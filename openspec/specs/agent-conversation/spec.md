## Purpose
定义 Proma 与 Claude Code 建立流式对话、渲染消息内容以及读取 API Key 的核心对话行为。

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
系统 SHALL 从环境变量 `ANTHROPIC_API_KEY` 读取 API Key，无需 UI 配置。

#### Scenario: 环境变量已设置
- **WHEN** 后端启动时 `process.env.ANTHROPIC_API_KEY` 存在
- **THEN** 系统 SHALL 使用该 Key 进行 SDK 调用

#### Scenario: 环境变量未设置
- **WHEN** 后端启动时 `ANTHROPIC_API_KEY` 未设置
- **THEN** 系统 SHALL 在前端显示配置提示，阻止发送消息

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
