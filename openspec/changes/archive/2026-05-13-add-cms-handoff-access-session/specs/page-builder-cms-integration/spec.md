## ADDED Requirements

### Requirement: CMS handoff 配置必须生成稳定浏览器公开 URL
系统 SHALL 在 CMS 集成模式下支持 handoff 与 Builder Access Session 所需配置，并 SHALL 使用显式配置生成浏览器可访问的 handoff openUrl。

#### Scenario: public origin 缺失时拒绝创建 handoff
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 缺失或不是合法 origin，并请求创建 CMS handoff
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 从 `Host`、`X-Forwarded-Host` 或其他请求头推断 public origin

#### Scenario: public origin 不允许携带 path
- **WHEN** `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 配置为带 path、query 或 hash 的 URL，并请求创建 CMS handoff
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`

#### Scenario: 空 base path 生成根路径 openUrl
- **WHEN** `AI_PAGE_BUILDER_PUBLIC_ORIGIN=https://cms.example.com` 且 `AI_PAGE_BUILDER_BASE_PATH` 为空，并成功创建 CMS handoff
- **THEN** 响应 `openUrl` SHALL 以 `https://cms.example.com/api/integrations/cms/handoffs/` 开头

#### Scenario: 非空 base path 生成带前缀 openUrl
- **WHEN** `AI_PAGE_BUILDER_PUBLIC_ORIGIN=https://cms.example.com` 且 `AI_PAGE_BUILDER_BASE_PATH=/pagebuilder`，并成功创建 CMS handoff
- **THEN** 响应 `openUrl` SHALL 以 `https://cms.example.com/pagebuilder/api/integrations/cms/handoffs/` 开头

#### Scenario: TTL 配置缺省值生效
- **WHEN** 未配置 `AI_PAGE_BUILDER_HANDOFF_TTL_MS` 和 `AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS`
- **THEN** handoff TTL SHALL 默认为 2 分钟
- **AND** Builder Access Session TTL SHALL 默认为 72 小时

### Requirement: CMS handoff 创建接口必须校验项目、身份和目标
系统 SHALL 提供 `POST /api/integrations/cms/projects/:projectId/handoffs`，由 CMS 服务端基于稳定 `projectId` 创建短期一次性打开链接。

#### Scenario: 缺少或错误 integration secret 时拒绝创建 handoff
- **WHEN** 请求创建 CMS handoff 且缺少有效 `Authorization: Bearer <AI_PAGE_BUILDER_INTEGRATION_SECRET>`
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 JSON SHALL 包含 `code: "integration_unauthorized"`

#### Scenario: 创建 handoff 时重新校验 CMS Cookie
- **WHEN** CMS 使用有效 integration secret 和有效 `X-CMS-Cookie` 请求创建 handoff
- **THEN** 系统 SHALL 在当前请求内调用 CMS `/ui/login` 校验登录态
- **AND** 系统 SHALL NOT 把原始 CMS Cookie 写入 handoff、Builder Access Session、project binding 或响应体

#### Scenario: CMS Cookie 无效时拒绝创建 handoff
- **WHEN** 创建 handoff 时 CMS `/ui/login` 返回未登录或 HTTP 401/403
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 JSON SHALL 包含 `code: "cms_login_expired"`

#### Scenario: CMS 登录接口不可用时拒绝创建 handoff
- **WHEN** 创建 handoff 时 PageBuilder 无法调用 CMS `/ui/login` 或响应不可判定
- **THEN** 系统 SHALL 返回 `502`
- **AND** 响应 JSON SHALL 包含 `code: "cms_login_unavailable"`

#### Scenario: projectId 不存在时返回项目不存在
- **WHEN** 请求创建 handoff 的 `projectId` 没有对应 project binding 或其内部 workspace/session 不存在
- **THEN** 系统 SHALL 返回 `404`
- **AND** 响应 JSON SHALL 包含 `code: "project_not_found"`

#### Scenario: 空请求体使用默认 target 和 openMode
- **WHEN** CMS 创建 handoff 时没有发送 JSON body 或发送空 JSON 对象
- **THEN** 系统 SHALL 创建 `target: "builder"`、`openMode: "window"` 的 handoff
- **AND** 成功响应 SHALL 包含归一化后的 `target` 和 `openMode`

#### Scenario: 非法 JSON 请求体返回 invalid_request
- **WHEN** CMS 创建 handoff 时发送无法解析为 JSON 对象的请求体
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 静默按默认 `target/openMode` 创建 handoff

#### Scenario: 非法 target 或 openMode 返回 invalid_request
- **WHEN** 创建 handoff 请求体中的 `target` 不是 `builder` 或 `preview`，或 `openMode` 不是 `iframe` 或 `window`
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`

#### Scenario: 成功创建 builder handoff
- **WHEN** CMS 使用有效参数为已有项目创建 `target: "builder"` handoff
- **THEN** 系统 SHALL 返回 `200`
- **AND** 响应 JSON SHALL 包含短期 `openUrl`、`expiresAt`、`target: "builder"` 和归一化后的 `openMode`

#### Scenario: preview 未生成时拒绝创建 preview handoff
- **WHEN** CMS 为项目创建 `target: "preview"` handoff，但项目 workspace 没有可预览入口
- **THEN** 系统 SHALL 返回 `409`
- **AND** 响应 JSON SHALL 包含 `code: "preview_not_ready"`

#### Scenario: 成功创建 preview handoff
- **WHEN** CMS 为项目创建 `target: "preview"` handoff，且项目 workspace 存在可预览入口
- **THEN** 系统 SHALL 返回 `200`
- **AND** 响应 JSON SHALL 包含短期 `openUrl`、`expiresAt`、`target: "preview"` 和归一化后的 `openMode`

### Requirement: CMS handoff 消费必须签发 Builder Access Session
系统 SHALL 提供 `GET /api/integrations/cms/handoffs/:handoffId/open`，用于浏览器消费一次性 handoff、签发 `ai_page_builder_access` Cookie，并重定向到目标页面。

#### Scenario: 消费 builder handoff 跳转到 builder
- **WHEN** 浏览器访问未过期且未消费的 `target: "builder"` handoff openUrl
- **THEN** 系统 SHALL 创建 Builder Access Session
- **AND** 响应 SHALL 设置 `ai_page_builder_access` Cookie
- **AND** 响应 SHALL 302 跳转到 `${basePath}/builder/:workspaceId/:sessionId`

#### Scenario: 消费 preview handoff 跳转到 workspace preview
- **WHEN** 浏览器访问未过期且未消费的 `target: "preview"` handoff openUrl
- **THEN** 系统 SHALL 创建与 builder handoff 相同类型的 Builder Access Session
- **AND** 响应 SHALL 设置 `ai_page_builder_access` Cookie
- **AND** 响应 SHALL 302 跳转到 `${basePath}/api/workspaces/:workspaceId/preview/`

#### Scenario: handoff 记录与当前 binding 不一致时拒绝消费
- **WHEN** 浏览器消费 handoff 时，当前 project binding 的 `workspaceId` 或 `primarySessionId` 已不同于 handoff 创建时记录的内部资源
- **THEN** 系统 SHALL 返回 `404`
- **AND** 响应 JSON SHALL 包含 `code: "project_not_found"`
- **AND** 系统 SHALL NOT 签发 `ai_page_builder_access` Cookie 或跳转到新的内部资源

#### Scenario: 空 base path 下 cookie Path 为根路径
- **WHEN** `AI_PAGE_BUILDER_BASE_PATH` 为空且浏览器成功消费 handoff
- **THEN** `Set-Cookie` SHALL 包含 `Path=/`
- **AND** `Set-Cookie` SHALL 包含 `HttpOnly`、`SameSite=Lax` 和 `Max-Age`
- **AND** `Set-Cookie` SHALL NOT 包含 `Domain`

#### Scenario: 非空 base path 下 cookie Path 为 base path
- **WHEN** `AI_PAGE_BUILDER_BASE_PATH=/pagebuilder` 且浏览器成功消费 handoff
- **THEN** `Set-Cookie` SHALL 包含 `Path=/pagebuilder`
- **AND** `Set-Cookie` SHALL 包含 `HttpOnly`、`SameSite=Lax` 和 `Max-Age`
- **AND** `Set-Cookie` SHALL NOT 包含 `Domain`

#### Scenario: HTTP public origin 不设置 Secure
- **WHEN** `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 使用 `http:` 且浏览器成功消费 handoff
- **THEN** `Set-Cookie` SHALL NOT 包含 `Secure`

#### Scenario: HTTPS public origin 设置 Secure
- **WHEN** `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 使用 `https:` 且浏览器成功消费 handoff
- **THEN** `Set-Cookie` SHALL 包含 `Secure`

#### Scenario: 可信 forwarded proto 为 https 时设置 Secure
- **WHEN** 请求包含可信 `X-Forwarded-Proto: https` 且浏览器成功消费 handoff
- **THEN** `Set-Cookie` SHALL 包含 `Secure`

#### Scenario: handoff 不存在时返回 handoff_expired
- **WHEN** 浏览器访问不存在的 handoff openUrl
- **THEN** 系统 SHALL 返回 `404`
- **AND** 响应 SHALL 表示 `code: "handoff_expired"`

#### Scenario: handoff 过期或重复消费时返回 handoff_expired
- **WHEN** 浏览器访问已过期或已被消费的 handoff openUrl
- **THEN** 系统 SHALL 返回 `410`
- **AND** 响应 SHALL 表示 `code: "handoff_expired"`

#### Scenario: access session 不保存原始 CMS Cookie
- **WHEN** 系统成功消费 handoff 并创建 Builder Access Session
- **THEN** Builder Access Session SHALL 保存 `projectId`、`workspaceId`、`sessionId`、必要用户摘要和过期时间
- **AND** Builder Access Session SHALL NOT 保存原始 CMS Cookie、integration secret 或完整 Authorization header

### Requirement: Builder context 必须校验 Builder Access Session
系统 SHALL 提供 `GET /api/integrations/cms/builder-context`，供浏览器在 CMS 集成模式下通过 access cookie 获取当前 PageBuilder 项目上下文。

#### Scenario: 无 access cookie 时拒绝 builder context
- **WHEN** 浏览器请求 `GET /api/integrations/cms/builder-context?workspaceId=<workspaceId>&sessionId=<sessionId>` 且没有有效 `ai_page_builder_access` Cookie
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 JSON SHALL 包含 `code: "builder_access_required"`

#### Scenario: access session 与 workspace 或 session 不匹配时拒绝
- **WHEN** 浏览器请求 builder context 的 `workspaceId` 或 `sessionId` 与 Builder Access Session 不匹配
- **THEN** 系统 SHALL 返回 `403`
- **AND** 响应 JSON SHALL 包含 `code: "builder_access_mismatch"`

#### Scenario: access session 指向的内部资源不存在时返回 project_not_found
- **WHEN** Builder Access Session 指向的 project binding、workspace 或 session 已不存在
- **THEN** 系统 SHALL 返回 `404`
- **AND** 响应 JSON SHALL 包含 `code: "project_not_found"`

#### Scenario: access session 指向的 binding 已变更时返回 project_not_found
- **WHEN** Builder Access Session 指向的 `projectId` 仍存在，但当前 project binding 的 `workspaceId` 或 `primarySessionId` 已不同于 access session 中记录的内部资源
- **THEN** 系统 SHALL 返回 `404`
- **AND** 响应 JSON SHALL 包含 `code: "project_not_found"`
- **AND** 系统 SHALL NOT 返回变更后的 workspace 或 session 上下文

#### Scenario: builder context 成功返回最小上下文
- **WHEN** 浏览器携带有效且匹配的 `ai_page_builder_access` Cookie 请求 builder context
- **THEN** 系统 SHALL 返回 `200`
- **AND** 响应 JSON SHALL 包含 `projectId`、当前 `workspace`、当前 `session` 和 `access.expiresAt`
- **AND** 响应 JSON SHALL NOT 包含原始 CMS Cookie、integration secret、access cookie 值、完整 project binding 文件内容、`sdkSessionId`、`channelId` 或 `attachedDirectories`

#### Scenario: preview handoff 签发的 access session 可访问 builder context
- **WHEN** 浏览器通过 `target: "preview"` handoff 获得 `ai_page_builder_access` Cookie，并请求同项目 builder context
- **THEN** 系统 SHALL NOT 因 handoff target 是 `preview` 而拒绝该请求
