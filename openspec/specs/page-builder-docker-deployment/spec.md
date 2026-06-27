# page-builder-docker-deployment Specification

## Purpose
定义 `page-builder` 的 Docker Compose 部署约定，包括 `build/` 目录内部署资产、`web` / `server` 双服务拓扑、同源 API 入口、Bun 运行基线，以及宿主机 `~/.ai-page-builder` 持久化要求。
## Requirements
### Requirement: Docker Compose 部署必须提供 page builder 的前后端双服务闭环
系统 SHALL 提供一套面向 `page-builder` 的 `docker compose` 部署资产，使页面构建前端与 `@ai-page-builder/app` 后端能够作为两个核心应用服务一起启动，并默认提供内部 Playwright sidecar 作为浏览器自动化辅助服务，而不是要求操作者手工分别拼装多个本地命令。

#### Scenario: 部署资产位于 `build/` 并支持在该目录内直接执行
- **WHEN** 操作者进入仓库内的 `build/` 目录并执行默认的 `docker compose` 命令
- **THEN** 系统 SHALL 能够使用 `build/docker-compose.yml` 与 `build/` 下的 Dockerfile 直接完成构建与启动
- **AND** 系统 SHALL 继续以仓库根目录作为镜像构建上下文

#### Scenario: 默认 compose 启动核心前后端服务和默认 sidecar
- **WHEN** 操作者基于仓库提供的 page builder 部署资产执行默认的 `docker compose up`
- **THEN** 系统 SHALL 启动名为 `web` 的服务用于提供 page builder Web 入口
- **AND** 系统 SHALL 启动名为 `server` 的服务用于提供 API、SSE、Agent 与工作区能力
- **AND** 系统 SHALL 启动名为 `playwright` 的默认内部 sidecar 用于提供 Playwright MCP HTTP 服务

#### Scenario: 默认 compose 仅要求访问 page builder 对外入口
- **WHEN** 操作者使用默认 compose 配置启动 page builder 部署
- **THEN** 系统 SHALL 提供单一的 page builder 对外访问入口
- **AND** 系统 SHALL NOT 要求用户直接访问 `@ai-page-builder/app` 的独立宿主机端口或 Playwright sidecar 端口才能使用 page builder

### Requirement: Docker 可见部署命名必须使用 `ai-page-builder` / `server` / `web`
系统 SHALL 在 compose 分组名、镜像名、容器名和对外环境变量中使用 page-builder 专属命名，而不是继续暴露 legacy `proma` Docker 可见名称。

#### Scenario: compose 分组与服务镜像名称使用 page-builder 专属命名
- **WHEN** 操作者查看默认 compose 部署资产
- **THEN** 系统 SHALL 使用 `ai-page-builder` 作为 compose 分组名称
- **AND** 系统 SHALL 使用 `server`、`web` 作为服务与容器名称
- **AND** 系统 SHALL 使用 `ai-page-builder-server`、`ai-page-builder-web` 作为默认镜像名称

#### Scenario: Docker 对外环境变量使用 `AI_PAGE_BUILDER_*` 命名
- **WHEN** 操作者配置 compose 所需的外部运行参数
- **THEN** 系统 SHALL 使用 `AI_PAGE_BUILDER_*` 变量暴露 page builder 部署相关配置
- **AND** 系统 SHALL NOT 要求操作者在 Docker 资产中继续配置 `PROMA_*` 命名

### Requirement: compose 资产必须默认提供内部 Playwright MCP sidecar
系统 SHALL 在默认 `page-builder` compose 部署中启动一个供 `server` 通过内部网络访问的 `playwright` sidecar，用于承载 Playwright MCP HTTP 服务，而不是要求操作者额外启用 profile 或要求 `server` 在自身容器内本地拉起 Playwright MCP 进程。

#### Scenario: 默认 compose 启动 Playwright sidecar
- **WHEN** 操作者基于默认 page-builder compose 资产执行启动命令
- **THEN** 系统 SHALL 启动名为 `playwright` 的服务作为内部 Playwright MCP 提供方
- **AND** `server` SHALL 能够通过 compose 内部网络访问该服务的 MCP HTTP 端点

#### Scenario: Playwright sidecar 不作为浏览器对外入口暴露
- **WHEN** 操作者使用默认 compose 配置部署 page builder
- **THEN** 系统 SHALL NOT 要求用户直接访问 Playwright sidecar 的独立宿主机入口
- **AND** 浏览器侧对外访问入口 SHALL 继续仅为 `web` 或本地验证 Nginx 入口

#### Scenario: Playwright sidecar 使用 page-builder 专属 Docker 可见命名
- **WHEN** 操作者查看默认 compose 部署资产中的浏览器自动化 sidecar 定义
- **THEN** 系统 SHALL 使用 `playwright` 作为该 sidecar 的服务名称
- **AND** 系统 SHALL NOT 在该 sidecar 的 Docker 可见命名中继续暴露 legacy `proma` 字样

### Requirement: Docker 部署必须声明 Playwright sidecar 与内部预览 origin 的运行时输入
系统 SHALL 为 `server` 提供可外部覆盖的 Docker 运行时输入，用于解析默认 Playwright sidecar MCP 地址与 page-builder 预览的内部访问 origin，而不是把这些容器网络地址写入工作区持久化配置。Docker 内部预览 origin SHALL 被视为后端内部 API origin，默认指向 compose 内部 `server` 服务，不应配置为浏览器 public origin；当 public base path 存在时，注入给 Agent / Docker Playwright 的预览 URL SHALL 使用剥离 public base path 后的内部 API path。

#### Scenario: compose 为 server 声明 Docker 运行时标记
- **WHEN** 操作者查看 compose 资产中的 `server` 环境变量定义
- **THEN** 系统 SHALL 为 `server` 声明一个内部 Docker 运行时标记
- **AND** 该标记 SHALL 让应用层能够区分 Docker 运行时和本地非 Docker 运行

#### Scenario: 默认 sidecar 输入指向 compose 内部 Playwright MCP 地址
- **WHEN** 操作者查看默认 compose 资产中的可配置运行参数
- **THEN** 系统 SHALL 为 `server` 声明 `AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL` 这一运行时输入
- **AND** 该输入默认值 SHALL 指向 compose 内部 `playwright` 服务的 MCP HTTP 端点
- **AND** 操作者 SHALL 能通过环境变量覆盖该输入为空或其他 MCP 地址

#### Scenario: 默认内部预览 origin 指向 server 服务
- **WHEN** 操作者查看默认 compose 资产中的可配置运行参数
- **THEN** 系统 SHALL 为 `server` 声明 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` 这一运行时输入
- **AND** 该输入默认值 SHALL 指向 compose 内部用于访问工作区预览路由的 `server` HTTP origin
- **AND** 操作者 SHALL 能通过环境变量覆盖该输入为空或其他内部预览 origin
- **AND** 文档 SHALL 提示该输入不应配置为浏览器 public origin，避免扩大内部只读预览例外的访问面

#### Scenario: public base path 不污染 Docker 内部预览 URL
- **WHEN** Docker CMS 集成部署配置 `AI_PAGE_BUILDER_BASE_PATH=/pagebuilder`、`AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN=http://server:8888`，且 Agent turn 使用默认内部 Playwright sidecar
- **THEN** 注入给 Agent 的预览 URL SHALL 使用 `http://server:8888/api/workspaces/<workspaceId>/preview/`
- **AND** 注入给 Agent 的预览 URL SHALL NOT 使用 `http://server:8888/pagebuilder/api/workspaces/<workspaceId>/preview/`

#### Scenario: 内部 Playwright 预览访问不要求用户浏览器 cookie
- **WHEN** Docker CMS 集成部署中的内部 Playwright sidecar 访问 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` 下的只读预览展示 URL
- **THEN** 系统 SHALL 允许该内部只读预览请求在没有用户浏览器 `ai_page_builder_access` Cookie 的情况下完成
- **AND** 系统 SHALL 继续要求外部 public preview URL 通过 CMS handoff/access session 获得访问权限

### Requirement: 对外入口必须保持根路径下的 page builder SPA 与同源 API 访问
系统 SHALL 让部署后的 page builder Web 入口同时承担前端静态资源访问与 `/api` 请求转发职责，以保持浏览器侧仍以同源方式访问 page builder 与后端接口。

#### Scenario: 访问根路径时返回 page builder 首页
- **WHEN** 浏览器访问部署后的站点根路径 `/`
- **THEN** 系统 SHALL 返回 `page-builder` 的前端入口页面
- **AND** 系统 SHALL NOT 返回 `apps/app` 的通用主应用静态首页

#### Scenario: 访问 builder 路由时返回 page builder SPA 回退入口
- **WHEN** 浏览器直接访问 `/builder/<workspaceId>/<sessionId>` 这类 page builder 路由
- **THEN** 系统 SHALL 返回 page builder 的 SPA 入口文档
- **AND** 前端路由 SHALL 接管后续页面渲染

#### Scenario: 通过 page builder 入口访问 API 时保持同源代理
- **WHEN** 浏览器从 page builder 站点发起 `/api/status`、`/api/workspaces` 或其他 `/api/*` 请求
- **THEN** 系统 SHALL 通过 `web` 服务将该请求转发到内部 `server` 服务
- **AND** 浏览器侧 SHALL 无需额外配置跨域访问

#### Scenario: 流式发送请求通过同源入口保持流式语义
- **WHEN** 浏览器通过 page builder 对外入口向 `POST /api/sessions/:id/send` 发起流式会话请求
- **THEN** 系统 SHALL 透传 `server` 返回的流式响应
- **AND** 系统 SHALL NOT 在前置 Web 服务中将该流式响应改写为非流式或缓冲后一次性返回

### Requirement: 默认部署必须将 page builder 运行状态持久化到宿主机 `~/.ai-page-builder`
系统 SHALL 允许默认部署将 page builder 所依赖的工作区、会话、导出文件、CMS 配置、CMS runtime handoff/access session 记录与运行时设置持久化到宿主机 `~/.ai-page-builder`，而不是仅保存在容器的临时文件系统中。

#### Scenario: server 服务在固定容器路径下使用挂载后的配置目录
- **WHEN** 默认 compose 部署启动 `server` 服务
- **THEN** 系统 SHALL 将宿主机 `~/.ai-page-builder` 绑定到容器内固定路径 `/home/bun/.ai-page-builder`
- **AND** `server` SHALL 使用该固定路径作为运行时配置与工作区根目录

#### Scenario: 使用同一宿主机配置目录重建容器后保留项目状态
- **WHEN** 操作者停止并重新创建容器，且继续使用同一个宿主机 `~/.ai-page-builder`
- **THEN** 系统 SHALL 保留已有的 page builder 项目、工作区、会话记录、导出结果与 CMS 配置
- **AND** 系统 SHALL NOT 因容器重建而将这些状态重置为全新环境

#### Scenario: 使用同一宿主机配置目录重建 server 后保留 CMS runtime 会话
- **WHEN** CMS 集成模式下 handoff 或 Builder Access Session 已写入 CMS runtime store
- **AND** 操作者停止并重新创建 `server` 容器，且继续使用同一个宿主机 `~/.ai-page-builder`
- **THEN** 系统 SHALL 能在 TTL 内读取这些 CMS runtime 会话记录
- **AND** 系统 SHALL NOT 因容器重建而把未过期 handoff/access session 全部视为不存在

### Requirement: 启用 sidecar 时必须让 server 与 playwright 共享 page-builder 运行时存储
系统 SHALL 在启用 `playwright` sidecar 的 compose 部署中让 `server` 与 `playwright` 共享同一份 page-builder 运行时存储，以便 sidecar 生成的截图、快照等文件能够被 `server` 与宿主机读取，而不是停留在 sidecar 的独占文件系统中。

#### Scenario: 启用 sidecar 时 compose 为 server 与 playwright 挂载同一份运行时目录
- **WHEN** 操作者查看启用 `playwright` sidecar 的 compose 资产中的 `server` 与 `playwright` 定义
- **THEN** 系统 SHALL 将同一份 page-builder 运行时存储同时挂载到这两个服务
- **AND** 两个服务 SHALL 在各自容器内通过稳定路径访问该共享存储

#### Scenario: Playwright sidecar 产物可被 server 与宿主机读取
- **WHEN** 启用中的 runtime `playwright` 在共享 page-builder 存储中写入截图、快照或其他自动化产物
- **THEN** `server` SHALL 能从其挂载路径读取同一份文件
- **AND** 宿主机 SHALL 能从该默认 bind mount 对应的目录中检查同一份文件

### Requirement: 默认运行镜像必须以 Bun 为基线并最小化额外运行时依赖
系统 SHALL 以 Bun 作为 page builder 部署的默认构建与运行时基线，并 SHALL 为 `@ai-page-builder/app` 运行镜像提供 page builder 所需的最小额外依赖集合，而不是默认要求完整 Node.js 运行时。

#### Scenario: 默认 app 运行镜像在缺少 Node.js 时仍可启动基础 page builder 后端
- **WHEN** 默认 `@ai-page-builder/app` 运行镜像包含 Bun 与 Git，但未额外安装 Node.js
- **THEN** 系统 SHALL 仍可启动 `@ai-page-builder/app` 服务
- **AND** 系统 SHALL 暴露 page builder 所需的 HTTP API 与流式接口

#### Scenario: 默认 page builder Web 运行镜像使用 Bun 提供前端入口
- **WHEN** 默认 page builder Web 运行镜像启动
- **THEN** 系统 SHALL 使用 Bun 提供 page builder 的静态前端入口与 `/api` 代理能力
- **AND** 系统 SHALL NOT 要求为该 Web 入口额外安装 Node.js 才能运行

### Requirement: 部署资产必须将敏感运行参数外置为环境变量输入
系统 SHALL 通过环境变量或等效外部配置注入 page builder 部署所需的敏感运行参数，而不是把真实密钥或私有地址硬编码进版本库中的 compose 资产。

#### Scenario: 部署资产声明必需密钥输入但不提交真实值
- **WHEN** 仓库提供 page builder 的 compose 与相关部署模板文件
- **THEN** 系统 SHALL 为 `ANTHROPIC_API_KEY` 等必需运行参数提供环境变量输入约定
- **AND** 系统 SHALL NOT 在版本库中的 compose 资产内写入真实密钥值

#### Scenario: 部署资产允许使用环境变量覆盖可选运行地址
- **WHEN** 操作者需要为默认部署指定自定义的 Anthropic 服务地址或其他可配置运行参数
- **THEN** 系统 SHALL 允许通过环境变量方式传入这些覆盖值
- **AND** 系统 SHALL 保持未提供覆盖值时的默认部署路径可用

### Requirement: Docker server 环境必须显式声明 Agent SDK env 白名单
系统 SHALL 在 PageBuilder Docker 部署资产的 `server.environment` 中显式声明本期支持的 Agent SDK env 白名单，使操作者可通过 compose `--env-file` 对应的 env 文件配置这些变量并注入 `server` 容器；系统 SHALL NOT 为该能力新增 `env_file` 注入方式。

受支持白名单 MUST 包含：`ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL`、`ANTHROPIC_DEFAULT_OPUS_MODEL`、`ANTHROPIC_DEFAULT_SONNET_MODEL`、`ANTHROPIC_DEFAULT_HAIKU_MODEL`、`CLAUDE_CODE_SUBAGENT_MODEL`、`CLAUDE_CODE_EFFORT_LEVEL`、`CLAUDE_CODE_AUTO_COMPACT_WINDOW`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 与 `API_TIMEOUT_MS`。

#### Scenario: 默认 compose 显式传入 Agent SDK env
- **WHEN** 操作者查看 `build/docker-compose.yml` 中的 `server` 服务环境变量定义
- **THEN** 系统 SHALL 显式声明本期支持的 Agent SDK env 白名单
- **AND** 系统 SHALL 保持 `server` 容器可从 compose env 文件读取这些变量

#### Scenario: release compose 显式传入 Agent SDK env
- **WHEN** 操作者查看 `build/docker-compose.release.yml` 中的 `server` 服务环境变量定义
- **THEN** 系统 SHALL 显式声明本期支持的 Agent SDK env 白名单
- **AND** 系统 SHALL 保持 release 部署与默认 compose 的 Agent SDK env 配置语义一致

#### Scenario: Docker 不使用 env_file 注入 server 配置
- **WHEN** 操作者查看 PageBuilder Docker compose 资产
- **THEN** 系统 SHALL NOT 通过 `server.env_file` 将整个 env 文件注入容器
- **AND** 系统 SHALL 继续通过 `server.environment` 维护明确的容器环境变量边界

#### Scenario: Docker 启动脚本避免宿主机 Agent SDK env 覆盖 env 文件
- **WHEN** 操作者使用内置 PageBuilder Docker 启动脚本并通过 `--env-file` 指定 env 文件
- **AND** 宿主机 shell 中存在同名 `ANTHROPIC_*`、受支持 `CLAUDE_CODE_*`、`API_TIMEOUT_MS` 或旧 `AI_PAGE_BUILDER_ANTHROPIC_*` 变量
- **THEN** 启动脚本 SHALL 在调用 compose 前清理这些宿主机同名变量
- **AND** compose 变量替换 SHALL 使用 env 文件中的 Agent SDK 配置值

#### Scenario: Docker 保留旧 PageBuilder Agent 变量兼容入口
- **WHEN** 操作者仅在 Docker env 文件中配置 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY` 或 `AI_PAGE_BUILDER_ANTHROPIC_BASE_URL`
- **THEN** `server` 容器 SHALL 仍能读取这些旧变量
- **AND** 应用层 SHALL 能将其作为 `ANTHROPIC_API_KEY` 或 `ANTHROPIC_BASE_URL` 的 fallback

#### Scenario: Docker 不再强制要求旧 API key 变量
- **WHEN** 操作者在 Docker env 文件中配置 `ANTHROPIC_AUTH_TOKEN`，但未配置 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY`
- **THEN** compose 启动 SHALL NOT 因缺少 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY` 在变量展开阶段失败
- **AND** `server` 容器 SHALL 能启动并由应用层使用 `ANTHROPIC_AUTH_TOKEN` 作为 Agent SDK 凭证

### Requirement: Docker env 示例必须说明 Agent SDK 官方变量配置方式
系统 SHALL 在 PageBuilder Docker env 示例和部署文档中说明本期支持的 Agent SDK 官方环境变量，并给出 DeepSeek Anthropic-compatible provider 的配置示例；示例 MUST 说明旧 `AI_PAGE_BUILDER_ANTHROPIC_*` 变量仅作为兼容 fallback。

#### Scenario: standalone env 示例包含 Agent SDK env 说明
- **WHEN** 操作者查看 `build/.env.standalone.example`
- **THEN** 系统 SHALL 展示可配置的 Agent SDK env 白名单
- **AND** 系统 SHALL 说明 `ANTHROPIC_AUTH_TOKEN` 可作为 API key 之外的凭证方式

#### Scenario: CMS env 示例包含 Agent SDK env 说明
- **WHEN** 操作者查看 `build/.env.cms.example`
- **THEN** 系统 SHALL 展示可配置的 Agent SDK env 白名单
- **AND** 系统 SHALL 说明官方 `ANTHROPIC_*` 变量优先于旧 `AI_PAGE_BUILDER_ANTHROPIC_*` fallback

#### Scenario: 部署文档包含 DeepSeek 示例
- **WHEN** 操作者查看 PageBuilder Docker 部署说明
- **THEN** 文档 SHALL 提供包含 `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`、`ANTHROPIC_AUTH_TOKEN`、模型别名、subagent model、effort、auto compact、非必要流量禁用与 API timeout 的示例

### Requirement: PageBuilder Docker 部署必须支持 public base path 配置
系统 SHALL 允许 Docker 部署通过 `AI_PAGE_BUILDER_BASE_PATH` 声明浏览器公开访问 PageBuilder 的 base path，并 SHALL 保持该配置只表达浏览器公开路径，而不是要求后端 API 路由改为 `/pagebuilder/api/*`。

#### Scenario: 未配置 base path 时保持根路径部署
- **WHEN** Docker 部署未设置 `AI_PAGE_BUILDER_BASE_PATH`
- **THEN** PageBuilder Web SHALL 继续通过 `/`、`/builder/*`、`/assets/*` 和 `/api/*` 提供现有 standalone 入口

#### Scenario: 配置 base path 时声明生产反向代理语义
- **WHEN** Docker 示例或部署文档配置 `AI_PAGE_BUILDER_BASE_PATH=/pagebuilder`
- **THEN** 文档 SHALL 说明生产可由 Nginx 或 CMS 网关在 `location /pagebuilder/` 下反向代理到 PageBuilder Web
- **AND** 文档 SHALL 明确 public base path 只能被 CMS/Nginx 或 PageBuilder Web 中的一层剥离一次
- **AND** PageBuilder Server upstream SHALL 继续接收根相对 `/api/*` 路由

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

### Requirement: Docker CMS 集成配置必须覆盖第一期运行时输入
系统 SHALL 在 Docker 部署资产中暴露 CMS 集成第一期需要的 PageBuilder 运行时配置，并 SHALL 保持 Docker 对外配置使用 `AI_PAGE_BUILDER_*` 命名。CMS 集成模式 SHALL 暴露 access session 续期阈值配置，并 SHALL 说明默认文件 runtime store 会持久化 Builder Access Cookie bearer token，因此宿主机配置目录需要按敏感数据目录保护。

#### Scenario: standalone 默认部署不启用 CMS 集成模式
- **WHEN** Docker 部署未设置 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms`
- **THEN** 系统 SHALL 保持 standalone 行为
- **AND** 系统 SHALL NOT 因缺少 CMS base URL、public origin 或 integration secret 而启动失败

#### Scenario: CMS 集成模式声明所有必需运行时输入
- **WHEN** 操作者查看 Docker `.env` 示例、compose 和启动脚本
- **THEN** 系统 SHALL 提供 `AI_PAGE_BUILDER_INTEGRATION_MODE`、`AI_PAGE_BUILDER_PUBLIC_ORIGIN`、`AI_PAGE_BUILDER_BASE_PATH`、`AI_PAGE_BUILDER_CMS_BASE_URL`、`AI_PAGE_BUILDER_INTEGRATION_SECRET`、`AI_PAGE_BUILDER_HANDOFF_TTL_MS`、`AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS`、`AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS` 和 `AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS` 的配置入口
- **AND** `AI_PAGE_BUILDER_CMS_BASE_URL` 文档 SHALL 说明它是用于 `/ui/login` 的 CMS 管理端 API base URL，而不是 CMS Site URL
- **AND** 文档 SHALL 说明 Builder Access Cookie bearer token 会随 access session 写入 CMS runtime store

#### Scenario: Docker 外部配置不要求直接设置内部 PROMA 变量
- **WHEN** 操作者按 Docker 文档配置 PageBuilder
- **THEN** 文档和示例 SHALL NOT 要求操作者直接设置 `PROMA_CONFIG_DIR`、`PROMA_CLAUDE_HOME` 或 `PROMA_CMS_BASE_URL`
- **AND** 系统 SHALL 在容器启动边界把必要 `AI_PAGE_BUILDER_*` 映射到内部兼容变量

#### Scenario: CMS base URL 映射给现有内部 CMS 读取链路
- **WHEN** Docker 部署设置 `AI_PAGE_BUILDER_CMS_BASE_URL`
- **THEN** `server` 容器内现有 CMS gateway、CMS browser 和静态导出链路 SHALL 能通过内部兼容变量读取到相同 CMS 管理端 base URL

#### Scenario: 同步导出超时配置传入 server 容器
- **WHEN** Docker 部署设置 `AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS`
- **THEN** CMS 同步导出接口 SHALL 能在 `server` 容器运行时读取该值
- **AND** 系统 SHALL NOT 只在 `.env` 示例中声明该变量却不传入容器

#### Scenario: CMS runtime store 单实例边界写入文档
- **WHEN** 操作者查看 Docker `.env` 示例或部署说明
- **THEN** 文档 SHALL 说明默认 CMS runtime store 使用配置目录下的文件持久化
- **AND** 文档 SHALL 说明该默认文件 store 只支持单 `server` 实例语义
- **AND** 文档 SHALL NOT 宣称多个 `server` 实例可安全共享同一个文件 runtime store

### Requirement: Docker 部署必须提供本地 CMS mock 与 Nginx 验证拓扑
系统 SHALL 提供一个本地可启动的 CMS 集成验证拓扑，用于模拟 CMS 同源反向代理、CMS `/ui/login`、PageBuilder Web、PageBuilder Server 和默认 Playwright sidecar 的组合行为。

#### Scenario: 本地验证拓扑不污染默认 standalone compose
- **WHEN** 操作者使用默认 page-builder compose 启动服务
- **THEN** 系统 SHALL 继续只要求默认 PageBuilder 服务闭环可运行
- **AND** `cms-mock` 与 `nginx` 验证服务 SHALL 通过独立 compose overlay、专用验证 compose 或等效验证脚本启用

#### Scenario: Nginx 同源入口暴露 PageBuilder base path
- **WHEN** 本地 CMS 集成验证拓扑启动
- **THEN** 浏览器 SHALL 能通过同一个 origin 下的 `/pagebuilder/`、`/pagebuilder/builder/...` 和 `/pagebuilder/api/...` 访问 PageBuilder
- **AND** PageBuilder Server 内部 SHALL 继续接收根相对 `/api/...` 路由

#### Scenario: CMS mock 提供登录态校验
- **WHEN** PageBuilder 在验证拓扑中使用 `X-CMS-Cookie` 调用 CMS `/ui/login`
- **THEN** `cms-mock` SHALL 返回可配置的已登录或未登录响应
- **AND** PageBuilder SHALL 使用该响应驱动 `cms_login_expired` 或成功创建项目、handoff、导出的行为

#### Scenario: 同源反代保留集成接口关键 header
- **WHEN** CMS mock 或验证脚本经本地 Nginx 公开入口调用 `/pagebuilder/api/integrations/cms/*`
- **THEN** Nginx 和 PageBuilder Web 代理链路 SHALL NOT 丢弃 `Authorization` 或 `X-CMS-Cookie`
- **AND** PageBuilder Server SHALL 能基于这些 header 完成 server-to-server 集成鉴权和 CMS 登录态校验

#### Scenario: 验证拓扑只剥离 public base path 一次
- **WHEN** 浏览器请求 `/pagebuilder/api/status` 或 `/pagebuilder/api/integrations/cms/handoffs/<id>/open`
- **THEN** 代理链路 SHALL 只把 `/pagebuilder` public base path 剥离一次
- **AND** 系统 SHALL NOT 产生 `/pagebuilder/pagebuilder/api/...` 或把非 PageBuilder 路由错误代理到 Server 的行为

#### Scenario: 验证拓扑使用可观察的持久化目录
- **WHEN** 验证拓扑创建 CMS project binding、workspace、session 或 export artifact
- **THEN** 这些运行态文件 SHALL 落在 `PROMA_CONFIG_DIR` 对应的容器挂载目录下
- **AND** 宿主机 SHALL 能检查这些文件用于排查验证失败

#### Scenario: 测试 fixture 写入不新增生产 PageBuilder API
- **WHEN** 验证拓扑需要为 preview 或 export 准备 `workspace-files/index.html`
- **THEN** 测试 harness SHALL 通过宿主挂载、共享验证卷、`docker exec` 或等效 test-only 机制写入 fixture
- **AND** 系统 SHALL NOT 为该目的新增可被生产访问的 PageBuilder debug API

### Requirement: Docker CMS 集成验证必须覆盖浏览器打开、预览和同步导出闭环
系统 SHALL 提供可重复执行的 Docker/E2E 验证，用于证明 CMS 集成模式在同源 base path 下可以完成创建项目、受控打开、预览、防绕过和同步导出。

#### Scenario: 验证 builder handoff iframe 和新窗口打开
- **WHEN** 本地验证拓扑中 CMS mock 创建项目并创建 `target: "builder"` handoff
- **THEN** Playwright 或等效 E2E SHALL 验证 iframe 和新窗口都能消费 handoff openUrl
- **AND** 浏览器最终 SHALL 位于 `/pagebuilder/builder/<workspaceId>/<sessionId>` 下并能成功加载 builder context

#### Scenario: 验证同一浏览器多项目访问会话互不覆盖
- **WHEN** 同一浏览器先后为两个不同 CMS 项目消费 `target: "builder"` handoff
- **THEN** 每个项目 SHALL 获得独立的 workspace-scoped Builder Access Cookie
- **AND** 两个项目的 builder context SHALL 在同一个浏览器 cookie jar 中同时通过访问校验

#### Scenario: 验证 preview handoff 打开当前预览产物
- **WHEN** 本地验证拓扑为项目准备最小 `workspace-files/index.html` 并创建 `target: "preview"` handoff
- **THEN** iframe 和新窗口 SHALL 能打开 `/pagebuilder/api/workspaces/<workspaceId>/preview/`
- **AND** preview HTML 及其静态子资源 SHALL 能在同源 access cookie 下正常加载

#### Scenario: 验证 workspace-scoped CMS 资产代理
- **WHEN** preview fixture 或独立 E2E 步骤请求 `/pagebuilder/api/workspaces/<workspaceId>/page-builder/cms/assets?url=...`
- **THEN** 请求 SHALL 携带并通过当前 workspace 对应的 Builder Access Session 校验
- **AND** 浏览器或测试 harness SHALL NOT 使用旧全局 `/pagebuilder/api/page-builder/cms/assets?url=...` 作为 CMS 集成模式资产代理路径

#### Scenario: 验证直接 URL 绕过被阻止
- **WHEN** 浏览器没有有效 Builder Access Cookie 且直接访问最终 builder URL 或 workspace preview URL
- **THEN** builder shell MAY 加载但 builder context SHALL 被拒绝
- **AND** workspace preview HTML SHALL 被后端拒绝返回

#### Scenario: 验证 access cookie 与 iframe 响应头
- **WHEN** 浏览器通过 handoff 成功进入 builder 或 preview
- **THEN** `ai_page_builder_access_*` workspace-scoped Cookie SHALL 使用与 base path 匹配的 Path
- **AND** HTTP 验证下该 Cookie SHALL NOT 设置 `Secure`
- **AND** HTTPS public origin 或可信 forwarded proto 验证下该 Cookie SHALL 设置 `Secure`
- **AND** builder HTML 和 workspace preview HTML SHALL 包含 `frame-ancestors 'self'` 且 SHALL NOT 设置 `X-Frame-Options: DENY`

#### Scenario: 验证前端请求不回退到 CMS 根路径 API
- **WHEN** PageBuilder 在 `/pagebuilder` base path 下运行
- **THEN** 前端项目 API、preview iframe、workspace-scoped CMS 资产代理和静态资源请求 SHALL 使用 `/pagebuilder/api/...` 或 `/pagebuilder/assets/...`
- **AND** 浏览器 SHALL NOT 请求 CMS 根路径 `/api/...` 来访问 PageBuilder 资源

#### Scenario: 验证 CMS 同步导出返回 ZIP
- **WHEN** CMS mock 或验证脚本调用 `POST /pagebuilder/api/integrations/cms/projects/<projectId>/export`
- **THEN** PageBuilder SHALL 在容器内返回 `application/zip`
- **AND** ZIP body SHALL 包含 `index.html`

### Requirement: Docker 部署文档必须包含 CMS 集成生产前检查项
系统 SHALL 在 Docker 部署文档或等效部署说明中列出 CMS 集成上线前必须检查的反代、Cookie、日志和资源边界要求。

#### Scenario: 文档说明同源反代和 prefix 剥离规则
- **WHEN** 操作者阅读 Docker CMS 集成部署说明
- **THEN** 文档 SHALL 明确浏览器公开路径、API 请求和 workspace preview 均位于 `${AI_PAGE_BUILDER_PUBLIC_ORIGIN}${AI_PAGE_BUILDER_BASE_PATH}` 下
- **AND** 文档 SHALL 明确 CMS/Nginx/PageBuilder Web 之间只能由一层剥离 public base path

#### Scenario: 文档说明关键 header 透传要求
- **WHEN** 操作者阅读 Docker CMS 集成部署说明
- **THEN** 文档 SHALL 要求反向代理保留 `Authorization`、`X-CMS-Cookie`、`Host` 或等效 forwarded host，以及受控的 `X-Forwarded-Proto`

#### Scenario: 文档说明 Cookie 与 iframe 响应头要求
- **WHEN** 操作者阅读 Docker CMS 集成部署说明
- **THEN** 文档 SHALL 说明 access cookie Path、HTTP/HTTPS Secure 判定、`frame-ancestors 'self'` 和不得设置 `X-Frame-Options: DENY` 的要求

#### Scenario: 文档说明生产日志和资源边界风险
- **WHEN** 操作者阅读 Docker CMS 集成部署说明
- **THEN** 文档 SHALL 把 handoffId 可能进入 access log、同源脚本信任、公共前端资产与 workspace preview 资产边界列为生产前检查项
- **AND** 文档 SHALL 明确第一期不做全局日志脱敏专项重构
