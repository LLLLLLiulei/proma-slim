## MODIFIED Requirements

### Requirement: CMS 集成模式旧全局 CMS browser API 必须 fail closed
系统 SHALL 在 CMS 集成模式下拒绝无 workspace 上下文的旧全局 CMS browser API；CMS 集成模式下的 CMS 数据和资产访问必须使用 workspace-scoped CMS 路由完成。

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

## ADDED Requirements

### Requirement: CMS 集成模式 workspace-scoped CMS browser API 必须受 Builder Access Session 保护
系统 SHALL 提供 workspace-scoped CMS 数据读取和资产代理 API，并在 CMS 集成模式下通过统一 CMS Builder Access middleware 校验 access cookie、workspace 匹配和滑动续期。

#### Scenario: CMS 模式无 access cookie 请求 workspace-scoped CMS 数据被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `GET /api/workspaces/:workspaceId/page-builder/cms/sites`、`/catalogs`、`/catalogs/:catalogId`、`/contents` 或 `/assets?url=...` 时没有有效 `ai_page_builder_access` Cookie
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 SHALL 表示 `code: "builder_access_required"`
- **AND** 系统 SHALL NOT 访问 CMS 上游数据或代理 CMS 资产

#### Scenario: CMS 模式 access session 不匹配 workspace 时拒绝 workspace-scoped CMS API
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器携带的 Builder Access Session `workspaceId` 与 URL 中的 `workspaceId` 不同
- **THEN** 系统 SHALL 返回 `403`
- **AND** 响应 SHALL 表示 `code: "builder_access_mismatch"`
- **AND** 系统 SHALL NOT 访问 CMS 上游数据或代理 CMS 资产

#### Scenario: CMS 模式 workspace-scoped CMS 数据使用 project binding siteId
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器携带匹配 workspace 的有效 Builder Access Session 请求 workspace-scoped CMS `catalogs`、`catalogs/:catalogId` 或 `contents`
- **THEN** 系统 SHALL 根据 access session 的 `projectId` 读取 project binding
- **AND** 系统 SHALL 使用 project binding 的 `siteId` 作为缺省站点
- **AND** 系统 SHALL NOT 使用全局默认 `siteId = 1` 越过 project binding

#### Scenario: CMS 模式 query siteId 不能越过 project binding
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 workspace-scoped CMS 数据请求 query 中的 `siteId` 不等于当前 project binding 的 `siteId`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 响应 SHALL 表示 `code: "builder_access_mismatch"`
- **AND** 系统 SHALL NOT 用该 query `siteId` 请求 CMS 上游数据

#### Scenario: CMS 模式 sites 只返回绑定站点
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器携带匹配 workspace 的有效 Builder Access Session 请求 `GET /api/workspaces/:workspaceId/page-builder/cms/sites`
- **THEN** 系统 SHALL 只返回当前 project binding `siteId` 对应的 CMS 站点摘要
- **AND** 系统 SHALL NOT 向浏览器返回其他 CMS 站点

#### Scenario: CMS 模式绑定站点未出现在上游 sites 响应时返回空列表
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 workspace-scoped CMS `sites`
- **AND** CMS 上游 `sites` 响应中不存在当前 project binding `siteId` 对应站点
- **THEN** 系统 SHALL 返回空站点列表
- **AND** 系统 SHALL NOT 伪造站点摘要
- **AND** 系统 SHALL NOT 返回其他站点作为兜底

#### Scenario: CMS 模式 workspace-scoped CMS API 成功响应不缓存
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 workspace-scoped CMS 数据或资产请求通过校验并成功返回
- **THEN** 系统 SHALL 设置 no-store 语义的缓存响应头
- **AND** 系统 SHALL 按统一受保护 API 规则滑动续期 Builder Access Session

#### Scenario: standalone 模式 workspace-scoped CMS API 可服务 workspace preview
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且浏览器请求 workspace-scoped CMS `catalogs`、`catalogs/:catalogId`、`contents` 或 `assets`
- **THEN** 系统 SHALL 按现有 standalone CMS browser 读取和资产代理语义返回响应
- **AND** 系统 SHALL NOT 要求 `ai_page_builder_access` Cookie
- **AND** 系统 SHALL 保持旧全局 `/api/page-builder/cms/*` standalone 兼容行为不变

