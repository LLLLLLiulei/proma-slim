## 1. Prompt and runtime contract

- [x] 1.1 Add failing test coverage for workspace prompt context, including scratch-mode subagent guidance, workspace topology, and local memory path instructions
- [x] 1.2 Restore `agent-prompt-builder.ts` to describe workspace-scoped Skills, resource topology, and scratch-mode versus repo-mode subagent boundaries with clear maintenance comments

## 2. Team inbox and auto-resume recovery

- [x] 2.1 Add failing tests for team inbox lookup, unread message filtering, inbox read-marking, and idle worker detection
- [x] 2.2 Port the original `agent-team-reader` logic into the Web runtime with testable Claude home path resolution
- [x] 2.3 Replace `agent-orchestrator.ts` team-reader stubs with the restored module so auto-resume uses inbox messages first and task summaries as fallback

## 3. Verification

- [x] 3.1 Run targeted Bun tests for prompt builder, team reader, and workspace-aware orchestrator behavior
- [x] 3.2 Re-run Playwright UI verification against the Web app to confirm scratch workspace subagent behavior and result recovery no longer fail immediately
