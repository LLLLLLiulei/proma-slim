## Purpose
定义 `page-builder` 项目的工作区级编辑锁语义，包括独占获取、心跳续约、释放、TTL 过期、活跃 Agent 忙碌检测，以及对写操作和项目删除的后端约束。

## Requirements

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

### Requirement: CMS 集成模式 edit lock 必须在 builder context 成功后获取
PageBuilder BuilderPage 在 CMS 集成模式下 SHALL 只在 builder context 成功确认当前项目访问会话后获取、续约或释放 edit lock。

#### Scenario: builder context 成功后获取 edit lock
- **WHEN** CMS 集成模式下 BuilderPage 成功获取 builder context，且返回 workspace 是 page-builder 项目
- **THEN** 系统 SHALL 按现有 edit lock 流程复用或获取当前 workspace 的编辑锁
- **AND** 系统 SHALL 在 edit lock 可用后启用项目编辑操作

#### Scenario: builder context 失败时不触发 edit lock
- **WHEN** CMS 集成模式下 BuilderPage 获取 builder context 失败
- **THEN** 系统 SHALL NOT 请求 acquire、renew、status 或 release edit lock 接口
- **AND** 系统 SHALL NOT 从 sessionStorage 恢复 standalone edit lock 片段来绕过 builder context

#### Scenario: standalone edit lock 行为保持不变
- **WHEN** BuilderPage 处于 standalone 模式并进入 page-builder 项目
- **THEN** 系统 SHALL 继续优先复用已有锁上下文或直接获取新的编辑锁
- **AND** 系统 SHALL 继续在锁失效或被拒绝时禁用编辑能力并提示用户重新进入

### Requirement: CMS 集成模式 edit lock API 必须受 Builder Access Session 保护
系统 SHALL 在 CMS 集成模式下要求 page-builder edit lock API 先通过 Builder Access Session 校验，再执行现有编辑锁 acquire、renew、status 或 release 逻辑。

#### Scenario: CMS 模式无 access cookie 不能获取编辑锁
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `POST /api/page-builder/projects/:workspaceId/edit-lock` 没有有效 Builder Access Session
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 创建 page-builder edit lock

#### Scenario: CMS 模式 edit lock workspace 必须匹配 access session
- **WHEN** CMS 模式下浏览器请求任一 `edit-lock` API，且请求的 `workspaceId` 与 Builder Access Session 不匹配
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 获取、续约、查询或释放目标 workspace 的编辑锁

#### Scenario: CMS 模式 edit lock 状态变更必须校验来源
- **WHEN** CMS 模式下浏览器请求 acquire、renew 或 release edit lock
- **THEN** 系统 SHALL 校验 `Origin` 或 `Referer` 属于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`
- **AND** 来源校验失败时 SHALL NOT 执行编辑锁状态变更

#### Scenario: CMS 模式 edit lock status GET 不因缺少 Origin 被拒绝
- **WHEN** CMS 模式下浏览器请求 `GET /api/page-builder/projects/:workspaceId/edit-lock/:lockId` 且 Builder Access Session 匹配 workspace
- **THEN** 系统 SHALL 允许继续查询 edit lock 状态
- **AND** 系统 SHALL NOT 仅因请求缺少 `Origin` header 而拒绝

### Requirement: CMS 同步导出活动必须使项目不可获取新的编辑锁
系统 SHALL 在 CMS 同步导出活动期间把目标 page-builder workspace 视为 busy，并拒绝新的 edit lock acquire 请求，避免导出过程中项目文件继续被编辑。

#### Scenario: 同步导出期间获取编辑锁被拒绝
- **WHEN** 某个 page-builder workspace 正在执行 CMS 同步静态导出，且客户端请求获取该 workspace 的 edit lock
- **THEN** 系统 SHALL 拒绝获取编辑锁并返回冲突响应
- **AND** 系统 SHALL NOT 创建新的 edit lock
- **AND** 系统 SHALL 向调用方表达项目正在导出或暂不可编辑

#### Scenario: 同步导出活动进入项目编辑状态
- **WHEN** 某个 page-builder workspace 正在执行 CMS 同步静态导出，且系统查询该 workspace 的编辑可用状态
- **THEN** 系统 SHALL 将该项目报告为 locked
- **AND** locked reason SHALL 能区分导出活动与普通编辑锁或活跃 Agent

#### Scenario: 同步导出结束后项目可重新获取编辑锁
- **WHEN** 某个 page-builder workspace 的 CMS 同步导出完成或失败，并且该 workspace 没有有效 edit lock、活跃 Agent 或其他 busy 状态
- **THEN** 系统 SHALL 允许后续 edit lock acquire 按现有流程创建编辑锁
