## Why

当前 page-builder 的 CMS 站点上下文仍由宿主静态 `siteID` 隐式决定，Builder 弹框、自动 handoff、`apply_cms_binding`、preview 和静态导出都无法显式表达“当前绑定的是哪个站点”。这让多站点 CMS 绑定不可见、不可迁移，也使作者态 `<cms-catalog>` / `<cms-content>` 标签继续依赖宿主配置而不是自身源码。

## What Changes

- 在“从 CMS 选择数据”弹框中增加站点下拉框，并在栏目 / 内容页签之前显式选择站点；所有栏目树、栏目详情与内容列表都按当前所选站点加载。
- 将站点上下文加入 CMS 选择结果、自动 handoff payload、`cms-binding-apply` skill 输入与 `apply_cms_binding` 写入链路，避免后续流程再从宿主隐式推断站点。
- 为 `cms-catalog` 与 `cms-content` 增加显式作者态站点属性 `site-id`，并让 preview、SSR 与 static export 统一按标签自身的站点上下文取数。
- `apply_cms_binding` 与其他宿主生成链路默认写出显式 `site-id`，不再依赖宿主配置中的静态 `siteID`。
- **BREAKING** page-builder CMS 宿主配置不再提供静态运行时 `siteID`；旧页面中未显式写出 `site-id` 的 CMS 标签将统一按 `siteId = 1` 兼容执行，而不是继续继承旧配置中的自定义站点值。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `page-builder-cms-browser-dialog`: 在 CMS 弹框中增加站点选择，并通过宿主管理的 CMS 读取链路加载站点、栏目和内容。
- `page-builder-cms-selection-contract`: 在 CMS 选择确认结果中保留显式 `siteId`，使后续 handoff 与 apply 可直接复用站点上下文。
- `page-builder-cms-sdk-tools`: 将宿主 CMS 请求上下文从静态 `siteID` 配置改为显式 `siteId` 业务参数，并为读写链路定义默认站点回退语义。
- `page-builder-cms-auto-agent-handoff`: 自动 handoff payload 必须保留 CMS 选择结果中的 `siteId`，不得再依赖宿主静态站点。
- `page-builder-cms-apply-skill`: `cms-binding-apply` 输入与 `ready` 决策需要保留显式 `siteId`，以便后续 apply tool 生成带站点属性的 CMS 标签。
- `page-builder-cms-rendering-core`: CMS rendering core 的 query contract、组件 props、模板扫描与共享 runtime 需要支持显式 `siteId` / `site-id`。
- `page-builder-cms-rendering-apply-tool`: `apply_cms_binding` 需要生成带显式 `site-id` 的 `cms-catalog` / `cms-content`，并在缺省时回退到 `1`。
- `page-builder-cms-rendering-manifest-validation`: manifest 与 validator 需要识别 `site-id` 为受支持属性，并兼容旧标签缺省站点的回退语义。
- `page-builder-cms-rendering-preview`: preview 运行时必须按每个 island 的显式 `site-id` 或兼容缺省值 `1` 发起站点范围内取数。
- `page-builder-cms-rendering-static-export`: 静态导出 SSR 必须按每个 island 的显式 `site-id` 或兼容缺省值 `1` 预取并固化内容。

## Impact

- 影响 `packages/shared` 中的 CMS query / selection 类型与版本。
- 影响 `apps/page-builder` 中 CMS 弹框状态管理、站点选择 UI、自动 handoff 构造与相关测试。
- 影响 `apps/app` 中 page-builder CMS 路由、`CmsGateway`、宿主 CMS 配置解析、token provider 以及 `apply_cms_binding`。
- 影响 `packages/page-builder-cms-rendering` 中组件 props、runtime query、manifest、validator、preview bootstrap 与 SSR/export 链路。
- 需要同步更新相关测试、宿主配置说明与 OpenSpec capability 文档。
