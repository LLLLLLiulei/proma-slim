## Context

当前仓库的生产形态默认围绕 `@proma/app` 组织：后端通过 Bun HTTP 服务提供 `/api/*` 与 SSE，生产态静态文件回退仅服务 `apps/app/dist`。`page-builder` 虽然已经具备独立的 Vite 构建产物与完整前端工作台，但目前只在开发态通过 `5174 -> 3000` 的 `/api` 代理方式运行，缺少可直接交付的容器化部署入口。

这次变更的目标不是为整个主应用建立通用容器化方案，而是为 `page-builder` 提供一个最小闭环部署形态：用户只需要准备密钥、进入 `build/` 目录执行 `docker compose up`，即可得到一个可访问的 page builder 前端，以及与之配套的 Bun 后端、Agent 运行时和宿主机 `~/.ai-page-builder` 持久化目录。

设计还需要尊重几个现有约束：

- `apps/page-builder` 的生产构建产物是独立的，且 `base: '/'`，路由按站点根路径解析。
- `@proma/app` 当前静态资源服务只面向 `apps/app/dist`，不应为了本次部署把 page builder 强行并入同一个生产静态入口。
- 当前 Docker 资产已被移动到 `build/`，同时要求操作者能够在该目录内直接执行构建与启动命令，而不再把 compose 资产放回仓库根目录。
- 本地状态、工作区、导出文件、CMS 配置、SDK 隔离配置等均依赖 `PROMA_CONFIG_DIR` / `homedir()` 最终解析出的配置根目录，但 Docker 对外可见命名已经切换为 `AI_PAGE_BUILDER_*` 和 `~/.ai-page-builder`。
- Agent 运行时会检测 Node / Bun / Git，但执行器选择逻辑已经支持“优先 Node、缺失时退回 Bun”的路径，因此容器方案不必把 Node 视为默认必需运行时。

## Goals / Non-Goals

**Goals:**

- 提供一个可直接在 `build/` 目录内运行的 `docker compose` 部署方案，同时覆盖 page builder 前端与 `@proma/app` 后端。
- 保持 page builder 对外访问入口与 `/api` 请求同源，避免前端部署后再额外改写接口地址或 CORS 策略。
- 明确宿主机 `~/.ai-page-builder` 到容器内配置目录的挂载约定，保证容器重建后项目、工作区和导出结果不丢失。
- 以 Bun 作为默认构建与运行时，尽量复用现有包脚本和运行方式，避免引入新的服务端栈。
- 统一 Docker 可见命名为 `ai-page-builder` / `server` / `web` / `AI_PAGE_BUILDER_*`，避免继续暴露旧的 `proma` 命名。
- 将部署变更限制在部署资产、轻量运行脚本和必要的容器约定内，不扩大为主应用整体架构重构。

**Non-Goals:**

- 不为 `apps/app` 的通用主应用首页、通用聊天入口或整仓所有前端提供统一容器化入口。
- 不支持将 page builder 部署到带子路径前缀的 URL，例如 `/builder-app/`。
- 不在本次设计中引入 Kubernetes、Ingress、TLS 终结或多副本扩缩容。
- 不改变现有本地开发流程；`bun run dev:page-builder` 与本地直跑仍然保留。
- 不把 Docker Compose 方案扩展为 Windows 容器或多平台镜像矩阵设计。

## Decisions

### 1. 使用双服务 `docker compose` 拓扑，并固定 Docker 可见命名

部署方案采用两个服务：

- `server`: 运行 `@proma/app`，负责 API、SSE、Agent、工作区、预览文件读写与导出任务
- `web`: 负责对外暴露 page builder 前端，并将 `/api/*` 转发到 `server`

Compose 项目名固定为 `ai-page-builder`，镜像名固定为 `ai-page-builder-server` 与 `ai-page-builder-web`，容器名固定为 `server` 与 `web`。

选择这一拓扑的原因：

- `apps/page-builder` 已经是独立前端产物，继续保持独立部署边界最贴合现有代码结构。
- `@proma/app` 的生产静态资源处理当前只面向 `apps/app/dist`，若强行让其同时服务 page builder，会引入新的静态资源分发分支和根路径冲突。
- Compose 原生支持多服务编排、启动顺序和网络互联，比分一个容器里同时拉起两个进程更易观察和维护。
- 固定 Docker 对外命名后，部署说明、目录命名和用户操作路径都更稳定，也避免在容器层继续暴露历史 `proma` 字样。

备选方案对比：

- 单服务直接扩展 `@proma/app` 静态资源服务：被拒绝，因为会把部署需求升级为应用层路由重构。
- 单容器双进程：被拒绝，因为前端静态服务和后端 API 生命周期耦合，日志、健康检查与故障定位都更差。

### 2. `web` 使用 Bun `prod-server.ts` 实现轻量静态托管与反向代理

`web` 服务采用 Bun 运行 `apps/page-builder/src/server/prod-server.ts`，其职责仅包括：

- 提供 `apps/page-builder/dist` 静态文件
- 对非静态命中的页面路由返回 page builder 的 `index.html`
- 将 `/api/*` 请求与流式响应透明转发到 `server:8888`

选择 Bun 的原因：

- 用户目标明确要求“使用 Bun 运行”。
- 前端与后端都落在 Bun 生态下，可以减少额外基础镜像、配置文件和维护面。
- 通过自有 Bun 服务实现 SPA 回退和 `/api` 代理，可以更精确地匹配 page builder 现有根路径、容器端口 `3333` 和流式交互需求。

备选方案对比：

- 使用 Nginx / Caddy 托管 page builder dist：可行，但与“使用 Bun 运行”的目标不一致，也会增加额外服务器配置心智负担。
- 直接依赖 Vite 作为生产服务：被拒绝，因为 Vite 生产态不是目标运行形态。

### 3. 仅由 `server` 服务挂载宿主机 `~/.ai-page-builder`，并显式固定容器内配置路径

持久化目录由 `server` 服务单独持有，并将宿主机 `${HOME}/.ai-page-builder` 映射到容器内固定路径 `/home/bun/.ai-page-builder`。Docker 对外暴露的环境变量采用：

- `AI_PAGE_BUILDER_CONFIG_DIR=/home/bun/.ai-page-builder`
- `AI_PAGE_BUILDER_SDK_HOME=/home/bun/.ai-page-builder/sdk-config`

容器启动命令在进程内再映射回应用当前仍使用的：

- `PROMA_CONFIG_DIR=/home/bun/.ai-page-builder`
- `PROMA_CLAUDE_HOME=/home/bun/.ai-page-builder/sdk-config`

这样做的原因：

- 真实持久化读写全部发生在 `@proma/app` 侧，包括工作区、导出文件、CMS 设置、对话索引和 SDK 隔离配置。
- `web` 只是静态文件服务与 API 代理，不应持有工作区状态目录。
- 通过固定 `PROMA_CONFIG_DIR` 可以消除容器用户 `homedir()` 差异，避免运行用户变化导致配置根目录实际落点漂移。
- 显式指定 `PROMA_CLAUDE_HOME` 可让与 SDK 相关的目录也收敛在同一持久化根下，避免容器内再散落到独立的 `~/.claude`。
- 保持应用代码不改动的前提下，通过 Docker 对外层使用 `AI_PAGE_BUILDER_*` 命名，可以满足容器可见命名去除 `proma` 的要求。

备选方案对比：

- 同时把同一 volume 挂到 `web`：被拒绝，因为该服务不需要直接访问这些状态文件。
- 仅依赖容器默认 `homedir()`，不设置 `PROMA_CONFIG_DIR`：被拒绝，因为不同基础镜像/用户下路径不稳定。

### 4. 部署资产放在 `build/` 下，但镜像仍从仓库根目录构建

部署入口文件固定放在 `build/` 下，包括 `docker-compose.yml`、两个 Dockerfile 与 `.env.example`。操作者应在 `build/` 目录内执行 `docker compose`，但镜像构建上下文仍使用仓库根目录 `..`。仓库只保留一份根目录 `.dockerignore`，以保证 `cd build && docker build -f Dockerfile... ..` 可直接工作。

原因如下：

- `apps/page-builder` 依赖 workspace 包 `@proma/shared`、`@proma/ui`，并且其 Vite alias 还直接引用 `../app/src/renderer`。
- `@proma/app` 与 `apps/page-builder` 都依赖根 `bun.lock` 与 workspace 解析，局部目录构建会破坏依赖解析。
- 共享基础安装层可以降低重复安装成本，避免两个镜像在锁文件不变时重复下载整套依赖。
- 把 Docker 资产集中到 `build/` 后，仓库根目录不再混入部署入口文件，但依然保留单一构建上下文。

备选方案对比：

- 分别以 `apps/app` 和 `apps/page-builder` 为独立 build context：被拒绝，因为不满足当前 workspace / alias 解析前提。
- 在单个镜像中同时承载前后端运行：被拒绝，因为仍会回到双进程耦合问题。

### 5. 运行时依赖基线采用 “server: Bun + Git，web: Bun”，不默认安装 Node.js

运行时依赖策略定为：

- `server` 运行镜像：Bun + Git
- `web` 运行镜像：Bun
- Node.js 不作为默认运行时依赖安装

原因如下：

- `@proma/app` 的正式启动脚本就是 `bun src/main/index.ts`，并不要求以 Node 作为主进程运行。
- Agent 运行时选择逻辑已支持在 Node 缺失时退回 Bun 执行，因此 Node 不构成当前部署硬门槛。
- Git 虽然不是启动时强制校验门槛，但在工作区与 Agent 运行场景中更接近实际必备依赖，因此纳入 `server` 镜像基线。
- 当前 `server` 镜像仍以源码运行 `bun run start`，因此运行层保留 workspace 依赖与 `node_modules`；本次变更只固定“不额外安装 Node.js”的部署契约，不把后端运行时收紧为单文件 bundle。
- 保持运行镜像更轻，有利于缩短构建与分发时间；如果后续验证发现某些 SDK 场景必须依赖 Node，再补装 Node 也不会改变本次部署契约。

备选方案对比：

- `server` 运行镜像中额外安装 Node：可行，但当前不是必要条件，会增加镜像体积和维护成本。
- 完全不安装 Git：被拒绝，因为会增大 Agent / 工作区相关边缘场景的不确定性。

### 6. 对外只暴露 page builder Web 入口，后端保留为内部服务

Compose 默认只将 `web` 端口映射到宿主机 `3333:3333`，`server` 保持容器内网访问，不直接对外暴露。

这样做的原因：

- 最终用户只需要 page builder 入口，不需要直接访问 `@proma/app` 的独立页面。
- page builder Web 层既提供静态页面又代理 `/api`，天然适合作为唯一对外入口。
- 降低误访问 `server` 根路径时返回非 page builder 界面的概率，也减少端口暴露面。

备选方案对比：

- 同时对外暴露 `server:8888`：可行，但会暴露不需要的入口并增加用户理解成本。

## Risks / Trade-offs

- [Risk] page builder 当前按根路径 `/` 部署设计，若放在子路径前缀下会出现路由与静态资源路径错误。  
  → Mitigation: 第一版明确约束只能部署在站点根路径，并在 compose / 文档中固化这一前提。

- [Risk] `web` 服务需要代理 `/api` 下的流式响应，若实现不正确会破坏 SSE 或长连接交互。  
  → Mitigation: 生产 Web 服务必须采用流式透传实现，不在代理层做缓冲或聚合。

- [Risk] Bun-only 运行时可能在少数 Agent SDK 边界场景下暴露与 Node 不同的问题。  
  → Mitigation: 设计上保持 Node 可后续增补的余地，并将第一版 smoke test 聚焦在 page builder 核心闭环上。

- [Risk] 宿主机 `~/.ai-page-builder` 挂载与容器用户目录不一致时，容易导致状态落盘路径漂移。  
  → Mitigation: 通过 `AI_PAGE_BUILDER_CONFIG_DIR` 到 `PROMA_CONFIG_DIR` 的显式映射和固定容器内挂载路径消除对默认 `homedir()` 的依赖。

- [Risk] Compose 文件需要承载敏感环境变量，若处理不当容易把密钥写入仓库。  
  → Mitigation: 使用 `build/.env` / `build/.env.example` 约定，敏感值不进入版本库。

- [Risk] 两个镜像共享 root workspace 依赖，构建链路相对单应用镜像更复杂。  
  → Mitigation: 通过共享依赖安装阶段减少重复，并将构建上下文统一为仓库根目录。

## Migration Plan

1. 新增 page builder 部署资产，包括：
   - `build/docker-compose.yml`
   - `build/Dockerfile.page-builder-app`
   - `build/Dockerfile.page-builder-web`
   - `build/.env.example`
   - page builder 生产 Web 服务所需的 Bun 启动脚本
2. 通过仓库根构建上下文分别产出两个镜像，并在 `build/docker-compose.yml` 中声明 `server` / `web` 依赖关系与网络关系。
3. 将宿主机 `${HOME}/.ai-page-builder` 挂载到 `server` 服务的固定路径，并通过 Docker 可见 `AI_PAGE_BUILDER_*` 环境变量将运行时指向该目录。
4. 使用 `cd build && docker compose up -d` 启动服务后，通过 `http://127.0.0.1:3333/` 访问首页，并验证 `/api/status`、项目创建、会话发送与预览刷新链路。
5. 回滚时执行 `cd build && docker compose down` 即可停止容器；宿主机 `~/.ai-page-builder` 保留不动，因此可以无损退回本地运行模式或后续镜像版本。

本次变更不涉及数据结构迁移。已有本地 `~/.ai-page-builder` 可直接复用；若历史数据仍停留在 `~/.proma`，则需要由操作者自行迁移到新的目录名。

## Open Questions

当前没有阻塞本次第一版实现的产品问题。第一版默认采用：

- page builder 作为唯一对外入口
- 根路径部署
- `web -> server` 的同源代理拓扑
- `server` 镜像默认不安装 Node.js

如果后续需要支持子路径部署、统一主应用入口或更保守的 Node 运行时基线，可作为后续独立变更处理。
