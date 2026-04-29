## Context

Page-builder projects are represented by `template === 'page-builder'` workspaces. The builder, preview bridge, Agent sends, inline editing, image replacement, CMS handoff, block deletion, title edits, and project deletion all ultimately mutate workspace-scoped project state such as `workspace-files/`, workspace metadata, or page-builder derived artifacts.

The current home history flow opens the latest session for a project without checking whether another browser window is already editing the same workspace. The existing busy protection only rejects concurrent sends for the same Agent session; it does not protect the whole project workspace, does not cover non-Agent project-control APIs, and does not prevent direct builder URL access.

## Goals / Non-Goals

**Goals:**

- Allow only one active editor for each page-builder workspace.
- Keep locked projects viewable through their current preview.
- Release locks quickly on normal page exit and automatically after abnormal exits.
- Prevent direct API or direct URL bypass by enforcing the lock on backend editing and project-control operations.
- Treat ongoing Agent activity as project-busy even if the editing browser page is gone.
- Keep the first implementation simple with in-memory storage while isolating lock storage behind a replaceable boundary.

**Non-Goals:**

- Do not implement real-time collaborative editing.
- Do not introduce user identity, editor names, or multi-user presence.
- Do not build a full read-only builder mode in the first version; view-only means opening the current preview.
- Do not introduce Redis, database, or distributed lock dependencies in this change.
- Do not change ordinary non-page-builder workspace/session behavior.

## Decisions

### Workspace-scoped lease locks

The lock is scoped to `workspaceId`, not `sessionId`, because page-builder editing operations share the same workspace files and preview artifacts even when multiple sessions exist. The lock record contains `workspaceId`, `lockId`, `holderId`, optional `sessionId`, `acquiredAt`, `renewedAt`, `expiresAt`, and optional `releasePendingUntil`.

Alternative considered: session-scoped locks. This was rejected because a second session in the same page-builder workspace could still mutate the same project files.

### In-memory store with a storage interface

The first implementation uses an in-memory `Map`-backed store. Business logic should depend on a `PageBuilderEditLockStore` boundary rather than directly on the map so a future Redis, database, or distributed collection store can replace the storage without rewriting routes, heartbeat logic, or write-operation authorization.

Alternative considered: file-backed locks. This was deferred because the current implementation target favors minimal scope; file locks only solve shared-filesystem deployments and still need careful atomicity handling.

### Heartbeat lease with TTL

The builder page renews the lease every 15 seconds. The backend sets a 60-second TTL on each successful acquire or renew. If the browser crashes, the network disconnects, or the server misses release, the lock expires automatically after the TTL.

Alternative considered: release-only locking. This was rejected because page unload events are not reliable.

### Best-effort release with grace period

On builder page exit, the frontend sends a best-effort release using `sendBeacon` or `fetch(..., { keepalive: true })`. The backend marks the lock with a 5-second `releasePendingUntil` instead of deleting it immediately. A subsequent renew with the same `lockId` cancels the pending release.

This protects browser refresh: the old page may send release while the new page is loading. If the new page renews within the grace window, the lock remains valid.

### Builder-owned lock acquisition

The home history flow does not acquire an edit lock before navigation. It resolves or creates the target builder session, opens the builder route, and leaves lock acquisition and conflict handling to the builder page. This keeps all entry paths, including home clicks, direct builder URLs, and browser refresh, on the same lock lifecycle.

The builder page stores the active `lockId` and `holderId` in `sessionStorage` after acquiring or renewing a lock. On refresh, it renews the stored lock with the same holder before enabling editing. Direct builder URL entry with no usable stored lock attempts to acquire a new lock before enabling editing. Builder still tolerates URL-fragment lock credentials as a legacy/client-only handoff format, but the current home history entry point does not rely on that path.

### Holder IDs for page-instance safety

Each edit lock has a `holderId` credential. Renewal requires both the current `lockId` and the matching `holderId`, and it must not transfer lock ownership to a different holder. Release only applies when the releasing `holderId` still matches the stored holder. This prevents a caller that only knows a valid `lockId` from taking over or releasing the lock.

### Active Agent runs keep the project locked

Project edit state is locked when there is either a valid edit lock or any active Agent run for a session in the same workspace. This prevents another editor from entering while the backend Agent may still be writing project files after the browser page was closed.

### Backend editing enforcement

All page-builder editing and project-control APIs must validate the lock server-side. The frontend passes `lockId` and `holderId` on those requests, preferably via headers such as `X-Proma-Page-Builder-Edit-Lock` and `X-Proma-Page-Builder-Edit-Holder`. The backend only requires this check for workspaces with `template === 'page-builder'`.

Protected operations include Agent sends for page-builder sessions, workspace title updates for page-builder projects, inline text saves, block deletion, image replacement, CMS auto handoff, and static export job creation. Read-only preview, CMS browsing, project list, session list, message read, export status, and export download requests do not require an edit lock.

Project deletion is handled separately: deletion does not require the deleting user to hold a lock, but it must be rejected whenever the target page-builder project has a valid edit lock or an active Agent run.

## Risks / Trade-offs

- [Risk] In-memory locks are not shared across multiple server processes or nodes. → Mitigation: keep storage behind a replaceable store interface and document that multi-node deployments need a distributed store.
- [Risk] Browser background throttling can delay heartbeats. → Mitigation: use a TTL four times the heartbeat interval.
- [Risk] A user may close the builder while the Agent keeps running. → Mitigation: include active Agent session detection in project locked state.
- [Risk] A direct builder URL can bypass home history UI. → Mitigation: builder must acquire or validate a lock on load, and backend editing APIs must reject missing/invalid locks.
- [Risk] Refresh can accidentally release a lock. → Mitigation: use delayed release and holder-aware release semantics.
- [Risk] A stale lock could remain after implementation bugs. → Mitigation: expire locks by TTL and opportunistically clean expired locks during list/acquire/renew/assert operations.

## Migration Plan

1. Add shared types and backend edit-lock service with an in-memory store implementation.
2. Add lock routes under page-builder project APIs.
3. Add edit-state metadata to page-builder project summaries.
4. Add backend lock assertions to page-builder editing and project-control paths.
5. Update home history UI to display locked states, keep edit navigation builder-owned, and prevent locked project deletion.
6. Update builder UI to validate/acquire, heartbeat, release, and disable editing when the lock is lost.
7. Add focused backend and frontend tests for lock lifecycle and enforcement.

Rollback is straightforward because locks are runtime-only in memory. Removing the route/UI enforcement returns behavior to the previous unlocked model without data migration.
