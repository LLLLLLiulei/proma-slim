## ADDED Requirements

### Requirement: CMS 集成模式浏览器侧离线静态导出 API 必须受 Builder Access Session 保护
系统 SHALL 在 CMS 集成模式下保护浏览器侧离线静态导出任务 API，确保当前浏览器只能为 Builder Access Session 绑定的 workspace 创建、查询和下载导出任务。

#### Scenario: CMS 模式创建离线导出任务必须匹配 workspace 并校验来源
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器请求 `POST /api/workspaces/:workspaceId/page-builder/export-static-jobs`
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `workspaceId` 等于请求的 `workspaceId`
- **AND** 系统 SHALL 校验 `Origin` 或 `Referer` 属于 `AI_PAGE_BUILDER_PUBLIC_ORIGIN`
- **AND** 校验失败时 SHALL NOT 创建离线静态导出任务

#### Scenario: CMS 模式查询离线导出任务必须匹配 workspace
- **WHEN** CMS 模式下浏览器请求 `GET /api/workspaces/:workspaceId/page-builder/export-static-jobs/:jobId`
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `workspaceId` 等于请求的 `workspaceId`
- **AND** 系统 SHALL NOT 因普通 `GET` 请求缺少 `Origin` header 而拒绝

#### Scenario: CMS 模式下载离线导出结果必须匹配 workspace
- **WHEN** CMS 模式下浏览器请求 `GET /api/workspaces/:workspaceId/page-builder/export-static-jobs/:jobId/download`
- **THEN** 系统 SHALL 校验 Builder Access Session 的 `workspaceId` 等于请求的 `workspaceId`
- **AND** 校验失败时 SHALL NOT 返回导出 ZIP 文件
