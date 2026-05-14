## ADDED Requirements

### Requirement: CMS 集成模式项目 API 必须统一校验 Builder Access Session
系统 SHALL 在 CMS 集成模式下通过统一的 CMS Builder Access middleware 保护浏览器侧项目 API，并 SHALL 将 access cookie 解析、签名校验、过期判断、workspace/session 匹配、Origin/Referer 校验和滑动续期收敛到同一访问控制边界。

#### Scenario: standalone 模式不启用项目 API access 校验
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms`
- **THEN** session、workspace 和 page-builder 项目 API SHALL 保持现有 standalone 访问语义
- **AND** 系统 SHALL NOT 要求 `ai_page_builder_access` Cookie

#### Scenario: CMS 模式无 access cookie 访问受保护项目 API 被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求受保护项目 API 时没有有效 `ai_page_builder_access` Cookie
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 SHALL 使用 `{ code, error }` JSON 结构
- **AND** `code` SHALL 为 `builder_access_required`

#### Scenario: CMS 模式 access session 不匹配 workspace 或 session 时被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求的 workspace 或 session 与 Builder Access Session 不匹配
- **THEN** 系统 SHALL 返回 `403`
- **AND** 响应 SHALL 使用 `{ code, error }` JSON 结构
- **AND** `code` SHALL 为 `builder_access_mismatch`

#### Scenario: 校验成功后挂载访问上下文
- **WHEN** CMS 模式下受保护项目 API 通过 Builder Access Session 校验
- **THEN** 系统 SHALL 将 `projectId`、`workspaceId`、`sessionId` 和用户摘要挂到请求上下文
- **AND** 下游 route SHALL 复用该上下文进行 edit lock 或业务规则校验

### Requirement: CMS 集成模式受保护 API 必须按成功响应滑动续期
系统 SHALL 在 CMS 集成模式下对成功通过访问校验且业务响应成功的受保护 API 按空闲 TTL 语义滑动续期 Builder Access Session。

#### Scenario: 受保护 API 成功后续期 access session
- **WHEN** CMS 模式下受保护 API 完成 access 校验、workspace/session 匹配且业务响应状态小于 `400`
- **THEN** 系统 SHALL 将对应 Builder Access Session 的 `expiresAt` 延长到 `now + AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS`
- **AND** 响应 SHALL 重新写出 `Set-Cookie: ai_page_builder_access=...` 并刷新 `Max-Age`

#### Scenario: 鉴权失败不续期
- **WHEN** CMS 模式下受保护 API 因缺少 access cookie、签名无效、session 过期或 workspace/session mismatch 被拒绝
- **THEN** 系统 SHALL NOT 延长 Builder Access Session
- **AND** 系统 SHALL NOT 刷新 access cookie `Max-Age`

#### Scenario: 业务失败不续期
- **WHEN** CMS 模式下受保护 API 通过 access 校验但下游业务返回 `4xx` 或 `5xx`
- **THEN** 系统 SHALL NOT 延长 Builder Access Session
- **AND** 系统 SHALL NOT 因 edit lock 冲突、参数错误或业务异常刷新 access cookie

### Requirement: CMS 集成模式状态变更 API 必须校验 Origin 或 Referer
系统 SHALL 在 CMS 集成模式下对浏览器侧状态变更 API 校验请求来源属于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`，避免仅依赖 Cookie 的跨站请求风险。

#### Scenario: 状态变更 API 缺少可信来源时被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `POST`、`PATCH` 或 `DELETE` 类受保护 API
- **AND** 请求缺少 `Origin` 且缺少可解析的 `Referer`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 响应 SHALL 使用 `{ code, error }` JSON 结构
- **AND** `code` SHALL 为 `builder_access_origin_forbidden`

#### Scenario: 状态变更 API 来源不匹配时被拒绝
- **WHEN** CMS 模式下浏览器请求状态变更 API，且 `Origin` 或 `Referer` 的 origin 不等于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 响应 SHALL 表示 `code: "builder_access_origin_forbidden"`
- **AND** 系统 SHALL NOT 执行业务写操作
- **AND** 系统 SHALL NOT 滑动续期 Builder Access Session

#### Scenario: 状态变更 API 在 public origin 缺失时被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 缺失或不是合法 origin
- **AND** 浏览器请求 `POST`、`PATCH` 或 `DELETE` 类受保护 API
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 响应 SHALL 表示 `code: "builder_access_origin_forbidden"`
- **AND** 系统 SHALL NOT 执行业务写操作
- **AND** 系统 SHALL NOT 从 `Host`、`X-Forwarded-Host` 或其他请求头推断可信来源

#### Scenario: 项目 GET 与 preview 静态资源不因缺少 Origin 被拒绝
- **WHEN** CMS 模式下浏览器请求普通 `GET` 项目 API、preview HTML、preview static、图片、CSS 或 JS 等项目相关资源
- **THEN** 系统 SHALL 继续按 Builder Access Session 和 workspace/session 匹配校验
- **AND** 系统 SHALL NOT 仅因请求缺少 `Origin` header 而拒绝

#### Scenario: 无项目数据静态脚本不要求 Builder Access Session
- **WHEN** CMS 模式下浏览器请求 `preview-bridge.js`、`cms-rendering-preview.js` 或 `cms-rendering-vue.js` 等无项目数据静态脚本
- **THEN** 系统 SHALL NOT 要求 `ai_page_builder_access` Cookie
- **AND** 系统 SHALL NOT 仅因请求缺少 `Origin` header 而拒绝
- **AND** 静态脚本内容 SHALL NOT 包含项目数据、CMS Cookie、access token 或 workspace 私有配置

### Requirement: CMS 集成模式旧全局 CMS browser API 必须 fail closed
系统 SHALL 在 CMS 集成模式下拒绝无 workspace 上下文的旧全局 CMS browser API，直到 workspace-scoped CMS 数据路由提供可按 project binding 判权的替代入口。

#### Scenario: CMS 模式拒绝旧全局 CMS 数据读取接口
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `/api/page-builder/cms/sites`、`/api/page-builder/cms/catalogs`、`/api/page-builder/cms/catalogs/:catalogId` 或 `/api/page-builder/cms/contents`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 响应 SHALL 使用 `{ code, error }` JSON 结构
- **AND** 系统 SHALL NOT 匿名访问 CMS 上游数据

#### Scenario: CMS 模式拒绝旧全局 CMS 资产代理
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `/api/page-builder/cms/assets?url=...`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 作为无 workspace 上下文的 CMS 资源代理

#### Scenario: standalone 模式旧全局 CMS browser API 保持兼容
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且浏览器请求旧全局 CMS browser API
- **THEN** 系统 SHALL 保持现有 CMS browser 数据读取和资产代理行为

### Requirement: CMS 集成模式内部全量和生命周期 API 必须 fail closed
系统 SHALL 在 CMS 集成模式下拒绝浏览器侧内部全量列表、本地创建和会破坏 CMS project binding 的生命周期 API；这些 API 不应因为浏览器持有 Builder Access Session 而返回全量资源或执行绑定破坏性操作。

#### Scenario: CMS 模式拒绝全量 workspace 和 page-builder 项目列表
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `GET /api/workspaces` 或 `GET /api/page-builder/projects`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 返回全量 workspace 列表或全量 page-builder 历史项目列表

#### Scenario: CMS 模式拒绝本地创建 workspace
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `POST /api/workspaces`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 创建绕过 CMS project binding 的 workspace

#### Scenario: CMS 模式拒绝删除 workspace 或 page-builder 项目
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `DELETE /api/workspaces/:workspaceId` 或 `DELETE /api/page-builder/projects/:workspaceId`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 删除 CMS project binding 指向的 workspace、session 或项目文件

#### Scenario: CMS 模式 workspace-scoped 读取 API 必须匹配 workspace
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 workspace capabilities、directory-context、preview-state 或 file-search
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `workspaceId` 等于请求的 `workspaceId`
- **AND** 系统 SHALL NOT 因普通 `GET` 请求缺少 `Origin` header 而拒绝

#### Scenario: CMS 模式 workspace-scoped 写入和 PageBuilder 编辑 API 必须匹配 workspace
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 workspace patch、cms-target-snapshot、cms-auto-handoff、inline-text、block-delete 或 image replacement 等 workspace-scoped 写入或 PageBuilder 编辑 API
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `workspaceId` 等于请求的 `workspaceId`
- **AND** 系统 SHALL 校验 `Origin` 或 `Referer` 属于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`
- **AND** 需要 page-builder edit lock 的现有编辑操作 SHALL 继续校验 edit lock
- **AND** 系统 SHALL NOT 因存在 Builder Access Session 而绕过 edit lock

### Requirement: CMS builder context 必须纳入统一项目 API 保护和续期规则
系统 SHALL 将 `GET /api/integrations/cms/builder-context` 视为受保护项目 API，并通过统一 CMS Builder Access middleware 校验和滑动续期。

#### Scenario: builder context 使用统一 middleware 校验
- **WHEN** CMS 集成模式下浏览器请求 `GET /api/integrations/cms/builder-context?workspaceId=<workspaceId>&sessionId=<sessionId>`
- **THEN** 系统 SHALL 通过统一 CMS Builder Access middleware 校验 access cookie、workspaceId 和 sessionId
- **AND** 系统 SHALL NOT 在 route 内实现一套独立的 access cookie 校验规则

#### Scenario: builder context 成功后刷新 access session
- **WHEN** CMS 集成模式下 builder context 校验通过并成功返回当前 project context
- **THEN** 系统 SHALL 按统一受保护 API 规则滑动续期 Builder Access Session
- **AND** 响应 SHALL 继续不包含 access cookie 值、原始 CMS Cookie、integration secret 或完整 project binding 文件内容
