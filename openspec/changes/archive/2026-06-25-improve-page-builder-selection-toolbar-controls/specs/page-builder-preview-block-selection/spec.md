## ADDED Requirements

### Requirement: 已选目标必须支持提升为父级可选目标
系统 SHALL 允许用户在当前已经存在预览选中目标时，将该目标提升为其父级可选目标；提升后的目标 SHALL 作为新的唯一当前选区，并 SHALL 刷新 hover/selected overlay、display label、rect、能力信息和下一条消息隐藏 `targetSelection`。

#### Scenario: 普通 block 提升到最近可选父元素
- **WHEN** 用户已经在 Builder 预览中选中一个普通 block 目标
- **AND** 该目标的 DOM 父级存在可唯一解析的可选元素
- **AND** 用户触发 `选择上一级`
- **THEN** 系统 SHALL 将当前选区替换为该父级元素对应的 `kind: block` 目标
- **AND** 系统 SHALL 重新计算该父级目标的 selector、rect、display label 和能力信息
- **AND** 后续下一条消息 SHALL 使用提升后的 `targetSelection`，而不是继续使用原子卡片或子元素目标

#### Scenario: 普通 block 已到最外层可选区域时保持当前选区
- **WHEN** 用户已经选中 `body` 以下最外层可选普通 block
- **AND** 用户触发 `选择上一级`
- **THEN** 系统 SHALL 保持当前选区不变
- **AND** 系统 SHALL NOT 将 `body`、`html`、`head`、`script`、`style` 或其他非内容边界作为新的 `targetSelection`
- **AND** 系统 SHALL NOT 清除当前有效选区或产生错误状态

#### Scenario: 父级无法唯一解析时保持当前选区
- **WHEN** 用户触发 `选择上一级`
- **AND** preview bridge 无法为候选父级生成唯一且有效的 selector
- **THEN** 系统 SHALL 保持当前选区不变
- **AND** 系统 SHALL NOT 构造不稳定 selector 或把错误目标传递给父页面

#### Scenario: CMS island 提升到所属 parent block
- **WHEN** 用户已经选中某个 `cms-island` 目标
- **AND** 用户触发 `选择上一级`
- **THEN** 系统 SHALL 尝试使用该 `cms-island` 的 `parentBlockSelector` 解析所属普通 block
- **AND** 若解析成功，系统 SHALL 将当前选区替换为该 parent block 对应的 `kind: block` 目标
- **AND** 系统 SHALL NOT 将 CMS 渲染子节点当作普通 block 目标
- **AND** 系统 SHALL NOT 改变 `cms-island` 的 source-atomic 写入语义本身

#### Scenario: CMS island parent block 无法解析时保持 CMS 选区
- **WHEN** 用户已经选中某个 `cms-island` 目标
- **AND** 用户触发 `选择上一级`
- **AND** 该目标的 `parentBlockSelector` 无法唯一解析为 DOM 元素
- **THEN** 系统 SHALL 保持当前 `cms-island` 选区不变
- **AND** 系统 SHALL NOT 猜测相邻 block 或渲染子节点作为替代目标

#### Scenario: 提升父级前结束活动中的内联文字编辑
- **WHEN** 当前已选普通 block 内存在活动中的内联文字编辑
- **AND** 用户触发 `选择上一级`
- **THEN** 系统 SHALL 结束或丢弃当前内联编辑态
- **AND** 系统 SHALL 将内联文字编辑作用域更新到提升后的目标

### Requirement: 预览就地取消选择必须清空完整选区状态
系统 SHALL 支持从预览区已选目标工具条直接取消当前选区；取消后系统 MUST 清空 iframe 内 overlay 状态、父页面选区状态、右侧当前选中提示和下一条消息隐藏目标上下文。

#### Scenario: 从预览工具条取消普通 block 选区
- **WHEN** 用户已经选中普通 block 目标
- **AND** 用户点击预览工具条中的 `取消选择`
- **THEN** 系统 SHALL 清除当前 selected overlay 和 hover overlay
- **AND** 系统 SHALL 清除父页面中的 `selectedTargetSelection`
- **AND** 系统 SHALL 隐藏右侧对话输入区上方的当前选中提示
- **AND** 下一条普通消息 SHALL NOT 自动携带刚才的 `targetSelection`

#### Scenario: 从预览工具条取消 CMS island 选区
- **WHEN** 用户已经选中 `cms-island` 目标
- **AND** 用户点击预览工具条中的 `取消选择`
- **THEN** 系统 SHALL 清除该 CMS island 的选中 overlay
- **AND** 系统 SHALL 清除其 source-atomic 隐藏上下文
- **AND** 系统 SHALL NOT 继续把该 CMS island 作为下一条消息的活动目标

#### Scenario: 取消选择时结束活动中的内联文字编辑
- **WHEN** 当前已选 block 内存在活动中的内联文字编辑
- **AND** 用户点击预览工具条中的 `取消选择`
- **THEN** 系统 SHALL 结束当前内联编辑态
- **AND** 系统 SHALL NOT 在取消后继续保留该 block 的文本编辑作用域
