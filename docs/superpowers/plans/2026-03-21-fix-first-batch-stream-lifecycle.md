# Fix First Batch Stream Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple session execution lifecycle from individual SSE connections and `AgentView` mount/unmount, while keeping explicit stop behavior correct and making the first batch of high-priority regressions impossible to reintroduce.

**Architecture:** Treat SSE connections as disposable subscribers and treat the agent session as the long-lived execution owner. Back-end changes keep per-connection cleanup local and reserve `stopAgent()` for explicit stop flows; front-end changes stop conflating local subscription teardown with remote execution termination and only finalize UI state after confirmed server stop.

**Tech Stack:** Bun, Hono, React, Jotai, SSE, Bun test, TypeScript.

---

## Chunk 1: Lock The Desired Lifecycle In Tests

### Task 1: Add back-end regression tests for connection-scoped teardown

**Files:**
- Modify: `apps/electron/src/main/http/agent-stream.test.ts`
- Modify: `apps/electron/src/main/http/app.test.ts`
- Modify: `apps/electron/src/main/sse-manager.ts` only after tests fail

- [ ] Add a test showing that cancelling one SSE reader does not close the whole session connection set.
- [ ] Add a test showing that `/api/sessions/:id/send` connection teardown does not implicitly call `stopAgent`.
- [ ] Run the targeted tests and confirm they fail for the expected lifecycle reason before implementation.

### Task 2: Add front-end regression tests for stop and unmount behavior

**Files:**
- Modify: `apps/electron/src/renderer/hooks/useAgentSSE.test.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/MainContentPanel.test.ts` only if needed
- Modify: `apps/electron/src/renderer/hooks/useAgentSSE.ts` only after tests fail

- [ ] Add a test showing `stopSession()` does not finalize local stream state when the stop API request fails.
- [ ] Add a test showing cleanup aborts only local fetch controllers and does not mark the session as stopped by itself.
- [ ] Run the targeted tests and confirm they fail before touching production code.

## Chunk 2: Fix Back-End Lifecycle Ownership

### Task 3: Make SSE cleanup connection-scoped

**Files:**
- Modify: `apps/electron/src/main/sse-manager.ts`
- Modify: `apps/electron/src/main/http/agent-stream.ts`

- [ ] Change `ReadableStream.cancel()` handling to close only the cancelled connection instead of the entire session.
- [ ] Remove the implicit `stopAgent()` behavior from SSE response `onClose`.
- [ ] Keep explicit stop semantics in `/api/sessions/:id/stop`.
- [ ] Preserve existing error/completion behavior that intentionally closes all subscribers.

## Chunk 3: Fix Front-End Stop/Unmount Semantics

### Task 4: Separate local subscription teardown from remote stop

**Files:**
- Modify: `apps/electron/src/renderer/hooks/useAgentSSE.ts`

- [ ] Keep component cleanup limited to aborting in-flight local readers.
- [ ] Make `stopSession()` finalize local state only after `api.stopSession()` succeeds.
- [ ] Preserve current error reporting when stop fails.

## Chunk 4: Restore Static Correctness

### Task 5: Fix the current typecheck failure in the workspace hook test contract

**Files:**
- Modify: `apps/electron/src/main/lib/agent-orchestrator.workspace.test.ts`

- [ ] Replace the stale hand-written hook result shape with the current SDK-compatible shape including `permissionDecisionReason`.
- [ ] Run `bun run typecheck` to verify static contract alignment is restored.

## Chunk 5: Verify The First Batch

### Task 6: Run focused verification

**Files:**
- No production file changes in this step.

- [ ] Run the targeted back-end and front-end lifecycle tests.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun test` if the targeted suite passes and touched areas remain stable.
