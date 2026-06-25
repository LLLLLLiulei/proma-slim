## Why

当前 Builder 预览选区更容易命中卡片、图片、文本等内层节点；当一个模块包含多个卡片时，用户很难稳定选中整个外层区块交给 Agent 做整体调整。需要在已选目标的就地工具条中提供层级提升和取消选中能力，让用户可以从当前命中的子元素逐步提升到更合适的编辑边界，并能在预览区域直接清空选择。

## What Changes

- 在预览已选目标的浮动区块工具条中新增 `选择上一级` 操作。
- 在同一工具条中新增 `取消选择` 操作，作为右侧输入区当前选中提示之外的就地清除入口。
- 普通 block 目标执行 `选择上一级` 时，预览 bridge SHALL 基于当前已选 DOM 元素提升到最近可选父元素，重新计算 selector、rect、label 和目标能力。
- `cms-island` 目标执行 `选择上一级` 时 SHALL 提升为其 `parentBlockSelector` 对应的普通 block，而不是下钻或继续选择 CMS 渲染子节点。
- 当当前目标已经到达最外层可选区域、交互被锁定或选区失效时，`选择上一级` / `取消选择` SHALL 不产生错误或脏状态。
- 不改变后端写入 API 的目标类型；继续复用现有 `PageBuilderTargetSelection` 的 `block` / `cms-island` 语义。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-preview-block-selection`: 扩展预览选区状态机，支持从当前已选目标提升到父级可选目标，并支持从预览工具条直接清空当前选区。
- `page-builder-block-toolbar`: 扩展已选区块浮动工具条的动作集合，新增 `选择上一级` 和 `取消选择` 操作，并规定其禁用、锚定和能力刷新边界。

## Impact

- 影响前端：`apps/page-builder/src/renderer/components/builder/PreviewPane.tsx`、`PageBuilderBlockActionBar.tsx`、`BuilderPage.tsx` 以及相关测试。
- 影响预览 bridge：`apps/app/src/main/lib/page-builder-preview-bridge/*` 的 parent message 协议、选区解析、overlay 同步与测试。
- 影响共享类型：`packages/shared/src/types/page-builder-preview-selection.ts` 需要扩展 parent message 类型。
- 不引入新运行时依赖，不改变 CMS 绑定、删除、图片替换、静态导出或 Agent 消息发送 API。
