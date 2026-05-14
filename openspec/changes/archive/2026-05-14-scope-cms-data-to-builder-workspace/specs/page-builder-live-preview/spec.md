## MODIFIED Requirements

### Requirement: 工作区预览状态返回的 entryUrl 必须支持 public base path
系统 SHALL 让 PageBuilder Server 返回给浏览器的 workspace preview `entryUrl` 使用当前 public base path，使 builder iframe、新窗口预览和历史卡片预览在 `/pagebuilder` 挂载下不会请求 CMS 根路径 `/api/*`。

#### Scenario: base path 下 preview state 返回带前缀入口
- **WHEN** 当前工作区存在可预览页面，且 public base path 为 `/pagebuilder`
- **THEN** 预览状态接口返回的 `entryUrl` SHALL 形如 `/pagebuilder/api/workspaces/<workspaceId>/preview/`
- **AND** builder iframe SHALL 使用该地址加载预览页面

#### Scenario: base path 下历史项目 previewUrl 返回带前缀入口
- **WHEN** 首页历史项目接口返回存在预览产物的项目，且 public base path 为 `/pagebuilder`
- **THEN** 项目的 `previewUrl` SHALL 形如 `/pagebuilder/api/workspaces/<workspaceId>/preview/`
- **AND** 历史卡片 iframe 和新窗口预览 SHALL 使用该地址加载预览页面

#### Scenario: 无 base path 时 preview state 保持现有入口
- **WHEN** 当前工作区存在可预览页面，且未配置 public base path
- **THEN** 预览状态接口返回的 `entryUrl` SHALL 继续形如 `/api/workspaces/<workspaceId>/preview/`

#### Scenario: CMS 资源代理 URL 使用 public base path 和 workspace 上下文
- **WHEN** 预览 HTML 中的 CMS 远程资源被重写为宿主代理 URL，且 public base path 为 `/pagebuilder`
- **THEN** 重写后的资源 URL SHALL 位于 `/pagebuilder/api/workspaces/<workspaceId>/page-builder/cms/assets`
- **AND** 系统 SHALL NOT 生成指向 CMS 根路径 `/api/page-builder/cms/assets` 的浏览器 URL

#### Scenario: CMS 资源代理 URL 无 base path 时仍携带 workspace 上下文
- **WHEN** 预览 HTML 中的 CMS 远程资源被重写为宿主代理 URL，且未配置 public base path
- **THEN** 重写后的资源 URL SHALL 位于 `/api/workspaces/<workspaceId>/page-builder/cms/assets`
- **AND** 系统 SHALL NOT 生成无 workspace 上下文的 `/api/page-builder/cms/assets` 预览资源 URL
