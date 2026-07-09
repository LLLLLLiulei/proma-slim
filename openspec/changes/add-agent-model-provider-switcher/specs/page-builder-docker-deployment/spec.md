## ADDED Requirements

### Requirement: Docker 部署必须支持 Agent 模型提供商配置文件
系统 SHALL 允许 PageBuilder Docker 部署通过外部挂载的 JSONC 配置文件声明多家 Anthropic-compatible 模型提供商及其模型列表，并保持标准 JSON 文件兼容；部署资产 SHALL 提供配置文件路径环境变量示例，并 SHALL NOT 要求将真实模型密钥写入版本库中的 compose 或 env example 文件。

#### Scenario: compose 声明模型配置文件路径环境变量
- **WHEN** 操作者查看 PageBuilder Docker compose 资产中的 `server` 服务环境变量定义
- **THEN** 系统 SHALL 提供 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE` 配置入口
- **AND** 该入口 SHALL 允许指向容器内挂载的模型提供商 JSONC 配置文件

#### Scenario: 默认、release 与 CMS verify compose 均声明模型配置入口
- **WHEN** 操作者查看 `build/docker-compose.yml`、`build/docker-compose.release.yml` 或 `build/docker-compose.cms-verify.yml`
- **THEN** 每个 compose 文件中的 `server.environment` SHALL 显式声明 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE`
- **AND** 系统 SHALL NOT 通过 `server.env_file` 注入整份模型配置环境

#### Scenario: env 示例说明模型配置文件用法
- **WHEN** 操作者查看 `build/.env.standalone.example` 或 `build/.env.cms.example`
- **THEN** 系统 SHALL 说明 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE` 可用于启用多 provider/多模型选择
- **AND** 示例 SHALL NOT 包含真实模型 API Key

#### Scenario: 真实模型配置文件通过外部挂载提供
- **WHEN** 操作者需要在 Docker 部署中使用直接写入 `apiKey` 或 `authToken` 的模型提供商 JSONC
- **THEN** 系统 SHALL 支持通过 volume 或等效方式把该 JSONC 文件挂载到 `server` 容器
- **AND** compose 模板 SHALL NOT 把真实 JSON 内容内联到版本库文件中

#### Scenario: 未配置模型文件时 Docker 部署保持旧默认模型行为
- **WHEN** Docker 部署未设置 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE`
- **THEN** `server` 容器 SHALL 继续使用现有 Agent SDK env 白名单配置默认模型
- **AND** 系统 SHALL 保持旧 `AI_PAGE_BUILDER_ANTHROPIC_*` fallback 兼容

#### Scenario: 启动脚本避免宿主模型配置路径覆盖 env 文件
- **WHEN** 操作者使用内置 PageBuilder Docker 启动脚本并通过 `--env-file` 指定 env 文件
- **AND** 宿主机 shell 中存在同名 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE`
- **THEN** 启动脚本 SHALL 在调用 compose 前清理该宿主机同名变量
- **AND** compose 变量替换 SHALL 使用 env 文件中的模型配置文件路径

## MODIFIED Requirements

### Requirement: Docker env 示例必须说明 Agent SDK 官方变量配置方式
系统 SHALL 在 PageBuilder Docker env 示例和部署文档中说明本期支持的 Agent SDK 官方环境变量，并给出 DeepSeek Anthropic-compatible provider 的配置示例；示例 MUST 说明旧 `AI_PAGE_BUILDER_ANTHROPIC_*` 变量仅作为兼容 fallback。系统还 SHALL 说明多 provider/多模型场景应优先通过 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE` 指向外部 JSONC 配置文件，且真实 provider `apiKey` / `authToken` 不得写入版本库中的 env example 或 compose 模板。

#### Scenario: standalone env 示例包含 Agent SDK env 说明
- **WHEN** 操作者查看 `build/.env.standalone.example`
- **THEN** 系统 SHALL 展示可配置的 Agent SDK env 白名单
- **AND** 系统 SHALL 说明 `ANTHROPIC_AUTH_TOKEN` 可作为 API key 之外的凭证方式
- **AND** 系统 SHALL 说明多模型部署可使用 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE`

#### Scenario: CMS env 示例包含 Agent SDK env 说明
- **WHEN** 操作者查看 `build/.env.cms.example`
- **THEN** 系统 SHALL 展示可配置的 Agent SDK env 白名单
- **AND** 系统 SHALL 说明官方 `ANTHROPIC_*` 变量优先于旧 `AI_PAGE_BUILDER_ANTHROPIC_*` fallback
- **AND** 系统 SHALL 说明 CMS 集成部署同样可通过外部模型提供商 JSONC 启用模型切换

#### Scenario: 部署文档包含 DeepSeek 示例
- **WHEN** 操作者查看 PageBuilder Docker 部署说明
- **THEN** 文档 SHALL 提供包含 `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`、`ANTHROPIC_AUTH_TOKEN`、模型别名、subagent model、effort、auto compact、非必要流量禁用与 API timeout 的示例
- **AND** 文档 SHALL 说明该单 provider 示例可继续作为服务默认模型配置使用

#### Scenario: 部署文档包含多 provider JSONC 示例
- **WHEN** 操作者查看 PageBuilder Docker 部署说明
- **THEN** 文档 SHALL 提供 provider 内嵌 `models` 的模型提供商 JSONC 示例
- **AND** 文档 SHALL 说明 `apiKey` / `authToken` 可以直接写入外部 JSONC 文件或通过 env 引用
- **AND** 文档 SHALL 明确真实 JSONC 配置文件应通过外部挂载提供并避免提交到版本库
