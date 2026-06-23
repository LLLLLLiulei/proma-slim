## RENAMED Requirements

- FROM: `### Requirement: CMS 创建项目 API 必须创建空的 PageBuilder 项目`
- TO: `### Requirement: CMS 创建项目 API 必须支持空项目和模板项目`

## ADDED Requirements

### Requirement: CMS 模板库接口必须校验集成鉴权和当前 CMS 登录态
系统 SHALL 为 CMS server-to-server 模板库接口提供受控集成入口，并 SHALL 在返回模板数据、导入模板、重命名模板、删除模板或基于模板创建项目之前校验 `Authorization: Bearer <AI_PAGE_BUILDER_INTEGRATION_SECRET>` 和当前请求的 `X-CMS-Cookie` 登录态。系统 MUST NOT 将 integration secret、原始 CMS Cookie、上游完整 Cookie 或 Builder Access Session 写入模板 manifest、project binding、响应体或日志结构化字段。

#### Scenario: 缺少 integration secret 时拒绝模板列表
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 CMS 请求 `GET /api/integrations/cms/templates` 时缺少有效 `Authorization` header
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 JSON SHALL 包含 `code: "integration_unauthorized"`
- **AND** 系统 SHALL NOT 返回模板列表

#### Scenario: 缺少 CMS Cookie 时拒绝模板列表
- **WHEN** CMS 请求 `GET /api/integrations/cms/templates` 时缺少 `X-CMS-Cookie` 或该 header 为空白字符串
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 调用模板 registry

#### Scenario: CMS 登录态失效时拒绝模板导入
- **WHEN** CMS 请求 `POST /api/integrations/cms/templates/import` 且 CMS `/ui/login` 判定当前 `X-CMS-Cookie` 未登录或返回 HTTP 401/403
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 JSON SHALL 包含 `code: "cms_login_expired"`
- **AND** 系统 SHALL NOT 创建模板目录

#### Scenario: standalone 模式拒绝 CMS 模板接口
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且请求 `/api/integrations/cms/templates`、`/api/integrations/cms/templates/import`、`/api/integrations/cms/templates/:templateId` 或 `/api/integrations/cms/templates/batch-delete`
- **THEN** 系统 SHALL 返回结构化 CMS integration 鉴权错误
- **AND** 系统 SHALL NOT 返回或修改模板库数据

### Requirement: CMS 模板列表接口必须返回绝对预览 URL
系统 SHALL 提供 `GET /api/integrations/cms/templates`，由 CMS 服务端获取 PageBuilder 模板列表。响应 SHALL 复用现有模板摘要字段，并 SHALL 将每个模板的 `previewUrl` 转换为基于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 和 `AI_PAGE_BUILDER_BASE_PATH` 的浏览器可访问绝对 URL。模板预览 iframe 只承诺在 CMS 与 PageBuilder 同源部署时可用；跨源部署下 CMS SHALL 使用新窗口打开，或等待后续独立 CSP 配置能力。

#### Scenario: 成功获取 CMS 模板列表
- **WHEN** CMS 使用有效 integration secret 和有效 `X-CMS-Cookie` 请求 `GET /api/integrations/cms/templates`
- **THEN** 系统 SHALL 返回 `200` 和 `{ "templates": [...] }`
- **AND** 每个模板摘要 SHALL 包含 `id`、`name`、`sourceKind`、`createdAt`、`previewUrl` 和 `deletable`
- **AND** `previewUrl` SHALL 是绝对 URL

#### Scenario: 按模板名称搜索 CMS 模板列表
- **WHEN** CMS 使用有效 integration secret、有效 `X-CMS-Cookie` 和 `name` 查询参数请求 `GET /api/integrations/cms/templates?name=<keyword>`
- **THEN** 系统 SHALL 返回 `200` 和 `{ "templates": [...] }`
- **AND** `templates` SHALL 只包含模板名称包含 `<keyword>` 的模板
- **AND** 名称匹配 SHALL 去除查询参数首尾空白并大小写不敏感
- **AND** 空白 `name` SHALL 等价于不筛选
- **AND** 无匹配项时系统 SHALL 返回空 `templates` 数组

#### Scenario: 绝对预览 URL 包含 base path
- **WHEN** `AI_PAGE_BUILDER_PUBLIC_ORIGIN=https://cms.example.com` 且 `AI_PAGE_BUILDER_BASE_PATH=/pagebuilder`
- **AND** CMS 请求模板列表成功
- **THEN** 模板 `previewUrl` SHALL 形如 `https://cms.example.com/pagebuilder/api/page-builder/templates/<templateId>/preview/`

#### Scenario: 空 base path 返回 origin 下预览 URL
- **WHEN** `AI_PAGE_BUILDER_PUBLIC_ORIGIN=https://cms.example.com` 且 `AI_PAGE_BUILDER_BASE_PATH` 为空或 `/`
- **AND** CMS 请求模板列表成功
- **THEN** 模板 `previewUrl` SHALL 形如 `https://cms.example.com/api/page-builder/templates/<templateId>/preview/`

#### Scenario: public origin 缺失时拒绝模板列表
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 但 `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 缺失或不是合法 origin
- **AND** CMS 请求 `GET /api/integrations/cms/templates`
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 从 `Host`、`X-Forwarded-Host` 或其他请求头推断 public origin

#### Scenario: 模板预览不创建 handoff
- **WHEN** CMS 使用模板列表响应中的 `previewUrl` 在同源 iframe 或新窗口中预览模板
- **THEN** 浏览器 SHALL 直接访问现有模板只读预览 URL
- **AND** 系统 SHALL NOT 为模板预览创建 CMS handoff 或 Builder Access Session

#### Scenario: 跨源 iframe 预览不在本变更范围内
- **WHEN** CMS 与 PageBuilder 不是同源部署且 CMS 试图在 iframe 中打开模板 `previewUrl`
- **THEN** 本变更 SHALL NOT 要求放开模板预览响应的 `frame-ancestors` CSP
- **AND** CMS SHALL 使用新窗口打开模板预览，或等待后续独立 CSP 配置能力

### Requirement: CMS 模板导入接口必须复用模板 zip 导入能力
系统 SHALL 提供 `POST /api/integrations/cms/templates/import`，由 CMS 服务端上传静态 zip 并导入为 PageBuilder 用户模板。该接口 SHALL 复用现有模板 zip 导入规则，包括入口识别、模板 ID 生成、大小限制、路径安全校验、原子落盘、导入报告和失败清理语义。

#### Scenario: CMS 成功导入模板 zip
- **WHEN** CMS 使用有效 integration secret、有效 `X-CMS-Cookie` 和合法 multipart `file` 请求 `POST /api/integrations/cms/templates/import`
- **THEN** 系统 SHALL 创建新的用户模板
- **AND** 响应 SHALL 返回导入后的模板摘要
- **AND** 响应中的 `previewUrl` SHALL 是基于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 的绝对 URL

#### Scenario: CMS 导入请求缺少 file
- **WHEN** CMS 请求 `POST /api/integrations/cms/templates/import` 但请求体不是合法 multipart/form-data，或缺少 `file` 字段
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 创建模板目录

#### Scenario: public origin 缺失时拒绝模板导入
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 但 `AI_PAGE_BUILDER_PUBLIC_ORIGIN` 缺失或不是合法 origin
- **AND** CMS 请求 `POST /api/integrations/cms/templates/import`
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 读取、解压或写入上传 zip
- **AND** 系统 SHALL NOT 创建模板目录

#### Scenario: CMS 导入 zip 超限
- **WHEN** CMS 上传的 zip 原始大小超过 `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB` 或解压后累计大小超过 `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB`
- **THEN** 系统 SHALL 拒绝导入并返回 `413`
- **AND** 响应 JSON SHALL 包含 `code: "template_size_limit"`
- **AND** 系统 SHALL 清理本次请求产生的临时 zip 文件和临时模板目录

#### Scenario: CMS 导入非法 zip
- **WHEN** CMS 上传的 zip 无法解析、没有可识别 `index.html`、包含路径穿越、包含重复文件路径或包含不支持的特殊文件
- **THEN** 系统 SHALL 拒绝导入并返回结构化错误
- **AND** zip 无法解析、缺少入口或包含重复路径时，响应 JSON SHALL 包含 `code: "template_import_invalid"`
- **AND** zip 包含路径穿越或不支持特殊文件时，响应 JSON SHALL 包含 `code: "template_import_forbidden"`
- **AND** 系统 SHALL NOT 暴露半成品模板

### Requirement: CMS 模板管理接口必须支持重命名和批量删除
系统 SHALL 提供 CMS server-to-server 模板重命名和批量删除接口。重命名接口 SHALL 只修改模板展示名称并返回带绝对 `previewUrl` 的模板摘要；批量删除接口 SHALL 删除模板库中的模板文件，并 SHALL 使用部分成功响应表达 item 级删除结果。模板重命名或删除 SHALL NOT 影响已经基于该模板创建的 PageBuilder 项目。

#### Scenario: CMS 成功重命名模板
- **WHEN** CMS 使用有效 integration secret、有效 `X-CMS-Cookie` 和非空 `name` 请求 `PATCH /api/integrations/cms/templates/:templateId`
- **THEN** 系统 SHALL 更新该模板 manifest 中的名称
- **AND** 系统 SHALL 返回 `200` 和 `{ "template": ... }`
- **AND** 响应模板摘要 SHALL 包含绝对 `previewUrl`
- **AND** 系统 SHALL NOT 修改任何 CMS project binding 或已经创建的 workspace

#### Scenario: CMS 重命名模板名称为空时拒绝
- **WHEN** CMS 请求 `PATCH /api/integrations/cms/templates/:templateId` 且 `name` 缺失、不是字符串或去除首尾空白后为空
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 修改模板 manifest

#### Scenario: CMS 重命名不存在模板时返回模板不存在
- **WHEN** CMS 请求 `PATCH /api/integrations/cms/templates/:templateId` 且模板不存在或 `templateId` 不合法
- **THEN** 系统 SHALL 返回 `404`
- **AND** 响应 JSON SHALL 包含 `code: "template_not_found"`

#### Scenario: CMS 批量删除模板部分成功
- **WHEN** CMS 使用有效 integration secret、有效 `X-CMS-Cookie` 请求 `POST /api/integrations/cms/templates/batch-delete`
- **AND** 请求体包含存在模板、不存在模板和重复模板 ID
- **THEN** 系统 SHALL 按首次出现顺序去重后依次删除模板
- **AND** 系统 SHALL 返回 `200`
- **AND** 响应 JSON SHALL 包含删除成功的 `deletedTemplateIds`
- **AND** 响应 JSON SHALL 在 `failures` 中包含失败模板的 `templateId`、稳定 `code` 和 `error`
- **AND** 单个模板删除失败 SHALL NOT 阻断后续模板删除

#### Scenario: CMS 批量删除请求体非法时整体拒绝
- **WHEN** CMS 请求 `POST /api/integrations/cms/templates/batch-delete` 且 `templateIds` 缺失、不是数组、为空数组或包含非空字符串以外的值
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 删除任何模板

### Requirement: CMS 模板相关错误必须结构化
系统 SHALL 对 `/api/integrations/cms/templates*` 和带 `templateId` 的 `/api/integrations/cms/projects` 请求返回稳定结构化 JSON 错误。模板不存在、模板导入失败、模板大小超限、模板操作失败和模板冲突 MUST 使用固定可判定错误码，而不是回退为非结构化 `HttpError` 响应。模板相关错误码 SHALL 至少包含：`template_not_found`、`template_import_invalid`、`template_size_limit`、`template_import_forbidden`、`template_import_failed`、`template_operation_forbidden` 和 `template_operation_failed`。

#### Scenario: 模板不存在返回模板错误码
- **WHEN** CMS 使用不存在或非法的 `templateId` 创建项目
- **THEN** 系统 SHALL 返回 `404`
- **AND** 响应 JSON SHALL 包含 `code: "template_not_found"`
- **AND** 系统 SHALL NOT 创建 workspace、session 或 project binding

#### Scenario: 模板导入失败返回结构化错误
- **WHEN** CMS 模板导入请求因 zip 解析、入口识别、路径安全或大小限制失败
- **THEN** 响应 JSON SHALL 包含 `code` 和 `error`
- **AND** `code` SHALL 是 `template_import_invalid`、`template_size_limit`、`template_import_forbidden` 或 `template_import_failed` 之一
- **AND** 响应体 SHALL NOT 包含原始 CMS Cookie、integration secret、Authorization header、临时文件路径或内部堆栈

## MODIFIED Requirements

### Requirement: CMS 项目绑定必须持久化长期项目身份
系统 SHALL 将 CMS 外部记录与内部 page-builder workspace/session 的绑定持久化到 `${PROMA_CONFIG_DIR}/integrations/cms/projects.json`，并 SHALL 使用长期稳定的 `projectId` 作为 CMS 对外契约。系统 SHALL 在项目由模板创建时持久化可选 `sourceTemplateId`，用于后续幂等重试和冲突判定；旧 binding 中缺失 `sourceTemplateId` SHALL 被视为历史空项目或未声明模板来源的项目。

#### Scenario: 首次创建项目写入 project binding
- **WHEN** CMS 首次成功创建 AI 专题项目
- **THEN** 系统 SHALL 写入包含 `projectId`、`workspaceId`、`primarySessionId`、`projectName`、`siteId`、`externalRecordId`、必要用户摘要、`createdAt`、`updatedAt` 和 `lastValidatedAt` 的 binding 记录
- **AND** 如果本次创建请求使用了合法 `templateId`，系统 SHALL 在 binding 中写入 `sourceTemplateId`
- **AND** 系统 SHALL NOT 在 binding 中保存原始 CMS Cookie、integration secret、handoff/access token、模板 zip 原始文件或 Builder Access Session

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

#### Scenario: externalRecordId 与 sourceTemplateId 冲突时拒绝复用
- **WHEN** 某个 `externalRecordId` 已绑定项目，且已有 binding 的 `sourceTemplateId` 与本次请求声明的 `templateId` 不一致
- **THEN** 系统 SHALL 返回 `409`
- **AND** 响应 JSON SHALL 包含 `code: "project_conflict"`
- **AND** 系统 SHALL NOT 创建新的 workspace、session 或 project binding

#### Scenario: 已有空项目收到模板创建请求时拒绝复用
- **WHEN** 某个 `externalRecordId` 已绑定项目且已有 binding 缺少 `sourceTemplateId`
- **AND** 本次创建请求携带非空 `templateId`
- **THEN** 系统 SHALL 返回 `409`
- **AND** 响应 JSON SHALL 包含 `code: "project_conflict"`

#### Scenario: 已有 binding 指向的内部资源缺失时拒绝复用
- **WHEN** 某个 `externalRecordId` 已绑定项目，但对应 workspace 或 primary session 已不存在
- **THEN** 系统 SHALL 返回 `409`
- **AND** 响应 JSON SHALL 包含 `code: "project_conflict"`

### Requirement: CMS 创建项目 API 必须支持空项目和模板项目
系统 SHALL 提供 `POST /api/integrations/cms/projects`，由 CMS 服务端创建 AI 专题项目。请求体不包含 `templateId` 时，系统 SHALL 按现有语义初始化空的 page-builder workspace 和 primary session；请求体包含合法 `templateId` 时，系统 SHALL 基于该模板创建 page-builder workspace 和 primary session，并将创建结果写入 CMS project binding，最终仍只向 CMS 返回长期稳定 `projectId`。

#### Scenario: 首次创建空 CMS 项目成功
- **WHEN** CMS 使用有效 integration secret、有效 `X-CMS-Cookie` 和合法 `externalRecordId`、`projectName`、`siteId` 请求创建项目，且请求体不包含 `templateId`
- **THEN** 系统 SHALL 创建一个 `template: "page-builder"` 的空 workspace
- **AND** 系统 SHALL 创建该 workspace 下的 primary session
- **AND** 系统 SHALL 返回 `201` 和 `{ "projectId": <稳定项目 ID>, "created": true }`

#### Scenario: 首次根据模板创建 CMS 项目成功
- **WHEN** CMS 使用有效 integration secret、有效 `X-CMS-Cookie`、合法 `externalRecordId`、`projectName`、`siteId` 和存在的合法 `templateId` 请求创建项目
- **THEN** 系统 SHALL 创建一个 `template: "page-builder"` 的 workspace
- **AND** 系统 SHALL 将该模板 `workspace-files/` 中的普通文件和目录复制到新 workspace 的 `workspace-files/`
- **AND** 系统 SHALL 创建该 workspace 下的 primary session
- **AND** 系统 SHALL 写入包含 `sourceTemplateId` 的 CMS project binding
- **AND** 系统 SHALL 返回 `201`、`created: true`、稳定 `projectId` 和本次使用的 `templateId`
- **AND** 响应 SHALL NOT 暴露内部 `workspaceId`、`sessionId`、原始 CMS Cookie 或 integration secret

#### Scenario: 模板创建项目可继续使用 CMS handoff 和同步导出
- **WHEN** CMS 首次根据模板创建项目成功并获得稳定 `projectId`
- **THEN** CMS SHALL 能继续使用该 `projectId` 创建 builder handoff
- **AND** 如果模板项目已有 `workspace-files/index.html`，CMS SHALL 能继续使用该 `projectId` 创建 preview handoff
- **AND** CMS SHALL 能继续使用该 `projectId` 调用同步导出接口获取当前项目静态 ZIP 包

#### Scenario: 同一 externalRecordId 幂等重试
- **WHEN** CMS 使用同一 `externalRecordId`、同一 `siteId` 和与已有 binding 一致的 `templateId` 重试创建项目
- **THEN** 系统 SHALL 返回已有 `projectId`
- **AND** 系统 SHALL 返回 `200` 和 `created: false`
- **AND** 系统 SHALL NOT 再创建新的 workspace 或 primary session

#### Scenario: 旧客户端不传 templateId 可复用已有模板项目
- **WHEN** 某个 `externalRecordId` 已绑定到一个带 `sourceTemplateId` 的项目
- **AND** CMS 使用同一 `externalRecordId` 和同一 `siteId` 重试创建项目但未传 `templateId`
- **THEN** 系统 SHALL 返回已有 `projectId`
- **AND** 系统 SHALL 返回 `200` 和 `created: false`
- **AND** 系统 SHALL NOT 将“不传模板”视为与已有模板项目冲突

#### Scenario: 幂等重试仍需校验当前 CMS 登录态
- **WHEN** CMS 使用同一 `externalRecordId` 重试创建项目，但 integration secret 或 `X-CMS-Cookie` 无效
- **THEN** 系统 SHALL 在返回已有 `projectId` 前拒绝该请求
- **AND** 响应 SHALL NOT 暴露已有 `projectId`

#### Scenario: 创建项目请求参数不合法
- **WHEN** 创建项目请求缺少 `externalRecordId`、`projectName` 或 `siteId`，或这些字段不是非空字符串，或可选 `templateId` 不是非空字符串
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`

#### Scenario: 创建项目请求包含 prompt 时被拒绝
- **WHEN** 创建项目请求体包含 `prompt` 字段
- **THEN** 系统 SHALL 返回 `400`
- **AND** 响应 JSON SHALL 包含 `code: "invalid_request"`
- **AND** 系统 SHALL NOT 创建 workspace、session 或 project binding

#### Scenario: 创建项目使用不存在模板时被拒绝
- **WHEN** CMS 创建项目请求携带不存在或非法的 `templateId`
- **THEN** 系统 SHALL 返回 `404`
- **AND** 响应 JSON SHALL 包含稳定模板不存在错误码
- **AND** 系统 SHALL NOT 创建 workspace、session 或 project binding

#### Scenario: 创建模板项目不写入初始消息也不启动 Agent
- **WHEN** CMS 创建空项目或模板项目成功
- **THEN** 新建 primary session 的消息列表 SHALL 为空
- **AND** 系统 SHALL NOT 发送 Agent 消息
- **AND** 系统 SHALL NOT 启动 Agent 运行

#### Scenario: binding 写入失败时不返回可用 projectId
- **WHEN** workspace/session 已创建但 project binding 写入失败
- **THEN** 系统 SHALL 返回失败响应
- **AND** 响应 SHALL NOT 包含可用 `projectId`
- **AND** 系统 SHALL 尝试清理刚创建的 workspace/session 和模板复制产生的 workspace 文件
