## MODIFIED Requirements

### Requirement: Active Agent work MUST keep the project locked
系统 SHALL treat a page-builder project as locked while any Agent session in that workspace is actively running, even when no browser edit lock is valid; however, when the current page reopens the same active session and no other page instance or other session holds a valid edit lock for that workspace, the system SHALL treat the request as a recovery attempt rather than a fresh conflicting edit request.

#### Scenario: Agent run blocks unrelated editing after page close
- **WHEN** a builder page is closed while an Agent run in the same page-builder workspace remains active
- **THEN** the system SHALL report the project as locked for new unrelated editors
- **AND** the system SHALL reject new edit access requests from other sessions until the Agent run is no longer active

#### Scenario: Reopening the same active session is recoverable
- **WHEN** the current builder page reopens the same workspaceId and sessionId that still corresponds to an active Agent run, and no other page instance or other session holds a valid edit lock for that workspace
- **THEN** the system SHALL allow the page to recover that active session
- **AND** the system SHALL NOT treat that request as a normal lock conflict

#### Scenario: Reopened same-session lock may be replaced during recovery
- **WHEN** the current builder page reopens the same active session while a stale same-session lock record is still present from the previous page instance
- **THEN** the system SHALL allow the recovery flow to renew or replace that stale lock context
- **AND** the system SHALL NOT treat the stale same-session lock as another editor

#### Scenario: Non-active session with another active session remains blocked
- **WHEN** a builder page reopens a sessionId that is not the active Agent session for that workspace, while another session in the same workspace is still active
- **THEN** the system SHALL keep that non-active session blocked from becoming editable
- **AND** the system SHALL direct the user toward the active session instead

#### Scenario: Idle project becomes available
- **WHEN** a page-builder workspace has no valid edit lock and no active Agent run
- **THEN** the system SHALL report the project as available for editing

### Requirement: Page-builder editing operations MUST require a valid edit lock
系统 SHALL reject page-builder editing operations unless the request presents the valid edit lock for the target workspace. Read-only requests and project deletion SHALL use their own availability rules instead of requiring edit-lock credentials. When a builder page is recovering the same active Agent session, the system SHALL allow the page to continue to use the restored lock context after recovery succeeds, and stale same-session lock records SHALL NOT be treated as a different editor.

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
