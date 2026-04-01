## Why

当前 Builder 页中的 CMS 弹框仍然只是一个浏览与勾选界面，确认后只能返回“选中了哪些栏目 / 内容”，无法表达这些选择是要绑定到哪个区块，也无法稳定作为后续绑定模型的输入。现在需要先把 CMS 选择器升级为“区块绑定候选生成器”，为后续持续绑定、宿主持久化和模板渲染建立统一的结果协议。

## What Changes

- 将 CMS 弹框的确认结果从原始 UI 选择结果升级为统一的结构化选择协议，而不是只返回栏目数组或内容数组。
- 让 CMS 选择器在打开时接收当前目标区块上下文，并在确认结果中携带该目标区块的 selector。
- 明确区分两类固定选择语义：
  - 栏目选择：单栏目或多栏目
  - 内容选择：固定内容条目集合
- 约束本次协议范围仅覆盖固定条目选择，不包含“某栏目最新 N 条”等动态查询语义。
- 为后续 Module 3 的绑定模型提供稳定输入，但本 change 不实现绑定持久化、页面渲染或 Agent 自动继续执行。

## Capabilities

### New Capabilities
- `page-builder-cms-selection-contract`: 定义区块驱动 CMS 选择器的输入上下文、固定条目选择语义和统一确认结果结构。

### Modified Capabilities
- None.

## Impact

- Affected code:
  - `apps/page-builder/src/renderer/components/builder/CmsBrowserDialog.tsx`
  - `apps/page-builder/src/renderer/components/builder/useCmsBrowserState.ts`
  - `apps/page-builder/src/renderer/pages/BuilderPage.tsx`
  - `apps/page-builder/src/renderer/components/builder/PreviewPane.tsx`
- Affected shared types:
  - `packages/shared/src/types/page-builder-cms.ts`
  - 可能新增或调整 page-builder 侧 CMS 选择结果类型定义
- Downstream systems:
  - 后续 CMS 绑定模型、模板渲染与 Agent/宿主协同流程将依赖该协议，但不在本 change 内实现
