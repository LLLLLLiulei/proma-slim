## ADDED Requirements

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
