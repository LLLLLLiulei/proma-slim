## ADDED Requirements

### Requirement: CMS 集成模式配置与状态探测
系统 SHALL 支持通过 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 启用 CMS 集成模式，并 SHALL 提供匿名只读状态接口供前端判断当前模式。

#### Scenario: standalone 模式返回未启用状态
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且请求 `GET /api/integrations/cms/status`
- **THEN** 系统 SHALL 返回 `200` 和 `{ "integrationMode": "standalone", "enabled": false }`

#### Scenario: CMS 集成模式返回启用状态
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且请求 `GET /api/integrations/cms/status`
- **THEN** 系统 SHALL 返回 `200`、`integrationMode: "cms"`、`enabled: true`、`supportedOpenModes: ["iframe", "window"]` 和当前规范化后的 `basePath`

#### Scenario: 状态接口不暴露敏感信息
- **WHEN** 任意客户端请求 `GET /api/integrations/cms/status`
- **THEN** 系统 SHALL NOT 要求 integration secret
- **AND** 系统 SHALL NOT 接收或使用 `X-CMS-Cookie`
- **AND** 系统 SHALL NOT 调用 CMS `/ui/login`
- **AND** 响应 SHALL NOT 包含 secret、CMS Cookie、用户摘要、workspace、session 或 project binding 内容

#### Scenario: CMS 登录 baseUrl 配置缺失时状态接口仍可返回模式
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 但 `AI_PAGE_BUILDER_CMS_BASE_URL` 缺失或非法，且请求 `GET /api/integrations/cms/status`
- **THEN** 系统 SHALL 仍返回 `200` 和 `enabled: true`
- **AND** 系统 SHALL NOT 在状态响应中暴露具体配置错误细节

#### Scenario: CMS 登录 baseUrl 配置只作为登录态校验权威来源
- **WHEN** 系统执行 CMS `/ui/login` 登录态校验
- **THEN** 系统 SHALL 使用 `AI_PAGE_BUILDER_CMS_BASE_URL` 作为 CMS 管理端 baseUrl
- **AND** 系统 SHALL NOT 从旧 `PROMA_CMS_USERNAME` 或 `PROMA_CMS_PASSWORD` 读取当前用户登录态凭据

### Requirement: CMS server-to-server 接口必须校验 integration secret
系统 SHALL 对 CMS server-to-server 写接口校验 `Authorization: Bearer <AI_PAGE_BUILDER_INTEGRATION_SECRET>`，并 SHALL 使用结构化错误表示鉴权失败。

#### Scenario: 缺少 integration secret 时拒绝创建项目
- **WHEN** 请求 `POST /api/integrations/cms/projects` 且缺少有效 `Authorization` header
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 JSON SHALL 为 `{ "code": "integration_unauthorized", "error": "PageBuilder 集成鉴权失败" }`

#### Scenario: integration secret 不匹配时拒绝创建项目
- **WHEN** 请求 `POST /api/integrations/cms/projects` 且 Bearer secret 与 `AI_PAGE_BUILDER_INTEGRATION_SECRET` 不匹配
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 JSON SHALL 包含 `code: "integration_unauthorized"`

#### Scenario: standalone 模式不允许创建 CMS 项目绑定
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且请求 `POST /api/integrations/cms/projects`
- **THEN** 系统 SHALL 拒绝该请求并返回结构化错误
- **AND** 系统 SHALL NOT 创建 workspace、session 或 project binding

#### Scenario: CMS 登录 baseUrl 配置缺失时拒绝写接口
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 但 `AI_PAGE_BUILDER_CMS_BASE_URL` 缺失或非法，且请求 `POST /api/integrations/cms/projects`
- **THEN** 系统 SHALL 返回结构化错误
- **AND** 系统 SHALL NOT 创建 workspace、session 或 project binding

### Requirement: CMS 登录态校验必须使用当前请求 Cookie
系统 SHALL 使用 `X-CMS-Cookie` 在当前请求内调用 `GET {AI_PAGE_BUILDER_CMS_BASE_URL}/ui/login` 校验 CMS 用户登录态，并 SHALL NOT 持久化原始 CMS Cookie。

#### Scenario: 缺少 CMS Cookie 时拒绝请求
- **WHEN** 创建 CMS 项目时缺少 `X-CMS-Cookie` 或该 header 为空白字符串
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 调用 CMS `/ui/login`

#### Scenario: CMS 登录态校验成功
- **WHEN** 创建 CMS 项目时提供有效 `X-CMS-Cookie`，且 CMS `/ui/login` 返回 HTTP 200、`status === 1`、`data.logined === true`
- **THEN** 系统 SHALL 将 `X-CMS-Cookie` 作为上游请求的 `Cookie` header 转发
- **AND** 系统 SHALL 提取必要用户摘要用于 project binding
- **AND** 系统 SHALL NOT 把原始 CMS Cookie 写入响应体或持久化文件

#### Scenario: CMS Cookie 无效或未登录
- **WHEN** CMS `/ui/login` 返回 HTTP 200 但 `status !== 1`、`data.logined !== true` 或明确表示当前用户未登录
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 JSON SHALL 包含 `code: "cms_login_expired"`

#### Scenario: CMS 登录请求被上游拒绝
- **WHEN** CMS `/ui/login` 返回 HTTP 401 或 HTTP 403
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 JSON SHALL 包含 `code: "cms_login_expired"`

#### Scenario: CMS 登录接口不可用或响应不可解析
- **WHEN** PageBuilder 无法请求 CMS `/ui/login`，或 `/ui/login` 返回 HTTP 500、HTTP 502、其他非 2xx 响应、非 JSON、缺少必要结构或其他不可判定响应
- **THEN** 系统 SHALL 返回 `502`
- **AND** 响应 JSON SHALL 包含 `code: "cms_login_unavailable"`

### Requirement: CMS 项目绑定必须持久化长期项目身份
系统 SHALL 将 CMS 外部记录与内部 page-builder workspace/session 的绑定持久化到 `${PROMA_CONFIG_DIR}/integrations/cms/projects.json`，并 SHALL 使用长期稳定的 `projectId` 作为 CMS 对外契约。

#### Scenario: 首次创建项目写入 project binding
- **WHEN** CMS 首次成功创建 AI 专题项目
- **THEN** 系统 SHALL 写入包含 `projectId`、`workspaceId`、`primarySessionId`、`projectName`、`siteId`、`externalRecordId`、必要用户摘要、`createdAt`、`updatedAt` 和 `lastValidatedAt` 的 binding 记录
- **AND** 系统 SHALL NOT 在 binding 中保存原始 CMS Cookie、integration secret 或 handoff/access token

#### Scenario: projectId 独立于内部 workspace 和 session 身份
- **WHEN** 系统首次创建 CMS project binding
- **THEN** 系统 SHALL 独立生成长期稳定的 `projectId`
- **AND** `projectId` SHALL NOT 等于内部 `workspaceId`
- **AND** `projectId` SHALL NOT 等于内部 `primarySessionId`

#### Scenario: binding 写入使用原子替换
- **WHEN** 系统写入 project binding 文件
- **THEN** 系统 SHALL 使用临时文件加 rename 的方式替换目标文件
- **AND** 系统 SHALL 在同一进程内串行化创建、更新和删除 binding 的操作

#### Scenario: 并发创建同一 externalRecordId 不生成多个对外项目
- **WHEN** 多个请求并发使用同一 `externalRecordId` 创建项目
- **THEN** 系统 SHALL 对创建流程做写前二次检查
- **AND** 所有成功响应 SHALL 返回同一个 `projectId`
- **AND** binding 文件 SHALL NOT 损坏

#### Scenario: externalRecordId 与 siteId 冲突时拒绝复用
- **WHEN** 某个 `externalRecordId` 已绑定项目，但本次创建请求携带不同 `siteId`
- **THEN** 系统 SHALL 返回 `409`
- **AND** 响应 JSON SHALL 包含 `code: "project_conflict"`

#### Scenario: 已有 binding 指向的内部资源缺失时拒绝复用
- **WHEN** 某个 `externalRecordId` 已绑定项目，但对应 workspace 或 primary session 已不存在
- **THEN** 系统 SHALL 返回 `409`
- **AND** 响应 JSON SHALL 包含 `code: "project_conflict"`

### Requirement: CMS 创建项目 API 必须创建空的 PageBuilder 项目
系统 SHALL 提供 `POST /api/integrations/cms/projects`，由 CMS 服务端创建 AI 专题项目，并 SHALL 只初始化 page-builder workspace 和 primary session。

#### Scenario: 首次创建 CMS 项目成功
- **WHEN** CMS 使用有效 integration secret、有效 `X-CMS-Cookie` 和合法 `externalRecordId`、`projectName`、`siteId` 请求创建项目
- **THEN** 系统 SHALL 创建一个 `template: "page-builder"` 的 workspace
- **AND** 系统 SHALL 创建该 workspace 下的 primary session
- **AND** 系统 SHALL 返回 `201` 和 `{ "projectId": <稳定项目 ID>, "created": true }`

#### Scenario: 同一 externalRecordId 幂等重试
- **WHEN** CMS 使用同一 `externalRecordId` 和同一 `siteId` 重试创建项目
- **THEN** 系统 SHALL 返回已有 `projectId`
- **AND** 系统 SHALL 返回 `200` 和 `created: false`
- **AND** 系统 SHALL NOT 再创建新的 workspace 或 primary session

#### Scenario: 幂等重试仍需校验当前 CMS 登录态
- **WHEN** CMS 使用同一 `externalRecordId` 重试创建项目，但 integration secret 或 `X-CMS-Cookie` 无效
- **THEN** 系统 SHALL 在返回已有 `projectId` 前拒绝该请求
- **AND** 响应 SHALL NOT 暴露已有 `projectId`

#### Scenario: 创建项目请求参数不合法
- **WHEN** 创建项目请求缺少 `externalRecordId`、`projectName` 或 `siteId`，或这些字段不是非空字符串
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`

#### Scenario: 创建项目请求包含 prompt 时被拒绝
- **WHEN** 创建项目请求体包含 `prompt` 字段
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 创建 workspace、session 或 project binding

#### Scenario: 创建项目不写入初始消息也不启动 Agent
- **WHEN** CMS 创建项目成功
- **THEN** 新建 primary session 的消息列表 SHALL 为空
- **AND** 系统 SHALL NOT 发送 Agent 消息
- **AND** 系统 SHALL NOT 启动 Agent 运行

#### Scenario: binding 写入失败时不返回可用 projectId
- **WHEN** workspace/session 已创建但 project binding 写入失败
- **THEN** 系统 SHALL 返回失败响应
- **AND** 响应 SHALL NOT 包含可用 `projectId`
- **AND** 系统 SHALL 尝试清理刚创建的 workspace/session

### Requirement: CMS integration 错误响应必须结构化且避免泄露敏感信息
系统 SHALL 对 `/api/integrations/cms/*` 返回稳定结构化 JSON 错误，并 SHALL 避免在响应体和新增持久化数据中泄露敏感凭据。

#### Scenario: CMS integration 错误包含 code 和 error
- **WHEN** `/api/integrations/cms/*` 路由发生可预期业务错误
- **THEN** 响应 JSON SHALL 包含 `code` 和 `error` 字段
- **AND** `code` SHALL 使用标准错误码，例如 `invalid_request`、`integration_unauthorized`、`cms_login_expired`、`cms_login_unavailable` 或 `project_conflict`

#### Scenario: CMS integration 响应不泄露敏感信息
- **WHEN** CMS integration 接口返回成功或失败响应
- **THEN** 响应体 SHALL NOT 包含原始 CMS Cookie、integration secret、Authorization header、上游完整 Cookie 或内部 binding 文件内容
