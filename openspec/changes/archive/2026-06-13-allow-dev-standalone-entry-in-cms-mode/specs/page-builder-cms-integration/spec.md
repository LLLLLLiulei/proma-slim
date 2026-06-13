## MODIFIED Requirements

### Requirement: CMS 集成模式配置与状态探测
系统 SHALL 支持通过 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 启用 CMS 集成模式，并 SHALL 提供匿名只读状态接口供前端判断当前模式。系统 SHALL 支持仅开发模式生效的 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS` 配置，用于在 CMS 集成模式下开放 standalone 首页和历史入口；该配置在非 development 环境中 MUST 被忽略。

#### Scenario: standalone 模式返回未启用状态
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且请求 `GET /api/integrations/cms/status`
- **THEN** 系统 SHALL 返回 `200` 和 `{ "integrationMode": "standalone", "enabled": false }`
- **AND** 系统 SHALL NOT 返回 `devStandaloneEntryEnabled: true`

#### Scenario: CMS 集成模式返回启用状态
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且请求 `GET /api/integrations/cms/status`
- **THEN** 系统 SHALL 返回 `200`、`integrationMode: "cms"`、`enabled: true`、`supportedOpenModes: ["iframe", "window"]` 和当前规范化后的 `basePath`

#### Scenario: 开发态 standalone 入口配置生效
- **WHEN** `NODE_ENV=development`、`AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS` 为显式真值
- **AND** 请求 `GET /api/integrations/cms/status`
- **THEN** 系统 SHALL 返回 `integrationMode: "cms"` 和 `enabled: true`
- **AND** 系统 SHALL 返回 `devStandaloneEntryEnabled: true`
- **AND** 系统 SHALL 继续返回 CMS 集成模式所需的非敏感状态字段

#### Scenario: 非开发环境忽略开发态 standalone 入口配置
- **WHEN** `NODE_ENV` 不是 `development`、`AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS` 为显式真值
- **AND** 请求 `GET /api/integrations/cms/status`
- **THEN** 系统 SHALL 返回 `integrationMode: "cms"` 和 `enabled: true`
- **AND** 系统 SHALL NOT 返回 `devStandaloneEntryEnabled: true`
- **AND** 系统 SHALL 保持生产 CMS 受控入口语义

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

### Requirement: CMS 集成前端必须使用状态探测和 builder context
PageBuilder renderer 在 CMS 集成模式下 SHALL 使用 CMS integration status 判断运行模式，并 SHALL 使用 builder context 作为进入具体项目的受控前端上下文来源。仅当 status 明确返回 `devStandaloneEntryEnabled: true` 时，PageBuilder renderer MAY 在开发模式下复用 standalone 首页入口、历史入口和直接 builder 加载流程。

#### Scenario: 前端通过 integration status 判断 CMS 模式
- **WHEN** PageBuilder renderer 初始化首页或 builder 页面
- **THEN** 系统 SHALL 请求 `GET /api/integrations/cms/status`
- **AND** 当响应包含 `integrationMode: "cms"` 且 `enabled: true` 时，前端 SHALL 进入 CMS 集成门控流程
- **AND** 当前端同时收到 `devStandaloneEntryEnabled: true` 时，前端 SHALL 进入开发态 standalone 入口流程
- **AND** 当前端收到 `integrationMode: "cms"` 且 `enabled: true` 时，构建页 SHALL 保留 CMS 数据选择能力，不得因 `devStandaloneEntryEnabled: true` 隐藏选区后的 CMS 选择入口

#### Scenario: status 未完成前不得加载 standalone 项目入口
- **WHEN** PageBuilder renderer 已开始读取 `GET /api/integrations/cms/status` 但尚未确认当前模式
- **THEN** 系统 SHALL NOT 挂载 standalone 首页创建区、历史项目区或 Builder 项目工作台
- **AND** 系统 SHALL NOT 请求 `/api/page-builder/projects`、`/api/sessions`、`/api/workspaces`、session messages、preview-state、workspace preview、CMS browser、edit lock 或项目编辑 API

#### Scenario: status 请求失败时不回退 standalone
- **WHEN** PageBuilder renderer 无法成功读取 `GET /api/integrations/cms/status`
- **THEN** 系统 SHALL 展示服务暂不可用或可重试状态
- **AND** 系统 SHALL NOT 回退到 standalone 首页创建、历史列表或全量 workspace/session 初始化流程

#### Scenario: CMS 模式 builder 使用 builder context 获取项目上下文
- **WHEN** PageBuilder renderer 处于 CMS 集成模式并加载 `/builder/:workspaceId/:sessionId`
- **AND** integration status 未返回 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL 请求 `GET /api/integrations/cms/builder-context?workspaceId=<workspaceId>&sessionId=<sessionId>`
- **AND** 系统 SHALL 依赖同源 `ai_page_builder_access` Cookie 完成访问校验
- **AND** 系统 SHALL NOT 在前端读取、传递或持久化 access token

#### Scenario: 开发态 standalone 入口下 builder 使用 standalone 上下文解析
- **WHEN** PageBuilder renderer 加载 `/builder/:workspaceId/:sessionId`
- **AND** integration status 返回 `integrationMode: "cms"`、`enabled: true` 和 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL 使用 standalone `sessions/workspaces` 列表解析当前项目上下文
- **AND** 系统 SHALL NOT 要求当前页面必须由 CMS handoff 打开
- **AND** 系统 SHALL NOT 因缺少 `ai_page_builder_access` Cookie 展示 CMS 访问失效页
- **AND** 系统 SHALL 继续允许用户在预览区选中区块后打开 CMS browser 选择栏目或内容

#### Scenario: builder context 失败时提示从 CMS 重新进入
- **WHEN** CMS 集成模式下 builder context 返回 `401`、`403`、`404` 或其他失败响应
- **AND** integration status 未返回 `devStandaloneEntryEnabled: true`
- **THEN** 系统 SHALL 展示“访问已失效，请从 CMS 系统重新进入 PageBuilder”
- **AND** 系统 SHALL 阻止继续加载当前项目的消息、预览、CMS browser、edit lock 或项目编辑 API

#### Scenario: CMS 模式 API 请求继续使用 public base path 解析
- **WHEN** PageBuilder renderer 在 public base path 下请求 integration status 或 builder context
- **THEN** 前端调用方 SHALL 继续使用逻辑 `/api/...` 路径
- **AND** 共享 API client SHALL 将浏览器实际请求解析到 `${AI_PAGE_BUILDER_BASE_PATH}/api/...`

### Requirement: CMS 集成模式项目 API 必须统一校验 Builder Access Session
系统 SHALL 在 CMS 集成模式下通过统一的 CMS Builder Access middleware 保护浏览器侧项目 API，并 SHALL 将 access cookie 解析、过期判断、workspace/session 匹配、Origin/Referer 校验和滑动续期收敛到同一访问控制边界。系统 SHALL 从 CMS runtime store 读取 Builder Access Session，以支持单 `server` 实例重启后的访问恢复。仅当开发态 standalone 入口配置生效时，standalone 首页、历史和直接 builder 所需的项目 API SHALL 按 standalone 语义放行；CMS builder context SHALL NOT 被该 bypass 绕过。

#### Scenario: standalone 模式不启用项目 API access 校验
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms`
- **THEN** session、workspace 和 page-builder 项目 API SHALL 保持现有 standalone 访问语义
- **AND** 系统 SHALL NOT 要求 `ai_page_builder_access` Cookie

#### Scenario: 开发态 standalone 入口不启用项目 API access 校验
- **WHEN** `NODE_ENV=development`、`AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS` 为显式真值
- **AND** 浏览器请求 standalone 首页、历史项目或直接 builder 所需的 session、workspace 和 page-builder 项目 API
- **THEN** 系统 SHALL 保持现有 standalone 访问语义
- **AND** 系统 SHALL NOT 要求 `ai_page_builder_access` Cookie
- **AND** 系统 SHALL 继续执行既有 workspace、session、page-builder template 和 edit lock 业务校验

#### Scenario: 开发态 standalone 入口允许未绑定 workspace 加载 CMS browser 数据
- **WHEN** `NODE_ENV=development`、`AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS` 为显式真值
- **AND** 浏览器请求本地 standalone 创建的 page-builder workspace 的 `/api/workspaces/:workspaceId/page-builder/cms/sites`、`/catalogs`、`/contents` 或 `/assets`
- **AND** 该 workspace 没有 CMS project binding 或 Builder Access Session
- **THEN** 系统 SHALL 使用默认 CMS 配置加载 CMS browser 数据
- **AND** 系统 SHALL NOT 返回 `builder_access_required`
- **AND** 系统 SHALL NOT 要求当前页面必须由 CMS handoff 打开
- **AND** 系统 SHALL 仅使用服务账号 token 访问 CMS `/api/*` 数据接口
- **AND** 系统 SHALL NOT 将 `CurrentSite`、`ZUSID` 或其它 CMS UI Cookie 转发给 CMS `/api/*` 数据接口

#### Scenario: 开发态 standalone 入口下绑定 workspace 继续使用 binding 范围
- **WHEN** 开发态 standalone 入口生效
- **AND** 浏览器请求已有 CMS project binding 的 workspace-scoped CMS browser API
- **THEN** 系统 SHOULD 优先使用该 binding 的 `siteId` 约束 CMS 数据范围
- **AND** 系统 SHALL NOT 因缺少 Builder Access Session 而拒绝请求

#### Scenario: CMS 模式无 access cookie 访问受保护项目 API 被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且开发态 standalone 入口未生效
- **AND** 浏览器请求受保护项目 API 时没有有效 `ai_page_builder_access` Cookie
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 SHALL 使用 `{ code, error }` JSON 结构
- **AND** `code` SHALL 为 `builder_access_required`

#### Scenario: CMS 模式 access session 不匹配 workspace 或 session 时被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且开发态 standalone 入口未生效
- **AND** 浏览器请求的 workspace 或 session 与 Builder Access Session 不匹配
- **THEN** 系统 SHALL 返回 `403`
- **AND** 响应 SHALL 使用 `{ code, error }` JSON 结构
- **AND** `code` SHALL 为 `builder_access_mismatch`

#### Scenario: 校验成功后挂载访问上下文
- **WHEN** CMS 模式下受保护项目 API 通过 Builder Access Session 校验
- **THEN** 系统 SHALL 将 `projectId`、`workspaceId`、`sessionId` 和用户摘要挂到请求上下文
- **AND** 下游 route SHALL 复用该上下文进行 edit lock 或业务规则校验

#### Scenario: 重启后持久化 access session 仍可通过校验
- **WHEN** 浏览器已通过 handoff 获得有效 Builder Access Cookie
- **AND** Builder Access Session 已写入 CMS runtime store
- **AND** `server` 进程重启后继续使用同一个配置目录
- **THEN** 浏览器请求同 workspace/session 的受保护项目 API SHALL 通过 access 校验
- **AND** 系统 SHALL NOT 因内存 store 为空返回 `builder_access_required`

#### Scenario: builder context 不使用开发态 standalone bypass
- **WHEN** `NODE_ENV=development`、`AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS` 为显式真值
- **AND** 浏览器请求 `GET /api/integrations/cms/builder-context?workspaceId=<workspaceId>&sessionId=<sessionId>`
- **THEN** 系统 SHALL 仍通过 CMS Builder Access middleware 校验 access cookie、workspaceId 和 sessionId
- **AND** 系统 SHALL NOT 因开发态 standalone 入口生效而在 builder context route 中跳过 `cmsBuilderAccess` 上下文挂载

### Requirement: CMS 集成模式内部全量和生命周期 API 必须 fail closed
系统 SHALL 在 CMS 集成模式下拒绝浏览器侧内部全量列表、本地创建和会破坏 CMS project binding 的生命周期 API；这些 API 不应因为浏览器持有 Builder Access Session 而返回全量资源或执行绑定破坏性操作。仅当开发态 standalone 入口配置生效时，系统 SHALL 为本地开发放行 standalone 首页和历史项目所需的全量列表、本地创建和 page-builder 历史项目删除操作。

#### Scenario: CMS 模式拒绝全量 workspace 和 page-builder 项目列表
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且开发态 standalone 入口未生效
- **AND** 浏览器请求 `GET /api/workspaces` 或 `GET /api/page-builder/projects`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 返回全量 workspace 列表或全量 page-builder 历史项目列表

#### Scenario: CMS 模式拒绝本地创建 workspace
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且开发态 standalone 入口未生效
- **AND** 浏览器请求 `POST /api/workspaces`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 创建绕过 CMS project binding 的 workspace

#### Scenario: CMS 模式拒绝删除 workspace 或 page-builder 项目
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且开发态 standalone 入口未生效
- **AND** 浏览器请求 `DELETE /api/workspaces/:workspaceId` 或 `DELETE /api/page-builder/projects/:workspaceId`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 系统 SHALL NOT 删除 CMS project binding 指向的 workspace、session 或项目文件

#### Scenario: 开发态 standalone 入口允许读取和创建本地项目
- **WHEN** `NODE_ENV=development`、`AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS` 为显式真值
- **AND** 浏览器请求 `GET /api/workspaces`、`GET /api/page-builder/projects` 或 `POST /api/workspaces`
- **THEN** 系统 SHALL 按 standalone 语义返回或创建本地 page-builder 所需资源
- **AND** 系统 SHALL NOT 要求 Builder Access Session

#### Scenario: 开发态 standalone 入口允许删除历史 page-builder 项目
- **WHEN** `NODE_ENV=development`、`AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS` 为显式真值
- **AND** 浏览器请求 `DELETE /api/page-builder/projects/:workspaceId`
- **THEN** 系统 SHALL 按 standalone 历史项目删除语义处理该请求
- **AND** 系统 SHALL 继续校验项目可用状态，避免删除正在编辑、导出或 agent 运行中的项目
- **AND** 系统 SHALL NOT 要求 Builder Access Session

#### Scenario: CMS 模式 workspace-scoped 读取 API 必须匹配 workspace
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且开发态 standalone 入口未生效
- **AND** 浏览器请求 workspace capabilities、directory-context、preview-state 或 file-search
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `workspaceId` 等于请求的 `workspaceId`
- **AND** 系统 SHALL NOT 因普通 `GET` 请求缺少 `Origin` header 而拒绝

#### Scenario: CMS 模式 workspace-scoped 写入和 PageBuilder 编辑 API 必须匹配 workspace
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且开发态 standalone 入口未生效
- **AND** 浏览器请求 workspace patch、cms-target-snapshot、cms-auto-handoff、inline-text、block-delete 或 image replacement 等 workspace-scoped 写入或 PageBuilder 编辑 API
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `workspaceId` 等于请求的 `workspaceId`
- **AND** 系统 SHALL 校验 `Origin` 或 `Referer` 属于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`
- **AND** 需要 page-builder edit lock 的现有编辑操作 SHALL 继续校验 edit lock
- **AND** 系统 SHALL NOT 因存在 Builder Access Session 而绕过 edit lock
