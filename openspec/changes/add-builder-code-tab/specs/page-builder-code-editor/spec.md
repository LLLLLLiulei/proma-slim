## ADDED Requirements

### Requirement: 代码 Tab 必须提供已有文件浏览与编辑界面

系统 SHALL 在 Page Builder 右侧栏提供「聊天 / 代码」双 Tab 切换，其中代码 Tab 采用代码编辑器布局：左侧 Explorer 文件树递归列出当前工作区 `workspace-files/` 下的已有文件与目录，右侧为可同时打开多个文件的编辑器 Tab 区，并辅以状态栏。聊天 Tab SHALL 保留现有 Agent 对话能力不变。

#### Scenario: 进入代码 Tab 显示当前工作区文件树

- **WHEN** 用户在 Page Builder 右侧栏从聊天 Tab 切换到代码 Tab
- **THEN** 系统 SHALL 在左侧 Explorer 中以 `workspace-files/` 为根递归展示当前工作区的已有文件与目录
- **AND** 系统 SHALL 默认打开 `index.html` 作为初始编辑文件（若存在）

#### Scenario: 打开多个文件以 Tab 形式展示

- **WHEN** 用户在文件树中依次点击多个文本文件
- **THEN** 系统 SHALL 为每个打开的文件在编辑器区创建一个可切换、可关闭的 Tab
- **AND** 系统 SHALL 在编辑器区展示当前激活文件内容

#### Scenario: 聊天 Tab 与代码 Tab 切换保留各自状态

- **WHEN** 用户从代码 Tab 切换到聊天 Tab 后再切回代码 Tab
- **THEN** 系统 SHALL 保留代码 Tab 中已打开的文件与未保存改动
- **AND** 系统 SHALL 不因为 Tab 切换重新初始化代码编辑状态

### Requirement: 代码 Tab 必须只允许编辑已有文本文件内容

系统 SHALL 允许用户编辑 `workspace-files/` 下已有文本文件的内容，不按扩展名设置可编辑白名单。系统 SHALL 禁止通过代码 Tab 或工作区文件 API 新建、删除、重命名文件或文件夹。图片文件 SHALL 以预览形式展示；无法以文本形式安全编辑的其他二进制文件 SHALL 给出“二进制文件不可编辑”提示，而不是尝试以文本加载。

#### Scenario: 文本文件可在编辑器中编辑

- **WHEN** 用户打开 `workspace-files/` 下任意已有文本文件（如 `.html`、`.css`、`.js`、`.json`、`.svg`、`.md`、`.txt` 或其他文本类型）
- **THEN** 系统 SHALL 在 Monaco 中以推断的语法高亮加载并允许编辑其内容

#### Scenario: 图片文件以预览形式展示

- **WHEN** 用户在文件树中点击图片文件
- **THEN** 系统 SHALL 展示该图片的预览
- **AND** 系统 SHALL 不尝试将其作为可编辑文本加载

#### Scenario: 其他二进制文件给出不可编辑提示

- **WHEN** 用户在文件树中点击无法以文本安全编辑的二进制文件
- **THEN** 系统 SHALL 显示“该文件为二进制，无法在编辑器中编辑”之类的提示
- **AND** 系统 SHALL 不将其内容作为可编辑文本加载

#### Scenario: 禁止创建、删除或重命名文件

- **WHEN** 用户使用代码 Tab 或工作区文件 API
- **THEN** 系统 SHALL 不提供新建文件、新建文件夹、删除文件、删除文件夹或重命名入口
- **AND** 后端 SHALL 不暴露对应的 create/delete/rename API

### Requirement: 系统必须为代码编辑器提供已有文件读取与保存 API

系统 SHALL 提供挂载到 `/api/workspaces/:workspaceId/files` 的工作区文件 API，支撑代码编辑器的文件树读取、文件内容读取和整文件保存。文件内容读取 SHALL 返回文件原始内容，不得返回经 HTML 转换或注入预览脚本后的内容。保存 SHALL 只允许修改已有文件内容，必须要求有效的 page-builder 编辑锁；只读 list/read SHALL 不要求编辑锁。所有文件路径解析 SHALL 防止目录穿越，并禁止访问 `.proma` 派生元数据目录。

#### Scenario: 文件列表接口返回工作区文件树

- **WHEN** 客户端请求 `GET /api/workspaces/:workspaceId/files`
- **THEN** 系统 SHALL 返回 `workspace-files/` 下递归的文件与目录结构
- **AND** 每个条目 SHALL 至少包含相对路径、类型（文件 / 目录）与大小

#### Scenario: 读取文件接口返回原始内容和版本

- **WHEN** 客户端请求 `GET /api/workspaces/:workspaceId/files/<相对路径>`
- **THEN** 系统 SHALL 返回该文件的原始内容
- **AND** 系统 SHALL 返回该内容对应的版本标识
- **AND** 系统 SHALL 不对其中的 HTML 注入预览脚本或做运行时转换

#### Scenario: 保存已有文件缺少编辑锁被拒绝

- **WHEN** 客户端发起保存请求但未携带有效编辑锁
- **THEN** 系统 SHALL 以冲突响应拒绝
- **AND** 系统 SHALL 不修改 `workspace-files/` 下任何文件

#### Scenario: 只读操作不要求编辑锁

- **WHEN** 客户端请求文件树或读取单个文件内容
- **THEN** 系统 SHALL 不要求 page-builder 编辑锁即可返回结果

#### Scenario: 路径穿越和派生目录访问被拒绝

- **WHEN** 客户端请求的文件相对路径包含 `..`、`.`、空路径或试图访问 `.proma`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL 不返回或修改 `workspace-files/` 之外或派生目录中的内容

### Requirement: 保存必须直接写入已有文本文件内容且不做文本校验

系统 SHALL 在保存文件时直接写入用户提交的原始文本内容，不对文本内容执行 CMS validator 校验，不返回 validator 诊断，也不得静默改写 HTML。HTML 文件保存后 SHALL 刷新 CMS rendering manifest 作为派生索引；非 HTML 文件 SHALL 直接写盘，不涉及 manifest。

#### Scenario: 保存 HTML 保留用户提交原文

- **WHEN** 用户保存 `index.html` 或其他 HTML 文件且写操作通过编辑锁校验
- **THEN** 系统 SHALL 将提交的原始 HTML 内容写回对应文件
- **AND** 系统 SHALL 不因 CMS validator error 阻止保存
- **AND** 系统 SHALL 不删除或改写用户提交的 HTML 文本

#### Scenario: 保存 HTML 后 CMS manifest 同步更新

- **WHEN** 用户保存包含 `<cms-catalog>` 或 `<cms-content>` 的 HTML 文件
- **THEN** 系统 SHALL 基于保存后的 HTML 刷新该工作区的 CMS rendering manifest

#### Scenario: 非 HTML 文件直接写盘

- **WHEN** 用户保存 `.css`、`.js` 等非 HTML 文件的修改且通过编辑锁校验
- **THEN** 系统 SHALL 将新内容直接写回对应文件
- **AND** 系统 SHALL 不触发 CMS validator 或 manifest 更新

#### Scenario: 保存不存在的文件被拒绝

- **WHEN** 客户端尝试保存 `workspace-files/` 下不存在的路径
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL 不创建新文件

### Requirement: 保存必须防止覆盖外部更新

系统 SHALL 在读取文件时返回内容版本，并在保存时校验客户端提交的 baseVersion 是否仍匹配当前文件版本。若文件已被 Agent 或其他流程修改，系统 SHALL 拒绝旧版本保存，避免用旧 draft 覆盖新内容。

#### Scenario: baseVersion 匹配时保存成功

- **WHEN** 用户读取文件后立即保存修改
- **AND** 文件当前版本仍与读取时版本一致
- **THEN** 系统 SHALL 保存修改并返回新的文件版本

#### Scenario: baseVersion 不匹配时拒绝保存

- **WHEN** 用户读取文件后，Agent 或其他流程修改了同一文件
- **AND** 用户随后基于旧内容发起保存
- **THEN** 系统 SHALL 返回冲突响应
- **AND** 系统 SHALL 保留当前磁盘上的新内容不被覆盖

### Requirement: Agent 运行时代码 Tab 必须为只读且禁止保存

系统 SHALL 在目标工作区存在活跃 Agent 执行时，使代码 Tab 进入只读状态，允许打开和查看文件内容，但禁止用户编辑和保存。只读状态 SHALL 由编辑锁语义驱动：Agent 活跃即项目锁定、代码 Tab 无法持有编辑锁，故 Monaco 切为只读并显示提示；Agent 执行结束后 SHALL 恢复可编辑。

#### Scenario: Agent 运行时代码 Tab 只读

- **WHEN** 当前工作区存在活跃 Agent 执行
- **THEN** 系统 SHALL 允许用户打开文件查看内容
- **AND** 系统 SHALL 使 Monaco 编辑器处于只读模式
- **AND** 系统 SHALL 显示代码只读提示
- **AND** 系统 SHALL 禁用保存按钮并禁止保存快捷键触发保存

#### Scenario: Agent 执行结束后恢复可编辑

- **WHEN** 当前工作区的 Agent 执行结束且项目重新可获取编辑锁
- **THEN** 系统 SHALL 使 Monaco 恢复为可编辑
- **AND** 系统 SHALL 移除只读横幅提示

### Requirement: 代码保存后必须驱动左侧预览刷新

系统 SHALL 在代码 Tab 成功保存影响预览的文件后，驱动左侧预览刷新，复用现有基于 `revision` 的预览状态轮询机制，不得为此新建 SSE 文件事件通道。

#### Scenario: 保存 index.html 后预览刷新

- **WHEN** 用户在代码 Tab 保存 `index.html` 成功
- **THEN** 系统 SHALL 使后续预览状态查询返回新的 `revision`
- **AND** 系统 SHALL 自动重新加载左侧预览 iframe 以展示更新后的页面

### Requirement: 代码编辑器必须保护未保存改动

系统 SHALL 跟踪每个打开文件的未保存改动并以可视化方式标识；当用户在存在未保存改动时执行关闭页面或关闭文件 Tab 等可能丢失改动的操作，系统 SHALL 进行拦截确认。

#### Scenario: 未保存文件在文件树与 Tab 中可视化标识

- **WHEN** 某个已打开文件存在未保存改动
- **THEN** 系统 SHALL 在文件树与编辑器 Tab 上以视觉标识（如加粗、圆点）表示该文件已修改未保存

#### Scenario: 存在未保存改动时拦截离开

- **WHEN** 用户在存在未保存改动时关闭页面或关闭文件 Tab
- **THEN** 系统 SHALL 弹出确认提示
- **AND** 系统 SHALL 仅在用户确认后才放弃未保存改动
