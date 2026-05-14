## Why

CMS 集成模式已经能通过 handoff 签发 Builder Access Session，并且前端也已通过 builder context 受控进入项目；但后端仍有大量 session、workspace、page-builder 项目 API 可以被直接调用。现在需要把访问保护从“页面入口保护”收敛为“项目 API 保护”，避免用户绕过 CMS 入口直接读取、修改或删除 CMS 绑定项目。

## What Changes

- 新增统一的 CMS Builder Access API 保护层，作为浏览器侧项目 API 的唯一访问控制 owner。
- CMS 集成模式下，所有项目相关 session/workspace/page-builder API 按 workspace 或 workspace+session 维度校验 `ai_page_builder_access`。
- CMS 集成模式下，内部全量列表、本地创建、会破坏 CMS project binding 的删除/迁移类 API fail closed。
- CMS 集成模式下，旧全局 `/api/page-builder/cms/*` 暂时 fail closed；workspace-scoped CMS 数据路由由后续 `scope-cms-data-to-builder-workspace` change 恢复。
- 浏览器侧状态变更 API 增加 `Origin`/`Referer` 校验；普通 `GET`、preview HTML/static 和无项目数据的静态脚本不做一刀切 origin 校验。
- 受保护 API 仅在完整校验通过且业务响应成功时滑动续期 Builder Access Session，并重新写出 access cookie。
- 写页面、发送 Agent、edit lock 等现有写保护继续叠加；Builder Access Session 不替代 edit lock。
- 非 `/api/integrations/cms/*` 的受保护 API 在 CMS 模式下也返回 `{ code, error }` 结构化 CMS integration 错误。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `page-builder-cms-integration`: 增加 CMS 集成模式下项目 API 访问保护、统一 access middleware、滑动续期、Origin/Referer 校验、旧全局 CMS browser API fail closed 规则。
- `web-server`: 调整 CMS 集成模式下受保护 API 的错误响应契约，使非 integration routes 也能返回结构化 CMS integration 错误。
- `session-management`: 增加 CMS 集成模式下 session 列表、创建、读取、发送、停止、响应、删除和迁移 API 的保护或禁用规则。
- `page-builder-edit-lock`: 增加 CMS 集成模式下 edit-lock API 必须先通过 Builder Access Session 的要求。
- `page-builder-live-preview`: 将 workspace preview HTML/static 的 CMS access 校验纳入统一项目 API 保护规则，并保留非编辑态 preview 约束。
- `page-builder-offline-static-export`: 增加 CMS 集成模式下浏览器侧离线静态导出任务 API 的 access session 保护规则。
- `page-builder-cms-browser-dialog`: 明确 CMS 集成模式下 CMS browser 暂时不得使用旧全局 CMS browser API，直到后续 workspace-scoped CMS 数据路由恢复。

## Impact

- Affected routes:
  - `apps/app/src/main/http/routes/sessions.ts`
  - `apps/app/src/main/http/routes/workspaces.ts`
  - `apps/app/src/main/http/routes/page-builder.ts`
  - `apps/app/src/main/http/routes/cms-integration.ts`
  - `apps/app/src/main/http/app.ts`
- Affected middleware/context:
  - `apps/app/src/main/http/middleware/session.ts`
  - `apps/app/src/main/http/middleware/workspace.ts`
  - `apps/app/src/main/http/page-builder-edit-lock-auth.ts`
  - `apps/app/src/main/http/types.ts`
  - new `apps/app/src/main/lib/cms-integration/cms-builder-access-middleware.ts`
- Affected services:
  - `apps/app/src/main/lib/cms-integration/builder-access-session-service.ts`
  - `apps/app/src/main/lib/cms-integration/cms-integration-runtime.ts`
- Affected CMS browser frontend:
  - `apps/page-builder/src/renderer/components/builder/CmsBrowserDialog.tsx`
  - `apps/page-builder/src/renderer/components/builder/useCmsBrowserState.ts`
- Affected behavior:
  - standalone 模式 API 语义保持兼容。
  - CMS 集成模式在 Change 6 完成前，CMS browser 的旧全局数据接口会被安全收口为不可用。
  - 前端无需读取 access token；浏览器继续依赖同源 HttpOnly Cookie。
