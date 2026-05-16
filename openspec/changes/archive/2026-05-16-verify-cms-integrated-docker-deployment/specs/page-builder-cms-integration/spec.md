## ADDED Requirements

### Requirement: CMS 集成必须可在 Docker 同源反代环境下完成第一期闭环验证
系统 SHALL 提供可重复的 Docker 级验证，证明 CMS 集成第一期能力在同源 public base path 部署下可以完成项目创建、受控打开、预览、防绕过和同步导出闭环。

#### Scenario: Docker 同源环境中创建 CMS 绑定项目
- **WHEN** 本地 CMS mock 或验证脚本通过本地 Nginx 公开入口 `/pagebuilder/api/integrations/cms/projects` 调用 PageBuilder 创建项目
- **THEN** PageBuilder SHALL 使用 integration secret 和 `X-CMS-Cookie` 完成 server-to-server 校验
- **AND** 系统 SHALL 创建 project binding、workspace 和 primary session
- **AND** project binding、workspace 和 session SHALL 落在 Docker 持久化配置目录下

#### Scenario: Docker 同源环境中打开 builder handoff
- **WHEN** CMS mock 或验证脚本为项目创建 `target: "builder"` handoff
- **THEN** iframe 和新窗口 SHALL 能通过同源 handoff openUrl 进入 `/pagebuilder/builder/<workspaceId>/<sessionId>`
- **AND** BuilderPage SHALL 通过 builder context 获取项目上下文，而不是绕过 handoff 直接加载内部项目上下文

#### Scenario: Docker 同源环境中同一浏览器可同时打开多个专题项目
- **WHEN** 同一浏览器连续消费两个不同 CMS 项目的 builder handoff
- **THEN** PageBuilder SHALL 使用按 workspace 隔离的 Builder Access Cookie 保存访问会话
- **AND** 后打开项目 SHALL NOT 覆盖前一个项目的访问会话
- **AND** 两个项目的 builder context SHALL 能在同一个浏览器 cookie jar 中分别通过校验

#### Scenario: Docker 同源环境中打开 preview handoff
- **WHEN** 验证环境为项目准备可预览 `workspace-files/index.html` 并创建 `target: "preview"` handoff
- **THEN** iframe 和新窗口 SHALL 能通过同源 handoff openUrl 进入 `/pagebuilder/api/workspaces/<workspaceId>/preview/`
- **AND** preview HTML、preview static 子资源和 workspace-scoped CMS 资产代理 SHALL 使用同一个 Builder Access Session 通过访问校验

#### Scenario: Docker 同源环境中 workspace-scoped CMS 资产代理受访问会话约束
- **WHEN** Docker/E2E 验证请求 `/pagebuilder/api/workspaces/<workspaceId>/page-builder/cms/assets?url=...`
- **THEN** PageBuilder SHALL 使用 Builder Access Session 校验请求 workspace 与访问会话匹配
- **AND** 验证 SHALL NOT 通过旧全局 `/pagebuilder/api/page-builder/cms/assets?url=...` 路径证明 CMS 集成模式资产代理可用

#### Scenario: Docker 同源环境中直接 URL 防绕过生效
- **WHEN** 浏览器没有有效 Builder Access Session 且直接访问最终 builder URL、builder context、session API 或 workspace preview URL
- **THEN** PageBuilder SHALL 拒绝加载项目上下文或预览 HTML
- **AND** 系统 SHALL NOT 允许用户发送 Agent 消息、读取 session messages、访问 workspace preview 或触发项目 API

#### Scenario: Docker 同源环境中同步导出返回 ZIP
- **WHEN** CMS mock 或验证脚本通过 `/pagebuilder/api/integrations/cms/projects/<projectId>/export` 触发同步导出
- **THEN** PageBuilder SHALL 校验 integration secret 和当前 `X-CMS-Cookie`
- **AND** 成功时 SHALL 返回 `application/zip`
- **AND** ZIP SHALL 包含当前 workspace 的 `index.html`

#### Scenario: Docker 验证不依赖真实大模型生成页面
- **WHEN** Docker/E2E 验证需要 preview 或 export 页面产物
- **THEN** 验证 harness MAY 通过测试 fixture 准备最小 `workspace-files/index.html`
- **AND** 验证 SHALL NOT 依赖真实 Agent 对话或上游大模型响应完成页面生成

#### Scenario: Docker 同源环境中 CMS 集成路径保持 base path
- **WHEN** PageBuilder 在 `/pagebuilder` public base path 下运行
- **THEN** handoff openUrl、builder redirect、preview redirect、builder context、项目 API、workspace-scoped CMS API 和同步导出路径 SHALL 都位于 `/pagebuilder` 下
- **AND** 浏览器 SHALL NOT 访问 CMS 根路径 `/api/...` 来调用 PageBuilder API
