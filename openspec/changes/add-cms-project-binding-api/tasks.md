## 1. 配置与错误基础

- [x] 1.1 新增 CMS integration 配置解析模块，读取 `AI_PAGE_BUILDER_INTEGRATION_MODE`、`AI_PAGE_BUILDER_INTEGRATION_SECRET`、`AI_PAGE_BUILDER_CMS_BASE_URL` 和 `AI_PAGE_BUILDER_BASE_PATH`
- [x] 1.2 为 CMS integration 定义结构化错误类型和错误响应 helper，保证 `/api/integrations/cms/*` 返回 `{ code, error }`
- [x] 1.3 明确 `AI_PAGE_BUILDER_CMS_BASE_URL` 是 `/ui/login` 权威 baseUrl，登录态校验不得从旧 `PROMA_CMS_*` 账号密码配置读取当前用户凭据
- [x] 1.4 补充 CMS integration 配置与错误映射单元测试，覆盖 standalone、cms、配置缺失、无效 baseUrl 和 status 不暴露配置细节场景

## 2. CMS 登录态与 secret 校验

- [x] 2.1 实现 integration secret 校验 helper，支持 `Authorization: Bearer <secret>` 并返回 `integration_unauthorized`
- [x] 2.2 实现 CMS `/ui/login` validator，使用 `X-CMS-Cookie` 作为上游 `Cookie` header 并提取必要用户摘要
- [x] 2.3 补充缺失或空白 `X-CMS-Cookie` 测试，确保返回 `invalid_request` 且不调用 CMS `/ui/login`
- [x] 2.4 补充登录态校验测试，覆盖成功、HTTP 200 但 `status !== 1`、HTTP 200 但 `data.logined !== true`、401/403、500/502、网络失败、非 JSON 和格式异常响应
- [x] 2.5 检查新增代码路径，确保不主动记录、返回或持久化原始 CMS Cookie 和 integration secret

## 3. Project Binding Store

- [x] 3.1 在 `config-paths.ts` 或 CMS integration 模块中新增 `${PROMA_CONFIG_DIR}/integrations/cms/projects.json` 路径解析
- [x] 3.2 实现 project binding store 的读取、按 `projectId` 查询、按 `externalRecordId` 查询和内部资源存在性校验
- [x] 3.3 实现串行化创建流程、写前二次检查、临时文件写入和 rename 原子替换
- [x] 3.4 实现 `externalRecordId` 幂等复用、`siteId` 不一致冲突、workspace/session 缺失冲突规则，并在首次写入时记录 `lastValidatedAt`
- [x] 3.5 确保 `projectId` 独立生成且不等于内部 `workspaceId` 或 `primarySessionId`
- [x] 3.6 补充 binding store 测试，覆盖首次写入、幂等命中、冲突、文件损坏恢复、`lastValidatedAt` 和并发创建同一 `externalRecordId`

## 4. CMS Integration HTTP Routes

- [x] 4.1 新增 `apps/app/src/main/http/routes/cms-integration.ts` 并在 `http/app.ts` 注册 `/api/integrations/cms`
- [x] 4.2 实现 `GET /api/integrations/cms/status`，确保不要求 secret、不接收 Cookie、不触发 `/ui/login`
- [x] 4.3 实现 `POST /api/integrations/cms/projects` 请求体校验，缺字段、空字符串或包含 `prompt` 时返回 `invalid_request`
- [x] 4.4 创建项目时按顺序执行 secret 校验、CMS 登录态校验、binding 幂等检查、workspace 创建、primary session 创建和 binding 写入；幂等命中也必须先通过当前请求鉴权与登录态校验
- [x] 4.5 binding 写入失败时阻止返回可用 `projectId`，并尝试清理本次刚创建的 workspace/session
- [x] 4.6 补充 HTTP route 测试，覆盖 status、鉴权失败、缺失 Cookie、登录态失败、baseUrl 缺失或非法、首次创建、幂等重试前重新校验 Cookie、参数非法和 prompt 拒绝

## 5. 现有能力契约与文档环境

- [x] 5.1 验证 CMS 创建的 workspace 使用 `template: "page-builder"`，并继续触发现有 page-builder workspace 初始化逻辑
- [x] 5.2 验证 CMS 创建的 primary session 归属于新 workspace，且消息列表为空、Agent 未启动
- [x] 5.3 验证 CMS 创建返回的 `projectId` 不等于内部 `workspaceId` 或 `primarySessionId`
- [x] 5.4 更新 `build/.env.example`，补充 CMS 集成模式相关环境变量且不写入真实 secret
- [x] 5.5 确认 standalone 模式下现有首页创建、workspace/session API 和 page-builder 历史列表行为不变

## 6. 验证

- [x] 6.1 运行 `openspec validate add-cms-project-binding-api --strict`
- [x] 6.2 运行新增 CMS integration 相关单元测试和 HTTP route 测试
- [x] 6.3 运行受影响的 workspace/session/page-builder 路由回归测试
- [x] 6.4 运行 `git diff --check`，确认无格式或空白错误
