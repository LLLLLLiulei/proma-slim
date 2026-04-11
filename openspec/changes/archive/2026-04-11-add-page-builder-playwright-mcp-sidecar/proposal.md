## Why

当前 `page-builder` 的默认 `playwright` MCP 以工作区持久化的 `stdio + npx @playwright/mcp` 方式接入，但默认 Docker 部署中的 `server` 运行镜像以 Bun 为基线，未提供 Node.js / npm / npx 运行时。这使 page-builder 在 Docker 环境中的浏览器自动化能力与本地预览校验能力不稳定，而 Playwright 官方已经提供适合容器化长期运行的 MCP Docker 服务模式，应将其纳入默认部署约定。

同时，若 Playwright sidecar 与 `server` 不共享 page-builder 的运行时存储，截图等自动化产物只能停留在 sidecar 容器内部，`server` 与宿主机都无法稳定读取或后续处理。默认 Docker 部署需要一并约定这条文件可见性边界。

## What Changes

- 为 `page-builder` 的 Docker Compose 资产增加可选的 Playwright MCP sidecar profile，并通过内部容器网络供 `server` 使用。
- 为 Docker 部署约定补充 Playwright sidecar 的命名、镜像、环境变量、Docker 运行时标记、网络可见性、与 `server` 共享的运行时存储边界，保持浏览器侧仍只暴露 `web` 单一入口。
- 调整 page-builder 的工作区运行时 MCP 装配逻辑，使 Docker 环境中的 `playwright` 在 sidecar 启用时改由运行时提供的远程 HTTP MCP 端点生效，而在 sidecar 未部署时去除该 Docker runtime 注入，不改写工作区持久化 `mcp.json`。
- 保持现有 page-builder 工作区默认持久化 MCP 兼容非 Docker 场景，不将容器内地址永久写入用户工作区配置。
- 明确本次变更不处理 `server-sequential-thinking` 的 Docker 运行时补齐问题。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `page-builder-docker-deployment`: compose 资产需要支持 `web + server` 基础拓扑，并可通过可选 `playwright` profile 扩展为内部协作拓扑，同时补充对应的部署输入、共享存储契约与可见命名约定。
- `workspace-scoped-agent-runtime`: page-builder 查询在 Docker 环境下需要支持将持久化的 `playwright` MCP 运行时解析到外部 HTTP sidecar；当 sidecar 未部署时，需要去除该 Docker runtime 注入而不影响本地非 Docker 场景。

## Impact

- Docker 部署资产：`build/docker-compose.yml`、`build/.env.example`，以及 Playwright sidecar profile、Docker 运行时标记与 `server` 共享 page-builder 运行时目录的挂载契约。
- Agent 运行时装配：page-builder 工作区 MCP 解析、Docker 环境变量驱动的 runtime 覆盖逻辑，以及相关测试。
- 依赖与运行环境：默认部署将引入 Playwright 官方 MCP 容器镜像与相应的内部网络连接约束。
- 文档与规范：需要同步更新 `page-builder-docker-deployment` 与 `workspace-scoped-agent-runtime` 的 spec delta，明确 Docker sidecar、共享运行时存储与持久化 MCP 的边界。
