## ADDED Requirements

### Requirement: CMS 集成必须提供同步静态 ZIP 导出 API
系统 SHALL 提供 CMS server-to-server 同步导出接口 `POST /api/integrations/cms/projects/:projectId/export`，由 CMS 发布流程基于长期稳定 `projectId` 获取当前 PageBuilder 项目的静态 ZIP 包。

#### Scenario: 有效 CMS 同步导出请求返回 ZIP
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，CMS 使用有效 integration secret、有效 `X-CMS-Cookie`、存在的 `projectId` 和可导出的 page-builder workspace 请求同步导出
- **THEN** 系统 SHALL 校验 CMS `/ui/login` 成功后执行静态导出
- **AND** 系统 SHALL 返回 `200`、`Content-Type: application/zip` 和 `Content-Disposition` 下载文件名
- **AND** 响应 body SHALL 是包含 `index.html` 的 ZIP 包

#### Scenario: standalone 模式拒绝 CMS 同步导出
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms`，且请求 `POST /api/integrations/cms/projects/:projectId/export`
- **THEN** 系统 SHALL 返回结构化拒绝响应
- **AND** 响应 JSON SHALL 包含 `code: "integration_unauthorized"`
- **AND** 系统 SHALL NOT 校验 CMS Cookie 或执行静态导出

#### Scenario: 同步导出接口必须校验 CMS server-to-server 身份
- **WHEN** 请求 `POST /api/integrations/cms/projects/:projectId/export` 缺少有效 `Authorization: Bearer <AI_PAGE_BUILDER_INTEGRATION_SECRET>`
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 JSON SHALL 包含 `code: "integration_unauthorized"`
- **AND** 系统 SHALL NOT 校验 CMS Cookie 或执行导出

#### Scenario: 同步导出接口必须校验当前 CMS Cookie
- **WHEN** CMS 同步导出请求缺少 `X-CMS-Cookie` 或 CMS `/ui/login` 判定未登录
- **THEN** 系统 SHALL 返回 `400 invalid_request` 或 `401 cms_login_expired`
- **AND** 系统 SHALL NOT 执行静态导出
- **AND** 系统 SHALL NOT 在响应体、workspace 文件、Agent 消息、project binding 或导出报告中写入原始 CMS Cookie

#### Scenario: 同步导出不要求 Builder Access Session
- **WHEN** CMS Server 以有效 integration secret 和有效 `X-CMS-Cookie` 调用同步导出接口，但请求没有浏览器 Builder Access Session cookie
- **THEN** 系统 SHALL 继续按 server-to-server 集成接口处理该请求
- **AND** 系统 SHALL NOT 因缺少 Builder Access Session、Origin 或 Referer 而拒绝该请求

#### Scenario: 项目不存在时返回 project_not_found
- **WHEN** CMS 同步导出请求中的 `projectId` 不存在，或对应 project binding 指向的 workspace/session 已不存在
- **THEN** 系统 SHALL 返回 `404`
- **AND** 响应 JSON SHALL 包含 `code: "project_not_found"`

#### Scenario: downloadCmsRemoteAssets 非布尔时返回 invalid_request
- **WHEN** CMS 同步导出请求体包含 `downloadCmsRemoteAssets` 且该字段不是 boolean
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 执行静态导出

#### Scenario: downloadCmsRemoteAssets 缺省值保持兼容
- **WHEN** CMS 同步导出请求体未提供 `downloadCmsRemoteAssets`
- **THEN** 系统 SHALL 使用与现有浏览器异步静态导出相同的默认值
- **AND** 导出报告 SHALL 保持与该默认值对应的 CMS 远程资源处理语义

#### Scenario: downloadCmsRemoteAssets 显式 true 时下载 CMS 远程资源
- **WHEN** CMS 同步导出请求体提供 `downloadCmsRemoteAssets: true`
- **THEN** 系统 SHALL 将该选项传入共享静态导出核心
- **AND** CMS 远程资源 SHALL 按现有离线静态导出规则下载到 ZIP 包内
- **AND** 导出报告 SHALL 记录对应本地化资源语义

#### Scenario: downloadCmsRemoteAssets 显式 false 时跳过 CMS 远程资源
- **WHEN** CMS 同步导出请求体提供 `downloadCmsRemoteAssets: false`
- **THEN** 系统 SHALL 将该选项传入共享静态导出核心
- **AND** CMS 远程资源 SHALL 按现有离线静态导出规则保留或改写为 CMS 源站 URL
- **AND** 导出报告 SHALL 记录被跳过的 CMS 远程资源 warning 和 retained external link 语义

### Requirement: CMS 同步导出必须在项目不可安全发布时返回 project_busy
系统 SHALL 在 CMS 同步导出前检查项目可用性；当项目正在编辑、Agent 正在运行、缺少导出入口、已有导出活动或其他不可安全发布状态时，系统 SHALL 返回结构化 `project_busy`，而不是返回旧包或半成品包。

#### Scenario: 有效编辑锁阻止 CMS 同步导出
- **WHEN** 目标 page-builder workspace 存在有效 edit lock，且 CMS 请求同步导出该项目
- **THEN** 系统 SHALL 返回 `409`
- **AND** 响应 JSON SHALL 包含 `code: "project_busy"`
- **AND** 系统 SHALL NOT 执行静态导出

#### Scenario: 活跃 Agent 阻止 CMS 同步导出
- **WHEN** 目标 page-builder workspace 存在活跃 Agent 运行，且 CMS 请求同步导出该项目
- **THEN** 系统 SHALL 返回 `409`
- **AND** 响应 JSON SHALL 包含 `code: "project_busy"`
- **AND** 系统 SHALL NOT 返回 ZIP

#### Scenario: 缺少 index.html 时返回 project_busy
- **WHEN** 目标 page-builder workspace 的 `workspace-files/index.html` 不存在，且 CMS 请求同步导出该项目
- **THEN** 系统 SHALL 返回 `409`
- **AND** 响应 JSON SHALL 包含 `code: "project_busy"`
- **AND** 响应 SHALL 表示当前项目没有可导出的页面产物

#### Scenario: 同 workspace 已有导出活动时返回 project_busy
- **WHEN** 目标 page-builder workspace 已存在浏览器异步导出或 CMS 同步导出活动，且 CMS 再次请求同步导出
- **THEN** 系统 SHALL 返回 `409`
- **AND** 响应 JSON SHALL 包含 `code: "project_busy"`
- **AND** 系统 SHALL NOT 创建第二个并发导出

### Requirement: CMS 同步导出失败必须返回结构化错误且不返回半成品 ZIP
系统 SHALL 只在静态导出完整成功后返回 ZIP；导出期间的 CMS 数据、CMS 资源、外部资源或服务端渲染失败 SHALL 返回结构化 JSON 错误。

#### Scenario: 导出期间上游资源失败返回 export_upstream_failed
- **WHEN** CMS 同步导出过程中 CMS 数据、CMS 资源、外部远程资源或 CMS island 渲染依赖请求失败并导致导出不能完整完成
- **THEN** 系统 SHALL 返回 `502`
- **AND** 响应 JSON SHALL 包含 `code: "export_upstream_failed"`
- **AND** 系统 SHALL NOT 返回 `application/zip` 或半成品 ZIP body

#### Scenario: 同步导出默认不被 PageBuilder 服务端主动超时
- **WHEN** 未配置 `AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS` 或该配置为 `0`
- **THEN** 系统 SHALL NOT 因 PageBuilder 服务端默认超时主动返回 `export_timeout`
- **AND** CMS HTTP 客户端 SHALL 自行决定等待时长

#### Scenario: 显式配置同步导出超时时返回 export_timeout
- **WHEN** `AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS` 配置为正整数，且 CMS 同步导出超过该时长仍未完成
- **THEN** 系统 SHALL 返回 `504`
- **AND** 响应 JSON SHALL 包含 `code: "export_timeout"`
- **AND** 系统 SHALL NOT 返回半成品 ZIP
- **AND** 后台导出完成或失败后系统 SHALL 释放该 workspace 的导出活动状态
