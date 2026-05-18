## 1. Store 抽象与依赖

- [x] 1.1 增加 `unstorage` 依赖，并确认 Bun、本地测试和 Docker 构建环境可正常解析。
- [x] 1.2 新增通用异步 runtime store 接口，覆盖 `get`、`set`、`delete`、`listKeys` 等最小能力。
- [x] 1.3 新增内存 runtime store 实现，用于单元测试和隔离验证。
- [x] 1.4 新增 `unstorage` fs runtime store adapter，默认 base 目录位于 `${PROMA_CONFIG_DIR}/integrations/cms/runtime`。
- [x] 1.5 为通用 runtime store 增加单元测试，覆盖读写、删除、prefix list、重建实例后读取文件持久化数据。

## 2. CMS runtime store 封装

- [x] 2.1 新增 CMS runtime store 模块，封装 handoff 和 access session 的 key 命名、序列化、反序列化和过期清理。
- [x] 2.2 实现 `CmsHandoffStore` 接口，支持按 `handoffId` 读写、删除和清理过期记录。
- [x] 2.3 实现 `BuilderAccessSessionStore` 接口，支持按 `accessId` 读写、删除和清理过期记录。
- [x] 2.4 确认 handoff/access session service 不直接 import `unstorage` 或文件系统 driver。
- [x] 2.5 为 CMS runtime store 增加单元测试，覆盖过期记录删除、无效记录忽略和重建 store 后恢复记录。
- [x] 2.6 为默认文件 runtime store 增加 per-key 串行能力，覆盖同一 `handoffId` 消费和同一 `accessId` 续期的单实例并发写入场景。
- [x] 2.7 在 CMS runtime store 接口中暴露 handoff 消费、access session 续期所需的业务级串行、claim 或 CAS 等价方法，避免 service 用裸 `get -> set` 实现关键状态迁移。

## 3. Handoff 持久化改造

- [x] 3.1 将 `CmsHandoffService` 改为异步接口，并改为依赖 `CmsHandoffStore`。
- [x] 3.2 在 handoff 创建成功返回前写入 CMS runtime store，保留 target/openMode 归一化和短 TTL 语义。
- [x] 3.3 在 handoff 消费时从 CMS runtime store 读取记录，并在 per-`handoffId` 串行区内完成未消费判定、binding 校验、access session 创建和 `consumedAt` 提交。
- [x] 3.4 保持 handoff 不存在、过期、重复消费和 binding 变化时的现有结构化错误行为。
- [x] 3.5 更新 CMS handoff route 和相关测试调用点，覆盖创建后重建 service/store 仍可消费未过期 handoff。
- [x] 3.6 增加重启后已消费 handoff 不可重复消费的测试。
- [x] 3.7 增加并发消费同一 handoff 的测试，断言只有一个请求成功签发 Builder Access Session。
- [x] 3.8 增加 access session 写入失败时 handoff 不会被永久标记为 consumed 的测试。
- [x] 3.9 增加 handoff consumed 写入失败时不返回 access cookie，并清理或允许过期清理未暴露 access session 的测试。

## 4. Builder Access Session 持久化改造

- [x] 4.1 将 `BuilderAccessSessionService` 改为异步接口，并改为依赖 `BuilderAccessSessionStore`。
- [x] 4.2 确认不新增 access cookie 签名配置，accessId 作为浏览器 bearer token 并随 access session record 持久化。
- [x] 4.3 明确 CMS runtime store 文件包含 access bearer token，宿主机配置目录按敏感数据保护。
- [x] 4.4 创建 Builder Access Session 时在返回 cookie 前写入 CMS runtime store，且 durable record 可通过 accessId 恢复 cookie 访问会话。
- [x] 4.5 校验 Builder Access Cookie 时用 bearer token 从 CMS runtime store 读取 access session，保持 workspace/session mismatch 和过期错误语义。
- [x] 4.6 增加重启后使用同一 runtime store 可继续校验 access cookie 的测试。
- [x] 4.7 增加缺失或过期 access session record 会拒绝旧 cookie 的测试。
- [x] 4.8 调整 cookie 签发和续期逻辑，使 cookie value 直接使用 accessId bearer token。
- [x] 4.9 增加 durable access session 文件内容测试，断言可恢复 bearer token 且不包含原始 CMS Cookie、integration secret 或 Authorization header。

## 5. 续期节流

- [x] 5.1 新增 `AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS` 配置读取，默认值为 1 小时。
- [x] 5.2 调整 `renew` 逻辑，仅在剩余有效期小于或等于续期阈值时更新 `expiresAt`、写入 store 并返回 `Set-Cookie`。
- [x] 5.3 剩余有效期大于续期阈值时保持 access 校验成功，但不写入 store、不刷新 cookie。
- [x] 5.4 保持鉴权失败和业务失败不续期的现有行为。
- [x] 5.5 增加续期阈值相关单元测试，覆盖未到阈值、到达阈值、过期和业务失败场景。
- [x] 5.6 增加并发续期测试，断言同一 `accessId` 的并发续期不会把较新的 `expiresAt` 覆盖为旧值。

## 6. 路由、中间件与集成回归

- [x] 6.1 更新 `cms-integration-runtime` 的共享 store 初始化，生产路径使用 `unstorage` fs adapter，测试可注入内存 store。
- [x] 6.2 更新 CMS Builder Access middleware、builder context、workspace-scoped CMS API 和 preview 相关调用，适配 async access session service。
- [x] 6.3 更新 CMS integration route 测试，覆盖 handoff/access session 持久化后的主流程。
- [x] 6.4 回归内部 Docker Playwright 只读预览例外，确认该例外不创建、不续期、不写入 access session。
- [x] 6.5 回归同一浏览器多项目 workspace-scoped access cookie 场景。

## 7. Docker/env 文档与验证

- [x] 7.1 更新 Docker `.env` 示例，补充 `AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS`、runtime store 敏感性和单实例边界说明。
- [x] 7.2 更新部署说明，说明默认 CMS runtime store 使用配置目录文件持久化且只支持单 `server` 实例语义。
- [x] 7.3 确认 Docker compose 的 server 挂载目录覆盖 CMS runtime store 路径。
- [x] 7.4 运行 `bun run typecheck`。
- [x] 7.5 运行 CMS integration、handoff、access session、runtime store 相关单元测试。
- [x] 7.6 运行 `openspec validate persist-cms-handoff-access-sessions --strict`。
