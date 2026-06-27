## Why

当前 PageBuilder/Proma 的 Agent SDK 运行时只显式支持 `ANTHROPIC_API_KEY` 与 `ANTHROPIC_BASE_URL`，并会过滤其他 `ANTHROPIC_*` 变量，导致用户无法通过 `.env.local` 或 Docker env 示例配置官方 Claude Code / Agent SDK 支持的模型、认证 token、compact、timeout 等运行参数。

需要支持 DeepSeek、MiniMax 等 Anthropic-compatible provider 时，用户应能直接按 Agent SDK 官方环境变量名配置运行时，而不需要修改代码或依赖用户级 `~/.claude/settings.json`。

## What Changes

- 后端 SHALL 从进程环境变量中收集受控白名单内的 Agent SDK env，并传入 `@anthropic-ai/claude-agent-sdk` 的 `query({ options.env })`。
- 后端 SHALL 支持 `ANTHROPIC_AUTH_TOKEN` 与 `ANTHROPIC_API_KEY` 任一凭证方式；存在 `ANTHROPIC_AUTH_TOKEN` 时不再强制要求 API key。
- 后端 SHALL 支持本期确认的 Agent SDK env 白名单：
  - `ANTHROPIC_BASE_URL`
  - `ANTHROPIC_AUTH_TOKEN`
  - `ANTHROPIC_API_KEY`
  - `ANTHROPIC_MODEL`
  - `ANTHROPIC_DEFAULT_OPUS_MODEL`
  - `ANTHROPIC_DEFAULT_SONNET_MODEL`
  - `ANTHROPIC_DEFAULT_HAIKU_MODEL`
  - `CLAUDE_CODE_SUBAGENT_MODEL`
  - `CLAUDE_CODE_EFFORT_LEVEL`
  - `CLAUDE_CODE_AUTO_COMPACT_WINDOW`
  - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
  - `API_TIMEOUT_MS`
- 后端 SHALL 保留 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY` 与 `AI_PAGE_BUILDER_ANTHROPIC_BASE_URL` 作为旧配置 fallback，但官方 `ANTHROPIC_*` 变量优先。
- 本地开发启动时 SHALL 让根目录 `.env.local` 中的受支持 Agent SDK env 和旧兼容变量覆盖宿主机同名变量，避免 shell 全局配置污染 PageBuilder。
- Docker compose 资产 SHALL 不使用 `env_file`，而是在 `server.environment` 中显式声明上述 Agent SDK env，并保持旧 `AI_PAGE_BUILDER_ANTHROPIC_*` fallback。
- Docker 启动脚本 SHALL 在调用 compose 前清理宿主机同名 Agent SDK env 和旧兼容变量，确保 `--env-file` 指定文件中的配置优先生效。
- 示例 env 与部署文档 SHALL 展示 DeepSeek 这类 Anthropic-compatible provider 的官方 Agent SDK env 配置方式。
- 不放开 user 级 `~/.claude/settings.json`，继续保持 SDK 配置隔离。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversation`: Agent 对话运行时的凭证检测与 SDK env 注入能力从仅 API key/base URL 扩展为受控 Agent SDK env 白名单。
- `page-builder-docker-deployment`: Docker 部署资产需要显式把受支持的 Agent SDK env 注入 `server` 容器，并在示例中说明官方变量与旧变量的兼容关系。

## Impact

- 影响后端 Agent SDK env 解析与注入链路：`apps/app/src/main/lib/agent-runtime-env.ts`、`apps/app/src/main/lib/agent-orchestrator.ts`、相关测试。
- 影响 Docker 部署资产：`build/docker-compose.yml`、`build/docker-compose.release.yml`、必要时包括 `build/docker-compose.cms-verify.yml`。
- 影响配置示例与说明：`.env.local` 参考内容、`build/.env.standalone.example`、`build/.env.cms.example`、`build/README.md`、`README.md`。
- 不改变前端 API，不改变用户级 Claude settings 加载策略，不引入 `env_file`。
