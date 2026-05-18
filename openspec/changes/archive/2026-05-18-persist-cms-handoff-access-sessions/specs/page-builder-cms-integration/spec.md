## ADDED Requirements

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

## MODIFIED Requirements

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
