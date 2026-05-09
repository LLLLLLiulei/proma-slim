## Context

当前 PageBuilder 已能在 standalone 模式下创建 page-builder workspace、创建 Agent session、进入 builder 并导出静态资源。但 CMS 集成场景需要 CMS 服务端只依赖一个长期稳定的 `projectId`，不能直接依赖内部 `workspaceId/sessionId`，也不能让浏览器或 PageBuilder 长期保存 CMS Cookie。

Change 1 已完成 public base path 支持。本 change 作为 Change 2，只补齐 CMS 集成的服务端基础能力：集成模式探测、server-to-server secret、CMS `/ui/login` 校验、project binding 和创建项目 API。后续 handoff/access session、前端入口保护、项目 API 保护、workspace-scoped CMS 数据代理和同步导出由后续 change 实现。

## Goals / Non-Goals

**Goals:**

- 在 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 下启用 CMS 集成基础能力，并保持 standalone 模式现有行为不变。
- 提供匿名只读 `GET /api/integrations/cms/status`，用于前端判断是否处于 CMS 集成模式。
- 为 CMS server-to-server 写接口提供 Bearer integration secret 校验。
- 使用 `X-CMS-Cookie` 在当前请求内调用 CMS `/ui/login`，并只保存必要用户摘要。
- 建立 `${PROMA_CONFIG_DIR}/integrations/cms/projects.json` project binding，将 `externalRecordId`、`siteId`、`projectId`、`workspaceId`、`primarySessionId` 持久化。
- 提供 `POST /api/integrations/cms/projects`，创建 page-builder workspace 和 primary session，并支持 `externalRecordId` 幂等重试。
- 为 CMS integration 路由返回结构化 `{ code, error }` 错误，不破坏现有非 integration API 的 `{ error }` 响应。

**Non-Goals:**

- 不实现 handoff、`openUrl`、Builder Access Session 或浏览器 access cookie。
- 不改造 HomePage、BuilderPage 或 CMS 集成模式前端入口。
- 不系统性保护现有 workspace/session/page-builder API。
- 不实现同步导出 ZIP。
- 不替换现有 CMS 数据读取 Gateway，也不复用旧 `PROMA_CMS_*` 账号密码配置作为本 change 的 `/ui/login` 凭据。
- 不持久化 CMS 原始 Cookie，不把 Cookie 写入 workspace、session、prompt、skill 输入或响应体。

## Decisions

### Decision 1: CMS 集成配置独立于旧 CMS Gateway 凭据

新增 `cms-integration-config.ts` 读取 `AI_PAGE_BUILDER_INTEGRATION_MODE`、`AI_PAGE_BUILDER_INTEGRATION_SECRET`、`AI_PAGE_BUILDER_CMS_BASE_URL` 和 `AI_PAGE_BUILDER_BASE_PATH`。只有 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 时，CMS 集成能力启用。

理由：现有 `page-builder-cms-config.ts` 服务于旧 CMS 数据浏览链路，包含账号密码型 token 获取配置；本 change 的 `/ui/login` 校验只需要 CMS 管理端 baseUrl 和当前用户 Cookie。两类凭据混用会扩大凭据边界，且容易把 CMS 数据读取账号误认为当前用户登录态。

兼容边界：`AI_PAGE_BUILDER_CMS_BASE_URL` 是本 change 的 `/ui/login` 权威 baseUrl；它可以作为同一个 CMS 管理端地址的统一配置入口，但 `/ui/login` validator 不从旧 `PROMA_CMS_BASE_URL`、`PROMA_CMS_USERNAME` 或 `PROMA_CMS_PASSWORD` fallback，也不依赖旧账号密码。现有旧 CMS Gateway 是否读取 `AI_PAGE_BUILDER_CMS_BASE_URL` 作为 baseUrl fallback 只属于配置兼容，不代表两条链路共享用户凭据。

替代方案：复用 `resolvePageBuilderCmsConfig()`。缺点是 standalone 缺少旧 CMS 账号密码时会影响新集成判断，也会使登录态校验依赖不相关的 username/password。

### Decision 2: status 接口只反映模式，不做配置健康检查

`GET /api/integrations/cms/status` 不校验 secret、不读取 `X-CMS-Cookie`、不调用 `/ui/login`，也不暴露 binding 或用户信息。`AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 时返回 `enabled: true`，同时返回当前实际规范化后的 `basePath`。

理由：status 是前端轻量探测接口，不应该因 CMS 上游异常拖慢或误伤首页渲染。写接口会在真正需要时校验 secret、baseUrl 和 Cookie。

替代方案：status 同时返回配置缺失状态。缺点是容易把部署诊断信息暴露给浏览器，并让前端根据配置细节分叉。

### Decision 3: CMS integration route 内集中映射结构化错误

扩展或复用 `HttpError` 时只对带 `code` 的 CMS integration 错误返回 `{ code, error }`。现有非 integration API 保持原有 `{ error }` 响应，避免影响前端和既有测试。

理由：CMS server-to-server 接口需要稳定错误码供 CMS 侧判断重试、重新登录或管理员排查；但全局修改所有 API 错误响应属于更大范围变更。

替代方案：全局 HTTP 错误都改成 `{ code, error }`。缺点是破坏面过大，不属于 Change 2。

### Decision 4: project binding 写入串行化并使用原子替换

新增 project binding store，使用进程内 mutex 串行化创建流程；创建前后都按 `externalRecordId` 二次检查；写入时先写临时文件，再 rename 到 `projects.json`。

理由：CMS 创建接口会被重试，甚至可能并发重试。同一进程内必须避免重复创建多个对外可见项目，并避免部分写入导致 binding 文件损坏。

替代方案：简单读写 JSON 文件。缺点是并发创建时可能生成多个 workspace/session，也可能在进程中断时留下损坏文件。

### Decision 5: 幂等命中以 `externalRecordId` 为主，`siteId` 不一致视为冲突

首次创建成功后，同一 `externalRecordId` 重试返回同一 `projectId`。若已有 binding 的 `siteId` 与本次请求不同，或绑定的 workspace/session 已丢失，则返回 `project_conflict`。`projectName` 变化不作为冲突，也不在本 change 内同步重命名。

理由：`externalRecordId` 是 CMS 已确认稳定提供的幂等键；`siteId` 决定后续 CMS 数据边界，不能静默切换。项目名属于展示信息，后续可由专门同步接口处理。

幂等安全边界：即使命中已有 `externalRecordId`，系统也必须先完成 integration secret 和当前 `X-CMS-Cookie` 登录态校验，再返回已有 `projectId`。否则攻击者只要知道外部记录 ID 就能探测项目绑定是否存在。

替代方案：每次重试更新项目名和 siteId。缺点是会让重试请求具备隐式修改项目归属的副作用。

### Decision 6: 创建项目接口显式拒绝 `prompt`

`POST /api/integrations/cms/projects` 收到 `prompt` 字段时返回 `invalid_request`，而不是静默忽略。

理由：第一期要求 CMS 创建项目只初始化 workspace/session，不自动发送 Agent 消息。显式拒绝能尽早暴露 CMS 接入错误，防止调用方误以为 prompt 已生效。

替代方案：忽略 `prompt`。缺点是 CMS 侧可能长期误配置且难以发现。

## Risks / Trade-offs

- [同一进程互斥不覆盖多实例并发] → 第一期明确只支持单 PageBuilder 实例；多实例共享 binding 需要后续引入数据库或分布式锁。
- [workspace/session 已创建但 binding 写入失败会产生孤儿资源] → 创建失败时尝试清理刚创建的 workspace/session；清理失败也不得返回 `projectId`，后续通过维护脚本清理孤儿 workspace。
- [status 返回 enabled 但写接口因配置缺失失败] → 这是有意设计；status 只用于前端模式判断，部署健康由写接口结构化错误和日志暴露。
- [CMS Cookie 可能很大或包含敏感信息] → 新增代码不主动打印 Cookie，不写入 binding/session/workspace；代理 header 大小限制在部署联调阶段验证。
- [旧 CMS Gateway 和新 CMS integration 同时存在] → 配置模块分离，避免旧账号密码链路影响当前用户 Cookie 校验。
- [HTTP 200 但 `/ui/login` payload 不是已登录] → 按 `cms_login_expired` 处理；网络失败、非 2xx、非 JSON 或响应结构不可判定则按 `cms_login_unavailable` 处理。

## Migration Plan

- 默认未设置 `AI_PAGE_BUILDER_INTEGRATION_MODE` 时保持 standalone 行为，不需要迁移已有 workspace/session。
- 开启 CMS 集成时，由部署环境显式配置 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`、`AI_PAGE_BUILDER_INTEGRATION_SECRET`、`AI_PAGE_BUILDER_CMS_BASE_URL` 和按需配置 `AI_PAGE_BUILDER_BASE_PATH`。
- 新增 `projects.json` 只记录开启集成后由 CMS 创建的项目；已有 standalone 项目不会自动转换为 CMS project binding。
- 回滚时关闭 `AI_PAGE_BUILDER_INTEGRATION_MODE` 即可恢复 standalone 行为；已写入的 binding 文件不会被自动删除，但也不会被 standalone 首页使用。

## Open Questions

无。当前实现按已确认边界执行：创建项目接口拒绝 `prompt`，新 CMS integration 登录态校验不从旧 `PROMA_CMS_*` 凭据 fallback，`externalRecordId + siteId` 是幂等安全复用边界。
