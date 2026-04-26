## ADDED Requirements

### Requirement: 当前已选目标必须在右侧对话输入区提供可见提示
系统 SHALL 在 `page-builder` Builder 页右侧对话输入框上方为当前已选目标提供高亮可见提示，作为隐藏 `targetSelection` 上下文的补充反馈；该提示 SHALL 反映当前有效选区的最新目标标识，并 SHALL NOT 被写入消息列表正文或伪造成新的用户消息。

#### Scenario: 选中普通 block 后显示预览可见标签
- **WHEN** 用户在 Builder 预览中选中一个普通静态 block
- **THEN** 系统 SHALL 在右侧对话输入框上方显示与预览选中框一致的标签文案
- **AND** 系统 SHALL NOT 默认展示该 block 的原始 `selector`
- **AND** 该提示 SHALL 表示当前消息将围绕这个 block 工作

#### Scenario: 选中 CMS island 后显示预览可见标签
- **WHEN** 用户在 Builder 预览中选中一个 `cms-island`
- **THEN** 系统 SHALL 在右侧对话输入框上方显示与预览选中框一致的组件标签文案
- **AND** 系统 SHALL NOT 默认展示该目标的 `sourceSelector`、`parentBlockSelector` 或 `htmlPath`
- **AND** 系统 SHALL NOT 使用其他英文固定前缀标签如 `Target`

#### Scenario: 用户可以从 notice 直接取消当前选中
- **WHEN** 右侧对话输入框上方已经显示当前已选目标提示
- **AND** 用户点击提示末尾的取消图标
- **THEN** 系统 SHALL 清除当前有效选区
- **AND** 系统 SHALL 隐藏该提示
- **AND** 系统 SHALL 不再把刚才的目标继续作为下一条消息的活动目标

#### Scenario: 切换选中目标后提示更新为最新目标
- **WHEN** 用户在同一轮发送前重新选择了另一个 block 或 `cms-island`
- **THEN** 系统 SHALL 将右侧对话输入框上方的提示更新为最新选中的预览标签文案
- **AND** 系统 SHALL NOT 同时展示多个目标提示

#### Scenario: 当前选区失效后隐藏提示
- **WHEN** 当前已选目标因为取消选区、发送成功、预览重载、预览刷新或其他选区失效原因被清除
- **THEN** 系统 SHALL 隐藏右侧对话输入框上方的当前目标提示
- **AND** 系统 SHALL 不再把该提示继续显示为活动目标

#### Scenario: 发送失败保留选区时继续保留提示
- **WHEN** 一条携带已选目标上下文的消息发送失败，且系统仍保留当前选区以便重试
- **THEN** 系统 SHALL 继续显示右侧对话输入框上方的当前目标提示
- **AND** 该提示 SHALL 继续与保留中的当前选区一致

#### Scenario: 可见提示不写入消息列表
- **WHEN** 系统在右侧对话输入区展示当前已选目标提示
- **THEN** 系统 SHALL NOT 为此在消息列表中追加新的系统消息、用户消息或占位消息
- **AND** 系统 SHALL 继续保持用户消息正文只反映用户实际输入的文本
