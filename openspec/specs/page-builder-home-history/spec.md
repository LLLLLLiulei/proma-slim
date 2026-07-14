## Purpose
定义 `page-builder` 首页在现有启动入口下方展示项目历史区的规则，包括卡片摘要、预览承载、编辑恢复、删除级联和与首页视觉语言的一致性。

## Requirements

### Requirement: 首页必须在现有启动入口下方展示 page-builder 项目历史区
系统 SHALL 在 `page-builder` 首页现有启动对话框下方提供包含历史记录的资源区，用于访问已有的 `page-builder` 项目；历史记录 SHALL 作为“历史记录”Tab 展示，且资源区的引入 MUST 保持现有首页启动入口继续可见且可用，而不是替换或重排原有启动入口。

#### Scenario: 访问首页时同时看到启动入口和历史记录入口
- **WHEN** 用户访问 `page-builder` standalone 首页，且系统中已经存在至少一个 `page-builder` 工作区
- **THEN** 系统 SHALL 保持现有首页启动对话框继续显示
- **AND** 系统 SHALL 在其下方展示包含“历史记录”Tab 的资源区入口

#### Scenario: 切换到历史记录 Tab 时看到历史区
- **WHEN** 用户在 standalone 首页资源区选择“历史记录”Tab
- **THEN** 系统 SHALL 展示项目历史记录区域
- **AND** 系统 SHALL 以既有历史卡片规则展示已有 `page-builder` 项目

#### Scenario: 没有历史项目时不影响首页启动入口
- **WHEN** 用户访问 `page-builder` standalone 首页，且系统中不存在任何 `page-builder` 工作区
- **THEN** 系统 SHALL 继续展示现有首页启动对话框
- **AND** 系统 SHALL 不因历史区为空而破坏首页原有启动流程

### Requirement: 历史区视觉必须与首页风格保持一致
系统 SHALL 让首页历史记录区延续现有首页的视觉语言，而不是引入独立的卡片产品风格；在对历史区进行视觉细化时，系统 MUST 优先参考现有 `taste-skill` 的设计约束。

#### Scenario: 历史区视觉延续首页现有语言
- **WHEN** 系统在首页渲染历史记录区与历史卡片
- **THEN** 历史区 SHALL 与首页现有浅色、轻层次、克制动效的视觉语言保持一致
- **AND** 系统 SHALL NOT 为历史区引入与首页明显割裂的新视觉体系

#### Scenario: 历史区视觉细化优先参考 taste-skill
- **WHEN** 系统对首页历史记录区进行样式设计或视觉细化
- **THEN** 系统 SHALL 优先参考现有 `taste-skill` 的设计约束
- **AND** 系统 SHALL 保持历史区与首页现有风格统一

### Requirement: 历史区必须以 page-builder 工作区卡片展示项目摘要
系统 SHALL 仅将 `template === 'page-builder'` 的工作区作为历史卡片展示对象，并以项目最近活跃时间倒序排列；每张卡片底部 SHALL 展示工作区名称和创建时间。

#### Scenario: 历史区只展示 page-builder 工作区
- **WHEN** 系统同时存在普通工作区与 `page-builder` 工作区
- **THEN** 首页历史区 SHALL 只展示 `page-builder` 工作区对应的卡片

#### Scenario: 历史卡片按最近活跃项目排序
- **WHEN** 历史区中存在多个 `page-builder` 项目，且它们的最近会话更新时间不同
- **THEN** 系统 SHALL 将最近会话更新时间更新的项目排在更前面

#### Scenario: 卡片底部展示项目基础信息
- **WHEN** 系统渲染某个历史项目卡片
- **THEN** 卡片底部 SHALL 展示该工作区名称
- **AND** 卡片底部 SHALL 展示该工作区创建时间

### Requirement: 历史卡片必须承载项目预览
系统 SHALL 在历史卡片主体中展示该项目当前可用的网页预览；当工作区存在预览入口时，卡片 MUST 通过 `iframe` 加载对应 HTML 预览，当工作区不存在预览入口时，卡片 MUST 展示统一的无预览空态，而不是显示旧预览内容。

#### Scenario: 项目存在预览时卡片加载 iframe
- **WHEN** 某个 `page-builder` 工作区存在可访问的预览入口
- **THEN** 该项目历史卡片 SHALL 使用 `iframe` 加载当前预览页面

#### Scenario: 项目不存在预览时显示空态
- **WHEN** 某个 `page-builder` 工作区当前不存在可访问的预览入口
- **THEN** 该项目历史卡片 SHALL 显示无预览空态
- **AND** 系统 SHALL NOT 继续显示该项目先前已失效的旧预览内容

### Requirement: 历史卡片悬浮时必须提供预览、编辑、删除操作
系统 SHALL 在用户悬浮历史项目卡片时显示交互蒙层，并提供 `预览`、`编辑`、`删除` 三个操作按钮；当项目当前被编辑锁或活跃 Agent 运行占用时，系统 SHALL 保持预览或查看入口可用，并 SHALL 允许用户进入 builder 由 builder 页面展示统一的锁冲突反馈，同时禁止删除入口。

#### Scenario: 悬浮卡片时显示三项操作
- **WHEN** 用户将鼠标悬浮到某个历史项目卡片上
- **THEN** 系统 SHALL 显示交互蒙层
- **AND** 系统 SHALL 显示 `预览`、`编辑`、`删除` 三个操作按钮

#### Scenario: 锁定项目展示忙碌状态并禁止删除
- **WHEN** 用户查看某个正在被编辑锁或活跃 Agent 运行占用的历史项目卡片
- **THEN** 系统 SHALL 显示项目正在编辑或构建中的状态
- **AND** 系统 SHALL 禁止用户从该卡片删除项目
- **AND** 系统 SHALL 保持 `编辑` 入口可用，使用户进入 builder 后看到统一的锁冲突反馈

#### Scenario: 预览操作打开当前项目预览
- **WHEN** 用户点击某个历史项目卡片上的 `预览` 按钮
- **THEN** 系统 SHALL 打开该项目当前最新的预览入口

### Requirement: 编辑操作必须恢复或补建可编辑会话
系统 SHALL 在用户点击历史项目卡片的 `编辑` 按钮时进入该项目的 builder 页面；若该工作区下已经存在仍在执行的 active Agent 会话，则系统 SHALL 优先恢复该 active 会话；若该工作区当前没有 active 会话但存在可用的最近会话，则系统 SHALL 进入该最近会话对应的 builder 页面；若该工作区当前没有可用会话，则系统 SHALL 自动创建一个新会话后再进入 builder。Builder 页面 SHALL 自行完成编辑锁获取、续约和冲突反馈。

#### Scenario: 工作区存在 active 会话时恢复该会话
- **WHEN** 用户点击某个历史项目卡片上的 `编辑` 按钮，且该工作区下存在仍在执行的 active Agent 会话
- **THEN** 系统 SHALL 优先进入该 active 会话对应的 builder 页面

#### Scenario: active 会话不存在时回退到最近会话
- **WHEN** 用户点击某个历史项目卡片上的 `编辑` 按钮，且该工作区下没有 active Agent 会话但存在最近一次会话
- **THEN** 系统 SHALL 进入该工作区最近一次会话对应的 builder 页面

#### Scenario: 已有锁上下文时由 builder 继续续约
- **WHEN** 用户从上一轮 builder 刷新后返回同一个工作区的 builder 页面，且浏览器保留了该页面实例的锁上下文
- **THEN** 系统 SHALL 继续复用原有 `lockId` 与 `holderId` 进行续约
- **AND** 系统 SHALL NOT 为续约生成新的 holder

#### Scenario: 工作区缺少会话时自动补建新会话
- **WHEN** 用户点击某个当前没有可用会话的历史项目卡片上的 `编辑` 按钮
- **THEN** 系统 SHALL 先为该工作区创建一个新会话
- **AND** 系统 SHALL 再进入该新会话对应的 builder 页面

### Requirement: 删除操作必须删除整个 page-builder 项目
系统 SHALL 在用户确认删除某个历史项目后，级联删除该 `page-builder` 工作区、其下所有会话，以及该工作区中的 `workspace-files` 预览产物；该删除行为 MUST 仅适用于 `page-builder` 项目，而不改变普通工作区原有删除语义。当项目存在有效编辑锁或活跃 Agent 运行时，系统 SHALL 禁止删除该项目。

#### Scenario: 删除前要求用户确认
- **WHEN** 用户点击某个历史项目卡片上的 `删除` 按钮
- **THEN** 系统 SHALL 先要求用户确认删除该项目

#### Scenario: 确认删除后级联清理整个项目
- **WHEN** 用户确认删除某个历史项目
- **THEN** 系统 SHALL 删除该工作区下的所有会话
- **AND** 系统 SHALL 删除该工作区的 `workspace-files` 预览产物
- **AND** 系统 SHALL 删除该工作区本身

#### Scenario: 删除后历史区移除该项目卡片
- **WHEN** 某个历史项目被成功删除
- **THEN** 首页历史区 SHALL 不再展示该项目卡片

#### Scenario: 锁定项目禁止删除
- **WHEN** 某个历史项目存在有效编辑锁或活跃 Agent 运行
- **THEN** 系统 SHALL 禁止删除该项目
- **AND** 系统 SHALL 保留该项目的历史卡片

#### Scenario: 普通工作区删除语义保持不变
- **WHEN** 系统处理非 `page-builder` 工作区的删除请求
- **THEN** 系统 SHALL 继续遵循普通工作区现有删除规则
- **AND** 系统 SHALL NOT 因首页历史项目删除能力而自动把普通工作区删除升级为级联删除

### Requirement: CMS 集成模式首页不得加载 standalone 历史区
PageBuilder 首页历史区 SHALL 仅在 standalone 行为下加载；CMS 集成模式且 standalone 入口开关未生效时，首页 SHALL NOT 展示或请求 standalone 项目历史，也 SHALL NOT 挂载历史记录 Tab 或历史记录内容。仅当 integration status 明确返回 `devStandaloneEntryEnabled: true` 时，首页 SHALL 按 standalone 行为提供资源区，并允许用户切换到历史记录 Tab 操作历史项目。

#### Scenario: CMS 模式首页不挂载历史区
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 CMS 集成模式已启用
- **AND** integration status 未返回 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL NOT 挂载 `PageBuilderHistorySection`
- **AND** 系统 SHALL NOT 展示历史项目卡片、历史空态、历史刷新按钮、删除项目入口或历史记录 Tab

#### Scenario: CMS 模式首页不请求历史项目列表
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 CMS 集成模式已启用
- **AND** integration status 未返回 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL NOT 请求 `/api/page-builder/projects`
- **AND** 系统 SHALL NOT 因历史区初始化请求 `/api/workspaces` 或 `/api/sessions`

#### Scenario: CMS standalone 入口开关生效时首页提供历史记录 Tab
- **WHEN** 用户访问 PageBuilder 首页且 integration status 返回 `integrationMode: "cms"`、`enabled: true` 和 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL 按 standalone 行为展示包含“历史记录”Tab 的资源区
- **AND** 系统 SHALL 允许用户切换到“历史记录”Tab 查看历史项目

#### Scenario: CMS standalone 入口开关生效时历史记录 Tab 加载历史项目
- **WHEN** 首页资源区在 CMS standalone 入口开关生效时展示
- **AND** 用户切换到“历史记录”Tab
- **THEN** 系统 SHALL 请求 `/api/page-builder/projects` 加载 page-builder 历史项目
- **AND** 历史项目卡片、历史空态、刷新按钮和删除项目入口 SHALL 按 standalone 视觉和交互规则展示

#### Scenario: CMS standalone 入口开关生效时历史项目操作按 standalone 行为执行
- **WHEN** 首页历史区在 CMS standalone 入口开关生效时展示项目卡片
- **THEN** 历史项目预览 SHALL 在新窗口打开当前预览 URL
- **AND** 历史项目编辑 SHALL 在新窗口打开 `/builder/:workspaceId/:sessionId`
- **AND** 历史项目删除 SHALL 调用 standalone page-builder 项目删除流程
- **AND** 系统 SHALL 继续阻止删除正在编辑、导出或 agent 运行中的项目

#### Scenario: standalone 模式历史区保持可用
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 standalone 模式
- **AND** 用户切换到“历史记录”Tab
- **THEN** 系统 SHALL 加载并展示 page-builder 项目历史区
- **AND** 历史项目编辑、预览和删除行为 SHALL 保持现有语义
