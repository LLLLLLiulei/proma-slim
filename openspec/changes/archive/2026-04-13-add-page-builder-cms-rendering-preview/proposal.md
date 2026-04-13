## Why

当前 `page-builder` 已经具备基础的工作区预览、CMS 代理接口和预览 bridge，但还不能把 `packages/page-builder-cms-rendering` 中的 `cms-*` 语义组件真正接入到预览链路。没有这一层集成，作者写入的 `cms-catalog` / `cms-content` 只能停留在 HTML 源码中，既无法通过真实 CMS 数据完成 iframe 预览，也无法为后续静态化和作者工具链提供稳定的运行时基础。

## What Changes

- 新增 `page-builder` CMS rendering preview capability，定义 page-builder 预览如何检测 `cms-*`、注入本地托管 preview 资产、挂载 CSR islands，并在首轮渲染完成后发出稳定的 ready 信号。
- 扩展 page-builder 预览状态 contract，使后端显式返回页面是否包含 CMS rendering 以及是否需要更宽的 iframe sandbox 权限，而不是让前端自行猜测。
- 调整 page-builder preview bridge 的初始化时序，使其在存在 CMS islands 时等待 `proma:cms-rendering-ready` 后再启动 DOM 观察与 ready 通知，从而避开 island 挂载过程中的中间态 DOM。
- 保持现有 CMS 资源 URL 重写和外部 bridge 注入能力，并将其与 CMS rendering preview 注入编排为稳定顺序的 HTML 预览管线。

## Capabilities

### New Capabilities
- `page-builder-cms-rendering-preview`: 定义 page-builder 预览如何接入 CMS rendering bootstrap、挂载浏览器端 islands，并与 CMS 代理接口和 ready 事件协同工作

### Modified Capabilities
- `page-builder-live-preview`: 扩展预览状态接口与 iframe 加载 contract，使 builder 能基于显式 CMS preview 元数据决定地址和 sandbox 行为
- `page-builder-preview-block-selection`: 调整外部 preview bridge 在 CMS islands 页面中的启动时序，确保区块选择与高亮建立在 island 首次挂载完成后的稳定 DOM 上

## Impact

- Affected code: `packages/page-builder-cms-rendering/src/preview/*`, `apps/app/src/main/lib/workspace-preview-service.ts`, `apps/app/src/main/http/routes/page-builder.ts`, `apps/app/src/main/lib/page-builder-preview-bridge.ts`, `apps/app/resources/page-builder/page-builder-preview-bridge.js`, `apps/app/src/renderer/lib/api.ts`, `apps/page-builder/src/renderer/lib/preview-state*.ts`, `apps/page-builder/src/renderer/pages/BuilderPage.tsx`, `apps/page-builder/src/renderer/components/builder/PreviewPane.tsx`
- Affected APIs: workspace preview state payload, page-builder preview asset routes, preview bridge readiness contract
- Dependencies: `packages/page-builder-cms-rendering` core package, existing page-builder CMS proxy routes, local preview asset delivery for Vue runtime and preview bootstrap
