## Purpose
定义 Proma 与 Claude Code 建立流式对话、渲染消息内容以及解析 Agent SDK 凭证的核心对话行为。

## Requirements

### Requirement: 流式对话
系统 SHALL 通过 `@anthropic-ai/claude-agent-sdk` 与 Claude Code 建立流式对话，用户发送消息后实时接收 AI 响应，并在流式回复期间保持平滑、有序、无异常跳变的文本呈现节奏。

#### Scenario: 发送消息并接收流式响应
- **WHEN** 用户在输入框输入文本并提交
- **THEN** 系统 SHALL 通过 Agent SDK 发起查询，前端通过 SSE 实时接收文本增量（text_delta），逐字渲染到消息区域

#### Scenario: 流式文本平滑渐进输出
- **WHEN** 后端以不规则 chunk 节奏持续推送同一轮助手文本增量
- **THEN** 系统 SHALL 以渐进、连续且有序的方式更新当前助手消息，而不是出现长时间停顿后大段跳字或突然整段补齐

#### Scenario: 流结束后渐进排空剩余内容
- **WHEN** 流式回复已结束但前端平滑渲染队列中仍有剩余文本尚未显示
- **THEN** 系统 SHALL 在结束阶段继续渐进排空剩余内容直到完整展示，而不是一次性将剩余文本整体跳出

#### Scenario: 文本输出完成
- **WHEN** 一段文本流式输出结束（收到 text_complete 事件）且前端显示内容已追平完整文本
- **THEN** 系统 SHALL 将完整文本块标记为已完成，停止流式动画

#### Scenario: SDK 调用失败
- **WHEN** SDK 查询过程中发生错误（网络错误、API Key 无效、模型不可用等）
- **THEN** 系统 SHALL 通过 SSE 推送 error 事件到前端，前端展示错误信息，允许用户重新发送

#### Scenario: 已知登录或运行时配置错误返回友好提示
- **WHEN** SDK 返回已知的登录、认证、API Key 或 Base URL 配置错误模式
- **THEN** 系统 SHALL 将该错误转换为用户可直接理解的提示，而不是原样展示底层技术错误文案

#### Scenario: 友好错误在实时展示与持久化消息中保持一致
- **WHEN** 系统将某个已知 SDK 错误转换为用户友好提示
- **THEN** 前端实时展示的错误内容与写入会话历史的状态消息 SHALL 使用一致的用户可见文案，同时保留原始错误用于诊断

#### Scenario: 并发发送保护
- **WHEN** 同一会话正在流式输出时用户再次发送消息
- **THEN** 系统 SHALL 阻止发送，前端禁用输入框直到当前生成完成或被停止

#### Scenario: 停止生成
- **WHEN** 用户在流式输出过程中点击停止按钮
- **THEN** 系统 SHALL 通过 AbortController 中止 SDK 查询，停止 SSE 推送，保留已生成的内容

#### Scenario: 消息持久化
- **WHEN** 一轮对话完成（收到 complete 事件）
- **THEN** 系统 SHALL 将用户消息和助手消息追加写入对应会话的 JSONL 文件

#### Scenario: 新一轮开始时不复用上一轮助手文本
- **WHEN** 用户在上一轮助手回复结束后发起新一轮发送，且新的流式文本尚未到达
- **THEN** 系统 SHALL 将当前 transient assistant 视图视为新的空响应起点，而不是短暂回显上一轮助手文本或将其误展示为当前回复

### Requirement: Markdown 渲染
系统 SHALL 将助手消息以 Markdown 格式渲染，支持代码块语法高亮。

#### Scenario: 代码块渲染
- **WHEN** 助手消息包含 ``` 围栏代码块
- **THEN** 系统 SHALL 渲染为带语法高亮的代码块，显示语言标签和复制按钮

#### Scenario: 常规 Markdown
- **WHEN** 助手消息包含标题、列表、链接、表格等 Markdown 元素
- **THEN** 系统 SHALL 正确渲染为对应的 HTML 元素

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

### Requirement: 模型使用
系统 SHALL 使用 SDK 默认模型，不提供前端模型切换。

#### Scenario: 默认模型
- **WHEN** 用户发送消息
- **THEN** 系统 SHALL 使用 Agent SDK 的默认模型（由 SDK 决定），不传递 model 参数

### Requirement: Teammate completion MUST support auto-resume result aggregation
系统 SHALL 在 teammate / subagent 任务完成后，通过 Claude Teams 文件系统中的 inbox 消息或 task summaries 自动恢复主会话，并向用户输出汇总后的最终回复。

#### Scenario: Inbox messages are used as the primary resume source
- **WHEN** 某个主会话启动过 teammate 任务，且 Claude Teams 中存在对应 team lead inbox 的未读结果消息
- **THEN** 系统 SHALL 读取这些未读消息、将其标记为已读，并使用 inbox 内容构造 resume prompt 继续同一主会话

#### Scenario: Task summaries remain the fallback resume source
- **WHEN** teammate 任务已完成，但 team lead inbox 中没有可用的未读结果消息，而事件流中已收集到 task summaries
- **THEN** 系统 SHALL 使用这些 task summaries 构造 fallback resume prompt，并继续生成面向用户的最终汇总回复

#### Scenario: Idle workers can trigger stalled task recovery
- **WHEN** 系统检测到已启动的 teammate workers 全部进入 idle，而主事件循环仍在等待 Task 工具结果
- **THEN** 系统 SHALL 将其视为可恢复的等待状态，并进入 auto-resume 收口流程，而不是无限等待或直接丢失 teammate 结果

### Requirement: 前端 MUST 自动校准陈旧流式状态
系统 SHALL 在检测到本地会话仍处于 streaming，但后端会话可能已经空闲时，主动探测后端活跃状态并收敛陈旧的本地流式状态，而不要求用户再次发送消息。

#### Scenario: 挂载或重新聚焦时清理陈旧流式状态
- **WHEN** 会话视图挂载、页面重新可见或窗口重新获得焦点，且本地 `running` 标记仍为真
- **THEN** 系统 SHALL 探测后端该会话的活跃状态
- **AND** 当后端返回该会话已空闲时，系统 SHALL 清理本地陈旧的 streaming 状态、刷新消息历史并重新启用输入区

#### Scenario: 后端仍活跃时保持忙碌状态
- **WHEN** 系统因本地 busy 状态触发一次会话活跃性探测
- **THEN** 当后端返回该会话仍活跃时，系统 SHALL 保持当前忙碌状态
- **AND** 系统 SHALL NOT 因本地补偿逻辑而过早允许新的发送

#### Scenario: 刷新后重新进入会话时恢复真实 busy 状态
- **WHEN** 用户在 Agent 仍在执行期间刷新页面或重新进入会话，导致本地内存中的 streaming 状态丢失
- **THEN** 系统 SHALL 在消息历史显示“上一条用户消息尚未得到助手响应”时主动探测后端该会话的活跃状态
- **AND** 当后端返回该会话仍活跃时，系统 SHALL 重新建立本地 busy 状态并继续阻断新的发送
- **AND** 系统 SHALL NOT 直接把后端返回的“上一条消息仍在处理中”409 作为普通发送失败提示给用户

### Requirement: 共享 AgentView 必须展示 compact 生命周期状态
系统 SHALL 在会话进入 compact 生命周期时，通过共享 `AgentView` 的瞬时状态区域明确展示 compact 阶段，而不是仅保留通用“处理中”状态。

#### Scenario: compact 开始时展示中性压缩提示
- **WHEN** 某轮会话收到 `compacting` 生命周期事件
- **THEN** 系统 SHALL 在共享 `AgentView` 的瞬时状态区域显示 `正在压缩上下文，请稍候…`
- **AND** 系统 SHALL 将当前 loading 文案切换为表示正在压缩上下文的状态

#### Scenario: compact 成功后展示继续处理提示
- **WHEN** 某轮会话收到 `compact_complete` 生命周期事件且当前 turn 尚未结束
- **THEN** 系统 SHALL 在共享 `AgentView` 的瞬时状态区域显示 `已压缩，继续处理中`

#### Scenario: 用户显式执行 /compact 时沿用同一套提示
- **WHEN** 用户显式发送 `/compact` 且会话进入 compact 生命周期
- **THEN** 系统 SHALL 使用与自动 compact 恢复相同的 compact 开始与成功提示
- **AND** 系统 SHALL NOT 为手动 `/compact` 使用另一套独立文案或单独页面逻辑

#### Scenario: 所有复用 AgentView 的界面行为一致
- **WHEN** 任一会话界面通过共享 `AgentView` 渲染对话，包括主应用对话页与 page-builder 内嵌对话页
- **THEN** 系统 SHALL 使用同一套 compact 状态提示行为
- **AND** 系统 SHALL NOT 只在单一页面类型中显示该提示

### Requirement: compact 提示必须保持瞬时并在后续事件到达后自清理
系统 SHALL 将 compact 相关提示作为当前流式过程中的瞬时状态展示，而不是持久化历史消息；在后续真实执行或终态事件到达时，系统 SHALL 自动清理这类提示。

#### Scenario: 恢复后的真实执行事件到达时清理成功提示
- **WHEN** 系统已显示 `已压缩，继续处理中`
- **AND** 随后同一轮执行开始输出文本、工具活动或终态事件
- **THEN** 系统 SHALL 清理该瞬时提示
- **AND** 系统 SHALL 继续展示后续真实执行状态

#### Scenario: compact 失败时沿用既有错误收口
- **WHEN** compact 流程后续收到错误或失败终态
- **THEN** 系统 SHALL 沿用现有错误事件与错误消息完成收口
- **AND** 系统 SHALL NOT 额外持久化 compact 失败提示为会话历史消息

#### Scenario: 手动 /compact 在成功后直接结束时清理提示
- **WHEN** 用户显式发送 `/compact`
- **AND** compact 成功后该轮会话直接进入 `complete` 终态
- **THEN** 系统 SHALL 清理 compact 成功提示
- **AND** 系统 SHALL NOT 因缺少后续文本或工具活动而让提示长期残留

#### Scenario: 重新进入会话时不回放旧的 compact 提示
- **WHEN** 用户刷新页面或稍后重新进入同一会话
- **THEN** 系统 SHALL NOT 从持久化消息历史中回放旧的 compact 过程提示
- **AND** 系统 SHALL 仅展示真实持久化的对话消息和错误消息

### Requirement: 共享 AgentView 必须在长会话下保持草稿编辑响应性并维持既有消息展示稳定
系统 SHALL 在共享 `AgentView` 中将普通 composer 草稿编辑与已展示的历史消息区域隔离；当当前会话的 `messages` 与 `streamState` 没有变化时，系统 SHALL 允许用户继续编辑当前草稿，并 SHALL NOT 仅因当前草稿文本变化而改变已展示 transcript 的当前可见内容或状态。

#### Scenario: 长会话空闲输入保持 transcript 可见内容稳定
- **WHEN** 当前会话已经存在已渲染的历史消息，且用户正在空闲态编辑 composer 草稿
- **AND** 在该次输入期间没有新的消息追加、流式状态变化或错误/compact 状态变化
- **THEN** 系统 SHALL 允许用户继续编辑当前草稿
- **AND** 系统 SHALL NOT 仅因本次草稿文本变化而改变已展示的历史消息列表、工具活动、错误状态或 compact 状态的当前可见内容

#### Scenario: 草稿输入不会改变现有消息展示语义
- **WHEN** 当前会话已经展示历史消息、工具活动、错误状态或 compact 瞬时状态，且用户继续编辑当前草稿
- **AND** 这些展示项对应的消息或流式状态本身没有变化
- **THEN** 系统 SHALL 保持这些展示项的当前可见状态不变
- **AND** 系统 SHALL 只在对应消息或流式状态真实变化时更新它们

### Requirement: 对话性能优化必须保持最新可见草稿提交语义
系统 SHALL 在引入消息区渲染隔离或其他对话性能优化后，继续以当前用户可见的最新 composer 草稿作为发送来源，而不得因为前端优化把发送退化为旧草稿快照。

#### Scenario: 最近输入后立即提交仍发送最新草稿
- **WHEN** 用户刚刚继续输入当前会话的 composer 草稿并立即触发发送
- **THEN** 系统 SHALL 发送该时刻用户可见的最新草稿内容
- **AND** 系统 SHALL NOT 发送较早的草稿快照或遗漏最近输入的字符

#### Scenario: 渲染隔离不会改变既有会话发送行为
- **WHEN** 系统已经为消息区引入渲染隔离或 memo 优化
- **AND** 用户在主对话页或 page-builder 内嵌对话页提交普通文本消息
- **THEN** 系统 SHALL 保持与优化前一致的会话发送语义
- **AND** 系统 SHALL 继续沿用既有的流式响应、工具活动展示、错误展示和 compact 状态展示行为

### Requirement: 错误消息 MUST 暴露结构化诊断上下文
系统 SHALL 在保留用户友好错误摘要的同时，为会话中的失败消息暴露结构化诊断详情和必要的上游原始错误信息，使用户能够区分本地流式异常与上游模型、SDK 或网络失败。

#### Scenario: 类型化错误在对话中展示结构化详情
- **WHEN** Agent 返回带有错误代码、标题、诊断详情或原始错误的类型化错误
- **THEN** 系统 SHALL 在会话时间线中展示用户可读的错误摘要
- **AND** 系统 SHALL 为该状态消息保留并允许查看诊断详情和原始错误文本

#### Scenario: 非类型化上游失败在持久化消息中保留原始诊断
- **WHEN** Agent 执行在 SDK、Provider、网络或 SSE 收尾路径中失败，且系统将其映射为用户友好提示
- **THEN** 系统 SHALL 在实时错误提示和持久化状态消息中保持一致的用户可见摘要
- **AND** 系统 SHALL 同时保留可用于诊断的上游错误信息，以便后续在前端查看

### Requirement: Agent send turn 必须输出可关联的诊断链路日志
系统 SHALL 为每次 `POST /api/sessions/:id/send` 的成功受理请求生成稳定的 turn 级关联标识，并 SHALL 为该次 turn 记录覆盖请求受理、消息持久化、prompt 组装、SDK 调用、重试、异常和完成收口的结构化诊断日志，而不是只在入口或错误处零散打印日志。

#### Scenario: 受理的 send 请求生成 turn 级链路日志
- **WHEN** 某个会话的 send 请求通过校验并被正式受理执行
- **THEN** 系统 SHALL 为该次执行生成唯一的 `turnId`
- **AND** 系统 SHALL 在后续关键处理阶段持续使用该 `turnId` 记录诊断日志

#### Scenario: prompt 组装阶段保留完整可诊断内容
- **WHEN** 系统为某次 send turn 组装动态上下文、组合消息、final prompt 或 system prompt
- **THEN** 系统 SHALL 记录该阶段的完整结构化诊断日志
- **AND** 该日志 SHALL 能完整保留用户原始消息、组合消息和最终送往模型的请求内容层次

#### Scenario: 重试或失败路径保留上游诊断上下文
- **WHEN** 某次 send turn 在 SDK、Provider、网络、typed_error 或 catch error 路径上出现异常或进入自动重试
- **THEN** 系统 SHALL 为该次 turn 记录对应的阶段日志
- **AND** 日志 SHALL 保留足以区分重试、上游失败和最终收口结果的结构化诊断信息

### Requirement: Agent turn 收口日志必须反映最终执行结果
系统 SHALL 在 turn 正常完成、被拒绝、被中止或以错误收口时输出明确的收口日志，使调用链路的终态可以在日志中被稳定识别。

#### Scenario: turn 正常完成时写入完成日志
- **WHEN** 某次 send turn 完成文本生成与消息持久化，并进入正常结束路径
- **THEN** 系统 SHALL 记录该 turn 的完成日志
- **AND** 该日志 SHALL 标识该次 turn 已完成收口

#### Scenario: turn 因忙碌保护被拒绝时写入拒绝日志
- **WHEN** 同一会话已有未完成的执行，新的 send 请求被并发保护拒绝
- **THEN** 系统 SHALL 记录该次请求的拒绝日志
- **AND** 该日志 SHALL 能区分这是一条未进入正式执行链路的忙碌拒绝结果

#### Scenario: turn 以错误或中止收口时写入终态日志
- **WHEN** 某次 send turn 因用户停止、SSE 收口失败、SDK 异常或友好错误映射而结束
- **THEN** 系统 SHALL 记录该次 turn 的终态日志
- **AND** 该日志 SHALL 能区分用户中止与异常失败
