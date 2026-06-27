## Context

`bun dev:page-builder` 通过根目录 `.env.local` 将变量加载进后端进程；Docker 启动也通过 `--env-file` 让 compose 能读取变量。但 Bun `--env-file` 和 Docker Compose 变量替换都会受到宿主机同名环境变量影响，宿主 shell 中已有的 `ANTHROPIC_*` 可能覆盖 env 文件中的配置。当前后端在构建 Agent SDK env 时也会过滤所有继承来的 `ANTHROPIC_*`，并只重新注入 `ANTHROPIC_API_KEY` 与 `ANTHROPIC_BASE_URL`，因此官方 Agent SDK env 中的 `ANTHROPIC_AUTH_TOKEN`、模型别名、subagent model、effort、auto compact 和 timeout 等配置无法按环境变量文件稳定生效。

当前 `ClaudeAgentAdapter` 通过 `settingSources: ['project']` 保持 SDK 配置隔离，不读取用户级 `~/.claude/settings.json`。本次变更应继续保持该隔离策略，只扩展应用自身从环境变量文件注入 SDK env 的能力。

## Goals / Non-Goals

**Goals:**

- 允许用户在 `.env.local`、`build/.env.standalone.example` 或 `build/.env.cms.example` 对应的实际 env 文件中直接配置本期确认的 Agent SDK 官方 env。
- 支持 `ANTHROPIC_AUTH_TOKEN` 与 `ANTHROPIC_API_KEY` 两种凭证方式，任一存在即可发起 Agent 会话。
- 保留旧 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY` 与 `AI_PAGE_BUILDER_ANTHROPIC_BASE_URL` 兼容入口。
- 本地开发时，根目录 `.env.local` 中的 Agent SDK 白名单变量和旧兼容变量优先于宿主机同名变量。
- Docker 不使用 `env_file`，继续在 `server.environment` 中显式声明需要注入容器的变量。
- Docker 启动脚本在调用 compose 前清理宿主机 Agent SDK 同名变量，使 `--env-file` 的取值优先生效。
- 保持用户级 Claude settings 隔离，避免本机 `~/.claude/settings.json` 污染 PageBuilder 运行时。

**Non-Goals:**

- 不支持任意环境变量无约束透传给 Agent SDK。
- 不引入新的 JSON settings 配置体系。
- 不改变前端模型选择 UI；模型仍由 Agent SDK env 或 SDK 默认行为决定。
- 不改变工作区 `CLAUDE.md`、MCP 配置和权限策略。

## Decisions

### 1. 使用固定白名单收集 Agent SDK env

新增或扩展 `agent-runtime-env.ts`，提供受控的 Agent SDK env 解析函数。该函数从 `process.env` 收集以下白名单变量：

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

理由：用户明确要求“先支持如下 Agent SDK env”，固定白名单比 `env_file` 或泛化透传更可控，也能避免把未知 `ANTHROPIC_*`、`CLAUDE_CODE_*` 或其他进程变量误送给 SDK。

备选方案：透传全部 `ANTHROPIC_*` 与 `CLAUDE_CODE_*`。放弃原因是安全边界更宽，且 Docker 不使用 `env_file` 后仍需要 compose 侧显式声明变量。

### 2. 官方变量优先，旧 PageBuilder 变量作为 fallback

解析顺序为：

- `ANTHROPIC_API_KEY` 优先；缺失时用 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY` 写入 SDK env 的 `ANTHROPIC_API_KEY`。
- `ANTHROPIC_BASE_URL` 优先；缺失时用 `AI_PAGE_BUILDER_ANTHROPIC_BASE_URL` 写入 SDK env 的 `ANTHROPIC_BASE_URL`。
- `ANTHROPIC_AUTH_TOKEN` 不做旧变量 fallback，按官方变量名配置。

理由：新方案鼓励直接使用官方 Agent SDK env，同时不破坏现有 Docker 与本地配置。

### 3. 凭证检测从 API key 改为 SDK credential

后端发送前的凭证判断改为：存在非空 `ANTHROPIC_API_KEY` 或非空 `ANTHROPIC_AUTH_TOKEN` 即视为已配置凭证。若只有旧 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY`，解析层会映射为 `ANTHROPIC_API_KEY`，同样视为有效。

理由：DeepSeek 等 provider 可能要求通过 bearer token 方式接入；继续强制 API key 会让 `ANTHROPIC_AUTH_TOKEN` 无法独立工作。

### 4. SDK env 构建继续隔离未知 Anthropic/Claude 变量

`buildSdkEnv()` 继续避免从宿主 shell 继承未知 `ANTHROPIC_*`。为了让白名单更明确，也应避免从基础 `cleanEnv` 隐式继承未知 `CLAUDE_CODE_*` 与 `API_TIMEOUT_MS`，再将解析出的白名单 env 显式合并进 `sdkEnv`。

系统内部强制变量仍由应用控制，包括：

- `CLAUDE_CONFIG_DIR`
- Windows 下的 `CLAUDE_CODE_SHELL`
- Windows 下的 `CLAUDE_BASH_NO_LOGIN`
- 现有内部默认 `CLAUDE_CODE_MAX_OUTPUT_TOKENS`
- 现有内部默认 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`
- 现有内部默认 `CLAUDE_CODE_ENABLE_TASKS`

理由：既支持用户配置的 SDK env，又不放弃当前隔离用户级 Claude 配置和运行时平台适配的安全边界。

### 5. process.env 同步保持与 options.env 一致

当前代码会将凭证同步到全局 `process.env`，以覆盖 SDK in-process 读取路径。本次变更应将解析后的白名单 Agent SDK env 同步到 `process.env`，并清理同名旧值，确保 `options.env` 与 SDK 直接读取 `process.env` 时看到的一致。

理由：当前实现已经存在全局同步行为；只改 `options.env` 可能出现 SDK 内部代码读取不到新凭证或模型变量的情况。

### 6. Docker 不使用 env_file，改为显式 environment 白名单

`build/docker-compose.yml` 与 `build/docker-compose.release.yml` 的 `server.environment` 显式声明本期支持的 Agent SDK env，以及旧 `AI_PAGE_BUILDER_ANTHROPIC_*` 兼容变量。不要新增 `env_file`。

推荐 compose 形态为同时传入官方变量和旧变量，由应用层负责优先级：

```yaml
ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
ANTHROPIC_AUTH_TOKEN: ${ANTHROPIC_AUTH_TOKEN:-}
ANTHROPIC_BASE_URL: ${ANTHROPIC_BASE_URL:-}
AI_PAGE_BUILDER_ANTHROPIC_API_KEY: ${AI_PAGE_BUILDER_ANTHROPIC_API_KEY:-}
AI_PAGE_BUILDER_ANTHROPIC_BASE_URL: ${AI_PAGE_BUILDER_ANTHROPIC_BASE_URL:-}
```

理由：避免 compose 变量嵌套和必填 API key 约束阻断 `ANTHROPIC_AUTH_TOKEN` 场景，也避免 env 文件中所有变量无差别进入 server 容器。

### 7. Env 文件优先于宿主机 Agent SDK 变量

本地开发启动器在 `NODE_ENV=development` 时向上查找根目录 `.env.local`，只解析并覆盖本期 Agent SDK env 白名单和旧 `AI_PAGE_BUILDER_ANTHROPIC_*` 兼容变量。CMS、端口、路径、代理等普通运行变量不参与覆盖，继续遵循现有环境变量语义。

Docker 侧不改变 compose 文件结构，不引入 `env_file`。内置 `build/start-page-builder.sh` 在调用 `docker compose --env-file ...` 前使用 `env -u` 清理本期支持的 Agent SDK env 和旧兼容变量，避免宿主 shell 中同名变量在 compose 变量替换阶段覆盖 env 文件。

理由：用户希望 env 文件成为 Agent SDK 配置来源，同时仍保留显式 `server.environment` 边界；只覆盖受控白名单可避免误伤 `PATH`、`HOME`、代理、端口和 CMS 配置。

## Risks / Trade-offs

- [Risk] 同步 `process.env` 仍是全局副作用，多个并发 Agent turn 使用不同 env 时可能互相影响。→ 本次配置来源仍是进程级环境变量，不支持 per-session provider；保持现有进程级语义并补充测试。
- [Risk] 放开 `ANTHROPIC_AUTH_TOKEN` 后错误提示若仍只提 API key 会误导用户。→ 更新缺凭证提示和友好错误文案，统一使用“Agent SDK 凭证”。
- [Risk] Docker 不使用 `env_file` 意味着以后新增 Agent SDK env 仍需修改 compose。→ 本次按用户确认的固定白名单实现，换取更明确的容器环境边界。
- [Risk] 手写 `docker compose --env-file ...` 命令仍可能被宿主机同名变量覆盖。→ 内置启动脚本自动清理白名单变量，文档提醒直接运行 compose 时需手动 unset 或使用脚本。
- [Risk] `CLAUDE_CODE_*` 变量中有些可能影响 SDK 行为稳定性。→ 只支持本期明确列出的变量，系统内部变量继续由应用覆盖。

## Migration Plan

1. 更新 env 解析与 SDK env 构建逻辑，保留旧 `AI_PAGE_BUILDER_ANTHROPIC_*` fallback。
2. 更新 Docker compose 与 release compose，移除对 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY` 的强制必填映射，显式声明 Agent SDK env 白名单。
3. 更新 `.env` 示例与部署文档，展示 DeepSeek 示例和旧变量兼容说明。
4. 调整本地开发启动器和 Docker 启动脚本，避免宿主机 Agent SDK 同名变量覆盖 env 文件。
5. 补充单元测试覆盖 auth token、模型 env、fallback 优先级、未知变量不透传和 env 文件优先级。
5. 回滚时可恢复旧 env 解析与 compose 映射；现有旧变量仍保留，回滚风险较低。

## Open Questions

无阻塞问题。本期按固定白名单实现，不使用 `env_file`，不引入配置文件方案。
