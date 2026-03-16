## Purpose
定义 Proma 与 Claude Code 建立流式对话、渲染消息内容以及读取 API Key 的核心对话行为。

## Requirements

### Requirement: 流式对话
系统 SHALL 通过 `@anthropic-ai/claude-agent-sdk` 与 Claude Code 建立流式对话，用户发送消息后实时接收 AI 响应。

#### Scenario: 发送消息并接收流式响应
- **WHEN** 用户在输入框输入文本并提交
- **THEN** 系统 SHALL 通过 Agent SDK 发起查询，前端通过 SSE 实时接收文本增量（text_delta），逐字渲染到消息区域

#### Scenario: 文本输出完成
- **WHEN** 一段文本流式输出结束（收到 text_complete 事件）
- **THEN** 系统 SHALL 将完整文本块标记为已完成，停止流式动画

#### Scenario: SDK 调用失败
- **WHEN** SDK 查询过程中发生错误（网络错误、API Key 无效、模型不可用等）
- **THEN** 系统 SHALL 通过 SSE 推送 error 事件到前端，前端展示错误信息，允许用户重新发送

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
