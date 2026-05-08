## ADDED Requirements

### Requirement: PageBuilder renderer 必须支持 public base path 路由和导航
系统 SHALL 让 PageBuilder 前端在浏览器地址包含 public base path 时正确解析首页、builder 路由和内部导航，同时在未配置 base path 时保持现有根路径行为。

#### Scenario: base path 下解析首页和 builder 路由
- **WHEN** 浏览器地址为 `/pagebuilder/` 或 `/pagebuilder/builder/<workspaceId>/<sessionId>`，且 public base path 为 `/pagebuilder`
- **THEN** PageBuilder renderer SHALL 分别解析为首页或对应 builder 路由
- **AND** 系统 SHALL NOT 将这些地址识别为 not-found

#### Scenario: base path 下构建内部导航地址
- **WHEN** PageBuilder 首页创建项目后跳转 builder，或历史记录打开已有项目
- **THEN** renderer SHALL 生成 `/pagebuilder/builder/<workspaceId>/<sessionId>` 形式的浏览器地址
- **AND** 未配置 public base path 时 SHALL 继续生成 `/builder/<workspaceId>/<sessionId>`

#### Scenario: 返回首页时保留 public base path
- **WHEN** PageBuilder 在 base path 模式下从 builder 或 not-found 页面导航回首页
- **THEN** renderer SHALL 导航到 `/pagebuilder/`
- **AND** 未配置 public base path 时 SHALL 继续导航到 `/`

### Requirement: 共享 API client 必须仅在 PageBuilder runtime 下应用 public base path
系统 SHALL 让共享 API client 保持调用方使用逻辑 `/api/*` 路径，同时在 PageBuilder public base path runtime 下把浏览器请求解析到 `${basePath}/api/*`。

#### Scenario: PageBuilder base path 下 API 请求带公开前缀
- **WHEN** PageBuilder renderer 在 public base path `/pagebuilder` 下调用逻辑 API 路径 `/api/status`
- **THEN** 浏览器请求 SHALL 发送到 `/pagebuilder/api/status`
- **AND** 调用方 SHALL NOT 需要手动拼接 `/pagebuilder`

#### Scenario: 主应用和 standalone 模式不受影响
- **WHEN** 主应用或未配置 public base path 的 PageBuilder 调用逻辑 API 路径 `/api/status`
- **THEN** 浏览器请求 SHALL 继续发送到 `/api/status`
- **AND** 系统 SHALL NOT 将主应用请求改写到 `/pagebuilder/api/status`
#### Scenario: PageBuilder runtime config 优先于 Vite 相对资源 base
- **WHEN** PageBuilder renderer 收到运行时注入的 public base path `/pagebuilder`，且 Vite 构建 base 为相对资源路径
- **THEN** renderer SHALL 使用运行时注入的 `/pagebuilder` 解析路由和 API 请求
- **AND** 未收到运行时注入配置且 Vite base 为相对资源路径时 SHALL 视为 root mode

#### Scenario: PageBuilder base path 下直接下载 URL 带公开前缀
- **WHEN** PageBuilder renderer 在 public base path `/pagebuilder` 下生成离线静态导出下载 URL
- **THEN** 生成的浏览器 URL SHALL 位于 `/pagebuilder/api/workspaces/<workspaceId>/page-builder/export-static-jobs/<jobId>/download`
- **AND** 调用方 SHALL NOT 需要手动拼接 `/pagebuilder`
