## Purpose
定义 Agent 会话的创建、列表展示、页签管理、标题维护、工作区归属、文件持久化行为，以及 CMS 集成创建项目时只初始化空 primary session 的边界。

## Requirements

### Requirement: 会话创建
系统 SHALL 支持创建新的对话会话，每个会话独立存储消息历史。

#### Scenario: 创建新会话
- **WHEN** 用户点击新建会话按钮
- **THEN** 系统 SHALL 创建一个新会话（生成 UUID），在侧边栏显示，并切换到该会话

### Requirement: 会话必须持久化工作区归属
系统 SHALL 为每个 Agent 会话持久化其所属工作区，并在创建、读取和更新时保留该归属关系；新会话的默认工作区归属 SHALL 来自权威的当前工作区上下文，而不是浏览器本地残留的活动会话或页签状态。

#### Scenario: 新会话继承当前工作区
- **WHEN** 用户在某个当前工作区下创建新会话
- **THEN** 系统 SHALL 为该会话写入对应的 `workspaceId`，并在后续列表与详情读取中保留该字段

#### Scenario: 历史会话补齐工作区归属
- **WHEN** 系统读取旧会话索引且发现某个会话缺少 `workspaceId`
- **THEN** 系统 SHALL 将该会话补齐到默认工作区，而不是继续保持无归属状态

#### Scenario: 活动页签与当前工作区不一致时仍继承当前工作区
- **WHEN** 用户当前选中的工作区与右侧活动页签所属工作区不同，并点击新建会话
- **THEN** 系统 SHALL 使用当前工作区上下文写入新会话的 `workspaceId`，而不是使用活动页签会话的 `workspaceId`

#### Scenario: 跨浏览器恢复后新会话仍继承已保存工作区
- **WHEN** 本地运行时已经保存当前工作区上下文，且用户在另一浏览器中重新打开应用后创建新会话
- **THEN** 系统 SHALL 继续使用该已保存工作区的 id 作为新会话的 `workspaceId`

### Requirement: 会话列表
系统 SHALL 在当前工作区上下文下展示该工作区的会话列表，并按最近修改时间倒序排列。

#### Scenario: 展示当前工作区的会话列表
- **WHEN** 用户打开应用且当前工作区已经确定
- **THEN** 系统 SHALL 从后端加载并展示 `workspaceId` 属于当前工作区的会话条目，显示标题和创建时间

#### Scenario: 切换工作区后刷新会话列表范围
- **WHEN** 用户在侧边栏切换到另一个工作区
- **THEN** 系统 SHALL 将会话列表切换为目标工作区的会话集合，同时不改变已打开会话自身保存的 `workspaceId`

#### Scenario: 切换会话
- **WHEN** 用户点击侧边栏中的某个会话
- **THEN** 系统 SHALL 加载该会话的历史消息并展示在对话区域

#### Scenario: 再次打开已打开的会话
- **WHEN** 用户点击一个已经在顶部页签条中打开的会话
- **THEN** 系统 SHALL 聚焦现有页签，而不是重复创建同一会话的新页签

### Requirement: 会话页签管理
系统 SHALL 允许用户在顶部同时保留多个已打开的会话页签，并在这些页签之间来回切换。

#### Scenario: 打开多个会话后保留现有页签
- **WHEN** 用户连续打开不同会话
- **THEN** 系统 SHALL 保留之前已打开的会话页签，并将新打开的会话设为当前活动页签

#### Scenario: 切换并发流式会话页签
- **WHEN** 用户同时打开两个会话页签且它们都处于流式回复过程中，并在它们之间来回切换
- **THEN** 系统 SHALL 始终展示当前活动页签自己的消息历史与流式内容，而不是短暂展示另一个会话的消息

### Requirement: 会话删除
系统 SHALL 支持删除会话及其所有消息。

#### Scenario: 删除会话
- **WHEN** 用户对某个会话执行删除操作
- **THEN** 系统 SHALL 删除会话索引记录和对应的 JSONL 消息文件，从列表中移除

### Requirement: 会话标题
系统 SHALL 支持自动生成和手动编辑会话标题。

#### Scenario: 自动生成标题
- **WHEN** 会话首次收到助手响应
- **THEN** 系统 SHALL 基于对话内容自动生成简短标题

#### Scenario: 手动编辑标题
- **WHEN** 用户双击会话标题
- **THEN** 系统 SHALL 允许用户编辑标题并保存

### Requirement: 会话工作区迁移必须保留消息历史
系统 SHALL 支持在工作区之间迁移会话，并保留该会话已有的消息历史记录。

#### Scenario: 迁移会话后保留 JSONL 消息
- **WHEN** 用户将某个会话迁移到其他工作区
- **THEN** 系统 SHALL 保留该会话已有的 JSONL 消息历史，并仅调整工作区归属与执行目录

### Requirement: 会话存储
系统 SHALL 复用现有文件系统持久化方案，存储在 `~/.proma/agent-sessions/` 目录。

#### Scenario: 会话索引存储
- **WHEN** 会话被创建、更新或删除
- **THEN** 系统 SHALL 更新 `~/.proma/agent-sessions.json` 索引文件

#### Scenario: 消息存储
- **WHEN** 新消息产生
- **THEN** 系统 SHALL 以 JSONL 格式追加写入 `~/.proma/agent-sessions/{id}.jsonl`

#### Scenario: 页面刷新后补齐刚完成的助手消息
- **WHEN** 用户在一轮回复刚结束、但最后一条 assistant 消息可能仍处于持久化完成窗口时刷新页面
- **THEN** 系统 SHALL 在初次历史读取后短暂补拉该会话消息，避免长期停留在仅显示最后一条 `user` 消息的截断历史状态

### Requirement: CMS 创建项目只初始化 primary session 元数据
系统 SHALL 在 CMS 创建 AI 专题项目时创建一个归属于该 page-builder workspace 的 primary session，但 SHALL NOT 写入初始用户消息或启动 Agent。

#### Scenario: CMS 项目 primary session 创建后消息为空
- **WHEN** CMS 创建 AI 专题项目成功
- **THEN** 系统 SHALL 创建一个归属于新 workspace 的 primary session
- **AND** 该 session 的消息文件 SHALL 不包含初始用户消息
- **AND** 系统 SHALL NOT 因创建项目而启动 Agent 运行

#### Scenario: project binding 记录 primary session
- **WHEN** CMS 创建 AI 专题项目成功
- **THEN** 系统 SHALL 将 primary session 的 `id` 写入 project binding 的 `primarySessionId`
- **AND** 后续 CMS 集成能力 SHALL 能通过 `projectId` 找到该 primary session

### Requirement: CMS 集成模式 session API 必须受 Builder Access Session 保护
系统 SHALL 在 CMS 集成模式下保护浏览器侧 session API，使 session 读取、附件访问、Agent 控制和消息发送只能访问 Builder Access Session 绑定的 primary session。

#### Scenario: CMS 模式禁止浏览器读取全量 session 列表
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `GET /api/sessions`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 返回全量 session 列表
- **AND** 系统 SHALL NOT 因浏览器持有 Builder Access Session 而返回当前项目子集或全量列表

#### Scenario: CMS 模式禁止浏览器本地创建 session
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `POST /api/sessions`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 创建绕过 CMS project binding 的新 session

#### Scenario: CMS 模式 session-scoped 读取必须匹配 workspace 和 session
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `GET /api/sessions/:sessionId/messages`、`GET /api/sessions/:sessionId/activity` 或 `GET /api/sessions/:sessionId/attachments/:attachmentId/content`
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `sessionId` 等于请求的 `sessionId`
- **AND** 系统 SHALL 校验该 session 所属 `workspaceId` 等于 Builder Access Session 的 `workspaceId`

#### Scenario: CMS 模式 session-scoped 写操作必须匹配并校验来源
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `POST /api/sessions/:sessionId/send`、`POST /api/sessions/:sessionId/stop`、`PATCH /api/sessions/:sessionId`、`POST /api/sessions/:sessionId/permission-respond` 或 `POST /api/sessions/:sessionId/ask-user-respond`
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `workspaceId + sessionId`
- **AND** 系统 SHALL 校验 `Origin` 或 `Referer` 属于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`

#### Scenario: CMS 模式 permission 和 ask-user 响应必须归属于 URL session
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `POST /api/sessions/:sessionId/permission-respond` 或 `POST /api/sessions/:sessionId/ask-user-respond`
- **THEN** 系统 SHALL 在执行响应前确认请求体中的 `requestId` 归属于 URL 中的 `:sessionId`
- **AND** 如果 `requestId` 属于其他 session 或无法确认归属，系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 对其他 session 的 permission 或 ask-user 请求提交响应

#### Scenario: CMS 模式发送 Agent 消息继续要求 edit lock
- **WHEN** CMS 模式下浏览器请求 `POST /api/sessions/:sessionId/send` 且 Builder Access Session 校验通过
- **THEN** 系统 SHALL 继续按现有 page-builder edit lock 规则校验当前 workspace 的编辑锁
- **AND** 系统 SHALL NOT 因存在 Builder Access Session 而绕过 edit lock

### Requirement: CMS 集成模式不得通过 session 生命周期 API 破坏 project binding
系统 SHALL 在 CMS 集成模式下禁止浏览器使用 session 删除或迁移 API 破坏 CMS project binding 中记录的 primary session 与 workspace 关系。

#### Scenario: CMS 模式禁止删除 session
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `DELETE /api/sessions/:sessionId`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 删除 CMS project binding 指向的 primary session

#### Scenario: CMS 模式禁止迁移 session 到其他 workspace
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `POST /api/sessions/:sessionId/move-workspace`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 修改 CMS project binding 指向 session 的 workspace 归属
