## 1. Workspace persistence and path model

- [x] 1.1 Reintroduce workspace path helpers and persistent workspace index storage, including automatic bootstrap of the default workspace
- [x] 1.2 Implement a workspace service that manages workspace CRUD metadata and resolves stable per-workspace directory structure
- [x] 1.3 Add legacy session backfill so sessions missing `workspaceId` are assigned to the default workspace before use

## 2. Session and agent runtime binding

- [x] 2.1 Thread `workspaceId` through session create, read, and update flows so session metadata always preserves workspace ownership
- [x] 2.2 Resolve agent SDK `cwd`, workspace `skills`, `mcp.json`, `workspace-files`, and additional directories from the session's workspace instead of `process.cwd()`
- [x] 2.3 Implement workspace migration handling that updates session ownership, switches the session directory, and clears stale `sdkSessionId` bindings

## 3. Web server workspace APIs

- [x] 3.1 Add Bun HTTP REST endpoints for listing, creating, renaming, and deleting workspaces
- [x] 3.2 Add workspace capability and directory context endpoints that return workspace-scoped Skills, MCP summaries, `workspace-files`, and attached directories
- [x] 3.3 Update session-related API routes to accept and persist `workspaceId`, including support for session workspace migration
- [x] 3.4 Reject workspace deletion when the target is the default workspace or still owns sessions, and return a user-facing error message

## 4. Renderer workspace flow

- [x] 4.1 Restore minimal workspace state management in the Web UI so the current workspace can be loaded, selected, and created from the sidebar
- [x] 4.2 Ensure new sessions inherit the currently selected workspace and session views surface the stored workspace context
- [x] 4.3 Reconnect workspace-aware input context by passing `workspacePath`, `workspaceSlug`, and attached directories into `RichTextInput` and related reference flows
- [x] 4.4 Replace the workspace card + select control with an original-like sidebar workspace list that highlights the current workspace and exposes inline create/edit/delete entry points
- [x] 4.5 Restyle the `+ 新会话`, `置顶会话`, and footer capability/settings areas so the sidebar hierarchy more closely matches the original Proma layout

## 5. Verification

- [x] 5.1 Add backend tests for default workspace bootstrap, legacy session backfill, workspace CRUD, and workspace-scoped runtime resolution
- [x] 5.2 Add integration coverage for session creation and migration with `workspaceId`, including `cwd` and `sdkSessionId` rebinding behavior
- [x] 5.3 Add UI or end-to-end verification for workspace selection, workspace-scoped new session creation, and workspace-aware input references
- [x] 5.4 Add renderer and Playwright verification for the original-like workspace sidebar structure, including current-workspace highlight and inline new-workspace flow
- [x] 5.5 Add backend verification for protected workspace deletion and current-workspace fallback after deleting an empty selected workspace
