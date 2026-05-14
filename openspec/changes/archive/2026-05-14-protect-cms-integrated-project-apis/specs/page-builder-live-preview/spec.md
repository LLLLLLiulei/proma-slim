## MODIFIED Requirements

### Requirement: CMS 集成模式下 workspace preview 必须校验 Builder Access Session
系统 SHALL 在 CMS 集成模式下通过统一 CMS Builder Access middleware 对 workspace preview HTML 和静态子资源执行 Builder Access Session 校验，防止未通过 CMS handoff 的浏览器直接访问 preview URL。

#### Scenario: standalone 模式 preview 行为保持不变
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且请求 `GET /api/workspaces/:workspaceId/preview/`
- **THEN** 系统 SHALL 按现有 standalone preview 规则返回预览响应
- **AND** 系统 SHALL NOT 要求 `ai_page_builder_access` Cookie

#### Scenario: CMS 模式无 access cookie 访问 preview 被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且请求 `GET /api/workspaces/:workspaceId/preview/` 没有有效 `ai_page_builder_access` Cookie
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 SHALL 表示 `code: "builder_access_required"`

#### Scenario: CMS 模式 access session 不匹配 workspace 时拒绝 preview
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且请求的 preview `workspaceId` 与 Builder Access Session 不匹配
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
