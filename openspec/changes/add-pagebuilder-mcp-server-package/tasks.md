## 1. Package 迁移与命名

- [x] 1.1 新建 `packages/pagebuilder-mcp-server` package 目录，迁移外部 MCP 服务当前工作树中的有效 `src/**`、`test/**` 和公开文档内容
- [x] 1.2 编写 `packages/pagebuilder-mcp-server/package.json`，使用 `@ai-page-builder/pagebuilder-mcp-server` 包名、`pagebuilder-mcp-server` bin、ESM 类型、必要 scripts 和依赖
- [x] 1.3 将 `packages/pagebuilder-mcp-server` 加入 root `package.json` workspace 列表，并刷新 `bun.lock`
- [x] 1.4 排除外部仓库 `.env`、`.git`、`node_modules`、隐藏工具配置、外部 openspec、独立 lockfile 和运行产物
- [x] 1.5 将 README、env 示例、默认 MCP server name、默认日志路径和当前状态文档中的服务产品名统一为 `pagebuilder-mcp-server`

## 2. MCP Server 入口改造

- [x] 2.1 抽离共享 server factory 和工具注册逻辑，确保 stdio 与 HTTP 入口共用同一份 tools 注册清单
- [x] 2.2 保留 stdio 入口 `src/index.js`，通过 `StdioServerTransport` 启动并保持 stdout 不被普通日志污染
- [x] 2.3 新增 HTTP 入口 `src/http.js`，通过 MCP SDK Streamable HTTP transport 暴露默认 `/mcp` endpoint
- [x] 2.4 新增 `/healthz` 健康检查 endpoint，返回可用于容器健康检查的成功响应
- [x] 2.5 支持 `PAGEBUILDER_MCP_HOST`、`PAGEBUILDER_MCP_PORT`、`PAGEBUILDER_MCP_PATH`、`PAGEBUILDER_MCP_LOG_PATH` 运行配置，并保留 provider 兼容环境变量

## 3. Docker 独立部署资产

- [x] 3.1 新增 `build/Dockerfile.pagebuilder-mcp-server`，以仓库根目录为 context 构建并运行 MCP server HTTP entry
- [x] 3.2 确保 Docker build 在镜像目标平台内安装依赖，不复制宿主机 `node_modules`，并保证 `sharp` native dependency 可用
- [x] 3.3 新增独立 compose 示例，包含 `pagebuilder-mcp-server` 服务、端口映射、环境变量映射和 healthcheck
- [x] 3.4 新增或补充不含真实密钥的 env 示例，说明 PageBuilder MCP runtime 变量和 provider 兼容变量
- [x] 3.5 确认本变更不向现有 PageBuilder 主 compose 强制新增 MCP server 服务

## 4. 测试与验证

- [x] 4.1 迁移并调整外部 MCP 服务测试，使其能在 monorepo package 内通过 `bun test` 或 package script 运行
- [x] 4.2 验证 stdio 入口能够启动并注册全部迁移 tools
- [x] 4.3 验证 HTTP `/healthz` 返回成功，HTTP `/mcp` 能完成 MCP initialize 或 tools/list 基本请求
- [x] 4.4 运行 `bun run typecheck` 或确认该 JavaScript package 不破坏现有 workspace 类型检查流程
- [x] 4.5 构建 PageBuilder MCP server Docker 镜像并验证容器启动后 `/healthz` 可访问
- [x] 4.6 检查 `apps/app`、`apps/page-builder`、默认 workspace MCP 配置生成和现有 PageBuilder Docker 主部署未被本变更接入或改写
