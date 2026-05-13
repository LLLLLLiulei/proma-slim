## Why

PageBuilder 需要作为 CMS 的底层页面构建服务被服务端集成使用，但当前只有独立模式下的 workspace/session 创建能力，CMS 无法获得长期稳定的 `projectId`，也无法通过当前 CMS 登录态受控初始化 AI 专题项目。

本 change 先补齐 CMS server-to-server 创建项目的基础闭环，为后续 handoff/access session、前端入口保护、项目 API 保护和同步导出提供稳定的 project binding 基础。

## What Changes

- 新增 CMS 集成模式配置解析，支持 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，并保证 standalone 模式不因缺少 CMS 集成配置而失败。
- 新增匿名只读状态接口 `GET /api/integrations/cms/status`，供前端判断当前是否处于 CMS 集成模式。
- 新增 CMS server-to-server integration secret 校验能力，用于保护 CMS 集成写接口。
- 新增 CMS `/ui/login` Cookie 校验能力，仅在当前请求内转发 `X-CMS-Cookie`，不持久化、不返回、不主动记录原始 Cookie。
- 新增 project binding 持久化能力，将 CMS 外部记录 `externalRecordId` 与内部 page-builder workspace/session 绑定到长期稳定的 `projectId`。
- 新增 `POST /api/integrations/cms/projects`，支持 CMS 创建 AI 专题项目并基于 `externalRecordId` 幂等重试。
- 新增 CMS integration 结构化错误响应 `{ code, error }`，覆盖鉴权失败、CMS 登录态失效、CMS 登录接口不可用、请求非法和项目冲突等场景。
- 创建项目接口不接收 prompt，不写入初始用户消息，不自动启动 Agent。

## Capabilities

### New Capabilities

- `page-builder-cms-integration`: 定义 PageBuilder 作为 CMS 底层服务时的集成模式探测、CMS server-to-server 鉴权、CMS 登录态校验、项目绑定和创建项目 API 契约。

### Modified Capabilities

- `app-workspace-identity`: 明确 CMS 创建项目时复用现有 page-builder workspace 身份，并将内部 workspace/session 作为 project binding 的实现细节。
- `session-management`: 明确 CMS 创建项目时只创建 primary session 元数据，不写入初始消息，不启动 Agent。
- `web-server`: 明确新增 `/api/integrations/cms/*` HTTP 路由与结构化 CMS integration 错误响应边界。

## Impact

- 影响后端 HTTP 路由注册：`apps/app/src/main/http/app.ts` 与新增 `apps/app/src/main/http/routes/cms-integration.ts`。
- 影响后端错误响应能力：`apps/app/src/main/http/errors.ts`、`apps/app/src/main/http/responses.ts` 或 CMS integration route 内集中错误封装。
- 新增 CMS integration 服务模块：配置解析、secret 校验、CMS 登录态校验、project binding store。
- 复用现有 `workspace-service.ts` 和 `agent-session-manager.ts` 创建 page-builder workspace 与 primary session。
- 新增运行态数据文件 `${PROMA_CONFIG_DIR}/integrations/cms/projects.json`。
- 更新 Docker/env 示例，补充 CMS 集成模式所需环境变量。
- 新增单元测试和 HTTP route 测试，覆盖 standalone 兼容、CMS 登录态校验、幂等创建和敏感信息不落盘。
