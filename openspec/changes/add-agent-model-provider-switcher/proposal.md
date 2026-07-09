## Why

PageBuilder 当前 Agent 对话只能依赖服务端默认 Agent SDK 模型，无法在同一部署中面向不同任务、成本和上下文窗口需求切换多家 Anthropic-compatible / Claude Code compatible 提供商下的多个模型。随着 PageBuilder 作为底层服务部署并服务多个项目，需要在不暴露密钥、不串并发 provider 配置的前提下，让用户在对话输入区选择模型并让下一次发送立即生效。

## What Changes

- 新增 Agent 模型提供商配置能力：支持通过 JSONC 配置文件声明多家 Anthropic-compatible provider（标准 JSON 仍兼容），每个 provider 内配置 baseUrl、apiKey/authToken、默认别名模型、subagent 模型以及可选模型列表。
- 新增安全的模型选项列表 API：前端只能获取 provider/model 展示字段和稳定 `modelOptionId`，不得获取 baseUrl、apiKey、authToken 等敏感信息。
- 在 PageBuilder 对话输入框底部增加模型下拉入口，按 provider 分组展示模型；切换后保存到浏览器本地偏好，并在下一次发送消息时通过 `modelOptionId` 生效。
- 修改 Agent 发送链路：允许请求携带后端定义的 `modelOptionId`，后端校验该选项存在且配置完整后，为本次 Agent SDK query 构造对应 provider 的运行时 env 与 SDK `model` 参数。
- 调整 Agent 状态判断：当模型提供商 JSONC 中存在可用 provider/model 时，即使未配置全局 `ANTHROPIC_API_KEY`，PageBuilder 对话输入也不应被状态接口误禁用。
- 保持现有单 provider 默认部署兼容：未配置模型提供商 JSONC 时，继续使用现有 `ANTHROPIC_*` / `AI_PAGE_BUILDER_ANTHROPIC_*` 环境变量作为服务默认模型。
- 明确并发隔离要求：多用户或多会话同时选择不同 provider/model 时，系统不得依赖全局 `process.env` 表示“当前 provider”，也不得让一个请求的 provider 凭证覆盖另一个请求。
- 更新 Docker/env 示例与部署文档，说明模型提供商 JSONC 配置文件、可选内联密钥、环境变量引用方式以及敏感配置提交边界。

## Capabilities

### New Capabilities

- `agent-model-provider-switcher`: 定义 Anthropic-compatible 多 provider/多模型配置、模型选项列表 API、PageBuilder 输入区模型选择、请求校验、密钥不暴露和 per-request provider/model 生效语义。

### Modified Capabilities

- `agent-conversation`: 将“只能使用 SDK 默认模型且不提供前端模型切换”修改为“可由已校验的模型选项为单次 Agent query 指定 provider/model，同时保持默认模型兼容”。
- `page-builder-docker-deployment`: 增加模型提供商配置文件与相关环境变量的 Docker 部署约定，并保持现有 Agent SDK env 白名单与旧变量 fallback 兼容。

## Impact

- 实施约束：apply 本 change 时必须先在 `/Users/liu/Documents/work/learning/ai-page-builder-worktree/` 下创建独立子文件夹，并基于当前代码新建独立开发分支作为 git worktree；不得直接在当前分支继续开发该 change。
- 影响共享类型：`AgentSendInput` / Agent 模型选项返回类型需要表达 `modelOptionId`、provider 展示信息和模型展示信息。
- 影响后端 Agent runtime：需要新增模型 provider 配置解析与校验逻辑，并在 `AgentOrchestrator` / `ClaudeAgentAdapter` 中按请求透传 provider env 与 SDK `model`。
- 影响 HTTP API：新增模型选项列表接口，调整 `/api/status` 的可发送状态判断，并扩展 `/api/sessions/:sessionId/send` 的请求体校验与错误处理。
- 影响前端 PageBuilder 对话：`AgentView` 输入框底部需要展示模型选择器，手动发送、自动首轮发送和程序化发送 payload 时都携带当前选择。
- 影响部署资产：`build/.env.*.example`、compose/启动脚本和部署文档需要说明模型提供商 JSONC 配置文件、密钥配置方式和不可提交真实密钥的边界。
- 影响测试：需要覆盖配置解析、密钥隐藏、未知模型拒绝、per-request provider env、SDK `model` 透传、UI 下拉与发送 payload、默认配置兼容、Docker 示例配置。
