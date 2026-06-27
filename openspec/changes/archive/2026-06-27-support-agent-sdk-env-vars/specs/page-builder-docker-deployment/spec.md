## ADDED Requirements

### Requirement: Docker server 环境必须显式声明 Agent SDK env 白名单
系统 SHALL 在 PageBuilder Docker 部署资产的 `server.environment` 中显式声明本期支持的 Agent SDK env 白名单，使操作者可通过 compose `--env-file` 对应的 env 文件配置这些变量并注入 `server` 容器；系统 SHALL NOT 为该能力新增 `env_file` 注入方式。

受支持白名单 MUST 包含：`ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL`、`ANTHROPIC_DEFAULT_OPUS_MODEL`、`ANTHROPIC_DEFAULT_SONNET_MODEL`、`ANTHROPIC_DEFAULT_HAIKU_MODEL`、`CLAUDE_CODE_SUBAGENT_MODEL`、`CLAUDE_CODE_EFFORT_LEVEL`、`CLAUDE_CODE_AUTO_COMPACT_WINDOW`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 与 `API_TIMEOUT_MS`。

#### Scenario: 默认 compose 显式传入 Agent SDK env
- **WHEN** 操作者查看 `build/docker-compose.yml` 中的 `server` 服务环境变量定义
- **THEN** 系统 SHALL 显式声明本期支持的 Agent SDK env 白名单
- **AND** 系统 SHALL 保持 `server` 容器可从 compose env 文件读取这些变量

#### Scenario: release compose 显式传入 Agent SDK env
- **WHEN** 操作者查看 `build/docker-compose.release.yml` 中的 `server` 服务环境变量定义
- **THEN** 系统 SHALL 显式声明本期支持的 Agent SDK env 白名单
- **AND** 系统 SHALL 保持 release 部署与默认 compose 的 Agent SDK env 配置语义一致

#### Scenario: Docker 不使用 env_file 注入 server 配置
- **WHEN** 操作者查看 PageBuilder Docker compose 资产
- **THEN** 系统 SHALL NOT 通过 `server.env_file` 将整个 env 文件注入容器
- **AND** 系统 SHALL 继续通过 `server.environment` 维护明确的容器环境变量边界

#### Scenario: Docker 启动脚本避免宿主机 Agent SDK env 覆盖 env 文件
- **WHEN** 操作者使用内置 PageBuilder Docker 启动脚本并通过 `--env-file` 指定 env 文件
- **AND** 宿主机 shell 中存在同名 `ANTHROPIC_*`、受支持 `CLAUDE_CODE_*`、`API_TIMEOUT_MS` 或旧 `AI_PAGE_BUILDER_ANTHROPIC_*` 变量
- **THEN** 启动脚本 SHALL 在调用 compose 前清理这些宿主机同名变量
- **AND** compose 变量替换 SHALL 使用 env 文件中的 Agent SDK 配置值

#### Scenario: Docker 保留旧 PageBuilder Agent 变量兼容入口
- **WHEN** 操作者仅在 Docker env 文件中配置 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY` 或 `AI_PAGE_BUILDER_ANTHROPIC_BASE_URL`
- **THEN** `server` 容器 SHALL 仍能读取这些旧变量
- **AND** 应用层 SHALL 能将其作为 `ANTHROPIC_API_KEY` 或 `ANTHROPIC_BASE_URL` 的 fallback

#### Scenario: Docker 不再强制要求旧 API key 变量
- **WHEN** 操作者在 Docker env 文件中配置 `ANTHROPIC_AUTH_TOKEN`，但未配置 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY`
- **THEN** compose 启动 SHALL NOT 因缺少 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY` 在变量展开阶段失败
- **AND** `server` 容器 SHALL 能启动并由应用层使用 `ANTHROPIC_AUTH_TOKEN` 作为 Agent SDK 凭证

### Requirement: Docker env 示例必须说明 Agent SDK 官方变量配置方式
系统 SHALL 在 PageBuilder Docker env 示例和部署文档中说明本期支持的 Agent SDK 官方环境变量，并给出 DeepSeek Anthropic-compatible provider 的配置示例；示例 MUST 说明旧 `AI_PAGE_BUILDER_ANTHROPIC_*` 变量仅作为兼容 fallback。

#### Scenario: standalone env 示例包含 Agent SDK env 说明
- **WHEN** 操作者查看 `build/.env.standalone.example`
- **THEN** 系统 SHALL 展示可配置的 Agent SDK env 白名单
- **AND** 系统 SHALL 说明 `ANTHROPIC_AUTH_TOKEN` 可作为 API key 之外的凭证方式

#### Scenario: CMS env 示例包含 Agent SDK env 说明
- **WHEN** 操作者查看 `build/.env.cms.example`
- **THEN** 系统 SHALL 展示可配置的 Agent SDK env 白名单
- **AND** 系统 SHALL 说明官方 `ANTHROPIC_*` 变量优先于旧 `AI_PAGE_BUILDER_ANTHROPIC_*` fallback

#### Scenario: 部署文档包含 DeepSeek 示例
- **WHEN** 操作者查看 PageBuilder Docker 部署说明
- **THEN** 文档 SHALL 提供包含 `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`、`ANTHROPIC_AUTH_TOKEN`、模型别名、subagent model、effort、auto compact、非必要流量禁用与 API timeout 的示例
