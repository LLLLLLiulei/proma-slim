## MODIFIED Requirements

### Requirement: Docker 部署必须声明 Playwright sidecar 与内部预览 origin 的运行时输入
系统 SHALL 为 `server` 提供可外部覆盖的 Docker 运行时输入，用于解析默认 Playwright sidecar MCP 地址与 page-builder 预览的内部访问 origin，而不是把这些容器网络地址写入工作区持久化配置。Docker 内部预览 origin SHALL 被视为后端内部 API origin，默认指向 compose 内部 `server` 服务，不应配置为浏览器 public origin；当 public base path 存在时，注入给 Agent / Docker Playwright 的预览 URL SHALL 使用剥离 public base path 后的内部 API path。

#### Scenario: compose 为 server 声明 Docker 运行时标记
- **WHEN** 操作者查看 compose 资产中的 `server` 环境变量定义
- **THEN** 系统 SHALL 为 `server` 声明一个内部 Docker 运行时标记
- **AND** 该标记 SHALL 让应用层能够区分 Docker 运行时和本地非 Docker 运行

#### Scenario: 默认 sidecar 输入指向 compose 内部 Playwright MCP 地址
- **WHEN** 操作者查看默认 compose 资产中的可配置运行参数
- **THEN** 系统 SHALL 为 `server` 声明 `AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL` 这一运行时输入
- **AND** 该输入默认值 SHALL 指向 compose 内部 `playwright` 服务的 MCP HTTP 端点
- **AND** 操作者 SHALL 能通过环境变量覆盖该输入为空或其他 MCP 地址

#### Scenario: 默认内部预览 origin 指向 server 服务
- **WHEN** 操作者查看默认 compose 资产中的可配置运行参数
- **THEN** 系统 SHALL 为 `server` 声明 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` 这一运行时输入
- **AND** 该输入默认值 SHALL 指向 compose 内部用于访问工作区预览路由的 `server` HTTP origin
- **AND** 操作者 SHALL 能通过环境变量覆盖该输入为空或其他内部预览 origin
- **AND** 文档 SHALL 提示该输入不应配置为浏览器 public origin，避免扩大内部只读预览例外的访问面

#### Scenario: public base path 不污染 Docker 内部预览 URL
- **WHEN** Docker CMS 集成部署配置 `AI_PAGE_BUILDER_BASE_PATH=/pagebuilder`、`AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN=http://server:8888`，且 Agent turn 使用默认内部 Playwright sidecar
- **THEN** 注入给 Agent 的预览 URL SHALL 使用 `http://server:8888/api/workspaces/<workspaceId>/preview/`
- **AND** 注入给 Agent 的预览 URL SHALL NOT 使用 `http://server:8888/pagebuilder/api/workspaces/<workspaceId>/preview/`

#### Scenario: 内部 Playwright 预览访问不要求用户浏览器 cookie
- **WHEN** Docker CMS 集成部署中的内部 Playwright sidecar 访问 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` 下的只读预览展示 URL
- **THEN** 系统 SHALL 允许该内部只读预览请求在没有用户浏览器 `ai_page_builder_access` Cookie 的情况下完成
- **AND** 系统 SHALL 继续要求外部 public preview URL 通过 CMS handoff/access session 获得访问权限
