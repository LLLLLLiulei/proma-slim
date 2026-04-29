## Why

Page-builder projects currently allow multiple browser windows or users to enter the same builder workspace and perform edits against the same `workspace-files` state. This creates a race where concurrent Agent sends, inline edits, CMS handoffs, image replacements, block deletion, title edits, or project deletion can overwrite or corrupt each other.

## What Changes

- Add a workspace-scoped page-builder edit lock that allows only one active editor per `page-builder` project.
- Use an in-memory lease lock in the first implementation, with a store boundary so the storage can later be replaced by a distributed/shared lock store.
- Require the builder page to acquire a lock before editing, heartbeat-renew it while open, and release it on page exit as a best-effort optimization.
- Use a TTL to automatically expire locks when the builder page crashes, the browser closes unexpectedly, or the network disconnects.
- Treat a page-builder project as locked while any session in that workspace still has an active Agent run, even if the browser page has closed.
- Surface lock state in the home history list so locked projects clearly show their busy state and cannot be deleted; edit clicks still navigate to builder, where lock acquisition and conflict feedback are handled consistently.
- Enforce the lock on page-builder editing APIs so direct URL access or manual API calls cannot bypass the UI.
- Keep read-only preview and CMS browsing requests available without an edit lock.

## Capabilities

### New Capabilities

- `page-builder-edit-lock`: Covers workspace-scoped exclusive editing, lease acquisition, heartbeat renewal, best-effort release, TTL expiry, active-Agent busy detection, and write-operation lock enforcement for page-builder projects.

### Modified Capabilities

- `page-builder-home-history`: History cards must reflect project edit availability, keep preview/view behavior available, route edit clicks to builder without pre-acquiring locks, and prevent deletion while locked.
- `page-builder-app`: Builder pages must operate only when they hold a valid edit lock and must disable or reject editing when the lock is missing, expired, or lost.

## Impact

- Backend page-builder project routes gain edit-lock acquire, renew, release, and status behavior.
- Page-builder project summaries gain edit-state metadata.
- Page-builder editing endpoints must validate an edit lock for `template === 'page-builder'` workspaces while leaving ordinary workspaces unchanged.
- Page-builder project deletion must reject locked or active-Agent projects, but does not require the deleting user to hold an edit lock when the project is otherwise available.
- Builder and history UI need builder-owned lock acquisition, heartbeat lifecycle handling, locked-state affordances, and 409 error handling.
- Tests need coverage for exclusive acquisition, holder-matched renewal, TTL expiry, refresh-safe release grace, active-Agent busy state, history-card locked behavior, heartbeat loss, and write API rejection without a valid lock.
