## Why

CMS 创建 AI 专题项目后，当前 PageBuilder 还缺少从 CMS 受控打开构建页或最新预览页的短期访问链路，用户仍可能通过内部 `workspaceId/sessionId` 或 workspace preview URL 绕过 CMS 入口。

本 change 在已有 project binding 基础上补齐 handoff、Builder Access Session 和最小后端访问校验，使 CMS 可以用 `projectId` 安全地打开 builder/preview，并为后续前端 gating 和全量项目 API 保护提供基础。

## What Changes

- 新增 CMS 项目 handoff 创建接口：CMS 服务端使用 `projectId`、integration secret 和当前 `X-CMS-Cookie` 创建短期一次性 `openUrl`。
- 新增 handoff 消费接口：浏览器访问 `openUrl` 后签发 `ai_page_builder_access` HttpOnly Cookie，并 302 到 builder 或 workspace preview。
- 新增 Builder Access Session 内存服务：保存 `projectId/workspaceId/sessionId` 与用户摘要，不保存原始 CMS Cookie。
- 新增 builder context 接口：浏览器通过 access cookie 获取当前项目上下文；无 access 或不匹配时返回结构化错误。
- CMS 集成模式下对 workspace preview HTML 和静态子资源增加最小 access session 校验，避免直接复制 preview URL 绕过 CMS。
- builder SPA shell 和 workspace preview HTML 支持同源 iframe 嵌入响应头要求，且 CMS preview handoff 打开的预览页不注入编辑态 preview bridge。
- 保持 standalone 模式不变；`AI_PAGE_BUILDER_BASE_PATH` 缺省为空，配置为空时 access cookie 使用 `Path=/`。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `page-builder-cms-integration`: 增加 handoff、Builder Access Session、builder context、access cookie 和 CMS 受控打开 builder/preview 的集成契约。
- `page-builder-live-preview`: 增加 CMS 集成模式下 workspace preview HTML/静态子资源的最小 access session 校验，以及 CMS preview handoff 打开的非编辑态预览要求。
- `web-server`: 增加 handoff/builder-context 路由承载、PageBuilder Web forwarded proto/host 传递和 builder shell iframe 响应头要求。

## Impact

- 后端 API：新增 `POST /api/integrations/cms/projects/:projectId/handoffs`、`GET /api/integrations/cms/handoffs/:handoffId/open`、`GET /api/integrations/cms/builder-context`。
- 后端模块：新增 `cms-handoff-service`、`builder-access-session-service` 和最小 access session 校验 helper。
- 预览服务：CMS 集成模式下保护 `/api/workspaces/:workspaceId/preview*`，并区分 builder 编辑态 iframe 与 CMS preview handoff 的非编辑态预览。
- Web 服务：PageBuilder Web 代理到 server 时传递可信 forwarded headers；生产 SPA shell HTML 增加 `frame-ancestors 'self'`。
- 配置：新增 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`、`AI_PAGE_BUILDER_HANDOFF_TTL_MS`、`AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS`。
- 测试：补充 handoff/access session 单元测试、CMS integration route 测试、preview access 测试和 PageBuilder Web header/forwarded header 测试。
