## Why

当前精简版 Web 运行时虽然保留了工作区、Skills、memory 文件和 Agent Teams 开关，但丢失了原版 Electron 中约束 subagent 行为的 prompt 上下文与 team inbox 读取链路，导致模型在 scratch 会话目录里错误选择 `worktree` isolation，并让纯研究型 subagent 直接失败。需要恢复原版的运行时契约，让“无真实 git 项目”的工作区也能正常使用 research/task 型 subagent，同时保留后续扩展到 repo 模式的边界。

## What Changes

- 恢复并强化工作区作用域下的 Agent prompt，上下文中明确说明 workspace 目录拓扑、Skill 命名空间、本地 `memory/MEMORY.md` 路径以及 scratch 与 repo 两类 subagent 运行约束。
- 恢复 Agent Teams 文件系统读取能力，包括 team lead inbox 查找、未读消息轮询、已读标记、idle worker 检测与 fallback summary prompt。
- 在 scratch workspace 运行时增加一层窄范围 Agent tool guardrail，当模型仍错误请求 `worktree` isolation 时，将其改写回普通 subagent 调用。
- 将 AgentOrchestrator 从当前的本地 stub 迁回到可工作的 team reader 实现，使 teammate 完成后能够自动 resume 并汇总结果。
- 为上述行为补充后端测试，覆盖 scratch-mode prompt 约束、team inbox 读取、idle 检测和 auto-resume 关键路径。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `workspace-scoped-agent-runtime`: 工作区运行时需要区分 scratch mode 与 repo mode，并在 session cwd 非 git 仓库时为 subagent 暴露稳定、可执行的 scratch 语义。
- `workspace-capability-surface`: 工作区 prompt 上下文需要向 Agent 明确暴露 Skills、memory 文件和 workspace 拓扑，避免回退到 SDK 内部路径或错误的 subagent 调用方式。
- `agent-conversation`: 多 subagent / teammate 任务完成后，系统需要恢复基于 inbox 或 task summaries 的 auto-resume 汇总回复流程。

## Impact

- Affected code:
  - `apps/electron/src/main/lib/agent-prompt-builder.ts`
  - `apps/electron/src/main/lib/agent-orchestrator.ts`
  - `apps/electron/src/main/lib/agent-team-reader.ts` (new)
  - `apps/electron/src/main/lib/agent-orchestrator.workspace.test.ts`
  - `apps/electron/src/main/lib/agent-team-reader.test.ts` (new)
- Systems:
  - workspace-scoped Agent prompt construction
  - Claude Agent SDK teammate / auto-resume integration
  - local filesystem data under `~/.claude/teams` and `~/.claude/tasks`
- User-visible behavior:
  - pure research subagents in scratch workspaces stop defaulting to `worktree`
  - teammate results can be resumed and summarized again instead of silently stalling
