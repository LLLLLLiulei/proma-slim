## ADDED Requirements

### Requirement: 选区消息发送后不得保留隐藏 follow-up target context
系统 SHALL 在一条携带 `targetSelection` 的消息发送成功后清除当前可见选区与高亮，并 SHALL NOT 在宿主侧继续保留一个隐藏的 follow-up target context。后续普通消息如果仍需附着 `targetSelection`，必须来自新的显式选区或其他结构化工作流状态，而不能来自宿主对自由文本 continuation 的猜测。

#### Scenario: 选区消息发送成功后清除可见选区且不保留隐藏 target
- **WHEN** 一条携带 `targetSelection` 的消息发送成功
- **THEN** 系统 SHALL 清除当前可见页面区块选择状态与高亮
- **AND** 系统 SHALL NOT 为该任务保留隐藏的 active follow-up target context

#### Scenario: 未重新选区的后续消息不得自动复用旧 target
- **WHEN** 用户已经完成一次带 `targetSelection` 的发送，随后未重新选区就继续发送普通消息
- **THEN** 系统 SHALL NOT 在该次发送的隐藏上下文中继续附着上一条消息的 `targetSelection`
- **AND** 系统 SHALL 将该次发送视为无显式 target 的 ordinary message，除非存在其他结构化 workflow state 明确要求不同处理

#### Scenario: 新 selection 才能带来新的 targetSelection
- **WHEN** 用户重新选择了新的预览目标
- **THEN** 系统 SHALL 在下一次发送中附着这个新的显式 `targetSelection`
- **AND** 系统 SHALL NOT 再继续复用之前发送过的旧目标

#### Scenario: 宿主不得通过自由文本重建旧 target
- **WHEN** 用户发送“继续”“再改一下”“把整个页面重做一版”或其他任意自然语言消息，但当前没有显式选区也没有专用 workflow state
- **THEN** 系统 SHALL NOT 仅凭这些自由文本内容去恢复、延续、清空或改写旧的 `targetSelection`
