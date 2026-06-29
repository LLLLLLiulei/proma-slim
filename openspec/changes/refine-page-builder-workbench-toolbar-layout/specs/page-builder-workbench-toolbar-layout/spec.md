## ADDED Requirements

### Requirement: Builder 预览区顶部菜单栏必须统一承载预览操作
系统 SHALL 在 Builder 左侧预览区顶部菜单栏中统一展示预览相关操作，并将操作按钮展示为图标加中文文字的形式。

#### Scenario: 默认展示完整预览工具栏
- **WHEN** 用户进入 Builder 页面且未配置隐藏任何工具栏项
- **THEN** 左侧预览区顶部菜单栏 SHALL 展示 `PC / Mobile` 设备切换入口
- **AND** 左侧预览区顶部菜单栏 SHALL 展示带图标和文字的 `选择`、`刷新`、`新窗口打开`、`导出`、`另存模板` 操作按钮

#### Scenario: 预览操作按钮必须包含可见文字
- **WHEN** 预览区顶部菜单栏展示 `选择`、`导出`、`刷新`、`另存模板` 或 `新窗口打开` 操作按钮
- **THEN** 每个按钮 SHALL 同时展示对应图标和中文文字
- **AND** 系统 SHALL NOT 只通过纯图标、`title` 或 `aria-label` 表达按钮用途

#### Scenario: 另存模板入口从右侧栏移动到预览工具栏
- **WHEN** 用户进入 Builder 页面且 `saveTemplate` 未被隐藏
- **THEN** 系统 SHALL 在左侧预览区顶部菜单栏展示 `另存模板` 入口
- **AND** 系统 SHALL NOT 在右侧栏顶部菜单栏重复展示 `另存模板` 入口

#### Scenario: 点击预览工具栏中的另存模板入口
- **WHEN** 用户点击预览区顶部菜单栏中的 `另存模板` 入口
- **THEN** 系统 SHALL 复用现有另存模板表单、编辑锁校验、CMS 固化提示和结果反馈逻辑
- **AND** 系统 SHALL NOT 因入口位置变化改变另存模板 API 或保存语义

### Requirement: Builder 右侧栏顶部菜单栏必须分离 Tab 与项目名称
系统 SHALL 将右侧栏顶部菜单栏组织为左侧内容切换 Tab、右侧项目名称与编辑入口，避免项目身份、内容切换和预览操作混在同一操作区。

#### Scenario: 默认右侧栏顶部菜单栏布局
- **WHEN** 用户进入 Builder 页面且未隐藏 `chatTab`、`codeTab` 或 `projectName`
- **THEN** 右侧栏顶部菜单栏最左侧 SHALL 展示 `对话 / 代码` Tab 组
- **AND** 右侧栏顶部菜单栏最右侧 SHALL 展示当前项目名称与项目名称编辑入口

#### Scenario: 右侧栏顶部菜单栏尺寸与预览工具栏保持一致
- **WHEN** 用户进入 Builder 页面且右侧栏顶部菜单栏可见
- **THEN** 右侧栏顶部菜单栏 SHALL 使用与预览区顶部菜单栏一致的基础高度和垂直留白
- **AND** `对话 / 代码` Tab 按钮与项目名称编辑按钮 SHALL 使用与预览区操作按钮一致的基础高度

#### Scenario: 对话与代码内容状态在切换时保留
- **WHEN** 用户在右侧栏顶部菜单栏中从 `对话` 切换到 `代码` 后再切回 `对话`
- **THEN** 系统 SHALL 保持聊天内容和代码编辑器内容区的既有挂载与状态保留行为
- **AND** 系统 SHALL NOT 因 Tab 位置变化重置聊天会话、已打开代码文件或未保存编辑状态

#### Scenario: 项目名称隐藏时隐藏编辑入口
- **WHEN** `projectName` 被隐藏
- **THEN** 右侧栏顶部菜单栏 SHALL NOT 展示项目名称文本
- **AND** 右侧栏顶部菜单栏 SHALL NOT 展示项目名称编辑按钮或编辑输入框入口

#### Scenario: 右侧顶部菜单栏无可见内容时不渲染空栏
- **WHEN** `chatTab`、`codeTab` 与 `projectName` 均被隐藏
- **THEN** 系统 SHALL NOT 渲染只保留高度或边框的空白右侧顶部菜单栏
- **AND** 右侧内容区 SHALL 继续展示可用内容

### Requirement: 工具栏可见性必须由单一运行时配置控制
系统 SHALL 通过 `AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS` 控制 Builder 工具栏项和项目名称的显示与隐藏，默认全部展示。

#### Scenario: 未配置隐藏项时全部展示
- **WHEN** `AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS` 未设置、为空或只包含空白内容
- **THEN** 系统 SHALL 展示所有受该配置控制的工具栏项

#### Scenario: 配置隐藏部分工具栏项
- **WHEN** `AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS` 包含 `export,saveTemplate,projectName`
- **THEN** 系统 SHALL 隐藏 `导出` 按钮、`另存模板` 按钮和项目名称区域
- **AND** 系统 SHALL 继续展示未被隐藏的其他工具栏项

#### Scenario: 未知 key 被忽略
- **WHEN** `AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS` 包含未知 key 或非法 key
- **THEN** 系统 SHALL 忽略这些未知或非法 key
- **AND** 系统 SHALL NOT 因未知或非法 key 阻止 Builder 页面渲染

#### Scenario: 支持的隐藏 key 集合固定
- **WHEN** 系统解析 `AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS`
- **THEN** 系统 SHALL 仅识别 `pcPreview`、`mobilePreview`、`select`、`export`、`refresh`、`saveTemplate`、`openInNewWindow`、`chatTab`、`codeTab`、`projectName`
- **AND** 系统 SHALL 将重复 key 去重后应用

#### Scenario: 生产环境注入运行时配置
- **WHEN** Page Builder 生产静态网关启动并读取到 `AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS`
- **THEN** 系统 SHALL 将规范化后的隐藏项列表注入 `window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__`
- **AND** 渲染端 SHALL 从运行时配置读取该列表，而不是直接读取 `process.env`

### Requirement: 设备切换隐藏后必须有确定性预览模式回退
系统 SHALL 在 `PC / Mobile` 设备切换入口被部分或全部隐藏时，确保内部预览设备模式仍有确定性且不会停留在不可见入口代表的状态。

#### Scenario: 只隐藏 PC 预览入口
- **WHEN** `pcPreview` 被隐藏且 `mobilePreview` 未隐藏
- **THEN** 系统 SHALL 默认使用 Mobile 预览模式
- **AND** 如果当前状态为 PC，系统 SHALL 回退到 Mobile 预览模式

#### Scenario: 只隐藏 Mobile 预览入口
- **WHEN** `mobilePreview` 被隐藏且 `pcPreview` 未隐藏
- **THEN** 系统 SHALL 默认使用 PC 预览模式
- **AND** 如果当前状态为 Mobile，系统 SHALL 回退到 PC 预览模式

#### Scenario: 同时隐藏 PC 与 Mobile 预览入口
- **WHEN** `pcPreview` 与 `mobilePreview` 均被隐藏
- **THEN** 系统 SHALL 不展示设备切换组
- **AND** 系统 SHALL 在内部使用 PC 预览模式作为默认模式

### Requirement: 右侧 Tab 隐藏后必须有确定性内容回退
系统 SHALL 在 `对话 / 代码` Tab 被部分或全部隐藏时，确保右侧内容区不会停留在不可见 Tab 对应的不可达状态。

#### Scenario: 只隐藏对话 Tab
- **WHEN** `chatTab` 被隐藏且 `codeTab` 未隐藏
- **THEN** 系统 SHALL 展示 `代码` Tab 入口
- **AND** 如果当前 active tab 为 `对话`，系统 SHALL 回退到 `代码` 内容区

#### Scenario: 只隐藏代码 Tab
- **WHEN** `codeTab` 被隐藏且 `chatTab` 未隐藏
- **THEN** 系统 SHALL 展示 `对话` Tab 入口
- **AND** 如果当前 active tab 为 `代码`，系统 SHALL 回退到 `对话` 内容区

#### Scenario: 同时隐藏对话与代码 Tab
- **WHEN** `chatTab` 与 `codeTab` 均被隐藏
- **THEN** 系统 SHALL 不展示 `对话 / 代码` Tab 组
- **AND** 右侧内容区 SHALL 回退展示 `对话` 内容区

### Requirement: 隐藏工具栏项不得改变底层业务能力
系统 SHALL 将 `AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS` 解释为 UI 可见性配置，而不是权限、能力删除或 API 禁用配置。

#### Scenario: 隐藏另存模板入口不删除另存模板能力
- **WHEN** `saveTemplate` 被隐藏
- **THEN** 系统 SHALL 仅从当前工具栏隐藏 `另存模板` 可见入口
- **AND** 系统 SHALL 保留另存模板表单组件、API 调用能力和编辑锁处理逻辑，以便后续其他入口复用

#### Scenario: 隐藏预览操作不改变对应处理逻辑
- **WHEN** `select`、`export`、`refresh` 或 `openInNewWindow` 被隐藏
- **THEN** 系统 SHALL 仅隐藏对应按钮
- **AND** 系统 SHALL NOT 因 UI 隐藏修改区块选择、静态导出、预览刷新或新窗口打开的底层处理逻辑
