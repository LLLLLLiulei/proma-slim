## ADDED Requirements

### Requirement: HTTP 服务必须承载 CMS handoff 与 builder context 路由
系统 SHALL 在现有 `/api/integrations/cms` 路由组中承载 CMS handoff 创建、handoff 消费和 builder context API，并 SHALL 保持 CMS integration 结构化错误响应。

#### Scenario: 注册 CMS 创建 handoff 路由
- **WHEN** CMS 请求 `POST /api/integrations/cms/projects/:projectId/handoffs`
- **THEN** HTTP 服务 SHALL 将请求路由到 CMS handoff 创建处理逻辑
- **AND** 该路由 SHALL 使用 `{ code, error }` 结构化错误响应

#### Scenario: 注册 CMS handoff open 路由
- **WHEN** 浏览器请求 `GET /api/integrations/cms/handoffs/:handoffId/open`
- **THEN** HTTP 服务 SHALL 将请求路由到 CMS handoff 消费处理逻辑
- **AND** 成功响应 SHALL 能设置 `Set-Cookie` 和 `Location` 头

#### Scenario: 注册 CMS builder context 路由
- **WHEN** 浏览器请求 `GET /api/integrations/cms/builder-context`
- **THEN** HTTP 服务 SHALL 将请求路由到 CMS builder context 处理逻辑
- **AND** 该路由 SHALL 使用 `{ code, error }` 结构化错误响应

### Requirement: PageBuilder Web 代理 API 时必须传递浏览器侧 forwarded 信息
系统 SHALL 让 PageBuilder Web 在代理 `/api/*` 请求到 PageBuilder Server 时传递可信的 forwarded host 与 proto 信息，供后端判断浏览器侧协议和生成 cookie 属性。

#### Scenario: 代理请求补充 forwarded host
- **WHEN** PageBuilder Web 代理浏览器 `/api/*` 请求到 PageBuilder Server
- **THEN** 上游请求 SHALL 包含浏览器请求对应的 `X-Forwarded-Host`

#### Scenario: 代理请求补充 forwarded proto
- **WHEN** PageBuilder Web 代理浏览器 `/api/*` 请求到 PageBuilder Server
- **THEN** 上游请求 SHALL 包含浏览器请求对应的 `X-Forwarded-Proto`

#### Scenario: base path 剥离后 forwarded 信息仍保留
- **WHEN** PageBuilder Web 直接收到带 public base path 的 `/pagebuilder/api/integrations/cms/handoffs/:id/open` 请求并剥离前缀代理到 server
- **THEN** 上游请求路径 SHALL 为 `/api/integrations/cms/handoffs/:id/open`
- **AND** 上游请求 SHALL 保留 forwarded host 与 proto 信息

### Requirement: PageBuilder Web 返回 builder shell 时必须允许同源 iframe 嵌入
系统 SHALL 在 PageBuilder Web 返回 builder SPA shell 的最终 HTML 响应上设置同源 iframe 兼容响应头。

#### Scenario: builder shell 包含 frame-ancestors CSP
- **WHEN** PageBuilder Web 返回 `/builder/:workspaceId/:sessionId` 或带 public base path 的 builder SPA shell
- **THEN** 响应头 SHALL 包含 `Content-Security-Policy: frame-ancestors 'self'`

#### Scenario: builder shell 不设置 DENY
- **WHEN** PageBuilder Web 返回 builder SPA shell
- **THEN** 响应头 SHALL NOT 包含会阻止同源 iframe 的 `X-Frame-Options: DENY`

#### Scenario: 静态资源响应不注入 builder shell CSP
- **WHEN** PageBuilder Web 返回 `/assets/*` 静态资源
- **THEN** 系统 SHALL NOT 把该响应当作 builder SPA shell 注入 runtime config 或 builder shell 专用 HTML 头
