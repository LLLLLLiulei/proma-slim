## ADDED Requirements

### Requirement: CMS 集成模式下 workspace preview 必须校验 Builder Access Session
系统 SHALL 在 CMS 集成模式下对 workspace preview HTML 和静态子资源执行最小 Builder Access Session 校验，防止未通过 CMS handoff 的浏览器直接访问 preview URL。

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

### Requirement: CMS preview handoff 打开的预览必须是非编辑态预览
系统 SHALL 区分 Builder 页面编辑态 preview 与 CMS preview handoff 打开的预览，CMS preview handoff 不得启用编辑态 bridge、overlay 或 inline edit 能力。

#### Scenario: CMS preview handoff 跳转地址不携带 preview bridge 参数
- **WHEN** 浏览器消费 `target: "preview"` handoff
- **THEN** 系统 SHALL 302 跳转到 `${basePath}/api/workspaces/:workspaceId/preview/`
- **AND** 跳转地址 SHALL NOT 包含 `page-builder-bridge=1`

#### Scenario: CMS preview HTML 不注入 preview bridge
- **WHEN** CMS preview handoff 打开的 workspace preview HTML 被返回
- **THEN** 响应 HTML SHALL NOT 包含 `page-builder-preview-bridge` 脚本
- **AND** 响应 HTML SHALL NOT 启用编辑 overlay 或 inline edit 能力

#### Scenario: Builder 编辑态 preview 仍可按显式参数注入 bridge
- **WHEN** Builder 页面左侧 iframe 在已有编辑态流程中请求 `GET /api/workspaces/:workspaceId/preview/?page-builder-bridge=1`
- **THEN** 系统 SHALL 继续按现有规则判断并注入 preview bridge
- **AND** 该能力 SHALL 不由 CMS preview handoff 自动触发
