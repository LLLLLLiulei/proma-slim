## Why

当前 `CMS Vue Islands + SSR 静态化` 方案已经有较完整的设计，但在接入正式 `page-builder` 预览、导出、Bridge 和 CMS 网关前，仍需要一个低风险、可重复运行的实验环境来验证关键链路是否成立。现在新增一个放在 `packages/` 下的自包含 demo，可以先验证“作者模板 -> preview CSR islands -> export SSR 静态 HTML”这一核心路径，并直观看到效果与边界。

## What Changes

- 新增一个放在 `packages/` 下的自包含 demo 包，用于验证 `cms-catalog` / `cms-content` 在普通 HTML 页面中的 islands 写法。
- 在 demo 中提供浏览器端 preview 流程，使原始 HTML 页面能够通过 Vue islands 和 mock CMS 数据进行 CSR 渲染。
- 在 demo 中提供命令行 export 流程，使同一份作者模板能够通过 SSR 导出为不依赖 Vue runtime 的静态 HTML。
- 提供 mock CMS 数据、最小运行时抽象和示例页面，用于对比作者源码、preview 结果和 export 产物。
- 保持 demo 与正式系统解耦，不直接依赖 `apps/app`、`apps/page-builder` 的生产链路实现。

## Capabilities

### New Capabilities
- `page-builder-cms-vue-islands-demo`: 提供一个自包含 demo 能力，用 mock CMS 数据验证 HTML-first 的 CMS Vue islands preview CSR 和 export SSR 静态化链路。

### Modified Capabilities

## Impact

- 新增 `packages/` 下的临时 demo workspace package。
- 更新根工作区配置，使新 demo 包可被 workspace 识别和运行。
- 为 demo 包引入本地 Vue 运行时与 SSR/模板编译依赖。
- 新增 demo 页面、mock CMS 数据、preview 本地服务和 export CLI。
- 不修改现有生产 page-builder API contract，也不直接改变现有预览与导出产品行为。
