## ADDED Requirements

### Requirement: 模板 zip 导入 API
系统 SHALL 提供 PageBuilder 模板 zip 导入 API：`POST /api/page-builder/templates/import`，用于将用户上传的静态 zip 导入为本地 PageBuilder 用户模板。

#### Scenario: 导入合法静态 zip
- **WHEN** 客户端以 `multipart/form-data` 请求 `POST /api/page-builder/templates/import`，并上传一个可识别 `index.html` 入口的合法 zip 文件
- **THEN** 系统 SHALL 创建一个新的本地用户模板
- **AND** 响应 SHALL 返回导入后的 `PageBuilderTemplateSummary`
- **AND** 后续模板列表 SHALL 能扫描到该模板

#### Scenario: 请求缺少 zip 文件
- **WHEN** 客户端请求模板导入 API 但未提供 `file` 字段，或 `file` 不是文件
- **THEN** 系统 SHALL 返回 400 或等价请求错误
- **AND** 系统 SHALL NOT 创建模板目录

#### Scenario: 非 zip 文件被拒绝
- **WHEN** 客户端上传的文件无法作为 zip 解析
- **THEN** 系统 SHALL 返回明确错误
- **AND** 系统 SHALL 清理本次请求产生的临时文件和临时目录

#### Scenario: 导入 API 支持 public base path
- **WHEN** 配置了 `AI_PAGE_BUILDER_BASE_PATH` 且模板导入成功
- **THEN** 响应中模板的 `previewUrl` SHALL 包含该 public base path

### Requirement: 任意静态 zip 入口识别
系统 SHALL 支持从任意包含 `index.html` 的静态 zip 中识别站点根目录，并将该站点根目录内容导入到模板 `workspace-files/`。

#### Scenario: 根目录 index 作为入口
- **WHEN** 上传 zip 根目录包含 `index.html`
- **THEN** 系统 SHALL 使用 zip 根目录作为站点根目录
- **AND** 系统 SHALL 将根目录下的普通文件和目录导入到模板 `workspace-files/`

#### Scenario: PageBuilder 模板包结构作为入口
- **WHEN** 上传 zip 包含 `workspace-files/index.html`
- **THEN** 系统 SHALL 兼容该结构并使用 `workspace-files/` 作为站点根目录

#### Scenario: 单一顶层目录作为入口
- **WHEN** 上传 zip 只有一个顶层目录，且该顶层目录下包含 `index.html`
- **THEN** 系统 SHALL 使用该顶层目录作为站点根目录

#### Scenario: 唯一 index 所在目录作为入口
- **WHEN** 上传 zip 中不存在根目录 `index.html` 或单一顶层目录入口，但全包只有一个 `index.html`
- **THEN** 系统 SHALL 使用该 `index.html` 所在目录作为站点根目录

#### Scenario: 无 index 被拒绝
- **WHEN** 上传 zip 中没有可识别的 `index.html`
- **THEN** 系统 SHALL 返回明确错误
- **AND** 系统 SHALL NOT 创建模板目录

#### Scenario: 多个 index 无法判断时被拒绝
- **WHEN** 上传 zip 中存在多个 `index.html` 且无法按入口识别规则确定唯一站点根目录
- **THEN** 系统 SHALL 返回明确错误，提示无法自动判断模板入口
- **AND** 系统 SHALL NOT 创建模板目录

### Requirement: 导入模板落盘结构
系统 SHALL 将导入 zip 转换为现有 PageBuilder 用户模板目录结构，并始终生成新的本地模板 ID。

#### Scenario: 生成新的模板 ID
- **WHEN** 系统导入任意 zip 为模板
- **THEN** 系统 SHALL 生成新的合法本地 `templateId`
- **AND** 系统 SHALL NOT 复用 zip 内 `template.json.id`

#### Scenario: 导入后写入标准模板结构
- **WHEN** zip 导入成功
- **THEN** 模板目录 SHALL 包含 `template.json` 和 `workspace-files/index.html`
- **AND** 模板内容 SHALL 位于 `getConfigDir()/page-builder-templates/<templateId>/`

#### Scenario: 模板名称来自 zip manifest
- **WHEN** 上传 zip 内存在合法 `template.json` 且其中 `name` 为非空字符串
- **THEN** 导入模板名称 SHALL 优先使用该 `name`

#### Scenario: 模板名称来自上传文件名
- **WHEN** 上传 zip 内不存在合法模板名称
- **THEN** 导入模板名称 SHALL 使用上传文件名去掉 `.zip` 后的名称

#### Scenario: 不生成缩略图
- **WHEN** zip 导入成功
- **THEN** 系统 SHALL NOT 生成、保存或返回模板缩略图字段

#### Scenario: 写入导入报告
- **WHEN** zip 导入成功
- **THEN** 系统 SHALL 在模板 `reports/` 下写入导入报告，记录入口识别结果和来源文件名

### Requirement: 模板 zip 导入大小限制
系统 SHALL 对模板 zip 导入应用原始 zip 大小和解压后总大小限制，默认分别为 100MB 和 500MB，并允许通过环境变量配置。

#### Scenario: zip 原始大小超限
- **WHEN** 上传 zip 原始文件大小超过 `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_ZIP_MB` 配置值或默认 100MB
- **THEN** 系统 SHALL 拒绝导入并返回大小超限错误
- **AND** 系统 SHALL NOT 创建模板目录

#### Scenario: 解压后总大小超限
- **WHEN** zip 入口累计解压后总大小超过 `AI_PAGE_BUILDER_TEMPLATE_IMPORT_MAX_UNCOMPRESSED_MB` 配置值或默认 500MB
- **THEN** 系统 SHALL 停止导入并返回大小超限错误
- **AND** 系统 SHALL 清理本次请求产生的临时文件和临时目录

#### Scenario: 非法大小配置回退默认值
- **WHEN** 大小限制环境变量缺失、非数字或小于等于 0
- **THEN** 系统 SHALL 使用默认大小限制

#### Scenario: 文件数量不限制
- **WHEN** 上传 zip 内包含大量普通文件但未超过原始 zip 大小和解压后总大小限制
- **THEN** 系统 SHALL NOT 因文件数量本身拒绝导入

### Requirement: 模板 zip 导入安全与原子性
系统 SHALL 拒绝不安全 zip 路径和特殊文件，并确保导入成功前不暴露半成品模板。

#### Scenario: 路径穿越被拒绝
- **WHEN** 上传 zip 包含绝对路径、`..` 路径段或试图逃逸站点根目录的 entry
- **THEN** 系统 SHALL 拒绝导入并返回安全错误
- **AND** 系统 SHALL NOT 写入正式模板目录

#### Scenario: 无关系统文件被忽略
- **WHEN** 上传 zip 包含 `__MACOSX/`、`.DS_Store` 或等价无关系统文件
- **THEN** 系统 SHALL 忽略这些文件
- **AND** 被忽略文件 SHALL NOT 导致合法模板导入失败

#### Scenario: 特殊文件被拒绝
- **WHEN** 上传 zip 包含无法作为普通文件或普通目录安全落盘的 entry
- **THEN** 系统 SHALL 拒绝导入并返回安全错误

#### Scenario: 临时目录原子落盘
- **WHEN** 系统处理模板 zip 导入
- **THEN** 系统 SHALL 先写入临时目录
- **AND** 只有在入口识别、大小校验、路径校验和模板 manifest 写入全部成功后，才将临时目录移动到正式模板目录

#### Scenario: 导入失败清理临时产物
- **WHEN** zip 导入过程中发生解析、校验、解压或写入失败
- **THEN** 系统 SHALL 清理本次请求产生的临时 zip 文件和临时模板目录

#### Scenario: 保留脚本和外链资源
- **WHEN** 上传 zip 中的模板页面包含本地脚本、内联脚本、远程脚本、远程图片、远程样式或远程字体
- **THEN** 系统 SHALL 保留这些引用
- **AND** 系统 SHALL NOT 在导入阶段自动下载、离线化或移除这些远程资源

## MODIFIED Requirements

### Requirement: 模板只读预览
系统 SHALL 提供模板只读预览 API，并只服务模板 `workspace-files/` 内的文件；当返回 HTML 预览时，系统 SHALL 使用 sandbox CSP 隔离导入模板脚本，使脚本可运行并允许同源资源正常加载。

#### Scenario: 打开模板预览入口
- **WHEN** 客户端请求 `GET /api/page-builder/templates/:templateId/preview/`
- **THEN** 系统返回该模板的 `workspace-files/index.html`

#### Scenario: 打开模板资源
- **WHEN** 客户端请求 `GET /api/page-builder/templates/:templateId/preview/assets/site.css`
- **THEN** 系统返回该模板 `workspace-files/assets/site.css` 文件

#### Scenario: 预览不注入运行时
- **WHEN** 系统返回模板 HTML 预览
- **THEN** 响应内容不注入 PageBuilder preview bridge，也不注入 CMS rendering preview runtime

#### Scenario: 预览 HTML 使用 sandbox CSP
- **WHEN** 系统返回模板 HTML 预览
- **THEN** 响应 SHALL 包含 CSP sandbox 策略，允许脚本运行并授予 `allow-same-origin`
- **AND** 响应 SHALL 限制 frame ancestor 为当前服务自身或等价安全范围

#### Scenario: 预览路径穿越被拒绝
- **WHEN** 客户端请求试图逃逸模板 `workspace-files/` 的预览路径
- **THEN** 系统返回 403 或等价错误响应

#### Scenario: 预览文件不存在
- **WHEN** 客户端请求模板 `workspace-files/` 内不存在的文件
- **THEN** 系统返回 404 或等价错误响应

#### Scenario: 预览响应不缓存
- **WHEN** 系统返回模板预览 HTML 或资源
- **THEN** 响应包含 `cache-control: no-store`

### Requirement: CMS 集成模式模板库访问边界
系统 SHALL 在 CMS 集成生产模式下开放全局模板库读取、详情、预览、下载、重命名、删除、使用和模板 zip 导入 API；模板作为静态 HTML 资源包 SHALL 不因 CMS 集成模式而区分可用性。

#### Scenario: CMS 集成生产模式开放模板库 API
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且未启用开发 standalone bypass
- **THEN** `GET /api/page-builder/templates`、模板详情、模板预览、模板下载、重命名、删除模板和使用模板 API 均可按模板库语义工作

#### Scenario: CMS 集成生产模式允许导入模板 zip
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且未启用开发 standalone bypass
- **AND** 客户端请求 `POST /api/page-builder/templates/import` 并上传合法 zip
- **THEN** 系统 SHALL 按模板 zip 导入规则创建用户模板

#### Scenario: CMS 集成生产模式不要求 dev standalone bypass
- **WHEN** 系统运行在 CMS 集成生产模式且未启用 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS`
- **THEN** 全局模板库 API SHALL NOT 因缺少 dev bypass 被拒绝
