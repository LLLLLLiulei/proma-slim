## ADDED Requirements

### Requirement: PageBuilder Docker 部署必须支持 public base path 配置
系统 SHALL 允许 Docker 部署通过 `AI_PAGE_BUILDER_BASE_PATH` 声明浏览器公开访问 PageBuilder 的 base path，并 SHALL 保持该配置只表达浏览器公开路径，而不是要求后端 API 路由改为 `/pagebuilder/api/*`。

#### Scenario: 未配置 base path 时保持根路径部署
- **WHEN** Docker 部署未设置 `AI_PAGE_BUILDER_BASE_PATH`
- **THEN** PageBuilder Web SHALL 继续通过 `/`、`/builder/*`、`/assets/*` 和 `/api/*` 提供现有 standalone 入口

#### Scenario: 配置 base path 时声明生产反向代理语义
- **WHEN** Docker 示例或部署文档配置 `AI_PAGE_BUILDER_BASE_PATH=/pagebuilder`
- **THEN** 文档 SHALL 说明生产推荐由 Nginx 或 CMS 网关在 `location /pagebuilder/` 下反向代理到 PageBuilder Web 并剥离 `/pagebuilder` 前缀
- **AND** PageBuilder Web upstream SHALL 继续接收根相对路径 `/`、`/builder/*`、`/assets/*` 和 `/api/*`

#### Scenario: Web 镜像运行时切换 base path 无需重建
- **WHEN** Docker 运行 PageBuilder Web 服务且配置了 `AI_PAGE_BUILDER_BASE_PATH`
- **THEN** 系统 SHALL 使用运行时 public base path 影响 HTML runtime config 注入和 Web 直连兼容逻辑
- **AND** Web 镜像 SHALL NOT 要求为了切换 `/`、`/pagebuilder` 或多级 base path 而重新构建

#### Scenario: base path 配置规范化和非法值处理
- **WHEN** `AI_PAGE_BUILDER_BASE_PATH` 配置为未设置、空字符串、`/`、`pagebuilder`、`/pagebuilder` 或 `/pagebuilder/`
- **THEN** 系统 SHALL 分别规范化为 root mode 或 `/pagebuilder` public base path
- **WHEN** `AI_PAGE_BUILDER_BASE_PATH` 包含 origin、query、hash、路径穿越片段或反斜杠
- **THEN** 构建或服务启动 SHALL 失败并输出清晰配置错误
- **AND** 系统 SHALL NOT 静默回退到 root mode
