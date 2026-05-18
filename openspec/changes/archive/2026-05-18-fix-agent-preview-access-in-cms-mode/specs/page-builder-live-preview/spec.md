## MODIFIED Requirements

### Requirement: 工作区预览状态返回的 entryUrl 必须支持 public base path
系统 SHALL 让 PageBuilder Server 返回给浏览器的 workspace preview `entryUrl` 使用当前 public base path，使 builder iframe、新窗口预览和历史卡片预览在 `/pagebuilder` 挂载下不会请求 CMS 根路径 `/api/*`。当预览 URL 被注入给 Docker 内部 Playwright MCP 访问时，系统 SHALL 从该 public `entryUrl` 中剥离 public base path 后再拼接内部预览 origin，避免把浏览器公开路径混用到内部 server origin。

#### Scenario: base path 下 preview state 返回带前缀入口
- **WHEN** 当前工作区存在可预览页面，且 public base path 为 `/pagebuilder`
- **THEN** 预览状态接口返回的 `entryUrl` SHALL 形如 `/pagebuilder/api/workspaces/<workspaceId>/preview/`
- **AND** builder iframe SHALL 使用该地址加载预览页面

#### Scenario: base path 下历史项目 previewUrl 返回带前缀入口
- **WHEN** 首页历史项目接口返回存在预览产物的项目，且 public base path 为 `/pagebuilder`
- **THEN** 项目的 `previewUrl` SHALL 形如 `/pagebuilder/api/workspaces/<workspaceId>/preview/`
- **AND** 历史卡片 iframe 和新窗口预览 SHALL 使用该地址加载预览页面

#### Scenario: 无 base path 时 preview state 保持现有入口
- **WHEN** 当前工作区存在可预览页面，且未配置 public base path
- **THEN** 预览状态接口返回的 `entryUrl` SHALL 继续形如 `/api/workspaces/<workspaceId>/preview/`

#### Scenario: Docker Playwright 内部预览 URL 剥离 public base path
- **WHEN** 当前工作区存在可预览页面、public base path 为 `/pagebuilder`、`AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN=http://server:8888`，且当前 Agent turn 使用 Docker HTTP Playwright MCP
- **THEN** 注入给 Agent 的 `<page_builder_browser_preview_url>` SHALL 形如 `http://server:8888/api/workspaces/<workspaceId>/preview/`
- **AND** 注入 URL SHALL NOT 包含 `/pagebuilder/api/workspaces/`

#### Scenario: Docker Playwright 内部预览 URL 支持多级 public base path
- **WHEN** 当前工作区存在可预览页面、public base path 为 `/ai/pagebuilder`、`AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN=http://server:8888`，且当前 Agent turn 使用 Docker HTTP Playwright MCP
- **THEN** 注入给 Agent 的 `<page_builder_browser_preview_url>` SHALL 形如 `http://server:8888/api/workspaces/<workspaceId>/preview/`
- **AND** 注入 URL SHALL NOT 包含 `/ai/pagebuilder/api/workspaces/`

#### Scenario: CMS 资源代理 URL 使用 public base path 和 workspace 上下文
- **WHEN** 预览 HTML 中的 CMS 远程资源被重写为宿主代理 URL，且 public base path 为 `/pagebuilder`
- **THEN** 重写后的资源 URL SHALL 位于 `/pagebuilder/api/workspaces/<workspaceId>/page-builder/cms/assets`
- **AND** 系统 SHALL NOT 生成指向 CMS 根路径 `/api/page-builder/cms/assets` 的浏览器 URL

#### Scenario: CMS 资源代理 URL 无 base path 时仍携带 workspace 上下文
- **WHEN** 预览 HTML 中的 CMS 远程资源被重写为宿主代理 URL，且未配置 public base path
- **THEN** 重写后的资源 URL SHALL 位于 `/api/workspaces/<workspaceId>/page-builder/cms/assets`
- **AND** 系统 SHALL NOT 生成无 workspace 上下文的 `/api/page-builder/cms/assets` 预览资源 URL

### Requirement: CMS 集成模式下 workspace preview 必须校验 Builder Access Session
系统 SHALL 在 CMS 集成模式下通过统一 CMS Builder Access middleware 对 workspace preview HTML 和静态子资源执行 Builder Access Session 校验，防止未通过 CMS handoff 的外部浏览器直接访问 preview URL。来自 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` 且未经过 public web/nginx 代理的 Docker Playwright 内部只读预览 GET 请求 SHALL 作为 Agent 诊断例外被允许访问，不要求 `ai_page_builder_access` Cookie；该例外 SHALL NOT 扩展到非 GET、非 preview allowlist 路径或任何状态变更 API。

#### Scenario: standalone 模式 preview 行为保持不变
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且请求 `GET /api/workspaces/:workspaceId/preview/`
- **THEN** 系统 SHALL 按现有 standalone preview 规则返回预览响应
- **AND** 系统 SHALL NOT 要求 `ai_page_builder_access` Cookie

#### Scenario: CMS 模式无 access cookie 访问外部 preview 被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且请求 `GET /api/workspaces/:workspaceId/preview/` 没有有效 `ai_page_builder_access` Cookie
- **AND** 请求 origin 不等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 SHALL 表示 `code: "builder_access_required"`

#### Scenario: CMS 模式内部 Docker Playwright 无 access cookie 访问 preview 被允许
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，请求 URL origin 等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`，且请求 `GET /api/workspaces/:workspaceId/preview/` 没有有效 `ai_page_builder_access` Cookie
- **AND** 请求未携带 `X-Forwarded-Host`
- **THEN** 系统 SHALL 返回 workspace preview HTML
- **AND** 系统 SHALL NOT 因缺少 `ai_page_builder_access` Cookie 返回 `builder_access_required`

#### Scenario: CMS 模式内部 Docker Playwright 访问 preview 静态子资源被允许
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，请求 URL origin 等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`，且请求 `GET /api/workspaces/:workspaceId/preview/*` 下的 CSS、JS、图片或其他静态子资源没有有效 `ai_page_builder_access` Cookie
- **AND** 请求未携带 `X-Forwarded-Host`
- **THEN** 系统 SHALL 返回对应 preview 静态子资源
- **AND** 系统 SHALL NOT 因普通静态资源请求缺少 `Origin` header 而拒绝

#### Scenario: CMS 模式经 public 代理转发的 internal-origin preview 不走内部例外
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，请求 URL origin 等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`，但请求携带 `X-Forwarded-Host`
- **AND** 请求没有有效 `ai_page_builder_access` Cookie
- **THEN** 系统 SHALL NOT 将该请求识别为 Docker Playwright 内部只读预览请求
- **AND** 系统 SHALL 返回 `401`
- **AND** 响应 SHALL 表示 `code: "builder_access_required"`

#### Scenario: CMS 模式内部 origin 不放行非 GET 或非 preview allowlist 路径
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，请求 URL origin 等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`，但请求为非 GET 方法、非 workspace preview 路径、session send/messages、workspace 写接口、builder context、CMS 选择/应用、导出或其他状态变更 API
- **THEN** 系统 SHALL NOT 因 internal origin 跳过既有 CMS access 校验
- **AND** 无有效 `ai_page_builder_access` Cookie 的请求 SHALL 继续按对应受保护 API 规则被拒绝

#### Scenario: CMS 模式 access session 不匹配 workspace 时拒绝外部 preview
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且请求的 preview `workspaceId` 与 Builder Access Session 不匹配
- **AND** 请求 origin 不等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`
- **THEN** 系统 SHALL 返回 `403`
- **AND** 响应 SHALL 表示 `code: "builder_access_mismatch"`

#### Scenario: CMS 模式 access session 匹配 workspace 时允许 preview HTML
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器携带匹配 workspace 的有效 `ai_page_builder_access` Cookie 请求 preview HTML
- **THEN** 系统 SHALL 返回 workspace preview HTML
- **AND** 响应头 SHALL 包含 `Content-Security-Policy: frame-ancestors 'self'`
- **AND** 响应头 SHALL NOT 包含会阻止同源 iframe 的 `X-Frame-Options: DENY`

#### Scenario: CMS 模式 access session 匹配 workspace 时允许 preview 静态子资源
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器携带匹配 workspace 的有效 `ai_page_builder_access` Cookie 请求 preview 下的 CSS、JS、图片或其他静态子资源
- **THEN** 系统 SHALL 返回对应 preview 静态子资源
- **AND** 系统 SHALL NOT 因普通静态资源请求缺少 `Origin` header 而拒绝

#### Scenario: CMS 模式 preview 成功响应刷新 access session
- **WHEN** CMS 模式下 workspace preview HTML 或静态子资源请求通过 Builder Access Session 校验并成功返回
- **THEN** 系统 SHALL 按统一受保护 API 规则滑动续期 Builder Access Session

#### Scenario: CMS 模式内部 Docker Playwright preview 响应不刷新 access session
- **WHEN** CMS 模式下 workspace preview HTML 或静态子资源请求通过内部 Docker Playwright 只读例外成功返回
- **THEN** 系统 SHALL NOT 创建或滑动续期 Builder Access Session
- **AND** 响应 SHALL NOT 因该内部例外写出新的 `ai_page_builder_access` Cookie
