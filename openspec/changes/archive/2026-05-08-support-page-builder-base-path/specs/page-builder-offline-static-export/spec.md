## ADDED Requirements

### Requirement: 离线静态导出下载 URL 必须支持 public base path
系统 SHALL 在离线静态导出任务完成后返回浏览器可直接访问的下载 URL，并在 PageBuilder public base path runtime 下包含当前 public base path。

#### Scenario: base path 下导出任务返回带前缀下载地址
- **WHEN** 某个离线静态导出任务完成，且 public base path 为 `/pagebuilder`
- **THEN** 任务状态中的 `downloadUrl` SHALL 位于 `/pagebuilder/api/workspaces/<workspaceId>/page-builder/export-static-jobs/<jobId>/download`
- **AND** 浏览器 SHALL NOT 请求 CMS 根路径 `/api/workspaces/<workspaceId>/page-builder/export-static-jobs/<jobId>/download`

#### Scenario: 无 base path 时导出下载地址保持兼容
- **WHEN** 某个离线静态导出任务完成，且未配置 public base path
- **THEN** 任务状态中的 `downloadUrl` SHALL 继续位于 `/api/workspaces/<workspaceId>/page-builder/export-static-jobs/<jobId>/download`
