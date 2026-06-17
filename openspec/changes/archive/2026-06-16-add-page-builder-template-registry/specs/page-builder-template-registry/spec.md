## ADDED Requirements

### Requirement: 用户模板目录
系统 SHALL 将 PageBuilder 用户模板存放在本地配置目录的 `page-builder-templates/` 子目录中，并在需要读取模板时确保该目录存在。

#### Scenario: 用户模板目录为空
- **WHEN** 用户模板目录不存在或不存在合法模板
- **THEN** 系统返回空模板列表而不是错误

#### Scenario: 用户模板目录路径
- **WHEN** 系统解析用户模板根目录
- **THEN** 路径位于 `getConfigDir()/page-builder-templates/`

### Requirement: 模板 manifest 校验
系统 SHALL 只接受合法的用户模板 manifest，并跳过非法模板目录且不使整个模板列表请求失败。

#### Scenario: 合法用户模板被接受
- **WHEN** 用户模板目录包含普通子目录、合法 `template.json`、`sourceKind: saved-project`、`entry: workspace-files/index.html` 且入口文件存在
- **THEN** 系统将该模板纳入模板 registry

#### Scenario: 非法 manifest 被跳过
- **WHEN** 用户模板目录包含缺失 `template.json`、JSON 非法、版本不为 `1`、`id` 与目录名不一致、`entry` 不合法或入口文件缺失的模板目录
- **THEN** 系统跳过该模板目录并继续处理其他模板

#### Scenario: 不返回缩略图字段
- **WHEN** 合法模板 manifest 中包含 `thumbnail` 或 `thumbnailUrl` 字段
- **THEN** 系统的模板列表和详情响应不包含 `thumbnail` 或 `thumbnailUrl`

#### Scenario: 不扫描内置模板目录
- **WHEN** 系统扫描模板 registry
- **THEN** 系统只扫描用户模板目录，不扫描或返回内置模板

### Requirement: 模板列表与详情 API
系统 SHALL 提供 PageBuilder 用户模板列表和详情 API，并返回浏览器可访问的预览 URL。

#### Scenario: 获取模板列表
- **WHEN** 客户端请求 `GET /api/page-builder/templates`
- **THEN** 系统返回 `{ "templates": [...] }`，其中每个模板包含公开模板摘要和 `previewUrl`

#### Scenario: 获取模板详情
- **WHEN** 客户端请求 `GET /api/page-builder/templates/:templateId` 且模板存在并合法
- **THEN** 系统返回该模板的公开详情

#### Scenario: 模板不存在
- **WHEN** 客户端请求不存在或非法的 `templateId`
- **THEN** 系统返回 404 或等价错误响应

#### Scenario: 预览 URL 支持 public base path
- **WHEN** 配置了 `AI_PAGE_BUILDER_BASE_PATH`
- **THEN** 模板列表和详情返回的 `previewUrl` SHALL 包含该 public base path

### Requirement: 模板只读预览
系统 SHALL 提供模板只读预览 API，并只服务模板 `workspace-files/` 内的文件。

#### Scenario: 打开模板预览入口
- **WHEN** 客户端请求 `GET /api/page-builder/templates/:templateId/preview/`
- **THEN** 系统返回该模板的 `workspace-files/index.html`

#### Scenario: 打开模板资源
- **WHEN** 客户端请求 `GET /api/page-builder/templates/:templateId/preview/assets/site.css`
- **THEN** 系统返回该模板 `workspace-files/assets/site.css` 文件

#### Scenario: 预览不注入运行时
- **WHEN** 系统返回模板 HTML 预览
- **THEN** 响应内容不注入 PageBuilder preview bridge，也不注入 CMS rendering preview runtime

#### Scenario: 预览路径穿越被拒绝
- **WHEN** 客户端请求试图逃逸模板 `workspace-files/` 的预览路径
- **THEN** 系统返回 403 或等价错误响应

#### Scenario: 预览文件不存在
- **WHEN** 客户端请求模板 `workspace-files/` 内不存在的文件
- **THEN** 系统返回 404 或等价错误响应

#### Scenario: 预览响应不缓存
- **WHEN** 系统返回模板预览 HTML 或资源
- **THEN** 响应包含 `cache-control: no-store`

### Requirement: 删除用户模板
系统 SHALL 支持删除合法用户模板，并确保删除范围限制在用户模板根目录内。

#### Scenario: 删除合法用户模板
- **WHEN** 客户端请求 `DELETE /api/page-builder/templates/:templateId` 且模板存在并合法
- **THEN** 系统删除该模板目录并返回 204 或等价成功响应

#### Scenario: 删除不存在模板
- **WHEN** 客户端请求删除不存在或非法的 `templateId`
- **THEN** 系统返回 404 或等价错误响应

#### Scenario: 删除不影响 workspace
- **WHEN** 系统删除用户模板
- **THEN** 系统只删除模板目录，不删除任何 PageBuilder workspace 或历史项目数据

### Requirement: CMS 集成模式访问边界
系统 SHALL 在 CMS 集成生产模式下阻断全局模板库 API，并在开发 CMS 集成模式下允许现有 dev bypass 调试 standalone 模板库。

#### Scenario: CMS 集成生产模式阻断模板库 API
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且未启用开发 standalone bypass
- **THEN** `GET /api/page-builder/templates`、模板详情、模板预览和删除模板 API 均返回 CMS 集成模式不可用错误

#### Scenario: CMS 集成开发模式允许 dev bypass
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`、`NODE_ENV=development` 且 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS=true`
- **THEN** 全局模板库列表、详情、预览和删除模板 API 可按 standalone 模式工作
