## Context

前置 change 已经建立了 CMS 集成模式的基础链路：CMS server-to-server 创建项目、创建 handoff，浏览器消费 handoff 后得到 `ai_page_builder_access`，BuilderPage 再通过 builder context 受控加载当前 `workspace/session`。但当前后端只有 builder context 和 workspace preview 做了局部校验，其他 session、workspace、page-builder 项目 API 仍沿用 standalone 匿名访问语义。

这意味着在 CMS 集成模式下，只要知道内部 `workspaceId` 或 `sessionId`，仍可能直接调用消息读取、Agent 发送、preview-state、edit-lock、项目删除、导出任务等 API。Change 5 要补齐的是后端访问面收口，而不是再增加新的 CMS 入口或前端门控。

## Goals / Non-Goals

**Goals:**

- 在 CMS 集成模式下统一保护浏览器侧项目 API，避免绕过 CMS handoff。
- 将 access cookie 解析、签名校验、session 查找、过期判断、workspace/session 匹配、Origin/Referer 校验和滑动续期集中到统一模块。
- 让 session-scoped API 按 `workspaceId + sessionId` 校验，workspace-scoped API 按 `workspaceId` 校验。
- 禁用 CMS 模式下会破坏 CMS project binding 的本地生命周期 API。
- 在 CMS 模式下让旧全局 `/api/page-builder/cms/*` fail closed，等待 Change 6 迁移到 workspace-scoped CMS 数据路由。
- 保持 standalone 模式当前 API 行为兼容。

**Non-Goals:**

- 不实现 workspace-scoped CMS browser API；该能力由 Change 6 独立处理。
- 不实现 CMS 同步导出 server-to-server API；该能力由 Change 7 独立处理。
- 不判断 CMS 业务角色、栏目权限或专题业务权限。
- 不引入 Redis/DB 存储 Builder Access Session。
- 不改变前端读取 access token 的方式；前端继续只依赖同源 HttpOnly Cookie。

## Decisions

### 1. 新增统一 CMS Builder Access middleware

新增 `cms-builder-access-middleware.ts`，作为 CMS 集成模式下浏览器侧项目 API 的唯一访问控制 owner。业务 route 不应自行读取 cookie 或更新 `expiresAt`。

该模块负责：

- 读取 `resolveCmsIntegrationConfig()`，standalone 模式直接放行。
- 解析 `ai_page_builder_access` Cookie 并调用 `BuilderAccessSessionService.validate()`。
- 根据 route 语义校验 `workspaceId` 或 `workspaceId + sessionId`。
- 对状态变更 API 校验 `Origin` 或 `Referer` 属于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`。
- 校验成功后把 `projectId`、`workspaceId`、`sessionId`、用户摘要等上下文挂到 Hono context。
- 在下游 route 成功返回后滑动续期。

替代方案是在每个 route 手写校验。拒绝该方案，因为它会导致续期、错误结构和 Origin/Referer 规则分散，后续很难证明所有 API 一致受保护。

### 2. 按 API 作用域分类处理

API 保护按作用域分类：

| 类型 | 示例 | CMS 模式处理 |
|---|---|---|
| 匿名只读模式探测 | `GET /api/integrations/cms/status` | 继续匿名允许 |
| CMS server-to-server | `POST /api/integrations/cms/projects`、`handoffs` | 继续使用 integration secret + `X-CMS-Cookie` |
| session-scoped 浏览器 API | messages、send、activity、attachments、stop、permission/ask-user response | 校验 access session 的 `workspaceId + sessionId` |
| workspace-scoped 浏览器 API | capabilities、directory-context、preview-state、preview、file-search、page-builder 编辑和导出 job API | 校验 access session 的 `workspaceId` |
| unscoped 内部列表/创建 | `GET/POST /api/workspaces`、`GET/POST /api/sessions`、`GET /api/page-builder/projects` | CMS 模式 fail closed |
| 破坏 binding 的生命周期 API | delete workspace/session/page-builder project、move-workspace | CMS 模式 fail closed |

全量列表和本地创建不尝试返回“当前项目子集”，因为 CMS 集成模式下前端已经由 builder context 获取上下文，保留这些 API 容易重新引入 standalone 恢复路径。

### 3. 状态变更 API 才校验 Origin/Referer

只对浏览器侧状态变更 API 做 CSRF 防护：`POST`、`PATCH`、`DELETE`，以及触发 Agent、写 workspace、写 page-builder 文件、创建导出任务、acquire/renew/release edit lock 的请求。普通 `GET`、preview HTML、preview static、图片/CSS/JS 和无项目数据的静态脚本不要求 `Origin`。

校验顺序：

1. 优先读取 `Origin`。
2. 没有 `Origin` 时读取 `Referer` 并取其 origin。
3. 必须等于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`。
4. CMS 模式启用但 public origin 缺失时，状态变更 API fail closed。

来源校验失败使用新的 CMS integration 错误码 `builder_access_origin_forbidden`，避免把 CSRF/来源问题混同为缺少 access cookie 或 workspace/session mismatch。

这样可以避免静态资源和浏览器普通导航因没有 Origin header 被误拒，同时仍避免仅依赖 Cookie 的跨站请求风险。

### 4. 成功后滑动续期

`BuilderAccessSessionService` 需要补充 `renew`/`touch` 能力，允许 middleware 在业务响应成功后更新内存 `expiresAt` 并重新写出 `Set-Cookie`。

续期规则：

- 仅当 access 校验完整通过、workspace/session 匹配、Origin/Referer 通过且下游响应 `status < 400` 时续期。
- 鉴权失败、mismatch、Origin/Referer 失败、业务 4xx/5xx、edit lock 冲突都不续期。
- cookie 值可保持原签名 access id，不需要重新生成 access id。

### 5. 非 integration route 也返回 CMS 结构化错误

现有 `web-server` spec 约束只有 `/api/integrations/cms/*` 使用 `{ code, error }`，但 Change 5 会让 `/api/sessions/*`、`/api/workspaces/*`、`/api/page-builder/*` 在 CMS 模式下抛出 `builder_access_required` / `builder_access_mismatch`。这些错误也必须保留 `{ code, error }`，否则前端和联调无法稳定识别 CMS access 失败。

实现上可在 `app.onError` 中识别 `CmsIntegrationError`，或让 middleware 直接返回 `toCmsIntegrationErrorResponse()`。推荐统一由错误处理处理，减少 route 分支。

### 6. 旧全局 CMS browser API 在 CMS 模式下 fail closed

`/api/page-builder/cms/sites|catalogs|contents|assets` 当前没有 workspace 上下文，无法证明请求属于哪个 CMS project binding，也无法用 binding 的 `siteId` 限制访问。Change 5 不迁移这些 API，因此 CMS 模式下应直接拒绝旧全局入口。

这会导致 CMS 集成模式下 CMS browser 暂时不可用，直到 Change 6 引入 workspace-scoped CMS browser 路由。这是有意的安全收口，不是功能遗漏。

## Risks / Trade-offs

- CMS browser 在 Change 5 和 Change 6 之间不可用 → 在 proposal、spec 和任务中明确这是阶段性安全收口，并在 Change 6 恢复 workspace-scoped 能力。
- 受保护 API 覆盖面遗漏 → 通过 route 清单和 HTTP 路由测试覆盖 `/api/sessions`、`/api/workspaces`、`/api/page-builder` 关键路径。
- 过度校验 Origin 导致 preview/static 失败 → 只对状态变更 API 校验 Origin/Referer，并为 preview static 增加测试。
- 结构化错误影响 standalone 既有 API → 仅在抛出 `CmsIntegrationError` 时返回 `{ code, error }`，普通 `HttpError` 保持原结构。
- 禁用删除/迁移 API 影响某些隐藏前端入口 → CMS 集成模式已经禁止 standalone 历史和本地入口；如果仍有隐藏入口触发，应返回明确 CMS access 错误而不是执行破坏性操作。

## Migration Plan

- standalone 模式不迁移、不改变现有 API 语义。
- CMS 集成模式部署后，旧全局 CMS browser API 先安全收口为不可用，避免继续匿名暴露 CMS 数据。
- 后续 `scope-cms-data-to-builder-workspace` change 引入 workspace-scoped CMS 数据路由后，再恢复 CMS browser 在 CMS 集成模式下的可用性。
- 如需回滚，可关闭 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 回到 standalone 访问语义；已签发的内存 Builder Access Session 随进程重启自然失效。

## Open Questions

无。当前范围按已确认的 Change 5 边界执行。
