## Context

当前 CMS 集成链路有三类状态：CMS project binding 已持久化到 `${PROMA_CONFIG_DIR}/integrations/cms/projects.json`；CMS handoff 记录保存在 `InMemoryCmsHandoffStore`；Builder Access Session 保存在 `InMemoryBuilderAccessSessionStore`。后两者都位于 `cms-integration-runtime.ts` 的进程级共享 Map 中，`server` 重启后全部丢失。

这会带来两个直接问题：CMS 服务端刚创建 handoff 后如果 `server` 重启，用户打开链接会得到 `handoff_expired`；用户已经通过 handoff 进入构建页后，如果 `server` 重启，浏览器 cookie 仍在，但服务端 access session 记录丢失，请求会变成 `builder_access_required`。

本次改造要求使用 `unstorage` 文件系统持久化，但不能把业务逻辑绑定到 `unstorage`。因此需要先定义项目内抽象层，再提供 `unstorage` fs adapter。当前文件实现只承诺单 `server` 实例语义，不解决多实例共享；后续 Redis 等中间件通过同一抽象新增 adapter。

## Goals / Non-Goals

**Goals:**

- 让 CMS handoff 和 Builder Access Session 在单 `server` 实例重启后可从持久化 runtime store 恢复。
- 引入与具体存储无关的异步 runtime store 抽象，避免 `unstorage` API 泄漏到 handoff/access session 业务层。
- 使用 `unstorage` fs driver 作为默认持久化实现，数据落在 PageBuilder 配置目录下。
- 新增 access session 续期节流，降低文件存储写入频率。
- 保留内存 store 用于单元测试、隔离测试和可能的 fallback。

**Non-Goals:**

- 不引入 Redis、SQLite、外部数据库或独立中间件。
- 不把 CMS project binding 的 `projects.json` 迁移到 runtime store。
- 不支持多个 `server` 实例同时共享同一个 `unstorage` fs runtime store。
- 不改变 handoff TTL、一次性消费、workspace-scoped access cookie 和 CMS access 权限边界。
- 不把完整 access session 状态塞进浏览器 cookie。

## Decisions

### 1. 定义项目内异步 runtime store 抽象

新增通用异步 KV 抽象，例如 `RuntimeTtlStore`：

- `get<T>(key): Promise<T | null>`
- `set<T>(key, value): Promise<void>`
- `delete(key): Promise<void>`
- `listKeys(prefix): Promise<string[]>`

该接口不暴露 `unstorage` driver、TTL API 或文件路径细节。TTL 不依赖底层 store 自动过期，而是继续由业务 record 中的 `expiresAt` 控制。这样 Redis adapter 未来可以选择使用原生 TTL，但业务行为仍以 record 过期时间为准。

替代方案是直接在 handoff/access session service 中使用 `unstorage`。该方案改动少，但会让业务层依赖具体工具，后续接 Redis 时需要重写业务代码，因此不采用。

### 2. 在通用 KV 上封装 CMS runtime store，并提供业务级串行语义

新增 CMS 语义 store，例如 `CmsHandoffStore` 和 `BuilderAccessSessionStore`。service 只依赖这些接口：

- `CmsHandoffStore` 负责按 `handoffId` 读写、删除和按过期时间清理 handoff record。
- `BuilderAccessSessionStore` 负责按 `accessId` 读写、删除和按过期时间清理 access session record。
- `CmsHandoffStore` 还必须提供 handoff 消费所需的业务级串行能力，例如 `withHandoffConsumeLock(handoffId, callback)`、`consumeHandoffAtomically(...)` 或等价接口，避免业务层自行用裸 `get -> set` 组合实现一次性消费。

key 命名由 CMS runtime store 封装，例如：

- `cms:handoffs:<handoffId>`
- `cms:access-sessions:<accessId>`

暂不维护 workspace/session 二级索引，除非实现阶段确认现有业务仍需要高效 `listByWorkspaceId` 或 `listBySessionId`。如果测试或诊断需要保留这些方法，可通过 prefix scan 或单独索引封装在 store 内，不暴露给 route。

默认文件实现运行在单 `server` 进程内，因此 handoff 消费并发控制可使用进程内 per-key lock。该 lock 必须按 `handoffId` 串行化同一 handoff 的消费流程，使并发访问同一个 openUrl 时只有一个请求能签发 Builder Access Session，其他请求必须看到已消费状态。未来 Redis adapter 不应复用进程锁语义，而应在 adapter 内使用 Redis `SET NX PX`、Lua、事务或等价 CAS/lease 机制实现相同业务接口。

### 3. 默认 adapter 使用 `unstorage` fs driver

生产共享 runtime 使用 `unstorage` 文件系统 driver，base 目录建议为：

`${PROMA_CONFIG_DIR}/integrations/cms/runtime`

该目录应位于 Docker 已挂载的 PageBuilder 配置目录下，因此容器重建后可保留 handoff/access session。文件 adapter 只承诺单 `server` 进程访问；如果未来需要多实例共享，应新增 Redis adapter，并在部署配置中切换 store backend。

替代方案是手写 JSON 原子文件。该方案无依赖但需要自行处理并发、节流、flush 和崩溃窗口，后续 adapter 扩展性较差，因此不作为首选。

### 4. Handoff 和 access session service 改为 async 持久化语义

`create`、`peek/get`、`consume`、`validate`、`renew` 等方法改为 async，确保写入持久化 store 成功后再返回业务成功。路由和 middleware 当前已经是 async，调用链可控。

替代方案是启动加载到内存、运行时异步 flush。该方案对现有同步接口侵入较小，但会出现“响应已成功、写盘未完成时进程崩溃导致记录丢失”的窗口，不符合本次持久化目标。

### 5. Handoff 消费与 access session 创建必须避免失败后永久消耗 handoff

Handoff open 不是简单的“先标记 consumed，再创建 access session”。正确流程必须满足：

1. 同一 `handoffId` 的消费流程先进入业务级串行区。
2. 读取 handoff 并校验不存在、过期、已消费和 binding 变化等条件。
3. 创建并持久化 Builder Access Session。
4. 在 access session 写入成功后，才把 handoff 标记为 `consumedAt` 并持久化。
5. 只有 access session 写入和 handoff consumed 写入都成功后，route 才能返回 `Set-Cookie` 和 302。

如果 access session 写入失败，handoff 必须保持未消费状态，使用户可在 TTL 内重试。如果 handoff consumed 写入失败，系统不得返回 access cookie；实现应删除刚创建但尚未暴露给浏览器的 access session，并让 handoff 保持可重试或返回明确的临时错误。即使清理失败，未返回给浏览器的孤立 access session 也不得扩大访问权限，后续由过期清理删除。

该顺序无法提供跨文件的强事务，但在单 `server` 文件 store 语义下可以消除最关键的永久消耗窗口，并通过 per-handoff 串行化保证并发请求只有一个成功。

### 6. Access session 持久化记录保存 bearer token

持久化 Builder Access Session record 保存服务端访问控制和 cookie 查回所需字段，例如：

- `accessId`
- `projectId`
- `workspaceId`
- `sessionId`
- `userSummary`
- `createdAt`
- `expiresAt`

`accessId` 同时作为浏览器 `ai_page_builder_access_*` Cookie 的 bearer token。签发和续期 cookie 时，系统直接写出该 accessId；校验时从 cookie 读取 accessId，再从 runtime store 读取对应 access session record。这样不需要额外 cookie 签名配置，单 `server` 实例重启后只要 runtime store 文件仍在，即可继续校验未过期 access session。

该简化方案会让 CMS runtime store 文件包含可直接使用的 bearer token，因此宿主机配置目录必须按敏感数据目录保护，不应进入日志、错误响应、公开备份或非授权人员可读路径。

### 7. Access session 续期做写入节流

当前受保护 API 成功后会滑动续期。持久化后如果每个成功请求都更新 store，会产生不必要文件写入。因此新增续期阈值：

- `AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS`
- 默认值：`1 小时`

只有当 `expiresAt - now <= threshold` 时，系统才把 `expiresAt` 延长到 `now + AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS` 并写出 `Set-Cookie`。当剩余时间大于阈值时，校验仍成功，但不写 store、不刷新 cookie。该语义仍满足空闲 TTL，只是把续期写入从每次请求降低为接近过期时刷新。

续期也应通过 `BuilderAccessSessionStore` 的业务接口或 per-`accessId` 串行区完成，避免并发续期写回旧 `expiresAt`。对于默认文件 store，进程内 per-key lock 即可满足单实例语义；未来共享 store adapter 需要提供等价 CAS/lease 能力。

## Risks / Trade-offs

- [Risk] `unstorage` fs driver 不适合多 `server` 实例同时共享写入。→ Mitigation: 文档明确当前只支持单实例文件持久化；抽象层预留 Redis adapter 接入点。
- [Risk] 续期节流改变了“每次成功请求都刷新 cookie”的细节。→ Mitigation: spec 明确只在剩余时间小于阈值时刷新；测试覆盖未到阈值不写 cookie、到阈值才续期。
- [Risk] 过期记录依赖业务清理，文件目录可能积累少量过期文件。→ Mitigation: `get/validate/consume` 遇到过期即删除；`create` 和可选定期清理执行 prefix prune。
- [Risk] service async 化会影响 middleware、route 和测试调用点。→ Mitigation: 分层改造，先改 store/service 单测，再改 middleware/route 调用并运行现有 CMS 集成测试。
- [Risk] 文件 store 没有跨 key 事务，handoff consumed 和 access session 创建可能出现部分失败。→ Mitigation: 在同一 handoff 串行区内先持久化 access session，再提交 handoff consumed；失败时不返回 cookie，并测试 access session 写失败不会永久消费 handoff。
- [Risk] 并发请求同时打开同一个 handoff 可能绕过一次性消费。→ Mitigation: CMS runtime store 提供业务级 per-key 串行/claim 能力，默认文件实现使用进程内 lock，测试覆盖并发 open 只有一个成功。
- [Risk] 将 accessId 作为 bearer token 写入文件会扩大凭据暴露面。→ Mitigation: 文档明确 CMS runtime store 目录属于敏感数据目录，不在响应体、错误信息和普通日志中输出 bearer token。

## Migration Plan

1. 增加 runtime store 抽象和内存/unstorage fs adapter。
2. 增加 CMS runtime store 封装，把 key 组织、过期清理、handoff 消费串行化和 access session 续期串行化集中在 CMS integration 内部。
3. 将 handoff service 改为 async，并接入 `CmsHandoffStore`。
4. 将 Builder Access Session service 改为 async，并接入 `BuilderAccessSessionStore`、bearer token 持久化和续期阈值。
5. 更新 CMS integration routes、middleware 和相关测试调用。
6. 更新 Docker/env 示例，声明 `AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS`、bearer token 敏感性和 runtime store 单实例边界。
7. 验证服务重启模拟：创建 handoff 后重建 service 实例仍可消费；签发 access cookie 后重建 service 实例仍可校验。
8. 验证失败与并发场景：access session 写入失败不永久消费 handoff；并发消费同一 handoff 只有一个请求成功；durable access session 文件可用于重启后恢复校验且不包含原始 CMS 凭据。

Rollback 策略：保留内存 store 实现；如文件持久化出现问题，可通过配置或代码 fallback 切回内存 store，但重启恢复能力会退回原状。

## Open Questions

无阻塞问题。默认按单 `server` 实例文件持久化实现，多实例共享在后续 Redis adapter change 中处理。
