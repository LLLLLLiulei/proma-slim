## ADDED Requirements

### Requirement: Page-builder projects MUST support exclusive workspace edit locks
系统 SHALL provide a workspace-scoped edit lock for each `template === 'page-builder'` project so only one editor can hold edit access to a project at a time.

#### Scenario: Acquiring an unlocked project
- **WHEN** a user requests edit access for a page-builder workspace that has no valid edit lock and no active Agent run
- **THEN** the system SHALL create an edit lock for that workspace
- **AND** the system SHALL return a `lockId`, `holderId`, `expiresAt`, and heartbeat interval to the client

#### Scenario: Rejecting a second editor
- **WHEN** a user requests edit access for a page-builder workspace that already has a valid edit lock held by another page instance
- **THEN** the system SHALL reject the request with a conflict response
- **AND** the system SHALL report that the project is locked for editing

#### Scenario: Lock scope covers every session in the workspace
- **WHEN** a page-builder workspace has a valid edit lock
- **THEN** the system SHALL consider all sessions in that workspace covered by the same project edit lock
- **AND** the system SHALL NOT allow another session in the same workspace to bypass the lock

### Requirement: Edit locks MUST use heartbeat renewal and TTL expiry
系统 SHALL model page-builder edit locks as renewable leases so locks are released automatically after abnormal client exits.

#### Scenario: Renewing a valid lock
- **WHEN** the current lock holder renews a valid page-builder edit lock before it expires
- **THEN** the system SHALL extend the lock expiration time
- **AND** the system SHALL keep the project editable for the holder

#### Scenario: Rejecting renewal from a different holder
- **WHEN** a client renews an existing page-builder edit lock with the correct `lockId` but a different `holderId`
- **THEN** the system SHALL reject the renewal with a conflict response
- **AND** the system SHALL keep the existing lock holder unchanged

#### Scenario: Expiring a stale lock
- **WHEN** a page-builder edit lock has not been renewed before its TTL expires
- **THEN** the system SHALL treat the lock as expired
- **AND** the system SHALL allow a later edit access request to acquire a new lock

#### Scenario: Client loses lock after missed heartbeat
- **WHEN** the builder page fails to renew its edit lock and the backend rejects a later renewal
- **THEN** the builder page SHALL disable editing actions
- **AND** the builder page SHALL prompt the user to re-enter editing from the home history list

### Requirement: Edit lock release MUST be best-effort and refresh-safe
系统 SHALL support a best-effort release path for normal builder exits while preserving the edit lock across ordinary page refreshes.

#### Scenario: Normal builder close releases after grace period
- **WHEN** the current lock holder exits the builder page and sends a release request
- **THEN** the system SHALL mark the lock for release after a short grace period
- **AND** the system SHALL release the lock if no renewal arrives before that grace period ends

#### Scenario: Page refresh keeps the same edit lock
- **WHEN** a builder page refresh causes the old page instance to send release and the new page instance renews the same lock during the grace period
- **THEN** the system SHALL cancel the pending release
- **AND** the system SHALL keep the edit lock valid for the refreshed builder page

#### Scenario: Release from a mismatched holder is ignored
- **WHEN** a client sends a release request with the correct `lockId` but a different `holderId`
- **THEN** the system SHALL ignore the release request
- **AND** the system SHALL keep the valid lock active for the current holder

### Requirement: Active Agent work MUST keep the project locked
系统 SHALL treat a page-builder project as locked while any Agent session in that workspace is actively running, even when no browser edit lock is valid.

#### Scenario: Agent run blocks editing after page close
- **WHEN** a builder page is closed while an Agent run in the same page-builder workspace remains active
- **THEN** the system SHALL report the project as locked
- **AND** the system SHALL reject new edit access requests until the Agent run is no longer active

#### Scenario: Idle project becomes available
- **WHEN** a page-builder workspace has no valid edit lock and no active Agent run
- **THEN** the system SHALL report the project as available for editing

### Requirement: Page-builder editing operations MUST require a valid edit lock
系统 SHALL reject page-builder editing operations unless the request presents the valid edit lock for the target workspace. Read-only requests and project deletion SHALL use their own availability rules instead of requiring edit-lock credentials.

#### Scenario: Valid lock authorizes an editing operation
- **WHEN** a page-builder editing operation includes the current `lockId` and `holderId` for the target workspace
- **THEN** the system SHALL allow the write operation to proceed

#### Scenario: Missing lock rejects an editing operation
- **WHEN** a page-builder editing operation omits the edit lock
- **THEN** the system SHALL reject the operation with a conflict response
- **AND** the system SHALL NOT mutate page-builder project files or metadata

#### Scenario: Expired lock rejects an editing operation
- **WHEN** a page-builder editing operation includes an expired or unknown edit lock
- **THEN** the system SHALL reject the operation with a conflict response
- **AND** the system SHALL instruct the client to re-enter editing

#### Scenario: Read-only requests do not require an edit lock
- **WHEN** a request only reads page-builder state, preview content, CMS browsing data, messages, static export status, or an existing export download
- **THEN** the system SHALL NOT require a page-builder edit lock for that request

#### Scenario: Project deletion is rejected while busy
- **WHEN** a delete request targets a page-builder project that has a valid edit lock or active Agent run
- **THEN** the system SHALL reject the delete request with a conflict response
- **AND** the system SHALL NOT delete the project

#### Scenario: Project deletion is allowed when available
- **WHEN** a delete request targets a page-builder project that has no valid edit lock and no active Agent run
- **THEN** the system SHALL allow the existing page-builder project deletion flow to proceed
- **AND** the system SHALL NOT require edit-lock credentials for that delete request

#### Scenario: Ordinary workspaces are unaffected
- **WHEN** a write operation targets a workspace that is not a page-builder project
- **THEN** the system SHALL NOT require a page-builder edit lock for that operation

### Requirement: Edit lock storage MUST be replaceable
系统 SHALL isolate edit lock persistence behind a storage boundary so the first in-memory implementation can be replaced by a distributed store later without changing page-builder lock semantics.

#### Scenario: In-memory store provides first implementation
- **WHEN** the application runs with the initial page-builder edit lock implementation
- **THEN** the system SHALL store locks in process memory
- **AND** the system SHALL enforce the same acquire, renew, release, expiry, and validation semantics through the lock service

#### Scenario: Storage implementation can be replaced
- **WHEN** a future deployment replaces the in-memory store with a distributed lock store
- **THEN** the system SHALL keep the same lock API and project editing behavior
- **AND** callers SHALL NOT depend on the concrete storage implementation
