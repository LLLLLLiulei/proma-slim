## MODIFIED Requirements

### Requirement: API Key 配置
系统 SHALL 从环境变量解析 Agent SDK 凭证，无需 UI 配置；系统 MUST 支持 `ANTHROPIC_API_KEY` 与 `ANTHROPIC_AUTH_TOKEN` 任一凭证方式，并 MUST 保留 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY` 作为旧配置 fallback。

#### Scenario: 官方 API key 环境变量已设置
- **WHEN** 后端启动时 `process.env.ANTHROPIC_API_KEY` 存在
- **THEN** 系统 SHALL 使用该 Key 进行 SDK 调用

#### Scenario: 官方 auth token 环境变量已设置
- **WHEN** 后端启动时 `process.env.ANTHROPIC_AUTH_TOKEN` 存在，且 `process.env.ANTHROPIC_API_KEY` 不存在
- **THEN** 系统 SHALL 视为 Agent SDK 凭证已配置并允许发送消息
- **AND** 系统 SHALL 将 `ANTHROPIC_AUTH_TOKEN` 传入 Agent SDK 运行时环境

#### Scenario: 旧 PageBuilder API key fallback 已设置
- **WHEN** 后端启动时 `process.env.ANTHROPIC_API_KEY` 不存在，且 `process.env.AI_PAGE_BUILDER_ANTHROPIC_API_KEY` 存在
- **THEN** 系统 SHALL 将该旧变量值映射为 Agent SDK 运行时环境中的 `ANTHROPIC_API_KEY`
- **AND** 系统 SHALL 允许发送消息以保持既有部署兼容

#### Scenario: Agent SDK 凭证环境变量未设置
- **WHEN** 后端启动时 `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN` 与 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY` 均未设置
- **THEN** 系统 SHALL 在前端显示 Agent SDK 凭证配置提示，阻止发送消息

## ADDED Requirements

### Requirement: Agent SDK 运行时必须支持受控环境变量白名单
系统 SHALL 从进程环境变量中收集受支持的 Agent SDK env，并将其传入 `@anthropic-ai/claude-agent-sdk` 查询选项；系统 MUST 仅透传本期明确支持的 Agent SDK env 白名单，而不是无约束透传所有 `ANTHROPIC_*` 或 `CLAUDE_CODE_*` 变量。

受支持白名单 MUST 包含：`ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL`、`ANTHROPIC_DEFAULT_OPUS_MODEL`、`ANTHROPIC_DEFAULT_SONNET_MODEL`、`ANTHROPIC_DEFAULT_HAIKU_MODEL`、`CLAUDE_CODE_SUBAGENT_MODEL`、`CLAUDE_CODE_EFFORT_LEVEL`、`CLAUDE_CODE_AUTO_COMPACT_WINDOW`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 与 `API_TIMEOUT_MS`。

#### Scenario: 白名单 Agent SDK env 被传入 SDK
- **WHEN** 后端进程环境变量中配置了 `ANTHROPIC_MODEL`、`ANTHROPIC_DEFAULT_SONNET_MODEL`、`CLAUDE_CODE_SUBAGENT_MODEL`、`CLAUDE_CODE_EFFORT_LEVEL`、`CLAUDE_CODE_AUTO_COMPACT_WINDOW`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 或 `API_TIMEOUT_MS`
- **THEN** 系统 SHALL 将这些非空变量传入 Agent SDK 查询环境

#### Scenario: 官方 base URL 优先于旧 PageBuilder base URL
- **WHEN** 后端进程环境变量同时配置了 `ANTHROPIC_BASE_URL` 与 `AI_PAGE_BUILDER_ANTHROPIC_BASE_URL`
- **THEN** 系统 SHALL 使用 `ANTHROPIC_BASE_URL` 作为 Agent SDK 运行时环境中的 base URL

#### Scenario: 旧 PageBuilder base URL fallback 被保留
- **WHEN** 后端进程环境变量未配置 `ANTHROPIC_BASE_URL`，但配置了 `AI_PAGE_BUILDER_ANTHROPIC_BASE_URL`
- **THEN** 系统 SHALL 将旧变量值映射为 Agent SDK 运行时环境中的 `ANTHROPIC_BASE_URL`

#### Scenario: 未列入白名单的 Anthropic 变量不透传
- **WHEN** 后端进程环境变量中存在未列入白名单的 `ANTHROPIC_*` 变量
- **THEN** 系统 SHALL NOT 将该变量传入 Agent SDK 查询环境

#### Scenario: 本地开发 env 文件覆盖宿主机 Agent SDK 同名变量
- **WHEN** 操作者通过开发脚本启动 PageBuilder，且根目录 `.env.local` 中配置了受支持的 Agent SDK env 或旧 `AI_PAGE_BUILDER_ANTHROPIC_*` 兼容变量
- **AND** 宿主机 shell 中存在同名 Agent SDK 环境变量
- **THEN** 后端开发服务 SHALL 使用 `.env.local` 中的对应值覆盖宿主机同名值
- **AND** 系统 SHALL NOT 因该覆盖逻辑修改 CMS、端口、路径、代理或其他非 Agent SDK 白名单变量

#### Scenario: 用户级 Claude settings 继续隔离
- **WHEN** 系统调用 Claude Agent SDK 发起查询
- **THEN** 系统 SHALL 继续限制 SDK settings source 为 project 级来源
- **AND** 系统 SHALL NOT 因支持环境变量文件而加载用户级 `~/.claude/settings.json`
