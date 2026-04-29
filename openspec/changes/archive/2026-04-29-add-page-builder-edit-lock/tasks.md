## 1. Shared Types and API Surface

- [x] 1.1 Add shared page-builder edit lock and edit-state types for lock acquisition, renewal, release, and project summary status.
- [x] 1.2 Extend the renderer API client with acquire, renew, release, and lock-aware write request support.
- [x] 1.3 Add API-client tests for lock endpoints and edit-lock headers on page-builder write requests.

## 2. Backend Lock Service

- [x] 2.1 Implement a page-builder edit lock service with an in-memory store boundary, workspace-scoped acquire, renew, release, validation, TTL cleanup, and release grace behavior.
- [x] 2.2 Include holder-aware release semantics so old page instances cannot release locks renewed by newer page instances.
- [x] 2.3 Include active-Agent workspace busy detection in project edit-state resolution.
- [x] 2.4 Add focused unit tests for exclusive acquisition, renewal, expiry, release grace, holder mismatch, and active-Agent busy state.

## 3. Backend Routes and Enforcement

- [x] 3.1 Add page-builder project edit-lock routes for acquire, renew, release, and current lock validation/status.
- [x] 3.2 Extend page-builder project summaries with edit-state metadata.
- [x] 3.3 Reject page-builder project deletion while the project has a valid edit lock or active Agent run.
- [x] 3.4 Enforce valid edit-lock credentials on page-builder Agent sends while leaving ordinary sessions unaffected.
- [x] 3.5 Enforce valid edit-lock credentials on page-builder workspace title updates and page-builder workspace write endpoints.
- [x] 3.6 Enforce valid edit-lock credentials on page-builder static export job creation while leaving export status and download reads unlocked.
- [x] 3.7 Add route tests for lock conflicts, stale lock expiry, summary edit states, project deletion rejection, write rejection without a valid lock, and unlocked read-only requests.

## 4. Home History UI

- [x] 4.1 Update history loading and card rendering to display available, editor-locked, and agent-busy project states.
- [x] 4.2 Open builder from a history card without pre-acquiring an edit lock, so builder-owned lock acquisition handles all entry paths consistently.
- [x] 4.3 Keep session creation or builder navigation failures local to the history flow without leaking edit locks from home.
- [x] 4.4 Prevent locked projects from deletion while preserving preview/view behavior and builder navigation for conflict feedback.
- [x] 4.5 Add history-section and history-card tests for available projects, locked project state display, edit navigation, deletion blocking, and no-preview locked state.

## 5. Builder Lock Lifecycle

- [x] 5.1 Add builder-side edit-lock context that reads or acquires the current lock, stores current `lockId` and `holderId`, renews stored locks with the same holder, and exposes lock validity to child interactions.
- [x] 5.2 Start heartbeat renewal using the backend heartbeat interval and disable editing when renewal fails.
- [x] 5.3 Send best-effort release on page exit or builder unmount using unload-safe request behavior.
- [x] 5.4 Preserve existing initial prompt one-shot behavior across lock validation, direct URL access, and page refresh.
- [x] 5.5 Add builder tests for lock validation, direct URL acquire, lock conflict, heartbeat failure, release-on-unmount, and no duplicate initial prompt send.

## 6. Integration and Verification

- [x] 6.1 Run focused backend and renderer tests covering page-builder project service, page-builder routes, API client, history UI, and builder page.
- [x] 6.2 Run OpenSpec validation for `add-page-builder-edit-lock`.
- [x] 6.3 Manually verify with two browser windows that only one window can edit a project, the second reaches builder lock-conflict/view behavior, normal close releases quickly, and abnormal close unlocks after TTL.
