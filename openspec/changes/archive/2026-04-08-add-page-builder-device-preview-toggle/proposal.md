## Why

当前 `page-builder` 的左侧预览仅提供单一桌面宽度视图，用户在制作响应式专题页时，无法直接在 Builder 工作台内判断移动端布局是否正确，只能依赖手动缩放窗口、浏览器开发者工具或新开页面检查。随着预览区已经承载区块选择、区块工具条和图片替换等操作，需要补齐同一上下文中的 `PC / Mobile` 视口切换能力，让用户在不离开 Builder 的情况下完成跨端校验。

## What Changes

- 在 Builder 左侧预览面板中新增项目级 `PC / Mobile` 设备预览切换入口，并移除现有“实时预览”文字标题占位。
- 为预览面板新增桌面与移动端两种视口模式，其中 `Mobile` 使用 `390px` 宽度的真实居中视口驱动 iframe 重排，而不是引入设备外壳或缩放模拟。
- 保留现有“导出静态包”“刷新预览”“全屏预览”“新窗口打开预览”等项目级操作，但调整预览容器结构，使区块选择高亮、已选区块工具条和图片替换等既有交互在切换视口后仍保持正确定位。
- 本次变更仅覆盖 Builder 前端预览体验，不修改工作区预览入口、预览状态接口或后端页面输出协议。

## Capabilities

### New Capabilities
- `page-builder-device-preview`: 定义 `page-builder` Builder 预览面板中的 `PC / Mobile` 视口切换、`390px` 移动端真实视口呈现，以及切换后的预览展示行为。

### Modified Capabilities
- `page-builder-app`: 调整 Builder 左侧预览面板的项目级控制项要求，使其在保留现有预览操作的同时支持设备视口切换，不再禁止展示设备切换控件。

## Impact

- Affected code:
  - `apps/page-builder/src/renderer/components/builder/PreviewPane.tsx`
  - `apps/page-builder/src/renderer/components/builder/PreviewPane.test.tsx`
- Affected systems:
  - `page-builder` Builder 左侧预览面板的项目级控制区与 iframe 视口容器布局
  - 已选区块工具条在不同预览视口下的锚定定位行为
- Dependencies / runtime impact:
  - 不引入新的后端接口或第三方设备模拟库
