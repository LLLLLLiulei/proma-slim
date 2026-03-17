## Why

`origin/main` 在 2026-03-15 及之后引入了几项与当前 Agent 产品仍直接相关的运行时修复，包括流式输出体验修正、SDK 登录错误提示友好化以及对应的 SDK 版本演进。当前 `feature/proma-web` 已保留独立的工作区与 Agent 运行时定制，因此需要以兼容性移植的方式回迁这些有效修复，而不是直接回放上游实现或重新引入旧 chat 链路。

## What Changes

- 将上游主线中对当前 Agent 对话链路仍有效的流式输出修复回迁到当前分支，恢复稳定、渐进且无异常跳变的文本流式渲染体验。
- 将 SDK 登录与认证类错误的技术性提示转换为前端可直接展示的友好消息，降低用户在 API Key、Base URL 或登录状态异常时的排障成本。
- 评估并在必要时引入 `@anthropic-ai/claude-agent-sdk` 的上游版本升级，以承接与当前运行时修复直接相关的底层行为改进。
- 明确排除仅服务于旧 `chat` 模式或当前分支无生产消费者的修复，不将其纳入本次回迁范围。
- 在回迁过程中，如果上游逻辑与当前工作区运行时或已定制 UI 行为发生冲突，暂停并由用户确认处理方式。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `agent-conversation`: 调整流式文本呈现与 SDK 错误展示要求，使当前 Agent 会话在流式回复期间保持平滑有序的输出节奏，并在已知登录、认证或运行时配置错误场景下返回可直接面向用户展示的提示。

## Impact

- Affected code:
  - `packages/ui/src/hooks/useSmoothStream.ts`
  - `apps/electron/src/renderer/components/agent/AgentMessages.tsx`
  - `apps/electron/src/renderer/components/ai-elements/message.tsx`
  - `apps/electron/src/main/lib/adapters/claude-agent-adapter.ts`
  - `apps/electron/src/main/lib/agent-orchestrator.ts`
- Dependencies:
  - `@anthropic-ai/claude-agent-sdk` may be upgraded if validation shows the backported runtime fixes depend on it.
- Validation surface:
  - Agent SSE streaming behavior
  - User-facing SDK error rendering
  - Existing workspace-scoped runtime behavior and current customized UI flow
