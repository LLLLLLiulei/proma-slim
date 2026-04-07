## MODIFIED Requirements

### Requirement: 首页首条需求必须在 builder 中自动且仅自动发送一次
系统 SHALL 将首页提交的网页需求在 builder 页面初始化完成后自动作为首条消息发送到当前会话，并 SHALL 在该次自动发送中显式装载 workspace-local `page-builder-guided-generation` 主控 skill，以保证首轮流程直接进入引导式专题页生成模式，同时确保同一会话不会因刷新或重复进入而重复发送该初始化需求。

#### Scenario: 首次进入 builder 时自动发送首页需求并注入主控 skill
- **WHEN** 用户通过首页完成项目创建并首次进入对应 builder 页面，且当前会话尚无任何消息
- **THEN** 系统 SHALL 自动将首页输入的网页需求作为首条消息发送到当前会话
- **AND** 系统 SHALL 在该次发送中显式装载 `page-builder-guided-generation`

#### Scenario: 刷新 builder 时不重复发送初始化需求
- **WHEN** 用户刷新已完成初始化发送的 builder 页面
- **THEN** 系统 SHALL 不再次发送首页输入的初始化需求

#### Scenario: 已存在消息的会话重新进入 builder 时不重复发送
- **WHEN** 用户重新进入一个已经存在消息记录的 builder 会话
- **THEN** 系统 SHALL 不再次触发首页初始化需求的自动发送

## ADDED Requirements

### Requirement: Builder 普通对话发送必须默认延续引导式专题页生成流程
系统 SHALL 在 `page-builder` 的普通用户发送路径中默认显式装载 workspace-local `page-builder-guided-generation`，以保证首轮生成与后续页面迭代持续处于同一引导式流程中。

#### Scenario: 用户在 builder 中发送普通消息时默认注入主控 skill
- **WHEN** 用户在 `page-builder` 的 Builder 对话区提交一条普通消息
- **THEN** 系统 SHALL 在该次发送中显式装载 `page-builder-guided-generation`
- **AND** 系统 SHALL 不要求用户手动输入 skill 调用指令

#### Scenario: 页面生成后的普通修改请求仍沿用主控 skill
- **WHEN** 当前 Builder 会话已经生成过页面，且用户继续在对话区提交后续修改请求
- **THEN** 系统 SHALL 继续在该次发送中显式装载 `page-builder-guided-generation`
- **AND** 系统 SHALL 使后续修改继续沿用引导式专题页生成的轻量迭代模式

#### Scenario: 已有专用显式 skill 的程序化发送不被默认主控 skill 覆盖
- **WHEN** 某次 Builder 发送已经由专用工作流提供了显式 `mentionedSkills`
- **THEN** 系统 SHALL 保留该次发送原有的显式 skill 集合
- **AND** 系统 SHALL NOT 再额外追加默认 `page-builder-guided-generation`
