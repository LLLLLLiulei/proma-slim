## Why

当前 page-builder 的 CMS 读取链路仍依赖旧的 `/ui/*` 接口和 Cookie 登录态，与已验证可用的 slim API 文档不一致，也使宿主配置、鉴权刷新和资源代理策略变得脆弱。现在已经确认 slim API 的真实返回结构、`siteID` 语义和资源访问约束，可以将 CMS 接入统一迁移到 `/manager/api/*`，同时收缩当前内容摘要契约中无法由新接口稳定提供的字段。

## What Changes

- 将 page-builder CMS 读取链路从旧 `/ui/*` 接口迁移到 slim API `/api/*`，并要求 `baseUrl` 直接包含 `/manager` 前缀。
- 将宿主 CMS 配置模型从 `ZUSID`/`CurrentSite`/Cookie 改为 `baseUrl`、`siteID`、`username`、`password`，其中 `siteID` 默认使用 `1` 并允许显式配置。
- 在宿主侧引入基于 `username/password` 的 token 获取与按过期时间刷新的 Bearer 鉴权，而不是透传 Cookie 登录态。
- 保留 `/api/page-builder/cms/assets` 资源代理通路，但去除资源请求鉴权头依赖，继续通过受控代理重写预览和导出中的 CMS 资源 URL。
- **BREAKING** 简化 page-builder 归一化 CMS 内容摘要契约，移除无法由 slim API 稳定提供的 `shape`、`assetCounts` 与 `assetHints` 语义。
- 将栏目详情读取改为基于 `/api/catalogs` 或 `/api/catalogsTree` 的组装结果，而不再依赖旧的栏目详情接口。
- 清理仅服务于旧 UI 接口的内容查询参数和兼容逻辑，使 page-builder CMS 查询契约与 slim API 能力对齐。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `page-builder-cms-browser-dialog`: CMS 浏览弹框改为消费 slim API 支撑的栏目和内容摘要，并去除对内容形状与素材计数展示的依赖。
- `page-builder-cms-rendering-core`: 归一化 CMS content query/result 与 ViewModel 契约收缩为 slim API 能稳定提供的基础摘要字段。
- `page-builder-cms-sdk-tools`: 宿主管理的 CMS tools 改为使用 `username/password + token` 鉴权上下文，并返回简化后的内容摘要结果。

## Impact

- Affected code: `apps/app/src/main/lib/cms-gateway.ts`, `apps/app/src/main/lib/page-builder-cms-config.ts`, `apps/app/src/main/http/routes/page-builder.ts`, `apps/app/src/main/lib/cms-sdk-tools.ts`, `apps/app/src/main/lib/workspace-preview-service.ts`, `apps/app/src/main/lib/page-builder-static-export-service.ts`, `packages/shared/src/types/page-builder-cms.ts`, `packages/page-builder-cms-rendering/*`, `apps/page-builder/src/renderer/components/builder/*`.
- Affected APIs: `/api/page-builder/cms/catalogs`, `/api/page-builder/cms/catalogs/:catalogId`, `/api/page-builder/cms/contents`, `/api/page-builder/cms/assets`, 以及宿主 CMS 配置文件/环境变量契约。
- Affected systems: page-builder CMS 浏览弹框、CMS runtime SDK tools、CMS rendering preview、离线静态导出中的 CMS 资源本地化。
