# PageBuilder MCP Server

`pagebuilder-mcp-server` is an independent MCP server package for AI Page Builder. It provides visual analysis, OCR, UI comparison, video analysis, and image generation tools through both stdio and Streamable HTTP transports.

This package is intentionally not wired into the PageBuilder agent runtime yet. It can be built, tested, and deployed as a standalone service.

## Tools

- `ui_to_artifact`
- `extract_text_from_screenshot`
- `diagnose_error_screenshot`
- `understand_technical_diagram`
- `analyze_data_visualization`
- `ui_diff_check`
- `analyze_image`
- `analyze_video`
- `generate_image`

## Local Usage

Install dependencies from the repository root:

```bash
bun install
```

Run tests:

```bash
bun run --filter='@ai-page-builder/pagebuilder-mcp-server' test
```

Start stdio MCP mode:

```bash
bun run --filter='@ai-page-builder/pagebuilder-mcp-server' start
```

Start HTTP MCP mode:

```bash
PAGEBUILDER_MCP_PORT=3000 \
bun run --filter='@ai-page-builder/pagebuilder-mcp-server' start:http
```

HTTP mode exposes:

- `GET /healthz`
- `POST /mcp`
- `GET /mcp`
- `DELETE /mcp`

`/mcp` uses the MCP SDK Streamable HTTP transport. Initialization responses include an `mcp-session-id` header, and clients must pass that header on subsequent session requests.

## Runtime Configuration

PageBuilder MCP runtime variables:

```env
PAGEBUILDER_MCP_HOST=0.0.0.0
PAGEBUILDER_MCP_PORT=3000
PAGEBUILDER_MCP_PATH=/mcp
PAGEBUILDER_MCP_LOG_PATH=
SERVER_NAME=pagebuilder-mcp-server
SERVER_VERSION=0.1.0
```

Provider variables remain compatible with the migrated service implementation:

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

`Z_AI_*` variables are provider compatibility variables for ZHIPU/ZAI-compatible APIs. They are not the PageBuilder MCP service name.

## Docker

Build the standalone image from the repository root:

```bash
docker buildx build \
  --platform linux/amd64 \
  --load \
  -f build/Dockerfile.pagebuilder-mcp-server \
  -t pagebuilder-mcp-server:latest \
  .
```

Run with compose:

```bash
docker compose \
  --env-file build/.env.pagebuilder-mcp-server.example \
  -f build/docker-compose.pagebuilder-mcp-server.yml \
  up -d --build
```

Check health:

```bash
curl http://localhost:3000/healthz
```

Do not expose this service directly to the public internet unless a later change adds authentication and deployment hardening.
