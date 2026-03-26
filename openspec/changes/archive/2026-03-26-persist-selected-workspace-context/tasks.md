## 1. Settings-backed workspace context

- [x] 1.1 Expose renderer-side settings read/write support for `agentWorkspaceId` on top of the existing `/api/settings` route and preserve backward-compatible settings behavior
- [x] 1.2 Rework current workspace bootstrap so renderer restores `agentWorkspaceId` from settings before resolving sidebar scope and new-session defaults
- [x] 1.3 Implement one-time migration from legacy browser-local workspace/session state into `agentWorkspaceId` and repair invalid persisted workspace ids with the unified fallback rule

## 2. Renderer decoupling from session and tab state

- [x] 2.1 Remove browser-local persistence from `currentAgentWorkspaceIdAtom` while keeping session tabs and active session as local view state
- [x] 2.2 Narrow session-tab selection helpers and app-shell synchronization so active tabs update only session-focused state and never mutate the selected workspace
- [x] 2.3 Persist sidebar workspace changes back to settings with optimistic UI update and rollback on write failure

## 3. Verification and regression coverage

- [x] 3.1 Add renderer tests for workspace restore, migration, invalid persisted workspace fallback, and tab/workspace decoupling
- [x] 3.2 Add settings/API coverage for reading and updating `agentWorkspaceId` without regressing existing settings behavior
- [x] 3.3 Run targeted tests and browser verification for refresh recovery, cross-workspace tab switching, and new-session inheritance after restore
