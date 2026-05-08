## ADDED Requirements

### Requirement: PageBuilder Web 必须支持 public base path 下的 SPA、静态资源和 API 代理
系统 SHALL 让 PageBuilder Web 在配置 public base path 时既能作为 Nginx strip-prefix 后的根相对 upstream 运行，也能兼容直接访问未剥离前缀的 `/pagebuilder/*` 请求。

#### Scenario: Nginx 剥离前缀后 Web upstream 保持根路径行为
- **WHEN** 生产反向代理把浏览器请求 `/pagebuilder/api/status` 剥离为 upstream 请求 `/api/status`
- **THEN** PageBuilder Web SHALL 按现有 `/api/*` 代理规则将请求转发到 PageBuilder Server 的 `/api/status`
- **AND** PageBuilder Server SHALL NOT 需要识别 `/pagebuilder/api/status`

#### Scenario: 直连 base path API 请求只剥离一次
- **WHEN** PageBuilder Web 直接收到 `/pagebuilder/api/status` 且 public base path 为 `/pagebuilder`
- **THEN** PageBuilder Web SHALL 将其剥离为 `/api/status` 后代理到 PageBuilder Server
- **AND** 系统 SHALL NOT 将 `/pagebuilder/pagebuilder/api/status` 错误剥离为 `/api/status`

#### Scenario: 直连 base path builder 路由返回 SPA shell
- **WHEN** PageBuilder Web 直接收到 `/pagebuilder/builder/<workspaceId>/<sessionId>` 且 public base path 为 `/pagebuilder`
- **THEN** PageBuilder Web SHALL 返回 PageBuilder SPA shell
- **AND** 前端路由 SHALL 能基于浏览器地址中的 public base path 解析 builder 参数

#### Scenario: 直连 base path 静态资源从 dist 返回
- **WHEN** PageBuilder Web 直接收到 `/pagebuilder/assets/<file>` 且 public base path 为 `/pagebuilder`
- **THEN** PageBuilder Web SHALL 从构建产物的 `assets` 目录返回对应静态资源
- **AND** 缺失的带扩展名资源 SHALL 返回 404 而不是 SPA fallback
#### Scenario: 生产 HTML 响应注入运行时 base path 配置
- **WHEN** PageBuilder Web 在生产模式下返回 `index.html` 或 SPA fallback，且 public base path 为 `/pagebuilder`
- **THEN** 响应 HTML SHALL 包含指向 `/pagebuilder/` 的 base href 和包含 `/pagebuilder` 的 runtime config
- **AND** 静态资源响应 SHALL NOT 被注入 HTML runtime config
- **AND** 切换运行时 base path 后响应 HTML SHALL NOT 残留旧 base path
