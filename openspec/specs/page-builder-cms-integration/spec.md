## Purpose
定义 PageBuilder 作为 CMS 底层页面构建服务时的集成模式探测、服务端鉴权、CMS 登录态校验、项目绑定持久化、空项目创建 API、CMS handoff 访问会话和敏感信息保护边界。

## Requirements

### Requirement: CMS 集成模式配置与状态探测
系统 SHALL 支持通过 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 启用 CMS 集成模式，并 SHALL 提供匿名只读状态接口供前端判断当前模式。

#### Scenario: standalone 模式返回未启用状态
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且请求 `GET /api/integrations/cms/status`
- **THEN** 系统 SHALL 返回 `200` 和 `{ "integrationMode": "standalone", "enabled": false }`

#### Scenario: CMS 集成模式返回启用状态
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且请求 `GET /api/integrations/cms/status`
- **THEN** 系统 SHALL 返回 `200`、`integrationMode: "cms"`、`enabled: true`、`supportedOpenModes: ["iframe", "window"]` 和当前规范化后的 `basePath`

#### Scenario: 状态接口不暴露敏感信息
- **WHEN** 任意客户端请求 `GET /api/integrations/cms/status`
- **THEN** 系统 SHALL NOT 要求 integration secret
- **AND** 系统 SHALL NOT 接收或使用 `X-CMS-Cookie`
- **AND** 系统 SHALL NOT 调用 CMS `/ui/login`
- **AND** 响应 SHALL NOT 包含 secret、CMS Cookie、用户摘要、workspace、session 或 project binding 内容

#### Scenario: CMS 登录 baseUrl 配置缺失时状态接口仍可返回模式
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 但 `AI_PAGE_BUILDER_CMS_BASE_URL` 缺失或非法，且请求 `GET /api/integrations/cms/status`
- **THEN** 系统 SHALL 仍返回 `200` 和 `enabled: true`
- **AND** 系统 SHALL NOT 在状态响应中暴露具体配置错误细节

#### Scenario: CMS 登录 baseUrl 配置只作为登录态校验权威来源
- **WHEN** 系统执行 CMS `/ui/login` 登录态校验
- **THEN** 系统 SHALL 使用 `AI_PAGE_BUILDER_CMS_BASE_URL` 作为 CMS 管理端 baseUrl
- **AND** 系统 SHALL NOT 从旧 `PROMA_CMS_USERNAME` 或 `PROMA_CMS_PASSWORD` 读取当前用户登录态凭据

### Requirement: CMS server-to-server 接口必须校验 integration secret
系统 SHALL 对 CMS server-to-server 写接口校验 `Authorization: Bearer <AI_PAGE_BUILDER_INTEGRATION_SECRET>`，并 SHALL 使用结构化错误表示鉴权失败。

#### Scenario: 缺少 integration secret 时拒绝创建项目
- **WHEN** 请求 `POST /api/integrations/cms/projects` 且缺少有效 `Authorization` header
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 JSON SHALL 为 `{ "code": "integration_unauthorized", "error": "PageBuilder 集成鉴权失败" }`

#### Scenario: integration secret 不匹配时拒绝创建项目
- **WHEN** 请求 `POST /api/integrations/cms/projects` 且 Bearer secret 与 `AI_PAGE_BUILDER_INTEGRATION_SECRET` 不匹配
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 JSON SHALL 包含 `code: "integration_unauthorized"`

#### Scenario: standalone 模式不允许创建 CMS 项目绑定
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且请求 `POST /api/integrations/cms/projects`
- **THEN** 系统 SHALL 拒绝该请求并返回结构化错误
- **AND** 系统 SHALL NOT 创建 workspace、session 或 project binding

#### Scenario: CMS 登录 baseUrl 配置缺失时拒绝写接口
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 但 `AI_PAGE_BUILDER_CMS_BASE_URL` 缺失或非法，且请求 `POST /api/integrations/cms/projects`
- **THEN** 系统 SHALL 返回结构化错误
- **AND** 系统 SHALL NOT 创建 workspace、session 或 project binding

### Requirement: CMS 登录态校验必须使用当前请求 Cookie
系统 SHALL 使用 `X-CMS-Cookie` 在当前请求内调用 `GET {AI_PAGE_BUILDER_CMS_BASE_URL}/ui/login` 校验 CMS 用户登录态，并 SHALL NOT 持久化原始 CMS Cookie。

#### Scenario: 缺少 CMS Cookie 时拒绝请求
- **WHEN** 创建 CMS 项目时缺少 `X-CMS-Cookie` 或该 header 为空白字符串
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 调用 CMS `/ui/login`

#### Scenario: CMS 登录态校验成功
- **WHEN** 创建 CMS 项目时提供有效 `X-CMS-Cookie`，且 CMS `/ui/login` 返回 HTTP 200、`status === 1`、`data.logined === true`
- **THEN** 系统 SHALL 将 `X-CMS-Cookie` 作为上游请求的 `Cookie` header 转发
- **AND** 系统 SHALL 提取必要用户摘要用于 project binding
- **AND** 系统 SHALL NOT 把原始 CMS Cookie 写入响应体或持久化文件

#### Scenario: CMS Cookie 无效或未登录
- **WHEN** CMS `/ui/login` 返回 HTTP 200 但 `status !== 1`、`data.logined !== true` 或明确表示当前用户未登录
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 JSON SHALL 包含 `code: "cms_login_expired"`

#### Scenario: CMS 登录请求被上游拒绝
- **WHEN** CMS `/ui/login` 返回 HTTP 401 或 HTTP 403
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 JSON SHALL 包含 `code: "cms_login_expired"`

#### Scenario: CMS 登录接口不可用或响应不可解析
- **WHEN** PageBuilder 无法请求 CMS `/ui/login`，或 `/ui/login` 返回 HTTP 500、HTTP 502、其他非 2xx 响应、非 JSON、缺少必要结构或其他不可判定响应
- **THEN** 系统 SHALL 返回 `502`
- **AND** 响应 JSON SHALL 包含 `code: "cms_login_unavailable"`

### Requirement: CMS 项目绑定必须持久化长期项目身份
系统 SHALL 将 CMS 外部记录与内部 page-builder workspace/session 的绑定持久化到 `${PROMA_CONFIG_DIR}/integrations/cms/projects.json`，并 SHALL 使用长期稳定的 `projectId` 作为 CMS 对外契约。

#### Scenario: 首次创建项目写入 project binding
- **WHEN** CMS 首次成功创建 AI 专题项目
- **THEN** 系统 SHALL 写入包含 `projectId`、`workspaceId`、`primarySessionId`、`projectName`、`siteId`、`externalRecordId`、必要用户摘要、`createdAt`、`updatedAt` 和 `lastValidatedAt` 的 binding 记录
- **AND** 系统 SHALL NOT 在 binding 中保存原始 CMS Cookie、integration secret 或 handoff/access token

#### Scenario: projectId 独立于内部 workspace 和 session 身份
- **WHEN** 系统首次创建 CMS project binding
- **THEN** 系统 SHALL 独立生成长期稳定的 `projectId`
- **AND** `projectId` SHALL NOT 等于内部 `workspaceId`
- **AND** `projectId` SHALL NOT 等于内部 `primarySessionId`

#### Scenario: binding 写入使用原子替换
- **WHEN** 系统写入 project binding 文件
- **THEN** 系统 SHALL 使用临时文件加 rename 的方式替换目标文件
- **AND** 系统 SHALL 在同一进程内串行化创建、更新和删除 binding 的操作

#### Scenario: 并发创建同一 externalRecordId 不生成多个对外项目
- **WHEN** 多个请求并发使用同一 `externalRecordId` 创建项目
- **THEN** 系统 SHALL 对创建流程做写前二次检查
- **AND** 所有成功响应 SHALL 返回同一个 `projectId`
- **AND** binding 文件 SHALL NOT 损坏

#### Scenario: externalRecordId 与 siteId 冲突时拒绝复用
- **WHEN** 某个 `externalRecordId` 已绑定项目，但本次创建请求携带不同 `siteId`
- **THEN** 系统 SHALL 返回 `409`
- **AND** 响应 JSON SHALL 包含 `code: "project_conflict"`

#### Scenario: 已有 binding 指向的内部资源缺失时拒绝复用
- **WHEN** 某个 `externalRecordId` 已绑定项目，但对应 workspace 或 primary session 已不存在
- **THEN** 系统 SHALL 返回 `409`
- **AND** 响应 JSON SHALL 包含 `code: "project_conflict"`

### Requirement: CMS 创建项目 API 必须创建空的 PageBuilder 项目
系统 SHALL 提供 `POST /api/integrations/cms/projects`，由 CMS 服务端创建 AI 专题项目，并 SHALL 只初始化 page-builder workspace 和 primary session。

#### Scenario: 首次创建 CMS 项目成功
- **WHEN** CMS 使用有效 integration secret、有效 `X-CMS-Cookie` 和合法 `externalRecordId`、`projectName`、`siteId` 请求创建项目
- **THEN** 系统 SHALL 创建一个 `template: "page-builder"` 的 workspace
- **AND** 系统 SHALL 创建该 workspace 下的 primary session
- **AND** 系统 SHALL 返回 `201` 和 `{ "projectId": <稳定项目 ID>, "created": true }`

#### Scenario: 同一 externalRecordId 幂等重试
- **WHEN** CMS 使用同一 `externalRecordId` 和同一 `siteId` 重试创建项目
- **THEN** 系统 SHALL 返回已有 `projectId`
- **AND** 系统 SHALL 返回 `200` 和 `created: false`
- **AND** 系统 SHALL NOT 再创建新的 workspace 或 primary session

#### Scenario: 幂等重试仍需校验当前 CMS 登录态
- **WHEN** CMS 使用同一 `externalRecordId` 重试创建项目，但 integration secret 或 `X-CMS-Cookie` 无效
- **THEN** 系统 SHALL 在返回已有 `projectId` 前拒绝该请求
- **AND** 响应 SHALL NOT 暴露已有 `projectId`

#### Scenario: 创建项目请求参数不合法
- **WHEN** 创建项目请求缺少 `externalRecordId`、`projectName` 或 `siteId`，或这些字段不是非空字符串
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`

#### Scenario: 创建项目请求包含 prompt 时被拒绝
- **WHEN** 创建项目请求体包含 `prompt` 字段
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 创建 workspace、session 或 project binding

#### Scenario: 创建项目不写入初始消息也不启动 Agent
- **WHEN** CMS 创建项目成功
- **THEN** 新建 primary session 的消息列表 SHALL 为空
- **AND** 系统 SHALL NOT 发送 Agent 消息
- **AND** 系统 SHALL NOT 启动 Agent 运行

#### Scenario: binding 写入失败时不返回可用 projectId
- **WHEN** workspace/session 已创建但 project binding 写入失败
- **THEN** 系统 SHALL 返回失败响应
- **AND** 响应 SHALL NOT 包含可用 `projectId`
- **AND** 系统 SHALL 尝试清理刚创建的 workspace/session

### Requirement: CMS integration 错误响应必须结构化且避免泄露敏感信息
系统 SHALL 对 `/api/integrations/cms/*` 返回稳定结构化 JSON 错误，并 SHALL 避免在响应体和新增持久化数据中泄露敏感凭据。

#### Scenario: CMS integration 错误包含 code 和 error
- **WHEN** `/api/integrations/cms/*` 路由发生可预期业务错误
- **THEN** 响应 JSON SHALL 包含 `code` 和 `error` 字段
- **AND** `code` SHALL 使用标准错误码，例如 `invalid_request`、`integration_unauthorized`、`cms_login_expired`、`cms_login_unavailable` 或 `project_conflict`

#### Scenario: CMS integration 响应不泄露敏感信息
- **WHEN** CMS integration 接口返回成功或失败响应
- **THEN** 响应体 SHALL NOT 包含原始 CMS Cookie、integration secret、Authorization header、上游完整 Cookie 或内部 binding 文件内容

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
