## MODIFIED Requirements

### Requirement: CMS 集成模式 workspace-scoped CMS browser API 必须受 Builder Access Session 保护
系统 SHALL 提供 workspace-scoped CMS 数据读取和资产代理 API，并在 CMS 集成模式下通过统一 CMS Builder Access middleware 校验 access cookie、workspace 匹配和滑动续期。来自 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` 且未经过 public web/nginx 代理的 Docker Playwright 内部只读预览 GET 请求可以访问预览渲染所需的 workspace-scoped CMS 数据和资产代理；该例外不得应用到外部 public 请求、无 project binding 的 workspace、binding 内部资源缺失的 workspace 或任何状态变更请求。

#### Scenario: CMS 模式无 access cookie 请求外部 workspace-scoped CMS 数据被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `GET /api/workspaces/:workspaceId/page-builder/cms/sites`、`/catalogs`、`/catalogs/:catalogId`、`/contents` 或 `/assets?url=...` 时没有有效 `ai_page_builder_access` Cookie
- **AND** 请求 origin 不等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 SHALL 表示 `code: "builder_access_required"`
- **AND** 系统 SHALL NOT 访问 CMS 上游数据或代理 CMS 资产

#### Scenario: CMS 模式内部 Docker Playwright 可访问预览所需 workspace-scoped CMS 数据
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，请求 URL origin 等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`，且请求 `GET /api/workspaces/:workspaceId/page-builder/cms/sites`、`/catalogs`、`/catalogs/:catalogId` 或 `/contents` 时没有有效 `ai_page_builder_access` Cookie
- **AND** 请求未携带 `X-Forwarded-Host`
- **THEN** 系统 SHALL 允许该只读请求继续执行
- **AND** 系统 SHALL 使用与该 `workspaceId` 对应的 CMS project binding 限定站点范围
- **AND** 系统 SHALL NOT 回退到全局默认 `siteId` 越过 project binding

#### Scenario: CMS 模式内部 Docker Playwright 可访问预览所需 CMS 资产代理
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，请求 URL origin 等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`，且请求 `GET /api/workspaces/:workspaceId/page-builder/cms/assets?url=...` 时没有有效 `ai_page_builder_access` Cookie
- **AND** 请求未携带 `X-Forwarded-Host`
- **THEN** 系统 SHALL 允许该只读资产代理请求继续执行
- **AND** 系统 SHALL 仍按 workspace 对应的 CMS project binding 限定 CMS 访问范围

#### Scenario: CMS 模式经 public 代理转发的 internal-origin workspace-scoped CMS API 不走内部例外
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，请求 URL origin 等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`，但请求携带 `X-Forwarded-Host`
- **AND** 请求 workspace-scoped CMS 数据或资产代理时没有有效 `ai_page_builder_access` Cookie
- **THEN** 系统 SHALL NOT 将该请求识别为 Docker Playwright 内部只读预览请求
- **AND** 系统 SHALL 返回 `401`
- **AND** 响应 SHALL 表示 `code: "builder_access_required"`
- **AND** 系统 SHALL NOT 访问 CMS 上游数据或代理 CMS 资产

#### Scenario: CMS 模式内部 Docker Playwright workspace-scoped CMS API 无 project binding 时失败关闭
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，请求 URL origin 等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`，且请求 workspace-scoped CMS 数据或资产代理时 URL 中的 `workspaceId` 没有关联的 CMS project binding
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 响应 SHALL 表示 `code: "project_not_found"` 或等价的结构化项目绑定缺失错误
- **AND** 系统 SHALL NOT 访问 CMS 上游数据或代理 CMS 资产

#### Scenario: CMS 模式内部 Docker Playwright workspace-scoped CMS API 的 binding 内部资源缺失时失败关闭
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，请求 URL origin 等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`，且请求 workspace-scoped CMS 数据或资产代理时 URL 中的 `workspaceId` 对应 binding 指向的 workspace 或 primary session 已不存在
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 响应 SHALL 表示结构化 project binding 不可用错误
- **AND** 系统 SHALL NOT 访问 CMS 上游数据或代理 CMS 资产

#### Scenario: CMS 模式 access session 不匹配 workspace 时拒绝外部 workspace-scoped CMS API
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器携带的 Builder Access Session `workspaceId` 与 URL 中的 `workspaceId` 不同
- **AND** 请求 origin 不等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`
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

#### Scenario: CMS 模式内部 Docker Playwright query siteId 仍不能越过 project binding
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`，请求 URL origin 等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`，且 workspace-scoped CMS 数据请求 query 中的 `siteId` 不等于 URL `workspaceId` 对应 project binding 的 `siteId`
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
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 workspace-scoped CMS 数据或资产请求通过 Builder Access Session 校验并成功返回
- **THEN** 系统 SHALL 设置 no-store 语义的缓存响应头
- **AND** 系统 SHALL 按统一受保护 API 规则滑动续期 Builder Access Session

#### Scenario: CMS 模式内部 Docker Playwright workspace-scoped CMS API 响应不刷新 access session
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 workspace-scoped CMS 数据或资产请求通过内部 Docker Playwright 只读例外成功返回
- **THEN** 系统 SHALL 设置 no-store 语义的缓存响应头
- **AND** 系统 SHALL NOT 创建或滑动续期 Builder Access Session
- **AND** 响应 SHALL NOT 因该内部例外写出新的 `ai_page_builder_access` Cookie

#### Scenario: standalone 模式 workspace-scoped CMS API 可服务 workspace preview
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且浏览器请求 workspace-scoped CMS `catalogs`、`catalogs/:catalogId`、`contents` 或 `assets`
- **THEN** 系统 SHALL 按现有 standalone CMS browser 读取和资产代理语义返回响应
- **AND** 系统 SHALL NOT 要求 `ai_page_builder_access` Cookie
- **AND** 系统 SHALL 保持旧全局 `/api/page-builder/cms/*` standalone 兼容行为不变
