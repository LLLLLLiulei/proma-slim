## ADDED Requirements

### Requirement: CMS 自动 handoff MUST 在阻断 busy 之前校准会话状态
系统 SHALL 在 CMS 自动 handoff 因当前会话 busy 而阻断之前，先校准当前 Builder 会话的真实活跃状态；若本地 busy 标记已陈旧，则系统 SHALL 清理陈旧状态并继续当前 handoff。

#### Scenario: 陈旧本地 busy 不阻断自动 handoff
- **WHEN** 系统准备发送一次 CMS 自动 handoff，且本地会话状态显示为 busy
- **THEN** 系统 SHALL 先探测当前 Builder 会话的后端活跃状态
- **AND** 当后端已空闲时，系统 SHALL 清理陈旧的本地 busy 状态并继续发送该次 handoff

#### Scenario: 真实 busy 仍然阻断自动 handoff
- **WHEN** 系统准备发送一次 CMS 自动 handoff，且会话活跃性探测确认后端仍在处理
- **THEN** 系统 SHALL 继续阻断该次 handoff
- **AND** 系统 SHALL 保持 CMS 弹框和当前选择现场不变
- **AND** 系统 SHALL 向用户反馈当前会话仍在处理中

### Requirement: CMS 自动 handoff 失败反馈 MUST 保留可诊断错误上下文
系统 SHALL 在 CMS 自动 handoff 发送失败时，除了保留原有的弹框与选择现场外，还向用户暴露可读失败摘要以及必要的诊断上下文，便于用户理解失败原因并原地重试。

#### Scenario: 自动 handoff 失败时保留可读错误与诊断信息
- **WHEN** 一次 CMS 自动 handoff 在发送阶段失败
- **THEN** 系统 SHALL 保持 CMS 弹框打开并保留当前已选结果与区块选中态
- **AND** 系统 SHALL 向用户展示该次失败的可读错误摘要
- **AND** 当存在结构化诊断详情或原始上游错误时，系统 SHALL 保留这些诊断上下文以支持原地重试
