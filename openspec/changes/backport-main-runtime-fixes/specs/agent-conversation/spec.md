## MODIFIED Requirements

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
