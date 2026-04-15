## 1. Host CMS Contract

- [x] 1.1 调整 `packages/shared` 中 CMS query / selection 类型，新增站点 summary 与 `siteId` 字段，并升级 `PageBuilderCmsSelectionResult` 版本
- [x] 1.2 重构 `resolvePageBuilderCmsConfig`、`CmsGateway` 与 `CmsTokenProvider`，移除宿主静态 `siteID` 运行时依赖并改为按请求接收 `siteId`
- [x] 1.3 为 page-builder 宿主路由与 renderer API 增加站点列表接口，以及 `catalogs` / `contents` / `catalog detail` 的显式 `siteId` 参数与默认站点 `1` 回退

## 2. Builder Selection Flow

- [x] 2.1 更新 `CmsBrowserDialog` 与 `useCmsBrowserState`，在 tabs 前增加站点下拉框，并在切站点时重置站点范围内缓存、分页与勾选状态
- [x] 2.2 更新 CMS 选择确认结果、自动 handoff payload 与 `cms-binding-apply` skill 输入，使 `siteId` 随 `selection` 全链路传递
- [x] 2.3 为 Builder 弹框、自动 handoff 和 skill contract 增加回归测试，覆盖显式站点传递与缺省站点 `1` 的兼容语义

## 3. CMS Rendering Authoring And Runtime

- [x] 3.1 为 `packages/page-builder-cms-rendering` 的 `cms-catalog` / `cms-content` props、query helper、template scan、manifest 与 validator 增加 `site-id` / `siteId` 支持
- [x] 3.2 更新 preview runtime 与 static export SSR，使其按每个 island 的显式 `siteId` 或默认 `1` 取数，并确保缓存 key 包含站点维度
- [x] 3.3 更新 `apply_cms_binding` 生成逻辑，使所有新写入的 `cms-catalog` / `cms-content` 都显式带上 `site-id`

## 4. Verification And Docs

- [x] 4.1 更新主流程测试、fixture 和宿主配置测试，覆盖 `/api/sites`、site-scoped catalog/content 请求、新标签显式 `site-id` 与旧标签默认站点 `1`
- [x] 4.2 更新相关 OpenSpec 主 spec、宿主配置说明和作者态示例，明确“站点上下文显式进入源码，宿主不再提供静态运行时 `siteID`”
