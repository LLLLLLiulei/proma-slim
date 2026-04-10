## Why

当前 `page-builder` 的可用形态仍以本地开发启动为主，缺少一套面向部署的容器化入口，导致前端、后端、Agent 运行时与持久化目录需要手工拼装。现在需要把已经落地的 `build/` 目录下 Docker 部署资产正式收敛为一套可归档的 OpenSpec 变更，让操作者可以直接在 `build/` 下执行 `docker compose up`，并在宿主机保留 page builder 的工作区与配置状态。

## What Changes

- 新增位于 `build/` 目录下的 `docker compose` 部署方案，能够从仓库根构建并同时启动 `web` 与 `server` 两个服务。
- 新增容器构建与运行约定，使 `page-builder` 前端构建产物通过 Bun 生产服务器对外提供，并将 `/api` 请求同源转发到内部 `server` 服务。
- 新增 Docker 可见命名约定，统一使用 `ai-page-builder`、`server`、`web` 与 `AI_PAGE_BUILDER_*` 外部环境变量名，避免继续暴露 `proma` 字样。
- 新增运行时持久化约定，将容器内配置与工作区根目录绑定到宿主机 `~/.ai-page-builder`，避免项目、导出文件、CMS 配置和会话数据在容器重建后丢失。
- 明确容器化运行所需的关键环境变量与依赖边界，包括 Bun 运行、Git、Agent 所需密钥注入，以及 `web -> server` 的网络关系。

## Capabilities

### New Capabilities
- `page-builder-docker-deployment`: 定义 `page-builder` 在 `docker compose` 下的前后端启动方式、`build/` 目录内部署资产布局、同源访问入口、Bun 运行约束与 `~/.ai-page-builder` 持久化挂载要求

### Modified Capabilities
- None.

## Impact

- Affected code:
  - `build/docker-compose.yml`
  - `build/Dockerfile.page-builder-app`
  - `build/Dockerfile.page-builder-web`
  - `build/.env.example`
  - `apps/page-builder/src/server/prod-server.ts`
  - `apps/page-builder/src/server/prod-server.test.ts`
  - 仓库根 `.dockerignore`
- Affected systems:
  - Bun 运行时
  - `~/.ai-page-builder` 宿主持久化目录
  - Agent 运行环境与密钥配置
- Dependencies:
  - Docker / Docker Compose
  - Bun 基础镜像
