## MODIFIED Requirements

### Requirement: Edit lock release MUST be best-effort and refresh-safe
系统 SHALL support a best-effort release path for normal builder exits while making the released project immediately available to other editors once the release request reaches the backend. A released lock MAY remain temporarily stored only for same-holder refresh recovery, but it SHALL NOT be treated as a blocking editor lock or a writable edit credential.

#### Scenario: Normal builder close makes the project immediately available
- **WHEN** the current lock holder exits the builder page and sends a release request
- **THEN** the system SHALL mark the previous lock as release pending or remove it
- **AND** the system SHALL report the project as available for editing immediately after the release request is accepted
- **AND** the system SHALL allow a later edit access request from another holder to acquire a new lock without waiting for the release grace period to end

#### Scenario: Page refresh can recover the same pending lock
- **WHEN** a builder page refresh causes the old page instance to send release and no other holder has acquired a replacement lock
- **AND** the new page instance renews the same `lockId` and `holderId` during the release grace period
- **THEN** the system SHALL cancel the pending release
- **AND** the system SHALL keep the edit lock valid for the refreshed builder page

#### Scenario: Another holder acquiring during release pending replaces the old lock
- **WHEN** a lock is release pending and a different holder requests edit access for the same page-builder workspace
- **THEN** the system SHALL create a new edit lock for the different holder
- **AND** the system SHALL replace the pending lock record
- **AND** the previous holder SHALL NOT be able to renew the old lock after it has been replaced

#### Scenario: Release pending lock does not authorize editing operations
- **WHEN** a builder page has released its edit lock and the lock is only retained for refresh recovery
- **THEN** the system SHALL reject normal page-builder editing operations that present the released `lockId` and `holderId`
- **AND** the system SHALL instruct the client to re-enter editing instead of mutating project files or metadata

#### Scenario: Release from a mismatched holder is ignored
- **WHEN** a client sends a release request with the correct `lockId` but a different `holderId`
- **THEN** the system SHALL ignore the release request
- **AND** the system SHALL keep the valid lock active for the current holder

#### Scenario: Release pending expires without renewal
- **WHEN** a released lock remains pending until the release grace period ends without a same-holder renewal
- **THEN** the system SHALL discard the pending lock record
- **AND** the system SHALL keep the project available unless another busy condition such as active Agent work or static export applies
