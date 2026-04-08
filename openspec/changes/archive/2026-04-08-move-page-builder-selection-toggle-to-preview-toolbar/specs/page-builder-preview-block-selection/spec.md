## ADDED Requirements

### Requirement: Builder 预览工具栏必须提供区块选择入口
系统 SHALL 在 `page-builder` Builder 页左侧预览工具栏中提供区块选择入口，使用户可以直接在预览上下文内进入、退出和取消页面区块选择模式，而不需要再到右侧对话输入区查找该入口。

#### Scenario: 预览工具栏显示唯一的可见区块选择入口
- **WHEN** 用户进入 Builder 页且左侧预览工具栏完成渲染
- **THEN** 系统 SHALL 在 `PC / Mobile` 预览模式控制附近显示一个区块选择入口
- **AND** 系统 SHALL 不再在右侧对话输入区显示一个重复的可见区块选择主入口

#### Scenario: 点击入口后进入页面区块选择模式
- **WHEN** Builder 页处于默认状态，且用户点击预览工具栏中的区块选择入口
- **THEN** 系统 SHALL 使当前 Builder 页进入页面区块选择模式
- **AND** 系统 SHALL 让左侧预览准备接收页面区块 hover 与 click 选择操作
- **AND** 系统 SHALL 使该入口显示为已激活状态

#### Scenario: 选中区块后入口继续展示选中态
- **WHEN** 用户已通过预览工具栏入口进入页面区块选择模式并成功选中某个区块
- **THEN** 系统 SHALL 保持该入口处于激活状态
- **AND** 系统 SHALL 保留当前选中的区块供后续区块工具条和下一条消息使用

#### Scenario: 再次点击激活入口时退出选区并清空当前目标
- **WHEN** 区块选择入口当前处于已激活状态，且用户再次点击该入口
- **THEN** 系统 SHALL 退出页面区块选择模式
- **AND** 系统 SHALL 清除当前 hover 高亮、选中高亮与已选 `selector`
- **AND** 系统 SHALL 使页面恢复为不可选择状态

#### Scenario: Agent 处理中入口不可切换
- **WHEN** 当前 Builder 会话中的 agent 正在处理用户请求
- **THEN** 系统 SHALL 禁用预览工具栏中的区块选择入口
- **AND** 系统 SHALL 不允许用户在该阶段切换区块选择模式

## REMOVED Requirements

### Requirement: Builder 对话输入区必须提供“从页面中选择”入口
**Reason**: 区块选择主入口已迁移到左侧预览工具栏，继续要求对话输入区保留同一主入口会造成入口重复和操作上下文割裂。
**Migration**: 隐藏对话输入区中的旧入口，由预览工具栏中的区块选择入口承担进入、退出和取消选区的主流程。
