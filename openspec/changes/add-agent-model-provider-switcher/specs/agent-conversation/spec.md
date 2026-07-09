## MODIFIED Requirements

### Requirement: 模型使用
系统 SHALL 默认使用 Agent SDK 的服务默认模型，并 SHALL 支持通过后端已校验的 `modelOptionId` 为单次 Agent query 指定 Anthropic-compatible provider/model；系统 MUST 保持未选择模型时的默认模型兼容行为，并 MUST 将上游实际解析出的模型继续用于流式状态和助手消息持久化。

#### Scenario: 默认模型
- **WHEN** 用户发送消息且请求未携带具体 `modelOptionId`
- **THEN** 系统 SHALL 使用 Agent SDK 的服务默认模型配置
- **AND** 系统 SHALL 保持现有 `ANTHROPIC_*` / `AI_PAGE_BUILDER_ANTHROPIC_*` 环境变量 fallback 语义

#### Scenario: 已校验模型选项指定本次 query 模型
- **WHEN** 用户发送消息且请求携带有效 `modelOptionId`
- **THEN** 系统 SHALL 使用该模型选项解析出的 provider 运行时配置发起 Agent SDK query
- **AND** 系统 SHALL 将该模型选项解析出的上游模型名作为 SDK `model` 参数传入

#### Scenario: 当前流式 turn 不被后续选择影响
- **WHEN** 某个会话的 Agent SDK query 已经启动
- **AND** 用户随后在前端切换了模型选择
- **THEN** 已启动的 query SHALL 继续使用启动时解析出的 provider/model
- **AND** 新选择 SHALL 仅影响下一次发送

#### Scenario: 实际模型仍由 SDK init 事件确认
- **WHEN** Agent SDK 返回 system init 消息并包含实际模型名
- **THEN** 系统 SHALL 继续发送 `model_resolved` 事件到前端
- **AND** 系统 SHALL 将该实际模型名写入本轮助手消息的 `model` 字段

#### Scenario: 未知模型选项不会进入 SDK
- **WHEN** 用户发送消息且请求携带未知或不可用 `modelOptionId`
- **THEN** 系统 SHALL 在调用 Agent SDK 前拒绝该请求
- **AND** 系统 SHALL 返回用户可理解的模型不可用提示
