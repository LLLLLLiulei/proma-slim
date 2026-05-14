## ADDED Requirements

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
