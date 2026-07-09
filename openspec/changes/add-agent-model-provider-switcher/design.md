## Context

当前 PageBuilder Agent 对话统一通过 `@anthropic-ai/claude-agent-sdk` 发起 query，并从进程环境变量解析单套 `ANTHROPIC_*` / `AI_PAGE_BUILDER_ANTHROPIC_*` 运行时配置。共享 `AgentView` 已经承载 PageBuilder 构建页对话，发送链路已有 `AgentSendInput.modelId` 与 `AgentQueryInput.model` 类型预留，但 HTTP、Orchestrator 与 Adapter 尚未把模型选择完整透传到 SDK。

本变更需要接入多家 Anthropic-compatible / Claude Code compatible 提供商的多个模型，并允许用户在 PageBuilder 对话输入框底部切换。所有提供商都可通过 Claude Agent SDK 兼容协议访问，因此本期不需要实现 OpenAI/Gemini 等原生协议 Adapter。关键约束是：密钥可以来自 JSONC 配置文件或环境变量，但绝不能返回给前端或写入日志；多用户并发请求选择不同 provider/model 时，不能因为全局 `process.env` 被覆盖而串 provider。

实施本 change 时不得直接在当前分支开发。apply 前必须在 `/Users/liu/Documents/work/learning/ai-page-builder-worktree/` 下创建独立子文件夹，并基于当前代码新建独立开发分支作为 git worktree；后续代码修改、测试和验证均在该 worktree 中进行。

## Goals / Non-Goals

**Goals:**

- 支持通过 JSONC 配置文件声明多家 Anthropic-compatible provider 及其模型列表，并兼容标准 JSON。
- 支持 provider 直接配置 `apiKey` / `authToken`，也支持通过 `apiKeyEnv` / `authTokenEnv` 引用环境变量。
- 提供只暴露展示信息的模型选项 API，让前端按 provider 分组展示模型。
- 在 PageBuilder 对话输入框底部提供模型切换入口，选择后对下一次发送立即生效。
- 让 `/api/sessions/:sessionId/send` 接受后端校验过的 `modelOptionId`，并按请求构造 Agent SDK env 与 SDK `model` 参数。
- 保留无模型配置文件时的旧单 provider 默认模型行为。
- 明确 per-request provider/model 运行时隔离，避免并发请求互相覆盖。

**Non-Goals:**

- 不实现原生 OpenAI、Gemini、Qwen、Zhipu 等非 Anthropic-compatible 协议 Adapter。
- 不提供前端管理 provider/baseUrl/apiKey 的配置 UI。
- 不在本期实现按 CMS 用户、租户或项目的服务端模型权限系统。
- 不要求正在流式生成的 turn 中途热切换模型；切换只影响下一次发送。
- 不实现 SDK `supportedModels()` 动态发现模型列表；模型列表来自 PageBuilder 配置。

## Decisions

### 1. 使用 provider 内嵌 models 的 JSONC 配置结构

模型配置文件由 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE` 指向。配置结构以 provider 为第一层，每个 provider 内声明自己的 `models`，而不是使用顶层 `models[] + providerId` 的范式结构。

示例结构：

```jsonc
{
  // 默认模型；如果该模型被禁用或不可用，会自动回退到第一个可用模型。
  "defaultModelOptionId": "zhipu.glm-5-2-1m",
  "providers": [
    {
      "id": "zhipu",
      "providerType": "zhipu",
      "label": "智谱",
      "runtime": "anthropic-compatible",
      "enabled": true,
      "baseUrl": "https://example.com/anthropic",
      "apiKey": "sk-xxx",
      "defaultOpusModel": "glm-5.2[1m]",
      "defaultSonnetModel": "glm-5.2[1m]",
      "defaultHaikuModel": "glm-4.7",
      "subagentModel": "glm-4.7",
      "models": [
        {
          "id": "glm-5-2-1m",
          "label": "GLM 5.2 1M",
          "model": "glm-5.2[1m]",
          "enabled": true,
          "contextWindow": 1000000
        }
      ]
    }
  ]
}
```

理由：配置文件主要面向部署和运维人员手写维护，provider 内嵌模型更直观，也天然匹配前端按 provider 分组展示。运行时解析后再构建扁平索引 `Map<modelOptionId, { provider, model }>` 以便快速校验。

provider 和 model 均支持可选 `enabled` 字段；仅当值严格为 `false` 时禁用，未配置时默认启用。禁用 provider 会过滤该 provider 下全部模型；禁用 model 只过滤单个模型。若 `defaultModelOptionId` 指向禁用项或其他不可用项，运行时回退到第一个可用模型选项并记录脱敏诊断。

模型配置文件使用 JSONC 解析，支持 `//` 单行注释、`/* ... */` 块注释和尾随逗号；标准 JSON 文件不需要修改即可继续使用。

替代方案：顶层 `providers[]` 和 `models[]` 分离。该方案更接近数据库范式，但当前没有独立模型管理 UI 或跨 provider 复用模型定义需求，会增加人工维护复杂度。

### 1.1 provider ID 与 baseUrl 规则

`provider.id` 和 `model.id` 必须使用稳定安全的 slug 字符集，建议仅允许字母、数字、下划线和短横线。`modelOptionId` 由后端生成，不从前端反解析为文件路径或 URL 片段，避免点号、斜杠、空白和路径穿越字符带来歧义。

`baseUrl` 的语义按 provider 类型区分：

- 官方 Anthropic provider 可省略 `baseUrl`，由 Agent SDK 使用默认 Anthropic API 地址。
- 非官方 Anthropic-compatible provider 必须配置 `baseUrl`，否则该 provider 视为配置不完整，不出现在模型选项列表中。

理由：现有单 provider env 部署允许不配置 `ANTHROPIC_BASE_URL` 使用 SDK 默认地址，多 provider JSONC 配置也需要支持官方 Anthropic；但 DeepSeek、智谱、MiniMax 等兼容 provider 若缺少 `baseUrl`，无法确定上游服务地址，必须视为不可用。

### 2. 前端只传 `modelOptionId`

前端模型下拉只使用后端返回的稳定 `modelOptionId`，格式由后端生成，建议为 `${provider.id}.${model.id}`。前端不得提交 provider baseUrl、apiKey、authToken 或真实 SDK env。

理由：后端掌握 provider 凭证和 allowlist，能拒绝未知模型、缺失凭证或被禁用的模型。前端提交裸 `model` 无法唯一表达 provider，也容易绕过部署侧允许列表。

### 3. API 返回展示数据，不返回运行时敏感数据

新增 `GET /api/agent/model-options` 返回 `defaultModelOptionId` 和 provider 分组的模型展示列表。响应允许包含 `providerId`、`providerType`、`providerLabel`、模型 label、真实上游模型名、contextWindow 等非敏感展示字段，但不得包含 `baseUrl`、`apiKey`、`authToken`、env key 对应值。

理由：前端需要展示模型来源和模型名，但不应具备调用上游模型的能力。

状态接口也必须兼容该配置模式。现有 `AgentView` 会根据 `/api/status` 的 `ok` 和 `apiKeyConfigured` 禁用输入框，因此当 JSONC 配置中存在至少一个可用 provider/model 时，即使没有全局 `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN` 或 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY`，`/api/status` 也应将 Agent 凭证状态视为可用。该状态响应仍只返回布尔能力和 SDK CLI 状态，不返回 provider 密钥、`baseUrl` 或配置文件敏感路径。

### 4. 每次发送按请求解析 provider runtime

`/api/sessions/:sessionId/send` 接收 `modelOptionId` 后，后端校验该选项存在、启用且 provider 配置完整。校验通过后，将本次请求解析为 `ResolvedAgentModelSelection`，包含：

- `modelOptionId`
- `providerId`
- `providerType`
- `model`
- `sdkEnv`

`sdkEnv` 基于 provider 配置生成：

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_API_KEY` 或 `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_DEFAULT_OPUS_MODEL`
- `ANTHROPIC_DEFAULT_SONNET_MODEL`
- `ANTHROPIC_DEFAULT_HAIKU_MODEL`
- `CLAUDE_CODE_SUBAGENT_MODEL`
- 继承仍被允许的通用 SDK env，如 effort、auto compact、API timeout 等

理由：主模型、别名模型和 subagent 模型必须属于同一 provider，避免主线程使用 provider A 而子任务或别名落到 provider B。

请求级 `sdkEnv` 和 SDK `model` 必须通过 adapter query 输入边界显式传递。共享 `AgentQueryInput` 或 Claude adapter 扩展输入需要一等表达本次请求的 `env` 与 `model`，实现不得依赖隐式类型转换或长时间修改全局 `process.env` 来代表当前 provider。

### 5. 避免用全局 `process.env` 表示当前 provider

现有代码会将 Agent SDK env 同步到全局 `process.env`，这在单 provider 下可接受，但多 provider 并发下会串配置。本期实现必须让 Agent SDK query 主路径依赖 per-request `env` 选项；对仍必须触碰 `process.env` 的 SDK 辅助操作，应使用最小作用域的临时覆盖并恢复，且不得跨异步长时间持有。

更保守的实现方向：

- `buildSdkEnv()` 接收本次请求已经解析好的 runtime env。
- `ClaudeAgentAdapter.query()` 将 `options.env` 传入 SDK options。
- `/compact` 自动恢复、retry 和 resume 查询沿用同一个 `modelOptionId` / `sdkEnv` / `model`。
- 不在流式 query 执行期间把 provider env 长期写入全局 `process.env`。

理由：PageBuilder 作为服务部署后可能有多个用户同时生成页面，provider env 必须请求隔离。

### 6. 本地选择保存到浏览器

模型选择保存到浏览器 localStorage，初始进入时从 `GET /api/agent/model-options` 的默认值或本地已保存值恢复。如果保存的 `modelOptionId` 已不在后端返回列表中，前端回退到后端默认值。

理由：当前缺少多用户服务端偏好模型；写入后端全局 settings 会导致不同用户互相影响。localStorage 能满足“切换后后续发送立即生效”和刷新保持选择。

PageBuilder 构建页存在多种发送入口：用户手动发送、`initialUserMessage` 自动首轮发送、CMS auto handoff 等 `programmaticSendRequest` 程序化发送。这些入口必须共用同一个“当前有效模型选择”。如果页面存在待自动发送消息，前端应先加载模型选项并解析出当前有效 `modelOptionId`，再触发自动发送，避免初始 turn 漏带用户选择的模型。

### 7. 保留服务默认模型兼容

未配置 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE` 时，系统继续使用现有 `ANTHROPIC_*` / `AI_PAGE_BUILDER_ANTHROPIC_*` 解析逻辑，并在模型选项 API 中返回一个服务默认选项。选择服务默认选项时，发送可不携带 `modelOptionId`，或携带保留 ID 后由后端解析为旧默认 runtime。

理由：已有部署不应因为增加模型切换功能而必须新增配置文件。

### 8. Docker 变量边界

Docker 部署继续通过 `server.environment` 显式声明可进入容器的配置边界，不引入 `server.env_file` 注入整份 env 文件。`AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE` 需要出现在默认 compose、release compose 和 CMS verify compose 的 `server.environment` 中。内置启动脚本在调用 compose 前也需要清理宿主机同名 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE`，让 `--env-file` 中的路径配置优先生效。

### 9. 独立 worktree 开发约束

本 change 的实现需要隔离在独立 git worktree 中完成。执行 apply 时应先在 `/Users/liu/Documents/work/learning/ai-page-builder-worktree/` 下创建一个与 change 名称对应的子目录，例如 `add-agent-model-provider-switcher/`，并基于当前代码创建独立开发分支，例如 `feature/add-agent-model-provider-switcher`。当前分支只保留 OpenSpec 文档准备工作，不直接承载该 change 的实现修改。

理由：该 change 涉及前后端、Agent runtime、Docker 资产和测试，改动范围较大；使用独立 worktree 可以避免污染当前分支，并便于与现有未提交或并行工作隔离。

## Risks / Trade-offs

- [Risk] SDK 内部在 query 执行期间仍读取全局 `process.env`，导致 per-request env 不完全隔离。 → Mitigation: 首选 SDK `env` 选项传值；审查并测试 adapter 捕获的 SDK options；必要时将必须读全局 env 的辅助调用限制为同步临界区或后续拆成子进程隔离。
- [Risk] JSONC 配置文件允许直接写 apiKey，误提交风险上升。 → Mitigation: 只提交 `.example`，文档明确真实配置文件必须外置挂载；日志和 API 响应必须脱敏；测试覆盖密钥不暴露。
- [Risk] provider 配置缺失或 defaultModelOptionId 指向禁用模型。 → Mitigation: 配置解析阶段返回可诊断错误；模型列表 API 可跳过不可用模型；发送时返回明确 400/503，而不是暴露上游错误。
- [Risk] 用户切换到小上下文模型后长会话更容易超上下文。 → Mitigation: 沿用现有上下文过长检测和 `/compact` 自动恢复；模型选项可展示 contextWindow 作为提示。
- [Risk] 共享 `AgentView` 同时用于主应用 Agent 与 PageBuilder。 → Mitigation: 模型选择器通过 prop 或产品入口控制，第一期只在 PageBuilder 构建页启用；如选择共享启用，需要同步补齐主应用测试。
- [Risk] API key 同时支持直接值和 env 引用会带来优先级歧义。 → Mitigation: 明确 `apiKey` / `authToken` 直接值优先于 `apiKeyEnv` / `authTokenEnv`，同一 provider 同时配置 apiKey 和 authToken 时优先使用 apiKey 并记录脱敏诊断。

## Migration Plan

1. 在 `/Users/liu/Documents/work/learning/ai-page-builder-worktree/` 下创建独立子文件夹和独立开发分支 worktree。
2. 新增模型配置解析器和安全返回类型，默认无配置时返回服务默认模型。
3. 新增模型选项列表 API，并补充密钥脱敏测试。
4. 调整 `/api/status`，让 JSON provider 中存在可用模型时不会因缺少全局 env 凭证禁用输入框。
5. 扩展发送请求类型与 HTTP 校验，将 `modelOptionId` 解析结果传入 Agent runtime。
6. 调整 Orchestrator/Adapter 透传 per-request env 与 SDK `model`。
7. 在 PageBuilder `AgentView` 输入区增加模型选择器并接入 localStorage，确保手动、自动首轮和程序化发送都使用当前有效选择。
8. 更新 Docker env 示例、配置文件示例和部署文档。
9. 验证旧单 provider env 部署、JSON 多 provider 部署、未知模型拒绝、并发不同 provider 请求隔离。

回滚策略：未配置模型提供商 JSONC 时旧行为保持不变；如果新配置导致问题，可移除 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE` 并重启服务回退到现有 `ANTHROPIC_*` 默认模型。

## Open Questions

- CMS handoff 是否需要允许 CMS 指定默认 `modelOptionId`？当前设计不包含，后续可在 CMS 集成能力中扩展。
