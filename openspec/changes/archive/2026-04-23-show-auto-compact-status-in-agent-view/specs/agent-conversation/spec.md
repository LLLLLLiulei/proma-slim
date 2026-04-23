## ADDED Requirements

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
