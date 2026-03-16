## ADDED Requirements

### Requirement: 工具调用展示
系统 SHALL 在对话中展示 Claude Code 的工具调用过程，包括工具名称、输入参数和执行结果。

#### Scenario: 工具开始执行
- **WHEN** 收到 tool_start 事件
- **THEN** 系统 SHALL 在消息流中展示工具名称和输入参数摘要，显示加载状态

#### Scenario: 工具执行完成
- **WHEN** 收到 tool_result 事件
- **THEN** 系统 SHALL 更新对应工具条目，显示执行结果（成功/失败），结果内容可折叠展开

#### Scenario: 多工具并行
- **WHEN** 助手在一轮响应中调用多个工具
- **THEN** 系统 SHALL 按顺序展示每个工具的调用过程，各自独立显示状态

### Requirement: 工具活动折叠
系统 SHALL 支持折叠/展开工具活动详情，默认折叠已完成的工具。

#### Scenario: 默认折叠
- **WHEN** 工具执行完成且有新的文本输出
- **THEN** 系统 SHALL 自动折叠该工具活动，仅显示工具名称和状态图标

#### Scenario: 手动展开
- **WHEN** 用户点击已折叠的工具活动
- **THEN** 系统 SHALL 展开显示完整的输入参数和执行结果
