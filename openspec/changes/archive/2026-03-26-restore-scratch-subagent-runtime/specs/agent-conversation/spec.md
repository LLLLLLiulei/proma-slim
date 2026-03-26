## ADDED Requirements

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
