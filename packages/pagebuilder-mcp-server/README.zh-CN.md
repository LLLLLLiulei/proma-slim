# PageBuilder MCP Server

`pagebuilder-mcp-server` 是 AI Page Builder 的独立 MCP server package，提供视觉理解、OCR、UI 对比、视频分析和图片生成等工具能力，并同时支持 stdio 与 Streamable HTTP transport。

当前 package 只作为独立服务提供，不会自动接入 PageBuilder Agent runtime、默认 workspace MCP 配置或现有 PageBuilder Docker 主部署。

## 工具列表

- `ui_to_artifact`
- `extract_text_from_screenshot`
- `diagnose_error_screenshot`
- `understand_technical_diagram`
- `analyze_data_visualization`
- `ui_diff_check`
- `analyze_image`
- `analyze_video`
- `generate_image`

## 本地使用

在仓库根目录安装依赖：

```bash
bun install
```

运行测试：

```bash
bun run --filter='@ai-page-builder/pagebuilder-mcp-server' test
```

启动 stdio MCP 模式：

```bash
bun run --filter='@ai-page-builder/pagebuilder-mcp-server' start
```

启动 HTTP MCP 模式：

```bash
PAGEBUILDER_MCP_PORT=3000 \
bun run --filter='@ai-page-builder/pagebuilder-mcp-server' start:http
```

HTTP 模式提供：

- `GET /healthz`
- `POST /mcp`
- `GET /mcp`
- `DELETE /mcp`

`/mcp` 使用 MCP SDK Streamable HTTP transport。初始化响应会返回 `mcp-session-id` header，客户端后续会话请求需要继续携带该 header。

## 运行配置

PageBuilder MCP 运行变量：

```env
PAGEBUILDER_MCP_HOST=0.0.0.0
PAGEBUILDER_MCP_PORT=3000
PAGEBUILDER_MCP_PATH=/mcp
PAGEBUILDER_MCP_LOG_PATH=
SERVER_NAME=pagebuilder-mcp-server
SERVER_VERSION=0.1.0
```

模型供应商变量继续兼容迁移前实现：

```env
PLATFORM_MODE=ZHIPU
Z_AI_API_KEY=sk-your-zhipu-or-zai-key
Z_AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4/

ALIYUN_API_KEY=
QWEN_API_KEY=
DASHSCOPE_API_KEY=
ALIYUN_OPENAI_BASE_URL=
ALIYUN_DASHSCOPE_BASE_URL=
```

`Z_AI_*` 是 ZHIPU/ZAI 兼容接口的供应商配置变量，不代表当前服务产品名。

## Docker

从仓库根目录构建独立镜像：

```bash
docker buildx build \
  --platform linux/amd64 \
  --load \
  -f build/Dockerfile.pagebuilder-mcp-server \
  -t pagebuilder-mcp-server:latest \
  .
```

使用独立 compose 启动：

```bash
docker compose \
  --env-file build/.env.pagebuilder-mcp-server.example \
  -f build/docker-compose.pagebuilder-mcp-server.yml \
  up -d --build
```

健康检查：

```bash
curl http://localhost:3000/healthz
```

除非后续变更补齐鉴权和部署加固，否则不要把该服务直接暴露到公网。
