## ADDED Requirements

### Requirement: Agent 模型提供商配置
系统 SHALL 支持通过外部 JSONC 配置文件声明多家 Anthropic-compatible / Claude Code compatible 模型提供商及其模型列表，并保持标准 JSON 文件兼容；每个 provider SHALL 在自身配置内包含可选 `models` 列表，系统 SHALL 为每个模型生成稳定的 `modelOptionId` 并用于后续 API 与发送请求。

#### Scenario: 从 JSONC 文件加载 provider 内嵌模型配置
- **WHEN** 后端启动或读取模型选项时配置了 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE`
- **THEN** 系统 SHALL 从该文件读取 provider 列表和每个 provider 内的 `models`
- **AND** 系统 SHALL 将每个可用模型解析为 `${provider.id}.${model.id}` 格式的 `modelOptionId`

#### Scenario: 模型配置文件支持 JSONC 语法
- **WHEN** 模型提供商配置文件包含 `//` 单行注释、`/* ... */` 块注释或尾随逗号
- **THEN** 系统 SHALL 正常解析该配置文件
- **AND** 系统 SHALL 保持标准 JSON 配置文件无需修改即可继续解析
- **AND** 系统 SHALL NOT 因 URL 字符串中的 `https://` 误判为注释而破坏配置值

#### Scenario: provider 支持直接配置密钥
- **WHEN** provider 配置中包含 `apiKey` 或 `authToken`
- **THEN** 系统 SHALL 使用该直接配置值为本 provider 构造 Agent SDK 凭证
- **AND** 系统 SHALL NOT 要求该 provider 额外配置 `apiKeyEnv` 或 `authTokenEnv`

#### Scenario: provider 支持环境变量引用密钥
- **WHEN** provider 配置中未包含直接 `apiKey` 或 `authToken`，但包含 `apiKeyEnv` 或 `authTokenEnv`
- **THEN** 系统 SHALL 从对应环境变量读取凭证值
- **AND** 当环境变量不存在或为空时，系统 SHALL 将该 provider 视为配置不完整

#### Scenario: 官方 Anthropic provider 可省略 baseUrl
- **WHEN** provider 明确配置为官方 Anthropic provider
- **THEN** 系统 SHALL 允许该 provider 不配置 `baseUrl`
- **AND** 系统 SHALL 让 Agent SDK 使用其默认 Anthropic API 地址

#### Scenario: 非官方 provider 缺少 baseUrl 时不可用
- **WHEN** provider 不是官方 Anthropic provider
- **AND** provider 未配置可用 `baseUrl`
- **THEN** 系统 SHALL 将该 provider 视为配置不完整
- **AND** 系统 SHALL NOT 将该 provider 下的模型作为可发送选项返回

#### Scenario: provider 或 model 可显式禁用
- **WHEN** provider 配置 `enabled: false`
- **THEN** 系统 SHALL 将该 provider 下全部模型视为不可用
- **AND** 系统 SHALL NOT 在模型选项 API 中返回该 provider
- **WHEN** 单个 model 配置 `enabled: false`
- **THEN** 系统 SHALL 只将该 model 视为不可用
- **AND** 系统 SHALL 保留同 provider 下其他可用模型
- **AND** 未配置 `enabled` 的 provider 或 model SHALL 默认视为启用

#### Scenario: 直接密钥优先于环境变量引用
- **WHEN** 同一个 provider 同时配置了 `apiKey` 与 `apiKeyEnv`
- **THEN** 系统 SHALL 使用直接 `apiKey` 值构造 Agent SDK 凭证
- **AND** 系统 SHALL NOT 因 `apiKeyEnv` 指向的环境变量缺失而判定该 provider 不可用

#### Scenario: 配置 ID 必须稳定且唯一
- **WHEN** 系统解析模型提供商配置
- **THEN** 系统 SHALL 要求 `provider.id` 在配置文件内全局唯一
- **AND** 系统 SHALL 要求同一 provider 内的 `model.id` 唯一
- **AND** 系统 SHALL 拒绝或跳过无法生成唯一 `modelOptionId` 的配置项

#### Scenario: 配置 ID 使用安全字符集
- **WHEN** 系统解析 `provider.id` 或 `model.id`
- **THEN** 系统 SHALL 要求 ID 仅使用字母、数字、下划线或短横线
- **AND** 系统 SHALL 拒绝或跳过包含点号、斜杠、空白、路径片段或其他特殊字符的 ID

#### Scenario: 默认模型选项不可用时回退
- **WHEN** `defaultModelOptionId` 缺失、指向不存在模型或指向配置不完整的 provider
- **THEN** 系统 SHALL 回退到第一个可用模型选项作为默认选项
- **AND** 系统 MAY 在后端脱敏诊断日志中记录该默认值回退

#### Scenario: 未配置模型文件时保留服务默认选项
- **WHEN** 未配置 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE`
- **THEN** 系统 SHALL 基于现有 Agent SDK 环境变量提供一个服务默认模型选项
- **AND** 系统 SHALL 继续允许用户发送消息而不要求新增模型配置文件
- **AND** 模型选项 API SHALL 将 `selectorEnabled` 标记为 `false`
- **AND** PageBuilder SHALL NOT 展示模型选择下拉入口

### Requirement: 模型选项列表 API
系统 SHALL 提供模型选项列表 API，返回 PageBuilder 前端展示所需的 provider 与 model 信息；该 API MUST NOT 返回 provider 的 `baseUrl`、`apiKey`、`authToken` 或任何密钥环境变量的实际值。

#### Scenario: 返回按 provider 分组的模型选项
- **WHEN** 前端请求模型选项列表
- **THEN** 系统 SHALL 返回 `defaultModelOptionId`
- **AND** 系统 SHALL 返回表示当前是否允许用户选择模型的 `selectorEnabled`
- **AND** 系统 SHALL 返回按 provider 分组的可选模型列表
- **AND** 每个模型项 SHALL 包含可用于发送请求的完整 `modelOptionId`

#### Scenario: 没有可用配置模型时禁用选择入口
- **WHEN** 未配置 `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE`
- **OR** 配置文件读取失败、provider 不可用、provider/model 全部禁用或过滤后没有任何可用模型
- **THEN** 模型选项 API SHALL 返回 `selectorEnabled: false`
- **AND** PageBuilder SHALL NOT 展示模型选择下拉入口
- **AND** 未配置模型文件时 SHALL 继续使用现有服务默认发送语义

#### Scenario: 模型选项 API 不暴露敏感配置
- **WHEN** provider 配置中包含 `baseUrl`、`apiKey` 或 `authToken`
- **THEN** 模型选项 API 响应 SHALL NOT 包含这些字段
- **AND** 响应 SHALL NOT 包含任何密钥值或上游鉴权头

#### Scenario: 不可用 provider 不作为可选模型返回
- **WHEN** 某个 provider 缺少可用凭证或必需的 baseUrl
- **THEN** 系统 SHALL NOT 将该 provider 下的模型作为可发送选项返回
- **AND** 系统 MAY 在后端脱敏诊断日志中记录该 provider 配置不完整

### Requirement: Agent 状态接口必须兼容模型提供商配置
系统 SHALL 在判断 Agent 是否可发送时同时考虑旧环境变量凭证和模型提供商 JSONC 配置；当模型提供商 JSONC 中存在至少一个可用 provider/model 时，系统 SHALL NOT 因缺少全局 `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN` 或 `AI_PAGE_BUILDER_ANTHROPIC_API_KEY` 而禁用 PageBuilder 对话输入。

#### Scenario: 仅配置模型提供商 JSONC 时状态可用
- **WHEN** 未配置全局 Agent SDK 凭证环境变量
- **AND** `AI_PAGE_BUILDER_AGENT_MODELS_CONFIG_FILE` 指向的 JSONC 中存在至少一个凭证完整的可用模型选项
- **THEN** `/api/status` SHALL 将 Agent 凭证状态视为已配置
- **AND** 当前端检测到 SDK CLI 可用时 SHALL 允许用户发送消息

#### Scenario: 没有任何可用凭证时状态不可用
- **WHEN** 未配置全局 Agent SDK 凭证环境变量
- **AND** 模型提供商 JSONC 未配置、读取失败或不存在任何可用模型选项
- **THEN** `/api/status` SHALL 将 Agent 凭证状态视为未配置
- **AND** 前端 SHALL 继续阻止发送并展示配置提示

#### Scenario: 状态接口不暴露模型密钥细节
- **WHEN** `/api/status` 基于模型提供商 JSONC 判断 Agent 凭证状态
- **THEN** 响应 SHALL NOT 包含 provider `baseUrl`、`apiKey`、`authToken`、密钥环境变量实际值或配置文件路径中的敏感片段

### Requirement: PageBuilder 输入区模型选择
系统 SHALL 在 PageBuilder 构建页对话输入框底部提供模型选择入口，让用户选择后续发送所使用的模型选项；模型选择 SHALL 只影响下一次及后续发送，不得改变当前正在运行的 Agent turn。

#### Scenario: 输入框底部展示模型下拉入口
- **WHEN** 用户进入 PageBuilder 构建页、模型选项 API 返回 `selectorEnabled: true` 且至少包含一个可用模型
- **THEN** 系统 SHALL 在对话输入框底部展示模型选择入口
- **AND** 下拉内容 SHALL 按 provider 展示模型选项

#### Scenario: 模型选择不可用时不展示下拉入口
- **WHEN** 模型选项 API 返回 `selectorEnabled: false`
- **OR** 模型选项列表不包含任何可用模型
- **THEN** 系统 SHALL NOT 在输入框底部展示模型选择入口
- **AND** 手动发送、自动首轮发送和程序化发送 SHALL NOT 携带隐藏或失效的 `modelOptionId`
- **AND** 流式状态文案 SHALL NOT 提示用户可以切换模型

#### Scenario: 选择模型后持久化到浏览器本地
- **WHEN** 用户在模型下拉中选择某个模型选项
- **THEN** 前端 SHALL 将所选 `modelOptionId` 保存到浏览器本地偏好
- **AND** 后续刷新同一浏览器页面后 SHALL 优先恢复该选择

#### Scenario: 已保存模型不可用时回退默认模型
- **WHEN** 浏览器本地保存的 `modelOptionId` 不再出现在模型选项 API 响应中
- **THEN** 前端 SHALL 回退到后端返回的 `defaultModelOptionId`
- **AND** 前端 SHALL NOT 继续发送已失效的 `modelOptionId`

#### Scenario: 流式生成期间不热切模型
- **WHEN** 当前会话正在流式生成
- **THEN** 前端 SHALL 防止用户误以为模型会影响当前 turn
- **AND** 若允许用户调整下拉选择，系统 SHALL 明确该选择仅对下一条消息生效

#### Scenario: 发送消息携带当前模型选项
- **WHEN** 用户在 PageBuilder 对话区发送消息且当前选择了具体 `modelOptionId`
- **THEN** 前端 SHALL 在发送请求中携带该 `modelOptionId`
- **AND** 前端 SHALL NOT 在请求中携带 provider 密钥、baseUrl 或鉴权头

#### Scenario: 自动首轮消息使用当前模型选择
- **WHEN** PageBuilder 构建页自动发送首页初始化需求
- **THEN** 系统 SHALL 使用当前浏览器偏好中有效的 `modelOptionId`
- **AND** 当没有有效偏好时 SHALL 使用后端默认模型选项

#### Scenario: 自动发送等待模型选项完成解析
- **WHEN** PageBuilder 构建页存在待自动发送的初始化消息或程序化发送请求
- **THEN** 前端 SHALL 在模型选项加载并解析出当前有效 `modelOptionId` 后再触发发送
- **AND** 若模型选项 API 加载失败，前端 SHALL 使用服务默认发送语义或展示可理解的错误，而不是发送已失效的本地选择

#### Scenario: 程序化发送使用当前模型选择
- **WHEN** PageBuilder 构建页通过 `programmaticSendRequest` 或等价程序化入口发送消息
- **THEN** 前端 SHALL 使用当前有效的 `modelOptionId`
- **AND** 该行为 SHALL 与用户手动发送和自动首轮发送保持一致

### Requirement: 发送请求必须校验模型选项并按请求生效
系统 SHALL 在 Agent 发送请求中校验 `modelOptionId`，并基于已解析的 provider/model 为本次 Agent SDK query 构造请求级运行时配置；未知、禁用或配置不完整的模型选项 MUST NOT 被透传到上游 SDK。

#### Scenario: 已知模型选项生效
- **WHEN** 用户发送消息并携带有效 `modelOptionId`
- **THEN** 后端 SHALL 将该选项解析为 provider 与 model
- **AND** 后端 SHALL 使用该 provider 的凭证、baseUrl、别名模型和 subagent 模型构造本次 Agent SDK env
- **AND** 后端 SHALL 将该 model 作为 SDK query 的 `model` 参数传入

#### Scenario: 未知模型选项被拒绝
- **WHEN** 用户发送消息并携带不存在的 `modelOptionId`
- **THEN** 后端 SHALL 返回 400 错误
- **AND** 后端 SHALL NOT 发起 Agent SDK query

#### Scenario: 配置不完整模型选项被拒绝
- **WHEN** 用户发送消息并携带的 `modelOptionId` 对应 provider 缺少可用凭证或必需的 baseUrl
- **THEN** 后端 SHALL 返回表示模型服务未配置完整的错误
- **AND** 后端 SHALL NOT 在错误中暴露密钥、baseUrl 或上游鉴权细节

#### Scenario: 请求级运行时通过 Adapter 输入边界透传
- **WHEN** 后端将已解析的模型选项传递给 Agent provider adapter
- **THEN** 系统 SHALL 在 adapter query 输入边界中显式携带本次请求的 SDK `env` 和 SDK `model`
- **AND** 系统 SHALL NOT 依赖隐式类型转换或全局 `process.env` 表示当前请求的 provider/model

#### Scenario: compact 和 retry 沿用同一模型选项
- **WHEN** 某轮 Agent 发送因上下文过长触发自动 compact、重放原始用户消息或 retry
- **THEN** 系统 SHALL 沿用该轮最初解析出的 provider env 与 SDK model
- **AND** 系统 SHALL NOT 在恢复流程中回退到其他 provider 或服务默认模型

#### Scenario: 并发请求不得串 provider 配置
- **WHEN** 两个不同会话同时选择不同 provider/model 并发送消息
- **THEN** 系统 SHALL 分别使用各自请求解析出的 Agent SDK env 和 SDK model
- **AND** 任一请求 SHALL NOT 因另一个请求的 provider 配置而改变自身上游 baseUrl、凭证或模型

### Requirement: 模型提供商密钥必须保持后端私有
系统 MUST 将模型提供商密钥视为敏感配置；即使密钥允许直接写入 JSONC 配置文件，系统也不得通过 API、日志、错误消息、前端状态或诊断 sidecar 暴露密钥原文。

#### Scenario: API 响应不包含密钥
- **WHEN** provider 配置文件中直接写入 `apiKey` 或 `authToken`
- **THEN** 任意前端可访问 API 响应 SHALL NOT 包含该密钥原文

#### Scenario: 错误消息不包含密钥
- **WHEN** 模型选项配置错误或上游鉴权失败
- **THEN** 用户可见错误消息 SHALL NOT 包含 `apiKey`、`authToken`、Authorization header 或密钥环境变量实际值

#### Scenario: 后端日志不包含密钥
- **WHEN** 系统记录模型选项解析、发送请求、SDK query 或上游错误诊断
- **THEN** 日志 SHALL 仅记录 providerId、modelOptionId、model、配置来源摘要等非敏感字段
- **AND** 日志 SHALL NOT 输出 provider 密钥原文
