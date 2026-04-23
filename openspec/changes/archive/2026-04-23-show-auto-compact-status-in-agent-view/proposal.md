## Why

当前后端已经支持在上下文过长时自动执行 `/compact` 并恢复原任务，用户也可以显式发送 `/compact` 主动压缩会话，但前端对话界面没有明确展示 compact 生命周期状态。用户在 page-builder 等共享 `AgentView` 场景中只会看到会话长时间停留在处理中，难以判断是卡住、上游模型慢，还是系统正在压缩上下文。

## What Changes

- 为共享 `AgentView` 补充 compact 状态提示，统一覆盖自动 compact 恢复和用户显式执行 `/compact` 的场景。
- compact 开始阶段使用中性提示文案，避免把手动 `/compact` 错误描述为“上下文过长”或“自动恢复”。
- 统一所有使用共享 `AgentView` 的前端会话界面行为，而不是只在 page-builder 内做特例提示。
- 保持 compact 状态提示为流式过程中的瞬时 UI，不写入持久化对话历史。
- 在后续文本、工具活动或终态事件到达后清理成功提示，避免提示长期悬挂在对话区。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `agent-conversation`: 扩展共享会话流式 UI 对 compact 生命周期的可见性要求，明确开始/成功提示文案、显示时机和清理时机。

## Impact

- Affected code:
  - `apps/app/src/renderer/atoms/agent-atoms.ts`
  - `apps/app/src/renderer/components/agent/AgentMessages.tsx`
  - `apps/app/src/renderer/components/agent/AgentView.tsx`
  - related Agent SSE / renderer / orchestrator tests
- Affected systems:
  - shared AgentView transient streaming UI
  - compact lifecycle event consumption in chat surfaces
  - page-builder and main app chat surfaces that reuse AgentView
- APIs / contracts:
  - SSE `AgentEvent` compact lifecycle consumption
