## ADDED Requirements

### Requirement: Builder 交互锁定 MUST 在陈旧 busy 状态下自动恢复
系统 SHALL 让 builder 对 Agent busy 状态的页面级锁定基于真实会话活跃性，而不是仅依赖可能残留的本地流式标记。

#### Scenario: 陈旧本地 busy 状态不会长期锁住 builder
- **WHEN** builder 当前会话的本地 streaming 标记仍为真，但后端会话已经空闲
- **THEN** 系统 SHALL 自动校准该会话状态
- **AND** 系统 SHALL 重新启用被 busy 状态锁定的 builder 交互
- **AND** 系统 SHALL NOT 要求用户必须先手动发送一条消息才能恢复

#### Scenario: 后端仍活跃时继续锁定 builder
- **WHEN** builder 触发一次会话忙碌状态校准，且后端返回该会话仍在处理
- **THEN** 系统 SHALL 继续保持 builder 的 busy 锁定
- **AND** 系统 SHALL 防止用户并发触发新的编辑或发送动作

#### Scenario: 刷新 builder 后仍能恢复真实 busy 锁定
- **WHEN** 用户在 builder 会话仍由 Agent 处理期间刷新页面，导致本地 `running` 状态被重置
- **THEN** 系统 SHALL 依据消息历史与后端活跃状态重新识别该会话仍在处理中
- **AND** 系统 SHALL 恢复页面级 busy 锁定，而不是允许用户立即再次发送并撞到后端 409
