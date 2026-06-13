## MODIFIED Requirements

### Requirement: CMS 集成模式 session API 必须受 Builder Access Session 保护
系统 SHALL 在 CMS 集成模式下保护浏览器侧 session API，使 session 读取、附件访问、Agent 控制和消息发送只能访问 Builder Access Session 绑定的 primary session。仅当开发态 standalone 入口配置生效时，系统 SHALL 允许 standalone 首页、历史和直接 builder 所需的 session 列表、本地创建和 session-scoped API 按 standalone 语义执行。

#### Scenario: CMS 模式禁止浏览器读取全量 session 列表
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且开发态 standalone 入口未生效
- **AND** 浏览器请求 `GET /api/sessions`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 返回全量 session 列表
- **AND** 系统 SHALL NOT 因浏览器持有 Builder Access Session 而返回当前项目子集或全量列表

#### Scenario: CMS 模式禁止浏览器本地创建 session
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且开发态 standalone 入口未生效
- **AND** 浏览器请求 `POST /api/sessions`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 创建绕过 CMS project binding 的新 session

#### Scenario: 开发态 CMS 模式允许读取全量 session 列表
- **WHEN** `NODE_ENV=development`、`AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS` 为显式真值
- **AND** 浏览器请求 `GET /api/sessions`
- **THEN** 系统 SHALL 按 standalone 语义返回 session 列表
- **AND** 系统 SHALL NOT 要求 Builder Access Session

#### Scenario: 开发态 CMS 模式允许本地创建 session
- **WHEN** `NODE_ENV=development`、`AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS` 为显式真值
- **AND** 浏览器请求 `POST /api/sessions`
- **THEN** 系统 SHALL 按 standalone 语义创建 session
- **AND** 系统 SHALL NOT 要求 Builder Access Session

#### Scenario: CMS 模式 session-scoped 读取必须匹配 workspace 和 session
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且开发态 standalone 入口未生效
- **AND** 浏览器请求 `GET /api/sessions/:sessionId/messages`、`GET /api/sessions/:sessionId/activity` 或 `GET /api/sessions/:sessionId/attachments/:attachmentId/content`
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `sessionId` 等于请求的 `sessionId`
- **AND** 系统 SHALL 校验该 session 所属 `workspaceId` 等于 Builder Access Session 的 `workspaceId`

#### Scenario: CMS 模式 session-scoped 写操作必须匹配并校验来源
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且开发态 standalone 入口未生效
- **AND** 浏览器请求 `POST /api/sessions/:sessionId/send`、`POST /api/sessions/:sessionId/stop`、`PATCH /api/sessions/:sessionId`、`POST /api/sessions/:sessionId/permission-respond` 或 `POST /api/sessions/:sessionId/ask-user-respond`
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `workspaceId + sessionId`
- **AND** 系统 SHALL 校验 `Origin` 或 `Referer` 属于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`
- **AND** 系统 SHALL NOT 因存在 access cookie 而绕过 edit lock 或 pending request 归属校验

#### Scenario: 开发态 CMS 模式 session-scoped API 按 standalone 行为执行
- **WHEN** `NODE_ENV=development`、`AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS` 为显式真值
- **AND** 浏览器请求 session-scoped messages、activity、attachment、send、stop、title update、permission response 或 ask-user response API
- **THEN** 系统 SHALL 按 standalone session API 语义处理该请求
- **AND** 系统 SHALL NOT 要求 Builder Access Session
- **AND** 系统 SHALL 继续执行 edit lock、pending request 归属和 session 存在性等既有业务校验

#### Scenario: CMS 模式 permission 和 ask-user 响应必须归属于 URL session
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `POST /api/sessions/:sessionId/permission-respond` 或 `POST /api/sessions/:sessionId/ask-user-respond`
- **THEN** 系统 SHALL 在执行响应前确认请求体中的 `requestId` 归属于 URL 中的 `:sessionId`
- **AND** 如果 `requestId` 属于其他 session 或无法确认归属，系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 对其他 session 的 permission 或 ask-user 请求提交响应

#### Scenario: CMS 模式发送 Agent 消息继续要求 edit lock
- **WHEN** CMS 模式下浏览器请求 `POST /api/sessions/:sessionId/send` 且 Builder Access Session 校验通过
- **THEN** 系统 SHALL 继续按现有 page-builder edit lock 规则校验当前 workspace 的编辑锁

#### Scenario: 开发态 CMS 模式发送 Agent 消息继续要求 edit lock
- **WHEN** 开发态 standalone 入口生效且浏览器请求 `POST /api/sessions/:sessionId/send`
- **AND** 该 session 属于 page-builder workspace
- **THEN** 系统 SHALL 继续按现有 page-builder edit lock 规则校验当前 workspace 的编辑锁
