## 1. Access Session 服务与错误响应基础

- [x] 1.1 为 `BuilderAccessSessionService` 增加按现有 access cookie 滑动续期的服务方法，并覆盖成功续期、过期记录、未知 accessId、cookie 属性刷新测试。
- [x] 1.2 扩展 CMS integration 错误码，新增 `builder_access_origin_forbidden`，并扩展 HTTP 错误处理，使 `CmsIntegrationError` 在非 `/api/integrations/cms/*` 路由中也返回 `{ code, error }`，且普通 `HttpError` 仍保持既有 `{ error }` 结构。
- [x] 1.3 扩展 `HttpAppEnv` 请求上下文类型，支持保存 CMS builder access context，包括 `projectId`、`workspaceId`、`sessionId` 和用户摘要。

## 2. 统一 CMS Builder Access Middleware

- [x] 2.1 新增 `cms-builder-access-middleware.ts`，实现 standalone 放行、CMS 模式 access cookie 校验、workspace/session 匹配和上下文挂载。
- [x] 2.2 在 middleware 中实现状态变更 API 的 `Origin`/`Referer` 校验，覆盖 `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 缺失或非法时 fail closed，并确保普通 `GET`、preview HTML/static、无项目数据静态脚本不因缺少 `Origin` 被拒绝。
- [x] 2.3 在 middleware 中实现成功响应后的滑动续期，并确保鉴权失败、mismatch、来源失败和业务失败不续期。
- [x] 2.4 将 `builder-context` 和 workspace preview 中已有的手写 access 校验收敛到统一 middleware。

## 3. Session API 保护

- [x] 3.1 在 CMS 模式下拒绝 `GET /api/sessions` 和 `POST /api/sessions`，确保全量列表不暴露、本地创建不绕过 CMS project binding。
- [x] 3.2 在 CMS 模式下保护 session messages、activity 和 attachment content，按 `workspaceId + sessionId` 匹配 Builder Access Session。
- [x] 3.3 在 CMS 模式下保护 send、stop、patch、permission-respond 和 ask-user-respond，叠加来源校验，并保持 `send` 继续要求 page-builder edit lock。
- [x] 3.4 在 CMS 模式下确保 permission-respond 和 ask-user-respond 的 `requestId` 归属于 URL 中的 `:sessionId`，跨 session 或无法确认归属时拒绝且不执行响应。
- [x] 3.5 在 CMS 模式下禁用 session 删除和 move-workspace，避免破坏 CMS project binding。

## 4. Workspace API 保护

- [x] 4.1 在 CMS 模式下拒绝 `GET /api/workspaces` 和 `POST /api/workspaces`，确保全量列表不暴露、本地创建不绕过 CMS project binding。
- [x] 4.2 在 CMS 模式下保护 workspace patch，并直接禁用 workspace delete 以避免破坏 CMS project binding。
- [x] 4.3 在 CMS 模式下保护 capabilities、directory-context、preview-state、file-search，按 workspace 匹配 Builder Access Session。
- [x] 4.4 在 CMS 模式下保护 cms-target-snapshot、cms-auto-handoff、inline-text、block-delete、image replacement 等 page-builder workspace API，并保留现有 edit lock 校验。
- [x] 4.5 在 CMS 模式下保护 export-static-jobs 创建、状态查询和下载，创建请求叠加来源校验。

## 5. PageBuilder 项目 API 与 CMS Browser 收口

- [x] 5.1 在 CMS 模式下拒绝 `GET /api/page-builder/projects`，确保不返回全量 page-builder 历史项目列表。
- [x] 5.2 在 CMS 模式下禁用 `DELETE /api/page-builder/projects/:workspaceId`，避免浏览器删除 CMS project binding 指向的项目资源。
- [x] 5.3 在 CMS 模式下保护 edit-lock acquire、renew、status、release，workspace 必须匹配 Builder Access Session，状态变更叠加来源校验。
- [x] 5.4 在 CMS 模式下让旧全局 `/api/page-builder/cms/sites|catalogs|contents|assets` fail closed，standalone 模式继续保持现有行为。
- [x] 5.5 确认 `preview-bridge.js`、`cms-rendering-preview.js`、`cms-rendering-vue.js` 等无项目数据静态脚本不被误纳入 access cookie 强校验。
- [x] 5.6 调整 CMS 浏览弹框在 CMS 集成模式下的行为，确保 Change 6 前不再调用旧全局 CMS browser API，并展示明确的暂不可用或读取失败状态。

## 6. 测试与验证

- [x] 6.1 增加 CMS access middleware 单元测试，覆盖缺 cookie、签名无效、过期、workspace mismatch、session mismatch、来源校验、public origin 缺失或非法、成功续期和失败不续期。
- [x] 6.2 增加 session route HTTP 测试，覆盖 CMS 模式下列表/创建拒绝、messages/activity/attachments/send/stop/permission/ask-user 保护、permission/ask-user 跨 session requestId 拒绝、delete/move-workspace 禁用。
- [x] 6.3 增加 workspace route HTTP 测试，覆盖 workspace root 列表/创建/删除的 CMS 模式 fail closed、workspace patch、capabilities、directory-context、preview-state、preview/static、file-search、page-builder 编辑 API、export job API 的保护和来源规则。
- [x] 6.4 增加 page-builder route HTTP 测试，覆盖 projects 列表/删除、edit-lock、无项目数据静态脚本、旧全局 CMS browser API 的 CMS 模式 fail closed 和 standalone 兼容。
- [x] 6.5 增加 CMS browser 弹框相关测试，覆盖 CMS 模式下不调用旧全局 CMS browser API、Change 6 前展示不可用状态、standalone 模式继续兼容旧读取链路。
- [x] 6.6 运行相关 OpenSpec 校验、HTTP route 测试、CMS integration 测试和 TypeScript typecheck，并记录结果。
