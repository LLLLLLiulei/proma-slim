## Why

当前 `page-builder` 已经具备区块级 CMS 入口和结构化 CMS 选择结果，但“用户确认选择后如何自动进入 Agent 对话、如何决策应用方式、何时主动澄清”仍缺少一份稳定的 skill contract。若不先把这层定义清楚，后续自动 handoff、区块快照工具和本地 HTML 落地逻辑都会散落在 prompt 文本与宿主代码里，导致行为不稳定且难以复用。

## What Changes

- 新增一个以 `cms-binding-apply` 为核心的 skill-first 能力定义，用于约束 CMS 选择确认后的自动应用决策流程。
- 定义该 skill 的输入 payload、输出结果、Phase 1A 支持范围与默认护栏。
- 明确该 skill 在什么场景下应主动触发 `AskUserQuestion`，以及什么场景下必须返回不兼容或拒绝自由应用。
- 为后续自动 handoff、强制 skill 注入、block snapshot tooling 和本地 HTML 应用闭环提供稳定 contract。

## Capabilities

### New Capabilities
- `page-builder-cms-apply-skill`: 定义 CMS 自动应用专用 skill 的输入输出 contract、澄清规则、受支持 render mode 与 Phase 1A 应用护栏。

### Modified Capabilities
- None.

## Impact

- Affected specs and shared contracts:
  - `openspec/specs/page-builder-cms-selection-contract/spec.md`
  - 新增 `page-builder-cms-apply-skill` spec
- Affected page-builder systems:
  - CMS 选择确认后的自动对话 handoff 设计
  - 区块快照 tooling 的输入输出边界
  - 本地 HTML/CSS/JS 应用闭环的决策前置 contract
- Affected runtime surfaces:
  - page-builder 工作区中的 skill 调用约束
  - `AskUserQuestion` 在 CMS 自动应用流程中的使用边界
