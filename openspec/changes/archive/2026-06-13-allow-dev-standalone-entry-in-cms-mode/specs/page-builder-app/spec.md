## MODIFIED Requirements

### Requirement: CMS 集成模式首页必须展示受限入口
PageBuilder HomePage 在 CMS 集成模式下 SHALL 停止提供 standalone 本地项目创建入口，并 SHALL 引导用户从 CMS 系统进入 PageBuilder。仅当 integration status 明确返回 `devStandaloneEntryEnabled: true` 时，HomePage SHALL 在开发模式下展示 standalone 首页启动入口。

#### Scenario: CMS 模式首页显示 CMS 入口提示
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 CMS 集成模式已启用
- **AND** integration status 未返回 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL 展示“请从 CMS 系统进入 PageBuilder”
- **AND** 系统 SHALL NOT 展示本地 prompt 输入框或创建按钮

#### Scenario: CMS 模式首页不允许本地创建项目
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 CMS 集成模式已启用
- **AND** integration status 未返回 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL NOT 调用 standalone 的 workspace 创建或 session 创建流程
- **AND** 系统 SHALL NOT 写入 bootstrap cache

#### Scenario: 开发态 CMS 模式首页允许本地创建项目
- **WHEN** 用户访问 PageBuilder 首页且 integration status 返回 `integrationMode: "cms"`、`enabled: true` 和 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL 展示本地 prompt 创建入口
- **AND** 用户提交需求后 SHALL 继续创建 page-builder workspace、创建 session、写入 bootstrap cache 并跳转到 builder 页面
- **AND** 系统 SHALL NOT 展示“请从 CMS 系统进入 PageBuilder”作为阻断入口

#### Scenario: standalone 首页保持现有启动流程
- **WHEN** 用户访问 PageBuilder 首页且 integration status 表示 standalone 模式
- **THEN** 系统 SHALL 继续展示本地 prompt 创建入口
- **AND** 用户提交需求后 SHALL 继续创建 page-builder workspace、创建 session、写入 bootstrap cache 并跳转到 builder 页面

### Requirement: CMS 集成模式 BuilderPage 必须先通过 builder context 加载
PageBuilder BuilderPage 在 CMS 集成模式下 SHALL 先完成 builder context 校验和上下文初始化，再挂载项目工作台。仅当 integration status 明确返回 `devStandaloneEntryEnabled: true` 时，BuilderPage SHALL 在开发模式下复用 standalone 直接 URL 加载流程。

#### Scenario: CMS 模式 builder 的首个项目上下文请求是 builder context
- **WHEN** 用户访问 `/builder/:workspaceId/:sessionId` 且 integration status 表示 CMS 集成模式已启用
- **AND** integration status 未返回 `devStandaloneEntryEnabled: true`
- **THEN** BuilderPage SHALL 首先请求 builder context
- **AND** BuilderPage SHALL NOT 先请求 `/api/sessions` 或 `/api/workspaces` 来解析当前项目

#### Scenario: builder context 成功后初始化当前项目状态
- **WHEN** CMS 集成模式下 builder context 成功返回当前 workspace 和 session
- **THEN** BuilderPage SHALL 使用返回的 workspace 和 session 初始化当前 Jotai workspace/session 状态
- **AND** BuilderPage SHALL 允许挂载 AgentView、PreviewPane、CMS browser 和项目工作台交互

#### Scenario: CMS 模式不读取 standalone bootstrap cache
- **WHEN** CMS 集成模式下 builder context 成功
- **THEN** BuilderPage SHALL NOT 从 standalone bootstrap cache 读取初始 prompt
- **AND** BuilderPage SHALL NOT 因进入 CMS 项目而自动发送首页初始化需求

#### Scenario: builder context 失败时项目工作台不挂载
- **WHEN** CMS 集成模式下 builder context 失败
- **AND** integration status 未返回 `devStandaloneEntryEnabled: true`
- **THEN** BuilderPage SHALL 展示统一访问失效页
- **AND** BuilderPage SHALL NOT 挂载 AgentView、PreviewPane 或 CMS browser
- **AND** BuilderPage SHALL NOT 请求 messages、preview-state、workspace preview、workspace directory context 或项目编辑 API

#### Scenario: builder context 失败页以 CMS 重新进入为主
- **WHEN** CMS 集成模式下 BuilderPage 展示 builder context 失败页
- **THEN** 系统 SHALL 以“访问已失效，请从 CMS 系统重新进入 PageBuilder”作为主要恢复提示
- **AND** 系统 MAY 提供重试入口
- **AND** 系统 SHALL NOT 把返回 PageBuilder 首页作为主要恢复路径

#### Scenario: 开发态 CMS 模式 builder 保持 standalone 直接 URL 行为
- **WHEN** 用户访问 `/builder/:workspaceId/:sessionId` 且 integration status 返回 `integrationMode: "cms"`、`enabled: true` 和 `devStandaloneEntryEnabled: true`
- **THEN** BuilderPage SHALL 通过现有 sessions/workspaces 列表解析当前项目
- **AND** BuilderPage SHALL 继续支持 standalone bootstrap 首条消息和直接 builder URL
- **AND** BuilderPage SHALL NOT 要求当前页面必须由 CMS handoff 打开
- **AND** BuilderPage SHALL NOT 因缺少 Builder Access Session 展示 CMS 访问失效页
- **AND** BuilderPage SHALL 在用户选中预览区块后继续展示 CMS 选择入口
- **AND** BuilderPage SHALL 使用当前 workspace 调用 CMS browser dialog 和 workspace-scoped CMS browser API

#### Scenario: standalone builder 保持现有直接 URL 行为
- **WHEN** 用户访问 `/builder/:workspaceId/:sessionId` 且 integration status 表示 standalone 模式
- **THEN** BuilderPage SHALL 继续通过现有 sessions/workspaces 列表解析当前项目
- **AND** BuilderPage SHALL 继续支持 standalone bootstrap 首条消息和直接 builder URL
