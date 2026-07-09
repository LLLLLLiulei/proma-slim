## 0. 开发工作区准备

- [x] 0.1 apply 本 change 前，在 `/Users/liu/Documents/work/learning/ai-page-builder-worktree/` 下创建独立子文件夹，并基于当前代码新建独立开发分支作为 git worktree；后续实现、测试和验证均在该 worktree 中完成，不直接在当前分支开发。

## 1. 配置模型与解析

- [x] 1.1 在共享类型中补充 Agent 模型提供商配置、公开模型选项响应、已解析模型选择和 `AgentSendInput.modelOptionId` 等类型，并保持现有 `modelId` 兼容。
- [x] 1.2 新增后端模型提供商配置解析模块，支持读取 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE`、JSONC 注释和尾随逗号、provider 内嵌 `models`、稳定生成 `${provider.id}.${model.id}` 格式的 `modelOptionId`。
- [x] 1.3 实现 provider/model ID 校验，要求 ID 仅使用字母、数字、下划线或短横线，并拒绝或跳过包含点号、斜杠、空白或路径片段的配置项。
- [x] 1.4 实现凭证解析优先级：直接 `apiKey` / `authToken` 优先于 `apiKeyEnv` / `authTokenEnv`，并在凭证缺失时将 provider 标记为不可用。
- [x] 1.5 实现 `baseUrl` 可用性规则：官方 Anthropic provider 可省略 `baseUrl`，非官方 Anthropic-compatible provider 缺少 `baseUrl` 时不可用。
- [x] 1.6 实现无配置文件时的服务默认模型 fallback，继续复用现有 `ANTHROPIC_*` / `AI_PAGE_BUILDER_ANTHROPIC_*` 环境变量语义。
- [x] 1.7 实现 `defaultModelOptionId` 失效时回退到第一个可用模型选项，并记录脱敏诊断日志。
- [x] 1.8 为配置解析补充单元测试，覆盖 provider/model ID 唯一性和字符集、直接密钥、环境变量密钥、直接密钥优先、baseUrl 规则、不可用 provider 过滤、默认选项回退和服务默认 fallback。
- [x] 1.9 支持 provider/model 级 `enabled: false` 禁用开关，未配置时默认启用，并补充禁用过滤与默认模型回退测试。
- [x] 1.10 支持模型提供商配置文件使用 JSONC 语法，标准 JSON 兼容，并补充注释、尾随逗号和 URL 字符串解析测试。

## 2. 模型选项 API

- [x] 2.1 新增 `GET /api/agent/model-options` 后端路由，返回 `defaultModelOptionId` 和按 provider 分组的公开模型选项。
- [x] 2.2 确保模型选项 API 响应不包含 `baseUrl`、`apiKey`、`authToken`、Authorization header 或密钥环境变量实际值。
- [x] 2.3 在前端 API client 中新增模型选项获取方法，并补充请求路径、响应解析和错误处理测试。
- [x] 2.4 为模型选项路由补充测试，覆盖正常配置、无配置文件默认选项、不可用 provider 不返回、敏感信息不泄露。
- [x] 2.5 调整 `/api/status` 判断逻辑，当模型提供商 JSONC 中存在至少一个可用模型选项时，将 Agent 凭证状态视为可发送，并保持响应不暴露模型配置敏感信息。
- [x] 2.6 为 `/api/status` 补充测试，覆盖仅配置 JSON provider 密钥时前端不被禁用、无 env 且无可用 provider 时仍提示未配置、状态响应不泄露密钥或 `baseUrl`。

## 3. Agent 发送链路

- [x] 3.1 扩展 `/api/sessions/:sessionId/send` 请求解析，接受可选 `modelOptionId` 并在调用 Agent SDK 前完成后端校验。
- [x] 3.2 对未知、禁用或配置不完整的 `modelOptionId` 返回用户可理解的 400/503 错误，并确保不发起 Agent SDK query。
- [x] 3.3 将已解析的 provider/model 选择从 HTTP 层传递到 `AgentService`、`AgentOrchestrator` 和 `ClaudeAgentAdapter`。
- [x] 3.4 在 adapter query 输入类型边界中显式承载请求级 SDK `env` 和 SDK `model`，避免依赖隐式类型转换或全局状态表达当前 provider。
- [x] 3.5 在 Adapter 发起 SDK query 时透传请求级 `env` 和 SDK `model`，并保留 SDK `model_resolved` 事件作为助手消息持久化模型来源。
- [x] 3.6 移除或收敛长时间运行期间对全局 `process.env` 的 provider 覆盖，确保并发请求不会互相串 `baseUrl`、凭证或模型；如 SDK 辅助逻辑必须读全局 env，只允许同步短临界区覆盖并立即恢复。
- [x] 3.7 确保自动 compact、重放原始用户消息、retry 和 auto-resume 沿用同一轮最初解析出的 `modelOptionId`、SDK `env` 和 SDK `model`。
- [x] 3.8 为发送链路补充测试，覆盖有效模型透传、未知模型拒绝、配置不完整拒绝、compact/retry/auto-resume 继承模型选择、并发不同 provider 不串配置。

## 4. PageBuilder 前端模型选择

- [x] 4.1 在 PageBuilder 构建页加载模型选项，并只在 PageBuilder 对话区启用模型选择器，避免影响未显式启用的通用 `AgentView` 使用场景。
- [x] 4.2 在对话输入框底部增加模型下拉入口，按 provider 分组展示模型 label、provider label 和必要的上下文窗口提示。
- [x] 4.3 将当前选择保存到浏览器 localStorage；当本地保存的 `modelOptionId` 不在后端返回列表中时，回退到 `defaultModelOptionId`。
- [x] 4.4 发送普通消息、PageBuilder 自动首轮初始化消息和 `programmaticSendRequest` 程序化消息时携带当前有效 `modelOptionId`，且前端请求不得携带 provider 密钥、`baseUrl` 或鉴权头。
- [x] 4.5 确保存在待自动发送消息时先完成模型选项加载和有效选择解析，再触发 initial/programmatic send；加载失败时使用服务默认语义或展示可理解错误。
- [x] 4.6 在流式生成期间保持当前 turn 使用启动时模型，并通过 UI 文案避免用户误以为下拉切换会热切当前生成。
- [x] 4.7 为前端补充测试，覆盖模型选项加载、localStorage 恢复与失效回退、下拉切换、发送 payload、自动首轮消息、程序化发送和流式期间提示。

## 5. 部署配置与文档

- [x] 5.1 更新 `build/docker-compose.yml`、`build/docker-compose.release.yml` 和 `build/docker-compose.cms-verify.yml` 的 `server.environment`，显式透传 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE`。
- [x] 5.2 更新 Docker 启动脚本和相关 env 透传逻辑，支持 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE` 指向容器内挂载的模型提供商 JSONC，并避免宿主机同名变量覆盖 `--env-file`。
- [x] 5.3 更新 `build/.env.standalone.example` 和 `build/.env.cms.example`，说明单 provider 官方 Agent SDK env、旧 `AI_PAGE_BUILDER_ANTHROPIC_*` fallback、多 provider 配置文件入口，并避免包含真实密钥。
- [x] 5.4 更新 PageBuilder Docker 部署文档，补充 DeepSeek Anthropic-compatible 单 provider 示例和 provider 内嵌 `models` 的多 provider JSONC 示例。
- [x] 5.5 补充 Docker 资产测试，校验 compose/env 示例包含模型配置文件入口、启动脚本清理宿主同名变量、保留旧默认模型兼容、不会内联真实 provider JSON 或 API key。

## 6. 安全与诊断

- [x] 6.1 统一模型配置和发送链路日志字段，只记录 `providerId`、`modelOptionId`、模型名、配置来源摘要等非敏感信息。
- [x] 6.2 对模型配置错误、上游鉴权失败和 SDK query 异常的用户可见错误做脱敏处理，禁止输出密钥、Authorization header、密钥环境变量实际值或完整 provider `baseUrl`。
- [x] 6.3 补充密钥不外泄测试，覆盖模型选项 API、错误响应、后端日志和诊断输出。

## 7. 验证

- [x] 7.1 运行模型配置、模型选项 API、Agent 发送链路、Adapter、PageBuilder 前端和 Docker 资产相关聚焦测试。
- [x] 7.2 运行 `bun run typecheck`，修复新增类型、共享类型导出和前后端调用边界问题。
- [x] 7.3 手动验证无模型配置文件的旧默认模型部署仍可发送消息，并验证多 provider JSONC 配置下切换模型后下一次发送立即生效。
- [x] 7.4 手动验证两个会话同时选择不同 provider/model 发送时不会串模型配置，且刷新页面后模型选择按浏览器 localStorage 恢复或回退默认值。
