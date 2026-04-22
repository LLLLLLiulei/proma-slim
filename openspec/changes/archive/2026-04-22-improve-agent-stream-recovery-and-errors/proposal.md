## Why

当前 page-builder 对话存在偶发“长时间无响应”的体感问题：有些场景下后端可能已经结束，但前端本地仍残留 `running` 状态，持续锁住 builder 交互；另一些场景下，即使上游模型或 SDK 已经返回错误，前端也只能看到过于简化的失败提示，难以区分是真正执行卡住、流式收尾异常，还是上游请求失败。现在需要先优先消除这种“假忙”状态，并补齐诊断信息，避免用户长期停留在错误的忙碌态。

同时，当用户在 Agent 仍在处理中时刷新页面，前端内存中的 streaming 状态会丢失，但后端任务仍继续执行；此时重新发送消息会直接撞到后端 409，前端却把它展示成一次普通发送失败。该刷新恢复场景也需要被纳入本次修复范围。

## What Changes

- 为通用 Agent 会话增加自动 stale-stream reconcile 机制，使前端在本地流式状态与后端会话活跃状态不一致时能够自动恢复，而不必等到用户再次发送消息。
- 补充刷新 / 重进会话后的 busy 恢复能力：若最后一条消息仍停留在用户侧且后端仍活跃，前端应恢复本地 busy 状态并避免把后端 409 直接暴露为普通发送失败。
- 调整 page-builder 的 busy 语义：builder 侧交互锁定、程序化 handoff 和普通发送都应以“后端是否仍真实活跃”为准，而不是只依赖可能残留的本地 `running` 标记。
- 扩展 Agent 错误持久化与展示链路，保留并展示用户可读错误、结构化诊断详情以及必要的上游原始错误信息，帮助区分 SDK / Provider / 网络 / 流式状态异常。
- 为前端流式生命周期与后端会话执行链路补充详细日志，包括发送、收帧、reconcile、完成、错误、上游模型失败和程序化 handoff 等关键阶段。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `agent-conversation`: 修改流式会话的收尾与错误可见性要求，使系统能够自动校准 stale 的本地 streaming 状态，并在实时展示与持久化消息中暴露更完整的结构化错误信息。
- `page-builder-app`: 修改 builder 对 Agent busy 状态的依赖方式，使页面级交互锁定能够在后端已空闲时自动恢复，而不是被陈旧的本地流式标记长期锁住。
- `page-builder-cms-auto-agent-handoff`: 修改 CMS 自动 handoff 的 busy / failure 语义，使程序化发送在遇到 stale 本地 busy 状态时先进行会话校准，并在失败时向用户保留更可诊断的错误上下文。

## Impact

- Affected code:
  - `apps/app/src/renderer/hooks/useAgentSSE.ts`
  - `apps/app/src/renderer/components/agent/AgentView.tsx`
  - `apps/app/src/renderer/components/agent/AgentMessages.tsx`
  - `apps/app/src/renderer/atoms/agent-atoms.ts`
  - `apps/page-builder/src/renderer/pages/BuilderPage.tsx`
  - `apps/app/src/main/http/agent-stream.ts`
  - `apps/app/src/main/sse-manager.ts`
  - `apps/app/src/main/lib/agent-orchestrator.ts`
  - `apps/app/src/main/lib/adapters/claude-agent-adapter.ts`
  - related renderer / main / page-builder tests
- Affected systems:
  - Agent SSE lifecycle and session activity reconciliation
  - page-builder busy-state gating and programmatic send flow
  - provider / SDK error persistence and UI surfacing
  - frontend/backend observability for streamed conversations
- APIs / contracts:
  - session activity probing behavior used by the renderer
  - persisted agent status message diagnostics
  - page-builder programmatic handoff settle semantics
