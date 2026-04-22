## ADDED Requirements

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
