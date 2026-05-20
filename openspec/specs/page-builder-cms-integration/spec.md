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
系统 SHALL 在 CMS 集成模式下支持 handoff 与 Builder Access Session 所需配置，并 SHALL 使用显式配置生成浏览器可访问的 handoff openUrl。系统 SHALL 支持配置 handoff TTL、Builder Access Session TTL 和 access session 续期阈值。

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
- **AND** Builder Access Session TTL SHALL 默认为 8 小时

#### Scenario: 续期阈值配置缺省值生效
- **WHEN** 未配置 `AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS`
- **THEN** Builder Access Session 续期阈值 SHALL 默认为 1 小时

#### Scenario: 非法 TTL 或续期阈值使用默认值
- **WHEN** `AI_PAGE_BUILDER_HANDOFF_TTL_MS`、`AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS` 或 `AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS` 被配置为非正整数
- **THEN** 系统 SHALL 使用对应默认值
- **AND** 系统 SHALL NOT 因非法可选 TTL 配置导致 CMS integration status 接口失败

### Requirement: CMS handoff 创建接口必须校验项目、身份和目标
系统 SHALL 提供 `POST /api/integrations/cms/projects/:projectId/handoffs`，由 CMS 服务端基于稳定 `projectId` 创建短期一次性打开链接。成功创建的 handoff SHALL 写入 CMS runtime store，以便在单 `server` 实例重启后仍可在 TTL 内被消费。

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
- **AND** 系统 SHALL 在返回成功前将 handoff 记录写入 CMS runtime store

#### Scenario: preview 未生成时拒绝创建 preview handoff
- **WHEN** CMS 为项目创建 `target: "preview"` handoff，但项目 workspace 没有可预览入口
- **THEN** 系统 SHALL 返回 `409`
- **AND** 响应 JSON SHALL 包含 `code: "preview_not_ready"`
- **AND** 系统 SHALL NOT 写入可消费的 handoff 记录

#### Scenario: 成功创建 preview handoff
- **WHEN** CMS 为项目创建 `target: "preview"` handoff，且项目 workspace 存在可预览入口
- **THEN** 系统 SHALL 返回 `200`
- **AND** 响应 JSON SHALL 包含短期 `openUrl`、`expiresAt`、`target: "preview"` 和归一化后的 `openMode`
- **AND** 系统 SHALL 在返回成功前将 handoff 记录写入 CMS runtime store

### Requirement: CMS handoff 消费必须签发 Builder Access Session
系统 SHALL 提供 `GET /api/integrations/cms/handoffs/:handoffId/open`，用于浏览器消费一次性 handoff、签发 `ai_page_builder_access` Cookie，并重定向到目标页面。系统 SHALL 从 CMS runtime store 读取 handoff，并 SHALL 在 Builder Access Session 写入成功后才持久化 consumed 状态，避免同一 handoff 在重启后被重复消费，也避免 access session 写入失败时永久消耗 handoff。

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

#### Scenario: 重启后仍可消费未过期 handoff
- **WHEN** 系统成功创建 handoff 并写入 CMS runtime store
- **AND** `server` 进程在 handoff TTL 内重启
- **THEN** 浏览器访问该 handoff openUrl SHALL 能从 CMS runtime store 读取记录并完成消费
- **AND** 系统 SHALL NOT 因进程内存 Map 丢失返回 `handoff_expired`

#### Scenario: 重启后已消费 handoff 不可重复消费
- **WHEN** 浏览器成功消费 handoff 且 consumed 状态已写入 CMS runtime store
- **AND** `server` 进程随后重启
- **THEN** 再次访问同一 handoff openUrl SHALL 返回 `handoff_expired`
- **AND** 系统 SHALL NOT 因重启丢失 consumed 状态而再次签发 Builder Access Session

#### Scenario: 并发消费同一 handoff 只有一个成功
- **WHEN** 多个浏览器请求在同一时间访问同一个未过期且未消费的 handoff openUrl
- **THEN** 系统 SHALL 至多为其中一个请求创建并返回 Builder Access Session
- **AND** 其他请求 SHALL 返回 handoff 已过期或已消费的错误语义
- **AND** 系统 SHALL NOT 因并发读取到同一未消费 handoff 而签发多个有效 access cookie

#### Scenario: access session 写入失败时 handoff 保持可重试
- **WHEN** 浏览器访问未过期且未消费的 handoff openUrl
- **AND** 系统在创建或持久化 Builder Access Session 时失败
- **THEN** 系统 SHALL NOT 将该 handoff 持久化为已消费
- **AND** 系统 SHALL NOT 返回 `Set-Cookie: ai_page_builder_access=...`
- **AND** 用户在 handoff TTL 内重试同一 openUrl 时 SHALL 仍可再次尝试消费

#### Scenario: handoff consumed 写入失败时不返回 access cookie
- **WHEN** 浏览器访问未过期且未消费的 handoff openUrl
- **AND** Builder Access Session 已写入但 handoff consumed 状态持久化失败
- **THEN** 系统 SHALL NOT 返回 `Set-Cookie: ai_page_builder_access=...`
- **AND** 系统 SHALL 删除或过期清理由该失败请求创建但未暴露给浏览器的 Builder Access Session
- **AND** 系统 SHALL NOT 让浏览器获得未与 consumed handoff 对应提交成功的 access session

#### Scenario: access session 不保存原始 CMS Cookie
- **WHEN** 系统成功消费 handoff 并创建 Builder Access Session
- **THEN** Builder Access Session SHALL 保存 `projectId`、`workspaceId`、`sessionId`、必要用户摘要和过期时间
- **AND** Builder Access Session SHALL NOT 保存原始 CMS Cookie、integration secret 或完整 Authorization header

#### Scenario: access session 不保存原始 CMS 凭据但保存 bearer token
- **WHEN** 系统成功消费 handoff 并创建 Builder Access Session
- **THEN** 持久化 Builder Access Session record SHALL 保存可用于查回该 session 的 access bearer token
- **AND** record SHALL NOT 保存原始 CMS Cookie、integration secret 或完整 Authorization header

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

### Requirement: CMS 集成前端必须使用状态探测和 builder context
PageBuilder renderer 在 CMS 集成模式下 SHALL 使用 CMS integration status 判断运行模式，并 SHALL 使用 builder context 作为进入具体项目的受控前端上下文来源。

#### Scenario: 前端通过 integration status 判断 CMS 模式
- **WHEN** PageBuilder renderer 初始化首页或 builder 页面
- **THEN** 系统 SHALL 请求 `GET /api/integrations/cms/status`
- **AND** 当响应包含 `integrationMode: "cms"` 且 `enabled: true` 时，前端 SHALL 进入 CMS 集成门控流程

#### Scenario: status 未完成前不得加载 standalone 项目入口
- **WHEN** PageBuilder renderer 已开始读取 `GET /api/integrations/cms/status` 但尚未确认当前模式
- **THEN** 系统 SHALL NOT 挂载 standalone 首页创建区、历史项目区或 Builder 项目工作台
- **AND** 系统 SHALL NOT 请求 `/api/page-builder/projects`、`/api/sessions`、`/api/workspaces`、session messages、preview-state、workspace preview、CMS browser、edit lock 或项目编辑 API

#### Scenario: status 请求失败时不回退 standalone
- **WHEN** PageBuilder renderer 无法成功读取 `GET /api/integrations/cms/status`
- **THEN** 系统 SHALL 展示服务暂不可用或可重试状态
- **AND** 系统 SHALL NOT 回退到 standalone 首页创建、历史列表或全量 workspace/session 初始化流程

#### Scenario: CMS 模式 builder 使用 builder context 获取项目上下文
- **WHEN** PageBuilder renderer 处于 CMS 集成模式并加载 `/builder/:workspaceId/:sessionId`
- **THEN** 系统 SHALL 请求 `GET /api/integrations/cms/builder-context?workspaceId=<workspaceId>&sessionId=<sessionId>`
- **AND** 系统 SHALL 依赖同源 `ai_page_builder_access` Cookie 完成访问校验
- **AND** 系统 SHALL NOT 在前端读取、传递或持久化 access token

#### Scenario: builder context 失败时提示从 CMS 重新进入
- **WHEN** CMS 集成模式下 builder context 返回 `401`、`403`、`404` 或其他失败响应
- **THEN** 系统 SHALL 展示“访问已失效，请从 CMS 系统重新进入 PageBuilder”
- **AND** 系统 SHALL 阻止继续加载当前项目的消息、预览、CMS browser、edit lock 或项目编辑 API

#### Scenario: CMS 模式 API 请求继续使用 public base path 解析
- **WHEN** PageBuilder renderer 在 public base path 下请求 integration status 或 builder context
- **THEN** 前端调用方 SHALL 继续使用逻辑 `/api/...` 路径
- **AND** 共享 API client SHALL 将浏览器实际请求解析到 `${AI_PAGE_BUILDER_BASE_PATH}/api/...`

### Requirement: CMS 集成模式项目 API 必须统一校验 Builder Access Session
系统 SHALL 在 CMS 集成模式下通过统一的 CMS Builder Access middleware 保护浏览器侧项目 API，并 SHALL 将 access cookie 解析、过期判断、workspace/session 匹配、Origin/Referer 校验和滑动续期收敛到同一访问控制边界。系统 SHALL 从 CMS runtime store 读取 Builder Access Session，以支持单 `server` 实例重启后的访问恢复。

#### Scenario: standalone 模式不启用项目 API access 校验
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms`
- **THEN** session、workspace 和 page-builder 项目 API SHALL 保持现有 standalone 访问语义
- **AND** 系统 SHALL NOT 要求 `ai_page_builder_access` Cookie

#### Scenario: CMS 模式无 access cookie 访问受保护项目 API 被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求受保护项目 API 时没有有效 `ai_page_builder_access` Cookie
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 SHALL 使用 `{ code, error }` JSON 结构
- **AND** `code` SHALL 为 `builder_access_required`

#### Scenario: CMS 模式 access session 不匹配 workspace 或 session 时被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求的 workspace 或 session 与 Builder Access Session 不匹配
- **THEN** 系统 SHALL 返回 `403`
- **AND** 响应 SHALL 使用 `{ code, error }` JSON 结构
- **AND** `code` SHALL 为 `builder_access_mismatch`

#### Scenario: 校验成功后挂载访问上下文
- **WHEN** CMS 模式下受保护项目 API 通过 Builder Access Session 校验
- **THEN** 系统 SHALL 将 `projectId`、`workspaceId`、`sessionId` 和用户摘要挂到请求上下文
- **AND** 下游 route SHALL 复用该上下文进行 edit lock 或业务规则校验

#### Scenario: 重启后持久化 access session 仍可通过校验
- **WHEN** 浏览器已通过 handoff 获得有效 Builder Access Cookie
- **AND** Builder Access Session 已写入 CMS runtime store
- **AND** `server` 进程重启后继续使用同一个配置目录
- **THEN** 浏览器请求同 workspace/session 的受保护项目 API SHALL 通过 access 校验
- **AND** 系统 SHALL NOT 因内存 store 为空返回 `builder_access_required`

### Requirement: CMS 集成模式受保护 API 必须按成功响应滑动续期
系统 SHALL 在 CMS 集成模式下对成功通过访问校验且业务响应成功的受保护 API 按空闲 TTL 语义滑动续期 Builder Access Session。为了降低文件 runtime store 写入频率，系统 SHALL 仅在当前 Builder Access Session 剩余有效期小于或等于续期阈值时刷新持久化记录和 access cookie。

#### Scenario: 受保护 API 成功且接近过期后续期 access session
- **WHEN** CMS 模式下受保护 API 完成 access 校验、workspace/session 匹配且业务响应状态小于 `400`
- **AND** 当前 Builder Access Session 的剩余有效期小于或等于 `AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS`
- **THEN** 系统 SHALL 将对应 Builder Access Session 的 `expiresAt` 延长到 `now + AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS`
- **AND** 系统 SHALL 将更新后的记录写入 CMS runtime store
- **AND** 响应 SHALL 重新写出 `Set-Cookie: ai_page_builder_access=...` 并刷新 `Max-Age`

#### Scenario: 受保护 API 成功但未到续期阈值时不写入
- **WHEN** CMS 模式下受保护 API 完成 access 校验、workspace/session 匹配且业务响应状态小于 `400`
- **AND** 当前 Builder Access Session 的剩余有效期大于 `AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS`
- **THEN** 系统 SHALL 保持请求通过
- **AND** 系统 SHALL NOT 更新 CMS runtime store 中的 `expiresAt`
- **AND** 系统 SHALL NOT 为该请求刷新 access cookie `Max-Age`

#### Scenario: 鉴权失败不续期
- **WHEN** CMS 模式下受保护 API 因缺少 access cookie、access token 无效、session 过期或 workspace/session mismatch 被拒绝
- **THEN** 系统 SHALL NOT 延长 Builder Access Session
- **AND** 系统 SHALL NOT 刷新 access cookie `Max-Age`

#### Scenario: 业务失败不续期
- **WHEN** CMS 模式下受保护 API 通过 access 校验但下游业务返回 `4xx` 或 `5xx`
- **THEN** 系统 SHALL NOT 延长 Builder Access Session
- **AND** 系统 SHALL NOT 因 edit lock 冲突、参数错误或业务异常刷新 access cookie

### Requirement: CMS 集成模式状态变更 API 必须校验 Origin 或 Referer
系统 SHALL 在 CMS 集成模式下对浏览器侧状态变更 API 校验请求来源属于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`，避免仅依赖 Cookie 的跨站请求风险。

#### Scenario: 状态变更 API 缺少可信来源时被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `POST`、`PATCH` 或 `DELETE` 类受保护 API
- **AND** 请求缺少 `Origin` 且缺少可解析的 `Referer`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 响应 SHALL 使用 `{ code, error }` JSON 结构
- **AND** `code` SHALL 为 `builder_access_origin_forbidden`

#### Scenario: 状态变更 API 来源不匹配时被拒绝
- **WHEN** CMS 模式下浏览器请求状态变更 API，且 `Origin` 或 `Referer` 的 origin 不等于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 响应 SHALL 表示 `code: "builder_access_origin_forbidden"`
- **AND** 系统 SHALL NOT 执行业务写操作
- **AND** 系统 SHALL NOT 滑动续期 Builder Access Session

#### Scenario: 状态变更 API 在 public origin 缺失时被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 缺失或不是合法 origin
- **AND** 浏览器请求 `POST`、`PATCH` 或 `DELETE` 类受保护 API
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 响应 SHALL 表示 `code: "builder_access_origin_forbidden"`
- **AND** 系统 SHALL NOT 执行业务写操作
- **AND** 系统 SHALL NOT 从 `Host`、`X-Forwarded-Host` 或其他请求头推断可信来源

#### Scenario: 项目 GET 与 preview 静态资源不因缺少 Origin 被拒绝
- **WHEN** CMS 模式下浏览器请求普通 `GET` 项目 API、preview HTML、preview static、图片、CSS 或 JS 等项目相关资源
- **THEN** 系统 SHALL 继续按 Builder Access Session 和 workspace/session 匹配校验
- **AND** 系统 SHALL NOT 仅因请求缺少 `Origin` header 而拒绝

#### Scenario: 无项目数据静态脚本不要求 Builder Access Session
- **WHEN** CMS 模式下浏览器请求 `preview-bridge.js`、`cms-rendering-preview.js` 或 `cms-rendering-vue.js` 等无项目数据静态脚本
- **THEN** 系统 SHALL NOT 要求 `ai_page_builder_access` Cookie
- **AND** 系统 SHALL NOT 仅因请求缺少 `Origin` header 而拒绝
- **AND** 静态脚本内容 SHALL NOT 包含项目数据、CMS Cookie、access token 或 workspace 私有配置

### Requirement: CMS 集成模式旧全局 CMS browser API 必须 fail closed
系统 SHALL 在 CMS 集成模式下拒绝无 workspace 上下文的旧全局 CMS browser API；CMS 集成模式下的 CMS 数据和资产访问必须使用 workspace-scoped CMS 路由完成。

#### Scenario: CMS 模式拒绝旧全局 CMS 数据读取接口
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `/api/page-builder/cms/sites`、`/api/page-builder/cms/catalogs`、`/api/page-builder/cms/catalogs/:catalogId` 或 `/api/page-builder/cms/contents`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 响应 SHALL 使用 `{ code, error }` JSON 结构
- **AND** 系统 SHALL NOT 匿名访问 CMS 上游数据

#### Scenario: CMS 模式拒绝旧全局 CMS 资产代理
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `/api/page-builder/cms/assets?url=...`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 作为无 workspace 上下文的 CMS 资源代理

#### Scenario: standalone 模式旧全局 CMS browser API 保持兼容
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且浏览器请求旧全局 CMS browser API
- **THEN** 系统 SHALL 保持现有 CMS browser 数据读取和资产代理行为

### Requirement: CMS 集成模式 workspace-scoped CMS browser API 必须受 Builder Access Session 保护
系统 SHALL 提供 workspace-scoped CMS 数据读取和资产代理 API，并在 CMS 集成模式下通过统一 CMS Builder Access middleware 校验 access cookie、workspace 匹配和滑动续期。来自 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` 且未经过 public web/nginx 代理的 Docker Playwright 内部只读预览 GET 请求可以访问预览渲染所需的 workspace-scoped CMS 数据和资产代理；该例外不得应用到外部 public 请求、无 project binding 的 workspace、binding 内部资源缺失的 workspace 或任何状态变更请求。

#### Scenario: CMS 模式无 access cookie 请求 workspace-scoped CMS 数据被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `GET /api/workspaces/:workspaceId/page-builder/cms/sites`、`/catalogs`、`/catalogs/:catalogId`、`/contents` 或 `/assets?url=...` 时没有有效 `ai_page_builder_access` Cookie
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 SHALL 表示 `code: "builder_access_required"`
- **AND** 系统 SHALL NOT 访问 CMS 上游数据或代理 CMS 资产

#### Scenario: CMS 模式 access session 不匹配 workspace 时拒绝 workspace-scoped CMS API
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器携带的 Builder Access Session `workspaceId` 与 URL 中的 `workspaceId` 不同
- **THEN** 系统 SHALL 返回 `403`
- **AND** 响应 SHALL 表示 `code: "builder_access_mismatch"`
- **AND** 系统 SHALL NOT 访问 CMS 上游数据或代理 CMS 资产

#### Scenario: CMS 模式 workspace-scoped CMS 数据使用 project binding siteId
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器携带匹配 workspace 的有效 Builder Access Session 请求 workspace-scoped CMS `catalogs`、`catalogs/:catalogId` 或 `contents`
- **THEN** 系统 SHALL 根据 access session 的 `projectId` 读取 project binding
- **AND** 系统 SHALL 使用 project binding 的 `siteId` 作为缺省站点
- **AND** 系统 SHALL NOT 使用全局默认 `siteId = 1` 越过 project binding

#### Scenario: CMS 模式 query siteId 不能越过 project binding
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 workspace-scoped CMS 数据请求 query 中的 `siteId` 不等于当前 project binding 的 `siteId`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 响应 SHALL 表示 `code: "builder_access_mismatch"`
- **AND** 系统 SHALL NOT 用该 query `siteId` 请求 CMS 上游数据

#### Scenario: CMS 模式 sites 只返回绑定站点
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器携带匹配 workspace 的有效 Builder Access Session 请求 `GET /api/workspaces/:workspaceId/page-builder/cms/sites`
- **THEN** 系统 SHALL 只返回当前 project binding `siteId` 对应的 CMS 站点摘要
- **AND** 系统 SHALL NOT 向浏览器返回其他 CMS 站点

#### Scenario: CMS 模式绑定站点未出现在上游 sites 响应时返回空列表
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 workspace-scoped CMS `sites`
- **AND** CMS 上游 `sites` 响应中不存在当前 project binding `siteId` 对应站点
- **THEN** 系统 SHALL 返回空站点列表
- **AND** 系统 SHALL NOT 伪造站点摘要
- **AND** 系统 SHALL NOT 返回其他站点作为兜底

#### Scenario: CMS 模式 workspace-scoped CMS API 成功响应不缓存
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 workspace-scoped CMS 数据或资产请求通过校验并成功返回
- **THEN** 系统 SHALL 设置 no-store 语义的缓存响应头
- **AND** 系统 SHALL 按统一受保护 API 规则滑动续期 Builder Access Session

#### Scenario: CMS 模式内部 Docker Playwright 可访问预览所需 workspace-scoped CMS 数据
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，请求 URL origin 等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`，且请求 `GET /api/workspaces/:workspaceId/page-builder/cms/sites`、`/catalogs`、`/catalogs/:catalogId` 或 `/contents` 时没有有效 `ai_page_builder_access` Cookie
- **AND** 请求未携带 `X-Forwarded-Host`
- **THEN** 系统 SHALL 允许该只读请求继续执行
- **AND** 系统 SHALL 使用与该 `workspaceId` 对应的 CMS project binding 限定站点范围
- **AND** 系统 SHALL NOT 回退到全局默认 `siteId` 越过 project binding

#### Scenario: CMS 模式内部 Docker Playwright 可访问预览所需 CMS 资产代理
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，请求 URL origin 等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`，且请求 `GET /api/workspaces/:workspaceId/page-builder/cms/assets?url=...` 时没有有效 `ai_page_builder_access` Cookie
- **AND** 请求未携带 `X-Forwarded-Host`
- **THEN** 系统 SHALL 允许该只读资产代理请求继续执行
- **AND** 系统 SHALL 仍按 workspace 对应的 CMS project binding 限定 CMS 访问范围

#### Scenario: CMS 模式经 public 代理转发的 internal-origin workspace-scoped CMS API 不走内部例外
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，请求 URL origin 等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`，但请求携带 `X-Forwarded-Host`
- **AND** 请求 workspace-scoped CMS 数据或资产代理时没有有效 `ai_page_builder_access` Cookie
- **THEN** 系统 SHALL NOT 将该请求识别为 Docker Playwright 内部只读预览请求
- **AND** 系统 SHALL 返回 `401`
- **AND** 响应 SHALL 表示 `code: "builder_access_required"`
- **AND** 系统 SHALL NOT 访问 CMS 上游数据或代理 CMS 资产

#### Scenario: standalone 模式 workspace-scoped CMS API 可服务 workspace preview
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且浏览器请求 workspace-scoped CMS `catalogs`、`catalogs/:catalogId`、`contents` 或 `assets`
- **THEN** 系统 SHALL 按现有 standalone CMS browser 读取和资产代理语义返回响应
- **AND** 系统 SHALL NOT 要求 `ai_page_builder_access` Cookie
- **AND** 系统 SHALL 保持旧全局 `/api/page-builder/cms/*` standalone 兼容行为不变

### Requirement: CMS 集成模式内部全量和生命周期 API 必须 fail closed
系统 SHALL 在 CMS 集成模式下拒绝浏览器侧内部全量列表、本地创建和会破坏 CMS project binding 的生命周期 API；这些 API 不应因为浏览器持有 Builder Access Session 而返回全量资源或执行绑定破坏性操作。

#### Scenario: CMS 模式拒绝全量 workspace 和 page-builder 项目列表
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `GET /api/workspaces` 或 `GET /api/page-builder/projects`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 返回全量 workspace 列表或全量 page-builder 历史项目列表

#### Scenario: CMS 模式拒绝本地创建 workspace
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `POST /api/workspaces`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 创建绕过 CMS project binding 的 workspace

#### Scenario: CMS 模式拒绝删除 workspace 或 page-builder 项目
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `DELETE /api/workspaces/:workspaceId` 或 `DELETE /api/page-builder/projects/:workspaceId`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 删除 CMS project binding 指向的 workspace、session 或项目文件

#### Scenario: CMS 模式 workspace-scoped 读取 API 必须匹配 workspace
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 workspace capabilities、directory-context、preview-state 或 file-search
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `workspaceId` 等于请求的 `workspaceId`
- **AND** 系统 SHALL NOT 因普通 `GET` 请求缺少 `Origin` header 而拒绝

#### Scenario: CMS 模式 workspace-scoped 写入和 PageBuilder 编辑 API 必须匹配 workspace
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 workspace patch、cms-target-snapshot、cms-auto-handoff、inline-text、block-delete 或 image replacement 等 workspace-scoped 写入或 PageBuilder 编辑 API
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `workspaceId` 等于请求的 `workspaceId`
- **AND** 系统 SHALL 校验 `Origin` 或 `Referer` 属于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`
- **AND** 需要 page-builder edit lock 的现有编辑操作 SHALL 继续校验 edit lock
- **AND** 系统 SHALL NOT 因存在 Builder Access Session 而绕过 edit lock

### Requirement: CMS builder context 必须纳入统一项目 API 保护和续期规则
系统 SHALL 将 `GET /api/integrations/cms/builder-context` 视为受保护项目 API，并通过统一 CMS Builder Access middleware 校验和滑动续期。

#### Scenario: builder context 使用统一 middleware 校验
- **WHEN** CMS 集成模式下浏览器请求 `GET /api/integrations/cms/builder-context?workspaceId=<workspaceId>&sessionId=<sessionId>`
- **THEN** 系统 SHALL 通过统一 CMS Builder Access middleware 校验 access cookie、workspaceId 和 sessionId
- **AND** 系统 SHALL NOT 在 route 内实现一套独立的 access cookie 校验规则

#### Scenario: builder context 成功后刷新 access session
- **WHEN** CMS 集成模式下 builder context 校验通过并成功返回当前 project context
- **THEN** 系统 SHALL 按统一受保护 API 规则滑动续期 Builder Access Session
- **AND** 响应 SHALL 继续不包含 access cookie 值、原始 CMS Cookie、integration secret 或完整 project binding 文件内容

### Requirement: CMS 集成必须提供同步静态 ZIP 导出 API
系统 SHALL 提供 CMS server-to-server 同步导出接口 `POST /api/integrations/cms/projects/:projectId/export`，由 CMS 发布流程基于长期稳定 `projectId` 获取当前 PageBuilder 项目的静态 ZIP 包。

#### Scenario: 有效 CMS 同步导出请求返回 ZIP
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，CMS 使用有效 integration secret、有效 `X-CMS-Cookie`、存在的 `projectId` 和可导出的 page-builder workspace 请求同步导出
- **THEN** 系统 SHALL 校验 CMS `/ui/login` 成功后执行静态导出
- **AND** 系统 SHALL 返回 `200`、`Content-Type: application/zip` 和 `Content-Disposition` 下载文件名
- **AND** 响应 body SHALL 是包含 `index.html` 的 ZIP 包

#### Scenario: standalone 模式拒绝 CMS 同步导出
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms`，且请求 `POST /api/integrations/cms/projects/:projectId/export`
- **THEN** 系统 SHALL 返回结构化拒绝响应
- **AND** 响应 JSON SHALL 包含 `code: "integration_unauthorized"`
- **AND** 系统 SHALL NOT 校验 CMS Cookie 或执行静态导出

#### Scenario: 同步导出接口必须校验 CMS server-to-server 身份
- **WHEN** 请求 `POST /api/integrations/cms/projects/:projectId/export` 缺少有效 `Authorization: Bearer <AI_PAGE_BUILDER_INTEGRATION_SECRET>`
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 JSON SHALL 包含 `code: "integration_unauthorized"`
- **AND** 系统 SHALL NOT 校验 CMS Cookie 或执行导出

#### Scenario: 同步导出接口必须校验当前 CMS Cookie
- **WHEN** CMS 同步导出请求缺少 `X-CMS-Cookie` 或 CMS `/ui/login` 判定未登录
- **THEN** 系统 SHALL 返回 `400 invalid_request` 或 `401 cms_login_expired`
- **AND** 系统 SHALL NOT 执行静态导出
- **AND** 系统 SHALL NOT 在响应体、workspace 文件、Agent 消息、project binding 或导出报告中写入原始 CMS Cookie

#### Scenario: 同步导出不要求 Builder Access Session
- **WHEN** CMS Server 以有效 integration secret 和有效 `X-CMS-Cookie` 调用同步导出接口，但请求没有浏览器 Builder Access Session cookie
- **THEN** 系统 SHALL 继续按 server-to-server 集成接口处理该请求
- **AND** 系统 SHALL NOT 因缺少 Builder Access Session、Origin 或 Referer 而拒绝该请求

#### Scenario: 项目不存在时返回 project_not_found
- **WHEN** CMS 同步导出请求中的 `projectId` 不存在，或对应 project binding 指向的 workspace/session 已不存在
- **THEN** 系统 SHALL 返回 `404`
- **AND** 响应 JSON SHALL 包含 `code: "project_not_found"`

#### Scenario: downloadCmsRemoteAssets 非布尔时返回 invalid_request
- **WHEN** CMS 同步导出请求体包含 `downloadCmsRemoteAssets` 且该字段不是 boolean
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 执行静态导出

#### Scenario: downloadCmsRemoteAssets 缺省值保持兼容
- **WHEN** CMS 同步导出请求体未提供 `downloadCmsRemoteAssets`
- **THEN** 系统 SHALL 使用与现有浏览器异步静态导出相同的默认值
- **AND** 导出报告 SHALL 保持与该默认值对应的 CMS 远程资源处理语义

#### Scenario: downloadCmsRemoteAssets 显式 true 时下载 CMS 远程资源
- **WHEN** CMS 同步导出请求体提供 `downloadCmsRemoteAssets: true`
- **THEN** 系统 SHALL 将该选项传入共享静态导出核心
- **AND** CMS 远程资源 SHALL 按现有离线静态导出规则下载到 ZIP 包内
- **AND** 导出报告 SHALL 记录对应本地化资源语义

#### Scenario: downloadCmsRemoteAssets 显式 false 时跳过 CMS 远程资源
- **WHEN** CMS 同步导出请求体提供 `downloadCmsRemoteAssets: false`
- **THEN** 系统 SHALL 将该选项传入共享静态导出核心
- **AND** CMS 远程资源 SHALL 按现有离线静态导出规则保留或改写为 CMS 源站 URL
- **AND** 导出报告 SHALL 记录被跳过的 CMS 远程资源 warning 和 retained external link 语义

### Requirement: CMS 同步导出必须在缺少产物或导出并发时返回 project_busy
系统 SHALL 在 CMS 同步导出前检查项目可用性；当缺少导出入口、已有导出活动或其他导出条件不满足时，系统 SHALL 返回结构化 `project_busy`，而不是返回旧包或半成品包。系统 SHALL NOT 因目标项目存在 edit lock 或活跃 Agent 而拒绝同步导出。

#### Scenario: 有效编辑锁不阻止 CMS 同步导出
- **WHEN** 目标 page-builder workspace 存在有效 edit lock，且 CMS 请求同步导出该项目
- **AND** 该项目存在可导出的 `workspace-files/index.html`
- **AND** 同 workspace 没有正在运行的导出活动
- **THEN** 系统 SHALL 执行静态导出
- **AND** 成功时 SHALL 返回 `application/zip`

#### Scenario: 活跃 Agent 不阻止 CMS 同步导出
- **WHEN** 目标 page-builder workspace 存在活跃 Agent 运行，且 CMS 请求同步导出该项目
- **AND** 该项目存在可导出的 `workspace-files/index.html`
- **AND** 同 workspace 没有正在运行的导出活动
- **THEN** 系统 SHALL 执行静态导出
- **AND** 成功时 SHALL 返回 `application/zip`

#### Scenario: 缺少 index.html 时返回 project_busy
- **WHEN** 目标 page-builder workspace 的 `workspace-files/index.html` 不存在，且 CMS 请求同步导出该项目
- **THEN** 系统 SHALL 返回 `409`
- **AND** 响应 JSON SHALL 包含 `code: "project_busy"`
- **AND** 响应 SHALL 表示当前项目没有可导出的页面产物

#### Scenario: 同 workspace 已有导出活动时返回 project_busy
- **WHEN** 目标 page-builder workspace 已存在浏览器异步导出或 CMS 同步导出活动，且 CMS 再次请求同步导出
- **THEN** 系统 SHALL 返回 `409`
- **AND** 响应 JSON SHALL 包含 `code: "project_busy"`
- **AND** 系统 SHALL NOT 创建第二个并发导出

### Requirement: CMS 同步导出失败必须返回结构化错误且不返回半成品 ZIP
系统 SHALL 只在静态导出完整成功后返回 ZIP；导出期间的 CMS 数据、CMS 资源、外部资源或服务端渲染失败 SHALL 返回结构化 JSON 错误。

#### Scenario: 导出期间上游资源失败返回 export_upstream_failed
- **WHEN** CMS 同步导出过程中 CMS 数据、CMS 资源、外部远程资源或 CMS island 渲染依赖请求失败并导致导出不能完整完成
- **THEN** 系统 SHALL 返回 `502`
- **AND** 响应 JSON SHALL 包含 `code: "export_upstream_failed"`
- **AND** 系统 SHALL NOT 返回 `application/zip` 或半成品 ZIP body

#### Scenario: 同步导出默认不被 PageBuilder 服务端主动超时
- **WHEN** 未配置 `AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS` 或该配置为 `0`
- **THEN** 系统 SHALL NOT 因 PageBuilder 服务端默认超时主动返回 `export_timeout`
- **AND** CMS HTTP 客户端 SHALL 自行决定等待时长

#### Scenario: 显式配置同步导出超时时返回 export_timeout
- **WHEN** `AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS` 配置为正整数，且 CMS 同步导出超过该时长仍未完成
- **THEN** 系统 SHALL 返回 `504`
- **AND** 响应 JSON SHALL 包含 `code: "export_timeout"`
- **AND** 系统 SHALL NOT 返回半成品 ZIP
- **AND** 后台导出完成或失败后系统 SHALL 释放该 workspace 的导出活动状态

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

### Requirement: CMS runtime 会话状态必须通过可替换 store 抽象持久化
系统 SHALL 通过项目内异步 runtime store 抽象持久化 CMS handoff 和 Builder Access Session，并 SHALL 避免 handoff/access session 业务逻辑直接依赖 `unstorage`、文件系统 API 或未来 Redis 等具体存储实现。默认实现 SHALL 使用 `unstorage` 文件系统 driver，并将数据写入 PageBuilder 配置目录下的 CMS runtime 存储目录；该默认文件实现 SHALL 只承诺单 `server` 实例语义。

#### Scenario: 默认 runtime store 使用配置目录持久化
- **WHEN** CMS 集成模式创建 handoff 或 Builder Access Session
- **THEN** 系统 SHALL 通过 runtime store 将短期会话记录写入 `${PROMA_CONFIG_DIR}/integrations/cms/runtime` 或等价的配置目录子路径
- **AND** 系统 SHALL NOT 仅依赖当前进程内存 Map 保存这些记录

#### Scenario: 业务层不直接依赖 unstorage
- **WHEN** handoff service 或 Builder Access Session service 读写短期会话记录
- **THEN** 它们 SHALL 依赖项目内 store 接口
- **AND** 它们 SHALL NOT 直接 import 或调用 `unstorage` driver API

#### Scenario: CMS store 提供业务级串行操作
- **WHEN** handoff 消费或 access session 续期需要执行读取、判定和写入组合操作
- **THEN** CMS runtime store SHALL 提供业务级串行、claim 或 CAS 等价能力
- **AND** handoff/access session 业务层 SHALL NOT 通过裸 `get -> set` 组合实现一次性消费或续期写回

#### Scenario: 文件 store 串行化同一 handoff 消费
- **WHEN** 默认 `unstorage` 文件系统 runtime store 在单 `server` 实例内处理同一 `handoffId` 的多个并发消费请求
- **THEN** 系统 SHALL 按 `handoffId` 对消费流程进行串行化
- **AND** 同一 handoff SHALL 至多有一个消费请求成功签发 Builder Access Session

#### Scenario: 预留未来中间件 adapter
- **WHEN** 后续需要接入 Redis 或其他共享中间件
- **THEN** 系统 SHALL 能通过新增 runtime store adapter 接入
- **AND** handoff/access session 的创建、消费、校验和续期业务规则 SHALL 不需要因存储后端变化而重写
- **AND** 未来共享 store adapter SHALL 在自身实现内提供与默认文件 store 等价的 handoff 单次消费和 access session 续期并发语义

#### Scenario: 文件 runtime store 不声明多实例共享
- **WHEN** 操作者使用默认 `unstorage` 文件系统 runtime store
- **THEN** 系统 SHALL 将其视为单 `server` 实例持久化能力
- **AND** 文档 SHALL NOT 宣称多个 `server` 实例可安全共享同一文件 runtime store

#### Scenario: 过期记录由业务层统一判定
- **WHEN** runtime store 读取到 handoff 或 Builder Access Session 记录
- **THEN** 系统 SHALL 根据记录中的 `expiresAt` 判定是否过期
- **AND** 系统 SHALL NOT 依赖底层 store 必须支持原生 TTL 才能保证访问控制正确性

### Requirement: CMS access cookie bearer token 必须随 access session 持久化
系统 SHALL 将 Builder Access Cookie 中的 bearer token 作为 Builder Access Session 标识持久化到 CMS runtime store，使单 `server` 实例重启后仍可直接通过浏览器 cookie 查回对应访问会话。该 bearer token SHALL 作为敏感运行数据处理，不得出现在 API 响应体、日志或错误信息中；保存 CMS runtime store 的宿主机目录 SHALL 按敏感数据目录保护。

#### Scenario: 持久化 access session 保存 bearer token 标识
- **WHEN** 系统持久化 Builder Access Session record
- **THEN** record SHALL 保存 `accessId`、项目、workspace、session、用户摘要和过期时间等服务端校验字段
- **AND** `accessId` SHALL 作为浏览器 `ai_page_builder_access_*` Cookie 的 bearer token
- **AND** 系统 SHALL NOT 额外要求配置 access cookie 签名参数

#### Scenario: 重启后通过持久化 bearer token 查回 access session
- **WHEN** 浏览器携带重启前签发且未过期的 Builder Access Cookie
- **AND** 对应 Builder Access Session record 仍存在于 CMS runtime store
- **THEN** 系统 SHALL 使用 cookie 中的 bearer token 查回 access session record
- **AND** 系统 SHALL 能完成 workspace/session 匹配和过期校验

#### Scenario: bearer token 不出现在响应体或日志
- **WHEN** CMS integration status、builder context、handoff 创建、handoff 消费或错误响应返回给客户端
- **THEN** 响应体 SHALL NOT 包含完整 `ai_page_builder_access_*` Cookie 或 bearer token 值
- **AND** 系统 SHALL NOT 将 bearer token 作为普通业务日志输出
