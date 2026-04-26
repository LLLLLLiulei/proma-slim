## Why

当前 Agent 对话在长会话下会因为输入草稿更新反复触发整段消息树的 render/reconcile，导致输入和发送出现可感知卡顿。现在需要先做一轮保守的前端性能优化，在不改变会话语义、发送语义和现有流式展示行为的前提下，恢复长对话中的基本输入响应性。

## What Changes

- 为共享 `AgentView` 中的消息区建立更明确的渲染边界，避免普通输入草稿变化默认重跑整段 transcript。
- 为历史消息项建立更细粒度的渲染隔离，降低长会话在追加消息、流式收口和重渲染时的重复派生成本。
- 保持现有流式回复、tool activity、compact 提示、错误状态与发送语义不变，并补充回归验证以确保“性能优化不改变会话行为”。
- 暂不在本次 change 中引入输入节流、draft atom 重构、消息虚拟化或新的运行时依赖。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `agent-conversation`: 为共享 Agent 对话视图补充长会话下的输入响应性与渲染隔离要求，确保普通输入不会无谓扰动已展示的历史消息区域，同时保持最新草稿提交语义、流式展示语义和错误/compact 展示语义稳定。

## Impact

- Affected code: `apps/app/src/renderer/components/agent/AgentView.tsx`, `apps/app/src/renderer/components/agent/AgentMessages.tsx`
- Affected tests: `apps/app/src/renderer/components/agent/AgentView.render.test.tsx`, `apps/app/src/renderer/components/agent/AgentMessages.test.ts`, and new render-boundary regression coverage for long transcript scenarios
- Systems: shared Agent conversation UI, page-builder embedded conversation, renderer-side message rendering performance
