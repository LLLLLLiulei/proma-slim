## Why

CMS 集成模式下，旧全局 `/api/page-builder/cms/*` CMS 数据浏览和资产代理已经被 fail closed，但 Builder 页面尚未提供可按 workspace、Builder Access Session 和 project binding `siteId` 约束的替代读取链路，导致集成模式下 CMS 浏览弹框只能显示暂不可用。

本变更需要恢复 CMS 集成模式下的 CMS 数据选择与预览能力，同时避免浏览器绕过 CMS handoff 或通过 query/body 切换到其他站点读取数据。

## What Changes

- 新增 workspace-scoped CMS 数据浏览和资产代理 API：`/api/workspaces/:workspaceId/page-builder/cms/*`。
- CMS 集成模式下，workspace-scoped CMS API 必须校验 Builder Access Session，并要求 access session 的 `workspaceId` 与 URL 中的 `workspaceId` 匹配。
- CMS 集成模式下，CMS 数据读取必须以 project binding 的 `siteId` 作为默认和上限；query 或业务 payload 不得越过该绑定站点。
- CMS 集成模式下，旧全局 `/api/page-builder/cms/*` 继续保持 fail closed，不作为匿名入口。
- Builder 页面在 CMS 集成模式下恢复 CMS 浏览弹框，并让弹框使用 workspace-scoped CMS API；standalone 模式继续使用旧全局 CMS browser API。
- preview HTML、CMS rendering preview runtime 和 CMS 图片预览 helper 在需要 workspace 上下文时使用 workspace-scoped CMS 资产代理。
- 保持 CMS 数据实时读取语义，相关列表/详情/资产响应继续使用 no-store 缓存策略。
- 不切换到 CMS UI 数据接口，不重构静态导出核心流程。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-cms-integration`: CMS 集成模式新增 workspace-scoped CMS 数据与资产访问规则，并继续拒绝旧全局 CMS browser API。
- `page-builder-cms-browser-dialog`: CMS 集成模式下 CMS 浏览弹框从暂不可用变为使用 workspace-scoped CMS API 读取站点、栏目、内容和图片。
- `page-builder-cms-rendering-preview`: preview runtime 在 workspace 上下文中使用 workspace-scoped CMS 数据代理作为等价宿主管理读取路径。
- `page-builder-live-preview`: preview HTML 中的 CMS 远程资源代理 URL 在 workspace 上下文中改为 workspace-scoped 资产代理。
- `page-builder-cms-auto-agent-handoff`: CMS 集成模式下自动 handoff 必须校验 `selection.siteId` 不越过当前 project binding。

## Impact

- 后端路由：`apps/app/src/main/http/routes/workspaces.ts`、`apps/app/src/main/http/routes/page-builder.ts`。
- CMS 读取与配置：`apps/app/src/main/lib/cms-gateway.ts`、`apps/app/src/main/lib/page-builder-cms-config.ts`、CMS integration project binding/access middleware 相关模块。
- preview 生成：`apps/app/src/main/lib/workspace-preview-service.ts`、`apps/app/src/main/lib/page-builder-cms-rendering-preview.ts`。
- 前端 API client 与 Builder UI：`apps/app/src/renderer/lib/api.ts`、`apps/page-builder/src/renderer/pages/BuilderPage.tsx`、`CmsBrowserDialog`、`useCmsBrowserState`、`CmsCatalogDetailPanel`、`CmsContentList`、`cmsPreviewImage.ts`。
- 规格文档：更新 CMS 集成、CMS 浏览弹框、CMS rendering preview、live preview 相关要求。
- 测试：新增/调整 HTTP 路由、前端 CMS browser、preview URL 生成与 CMS 模式访问控制测试。
