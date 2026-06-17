## ADDED Requirements

### Requirement: 模板使用 API
系统 SHALL 提供全局 PageBuilder 用户模板使用 API：`POST /api/page-builder/templates/:templateId/use`，用于将合法用户模板实例化为新的 PageBuilder 项目。

#### Scenario: 使用合法模板创建项目
- **WHEN** 客户端请求 `POST /api/page-builder/templates/:templateId/use`，请求体包含非空 `projectName`，且模板存在并合法
- **THEN** 系统创建新的 `template === 'page-builder'` workspace、首个 Agent session，并返回 `workspace`、`session` 和 `previewState`

#### Scenario: 新项目名称来自请求体
- **WHEN** 系统使用合法模板创建新的 PageBuilder workspace
- **THEN** 新 workspace 的 `name` SHALL 等于请求体中 trim 后的 `projectName`

#### Scenario: use API 要求项目名称
- **WHEN** 客户端请求模板使用 API 且不提供 `projectName`，或 `projectName` 为空/仅包含空白字符
- **THEN** 系统 SHALL 返回 400 或等价请求错误
- **AND** 系统 SHALL NOT 创建 workspace 或 session

#### Scenario: 模板不存在
- **WHEN** 客户端请求不存在或非法的 `templateId`
- **THEN** 系统返回 404 或等价错误响应，且不创建 workspace 或 session

### Requirement: 模板文件实例化范围
系统 SHALL 只将模板 `workspace-files/` 内的普通文件和普通目录复制到新 workspace 的 `workspace-files/`，不得复制模板元数据目录或模板 manifest。

#### Scenario: 复制 workspace-files 内容
- **WHEN** 模板包含 `workspace-files/index.html` 和相对资源文件
- **THEN** 新 workspace 的 `workspace-files/` SHALL 包含这些文件并保持相对路径和内容一致

#### Scenario: 默认 workspace-files 被模板覆盖
- **WHEN** 系统创建新的 PageBuilder workspace 后复制模板文件
- **THEN** 新 workspace 的 `workspace-files/` SHALL 只包含模板实例化后的文件，不得混入默认 PageBuilder 骨架页面

#### Scenario: 不复制模板元数据
- **WHEN** 模板目录包含 `template.json`、`reports/` 或 `source/`
- **THEN** 新 workspace 目录中不得包含这些模板元数据文件或目录

#### Scenario: 拒绝 symlink 或特殊文件
- **WHEN** 模板 `workspace-files/` 中包含 symlink、设备文件或其他非普通文件
- **THEN** 系统 SHALL 拒绝实例化并返回错误，且不得留下新建 workspace、session 或半成品文件

### Requirement: CMS 集成模板实例化边界
系统 SHALL 将模板实例化结果作为普通静态 PageBuilder 项目处理，不得继承 CMS 动态绑定、CMS rendering manifest、CMS 鉴权信息或 Builder Access Session。

#### Scenario: 使用 CMS 集成来源另存的模板
- **WHEN** 模板 manifest 的 `sourceProject.sourceMode` 为 `cms-integrated`
- **THEN** 系统 SHALL 只复制该模板已固化的静态 HTML 和本地资源，新项目不得继承 CMS project binding 或 Builder Access Session

#### Scenario: 不复制 CMS rendering manifest
- **WHEN** 模板 `workspace-files/.proma/cms-rendering-manifest.json` 存在
- **THEN** 新 workspace 中不得包含该 manifest

#### Scenario: preview state 不标记 CMS rendering
- **WHEN** 新 workspace 只包含固化后的静态页面且不含 CMS rendering 标记
- **THEN** 返回的 `previewState.hasCmsRendering` SHALL 为 `false`，`previewState.requiresSameOrigin` SHALL 为 `false`

### Requirement: 首个 session 与预览状态
系统 SHALL 为通过模板创建的新 PageBuilder workspace 创建首个 Agent session，并返回当前 workspace 预览状态。

#### Scenario: 创建首个 session
- **WHEN** 模板实例化成功
- **THEN** 返回的 `session.workspaceId` SHALL 等于返回的 `workspace.id`

#### Scenario: 返回可用 preview state
- **WHEN** 模板实例化成功且新 workspace 包含 `workspace-files/index.html`
- **THEN** 返回的 `previewState.hasPreview` SHALL 为 `true`，且 `previewState.entryUrl` SHALL 指向新 workspace 的预览入口

#### Scenario: preview state 支持 public base path
- **WHEN** 配置了 `AI_PAGE_BUILDER_BASE_PATH`
- **THEN** 返回的 `previewState.entryUrl` SHALL 包含该 public base path

### Requirement: 实例化失败回滚
系统 MUST 在模板实例化失败时清理所有本次请求创建的 workspace、session、workspace 磁盘目录和半成品文件。

#### Scenario: 文件复制失败回滚
- **WHEN** 系统已创建 workspace 但复制模板文件失败
- **THEN** 系统 SHALL 删除该 workspace 索引记录、workspace 磁盘目录，并不得创建或保留 session

#### Scenario: session 创建失败回滚
- **WHEN** 系统已创建 workspace 并复制模板文件，但创建首个 session 失败
- **THEN** 系统 SHALL 删除该 workspace、相关 session 元数据、session 工作目录和 workspace 磁盘目录

#### Scenario: preview state 计算失败回滚
- **WHEN** 系统已创建 workspace 和 session，但计算或返回 preview state 失败
- **THEN** 系统 SHALL 删除该 workspace、相关 session 元数据、session 工作目录和 workspace 磁盘目录

### Requirement: CMS 集成模式访问边界
系统 SHALL 在 CMS 集成生产模式下阻断全局模板使用 API，并在开发 CMS 集成模式下允许现有 dev bypass 调试 standalone 模板库。

#### Scenario: CMS 集成生产模式阻断 use API
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且未启用开发 standalone bypass
- **THEN** `POST /api/page-builder/templates/:templateId/use` 返回 CMS 集成模式不可用错误，且不创建 workspace 或 session

#### Scenario: CMS 集成开发模式允许 dev bypass
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`、`NODE_ENV=development` 且 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS=true`
- **THEN** `POST /api/page-builder/templates/:templateId/use` 可按 standalone 模式使用合法用户模板创建 PageBuilder 项目
