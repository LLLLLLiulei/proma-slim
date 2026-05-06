# page-builder-docker-deployment Specification

## Purpose
定义 `page-builder` 的 Docker Compose 部署约定，包括 `build/` 目录内部署资产、`web` / `server` 双服务拓扑、同源 API 入口、Bun 运行基线，以及宿主机 `~/.ai-page-builder` 持久化要求。
## Requirements
### Requirement: Docker Compose 部署必须提供 page builder 的前后端双服务闭环
系统 SHALL 提供一套面向 `page-builder` 的 `docker compose` 部署资产，使页面构建前端与 `@ai-page-builder/app` 后端能够作为两个协作服务一起启动，而不是要求操作者手工分别拼装多个本地命令。

#### Scenario: 部署资产位于 `build/` 并支持在该目录内直接执行
- **WHEN** 操作者进入仓库内的 `build/` 目录并执行默认的 `docker compose` 命令
- **THEN** 系统 SHALL 能够使用 `build/docker-compose.yml` 与 `build/` 下的 Dockerfile 直接完成构建与启动
- **AND** 系统 SHALL 继续以仓库根目录作为镜像构建上下文

#### Scenario: 默认 compose 启动 page builder 所需的两个服务
- **WHEN** 操作者基于仓库提供的 page builder 部署资产执行默认的 `docker compose up`
- **THEN** 系统 SHALL 启动名为 `web` 的服务用于提供 page builder Web 入口
- **AND** 系统 SHALL 启动名为 `server` 的服务用于提供 API、SSE、Agent 与工作区能力

#### Scenario: 默认 compose 仅要求访问 page builder 对外入口
- **WHEN** 操作者使用默认 compose 配置启动 page builder 部署
- **THEN** 系统 SHALL 提供单一的 page builder 对外访问入口
- **AND** 系统 SHALL NOT 要求用户直接访问 `@ai-page-builder/app` 的独立宿主机端口才能使用 page builder

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

### Requirement: compose 资产必须提供可选的内部 Playwright MCP sidecar
系统 SHALL 在 `page-builder` compose 资产中定义一个供 `server` 通过内部网络访问的可选 `playwright` sidecar，用于在 Docker 环境下承载 Playwright MCP HTTP 服务，而不是要求 `server` 在自身容器内本地拉起 Playwright MCP 进程。

#### Scenario: 操作者启用 playwright profile 时启动 sidecar
- **WHEN** 操作者基于仓库提供的 compose 资产并显式启用 `playwright` profile 执行 `docker compose up`
- **THEN** 系统 SHALL 启动名为 `playwright` 的服务作为内部 Playwright MCP 提供方
- **AND** `server` SHALL 能够通过 compose 内部网络访问该服务的 MCP HTTP 端点

#### Scenario: 操作者未启用 playwright profile 时不强制部署 sidecar
- **WHEN** 操作者基于仓库提供的 compose 资产执行 `docker compose up` 且未启用 `playwright` profile
- **THEN** 系统 SHALL 继续允许 `server` 与 `web` 组成基础部署运行
- **AND** 系统 SHALL NOT 要求默认 compose 必须启动 `playwright` 服务

#### Scenario: Playwright sidecar 不作为独立对外入口暴露
- **WHEN** 操作者使用默认 compose 配置部署 page builder
- **THEN** 系统 SHALL NOT 要求用户直接访问 Playwright sidecar 的独立宿主机入口
- **AND** 浏览器侧对外访问入口 SHALL 继续仅为 `web` 服务

#### Scenario: Playwright sidecar 使用 page-builder 专属 Docker 可见命名
- **WHEN** 操作者查看默认 compose 部署资产中的浏览器自动化 sidecar 定义
- **THEN** 系统 SHALL 使用 `playwright` 作为该 sidecar 的服务名称
- **AND** 系统 SHALL NOT 在该 sidecar 的 Docker 可见命名中继续暴露 legacy `proma` 字样

### Requirement: Docker 部署必须声明 Playwright sidecar 与内部预览 origin 的运行时输入
系统 SHALL 为 `server` 提供可外部覆盖的 Docker 运行时输入，用于解析 Playwright sidecar MCP 地址与 page-builder 预览的内部访问 origin，而不是把这些容器网络地址写入工作区持久化配置。

#### Scenario: compose 为 server 声明 Docker 运行时标记
- **WHEN** 操作者查看 compose 资产中的 `server` 环境变量定义
- **THEN** 系统 SHALL 为 `server` 声明一个内部 Docker 运行时标记
- **AND** 该标记 SHALL 让应用层能够区分“Docker 中未部署 sidecar”和“本地非 Docker 运行”

#### Scenario: sidecar 输入默认留空，启用时再配置 Playwright MCP 地址
- **WHEN** 操作者查看 compose 资产与 `.env` 模板中的可配置运行参数
- **THEN** 系统 SHALL 为 `server` 声明 `AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL` 这一运行时输入
- **AND** 该输入在未启用 sidecar 时 SHALL 默认为空
- **AND** 在启用 sidecar 时 SHALL 可配置为指向 compose 内部 `playwright` 服务的 MCP HTTP 端点

#### Scenario: sidecar 输入默认留空，启用时再配置内部预览 origin
- **WHEN** 操作者查看 compose 资产与 `.env` 模板中的可配置运行参数
- **THEN** 系统 SHALL 为 `server` 声明 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` 这一运行时输入
- **AND** 该输入在未启用 sidecar 时 SHALL 默认为空
- **AND** 在启用 sidecar 时 SHALL 可配置为指向 compose 内部用于访问工作区预览路由的 `server` HTTP origin

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
系统 SHALL 允许默认部署将 page builder 所依赖的工作区、会话、导出文件、CMS 配置与运行时设置持久化到宿主机 `~/.ai-page-builder`，而不是仅保存在容器的临时文件系统中。

#### Scenario: server 服务在固定容器路径下使用挂载后的配置目录
- **WHEN** 默认 compose 部署启动 `server` 服务
- **THEN** 系统 SHALL 将宿主机 `~/.ai-page-builder` 绑定到容器内固定路径 `/home/bun/.ai-page-builder`
- **AND** `server` SHALL 使用该固定路径作为运行时配置与工作区根目录

#### Scenario: 使用同一宿主机配置目录重建容器后保留项目状态
- **WHEN** 操作者停止并重新创建容器，且继续使用同一个宿主机 `~/.ai-page-builder`
- **THEN** 系统 SHALL 保留已有的 page builder 项目、工作区、会话记录、导出结果与 CMS 配置
- **AND** 系统 SHALL NOT 因容器重建而将这些状态重置为全新环境

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
