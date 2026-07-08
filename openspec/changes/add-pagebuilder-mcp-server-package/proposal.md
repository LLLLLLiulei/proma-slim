## Why

当前外部 MCP 服务仍独立于本仓库，且主要以 stdio transport 运行，无法作为 AI Page Builder 工程的一部分统一维护、测试、构建和通过 Docker 独立部署。将其迁移为 monorepo 内的独立 package，并补齐 HTTP MCP 服务入口，可以先形成可独立交付的基础能力，后续再通过单独变更接入 PageBuilder Agent 流程。

## What Changes

- 新增 `packages/pagebuilder-mcp-server` workspace package，迁移外部 MCP 服务的视觉理解、OCR、UI diff、视频分析和生图等工具能力。
- 将对外 package/bin/MCP server name、运行日志路径和文档中的服务产品名统一为 `pagebuilder-mcp-server`，不再使用 `zai-mcp-server` 作为服务命名。
- 保留 stdio MCP 入口用于本地或兼容场景，并新增 Streamable HTTP MCP 入口，默认提供 `/mcp` MCP endpoint 与 `/healthz` 健康检查。
- 新增独立 Dockerfile、独立 compose 示例和 env 示例，使 MCP server 能够不依赖 PageBuilder web/server 主部署而单独构建和运行。
- 暂不接入当前 PageBuilder Agent 编排、默认 workspace MCP 配置、skill 流程或现有 PageBuilder Docker 主 compose。

## Capabilities

### New Capabilities
- `pagebuilder-mcp-server`: 定义 monorepo 内独立 PageBuilder MCP server package 的命名、工具能力、stdio/HTTP 服务入口和运行配置。
- `pagebuilder-mcp-server-docker-deployment`: 定义 PageBuilder MCP server 的独立 Docker 构建、运行、健康检查和环境变量示例。

### Modified Capabilities
- `workspace-package-identity`: 新增 workspace package 必须使用 `@ai-page-builder/pagebuilder-mcp-server` 包名和 `pagebuilder-mcp-server` bin 命名。

## Impact

- 影响 root `package.json` workspace 列表与 `bun.lock`。
- 新增 `packages/pagebuilder-mcp-server/**` 源码、测试、README 和 env 示例。
- 新增 `build/Dockerfile.pagebuilder-mcp-server` 与独立 compose 示例。
- 暂不影响 `apps/app`、`apps/page-builder`、现有 PageBuilder Docker 主部署、Agent runtime MCP 注入和默认 workspace `mcp.json`。
