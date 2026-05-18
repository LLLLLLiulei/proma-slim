## Why

CMS 集成模式下的 handoff 和 Builder Access Session 目前只保存在 `server` 进程内存中，容器重启、进程重启或滚动发布会导致刚生成的 handoff 失效、已打开的构建页面重新访问失败。当前部署已依赖宿主机持久化目录保存项目绑定和工作区状态，因此短期访问会话也需要以轻量方式持久化，同时保留后续接入 Redis 等共享存储的扩展边界。

## What Changes

- 引入项目内 runtime store 抽象，使 CMS handoff 和 Builder Access Session 业务逻辑只依赖统一异步 store 接口，不直接依赖具体存储实现。
- 使用 `unstorage` 的文件系统 driver 作为当前默认持久化实现，将 CMS runtime 会话数据落到 PageBuilder 配置目录下的持久化 runtime 目录。
- 将 CMS handoff 从纯内存 Map 改为可跨 `server` 进程重启恢复的短期持久化记录，继续保持短 TTL、一次性消费和过期清理语义。
- 将 Builder Access Session 从纯内存 Map 改为可跨 `server` 进程重启恢复的短期持久化记录，继续保持 workspace-scoped cookie、过期校验和 access mismatch 规则。
- 明确 handoff 消费必须具备单 `server` 实例内的 per-handoff 串行语义，避免并发打开同一 handoff 时签发多个 access session。
- 明确 handoff 只有在 Builder Access Session 成功持久化后才能提交 consumed 状态，避免 access session 写入失败时永久消耗 handoff。
- 明确 Builder Access Session 的 accessId 作为浏览器 bearer token 写入 runtime store，server 重启后可直接通过 cookie 查回会话。
- 不新增 access cookie 签名配置；Builder Access Cookie bearer token 由 accessId 表示并随 access session record 持久化。
- 新增 access session 续期节流语义，避免每个受保护请求都写入文件存储。
- 明确当前 `unstorage` 文件实现只承诺单 `server` 实例语义；后续 Redis 或其他中间件通过同一 store 抽象接入，不作为本次实现目标。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-cms-integration`: CMS handoff 和 Builder Access Session 从进程内存态变为基于 runtime store 的短期持久化访问状态，并明确 accessId bearer token 持久化、续期节流和单实例文件存储边界。
- `page-builder-docker-deployment`: Docker 部署需要声明并挂载 CMS runtime store 所需持久化目录，补充 access session bearer token 敏感性和续期阈值等运行时输入说明。

## Impact

- 影响 CMS handoff 创建、消费、过期、重复消费和错误返回逻辑。
- 影响 Builder Access Session 创建、cookie 校验、workspace/session 匹配、滑动续期和过期清理逻辑。
- 影响 CMS Builder Access middleware 及依赖 access session 的 builder context、workspace preview、workspace-scoped CMS API 和受保护项目 API。
- 需要补充 handoff 并发消费、access session 写入失败、handoff consumed 提交失败和 durable record 包含可恢复 bearer token 且不含原始 CMS 凭据的测试。
- 需要新增 `unstorage` 相关依赖和项目内 store adapter，但不引入 Redis、SQLite 或外部中间件。
- 需要更新 Docker/env 示例与部署文档，说明默认文件持久化目录、bearer token 敏感性和续期阈值配置。
- 现有 `projects.json` CMS 项目绑定持久化保持不变，不在本次迁移范围内。
