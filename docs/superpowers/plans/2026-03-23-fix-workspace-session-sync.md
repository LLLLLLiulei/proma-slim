# Fix Workspace Session Sync Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the selected workspace aligned with the restored or explicitly activated session so creating or opening sessions never targets a stale workspace.

**Architecture:** Treat restored session selection as the source of truth during initialization, then synchronize the sidebar workspace selection only when the user activates a session or tab. Preserve intentional workspace browsing by avoiding a permanent effect that overrides manual workspace picks on every render.

**Tech Stack:** Bun, React, Jotai, TypeScript, Bun test, Playwright MCP.

---

## Chunk 1: Lock The Regression In Tests

### Task 1: Add renderer regression coverage for restored state desynchronization

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.test.ts`
- Modify: `apps/electron/src/renderer/components/app-shell/MainContentPanel.test.ts` if a tab-activation helper is introduced
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx` only after tests fail

- [ ] Add a test showing that initialization prefers the restored active session's workspace over a stale persisted workspace id.
- [ ] Add a test for any new tab/session activation helper if implementation extracts one.
- [ ] Run the targeted renderer tests and confirm the new assertion fails before production edits.

## Chunk 2: Apply The Minimal Renderer Fix

### Task 2: Synchronize workspace selection on session restoration and activation

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/MainContentPanel.tsx` only if top-tab activation also needs explicit workspace sync

- [ ] Resolve the initial workspace from the restored active session when available.
- [ ] Update explicit session activation paths so opening a session keeps the selected workspace in sync.
- [ ] Keep manual workspace browsing intact when the user only clicks a workspace without activating a session.

## Chunk 3: Verify In Tests And Browser

### Task 3: Run focused verification

**Files:**
- No production file changes in this step.

- [ ] Run the targeted renderer tests.
- [ ] Reproduce the original scenario in Playwright against `http://localhost:5173/`.
- [ ] Confirm that selecting `工作区1`, creating a session, and reopening sessions all stay in the correct workspace context.
