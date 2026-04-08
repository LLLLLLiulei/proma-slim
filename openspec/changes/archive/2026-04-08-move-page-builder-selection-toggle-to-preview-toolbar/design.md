## Context

`page-builder` 当前已经具备一套完整的区块选择链路：

- `BuilderPage` 持有 `selectionActionState`、`selectedSelector` 和消息装饰逻辑，是选区状态与对话发送的协调层。
- `PreviewPane` 已经持有预览工具栏、iframe 宿主、设备模式切换，以及基于 `selectionModeEnabled` 的桥接同步能力。
- 当前用户可见的区块选择主入口仍挂在右侧 `AgentView` 的 composer 动作区域，与真正发生选区行为的左侧预览面板分离。

这带来两个直接问题：

- 用户需要先看左侧预览、再回到右侧输入区点击“选择进行编辑”，入口与目标区域不在同一操作上下文内。
- 现在的选择状态不仅服务于区块 hover / selected，还会驱动区块工具条、消息微调和后续区块级操作，因此入口迁移如果连同状态一起搬动，容易把 `PreviewPane` 变成新的业务状态拥有者，破坏现有职责边界。

同时，本次变更存在两个明确约束：

- 只迁移用户可见入口，不重写已有 `idle -> armed -> selected -> idle` 选择状态机，也不改变消息装饰和刷新清选区行为。
- 对话区中的旧入口先隐藏，不直接删除相关状态和切换逻辑，便于平滑回退和阶段性验证。

## Goals / Non-Goals

**Goals:**

- 将区块选择主入口从对话输入区迁移到左侧预览工具栏。
- 保持 `BuilderPage` 继续作为区块选择状态和消息上下文装饰的唯一拥有者。
- 让预览工具栏中的选择按钮支持 `idle`、`armed`、`selected` 三种视觉状态，并在再次点击时清空当前选区。
- 保持现有预览桥接、区块工具条、图片替换、删除、内联编辑和消息微调行为不变。
- 在 agent 处理中继续禁用选择入口，避免与现有保护逻辑冲突。

**Non-Goals:**

- 不修改 iframe 预览桥接协议或新增后端接口。
- 不改变区块工具条的能力集合、布局或锚定机制。
- 不新增多选、锁定选择、历史选择或跨区块批量编辑。
- 不删除底层 composer 相关状态辅助逻辑，只移除其作为用户可见主入口的职责。

## Decisions

### 1. `BuilderPage` 继续作为区块选择状态的唯一来源

本次不把区块选择状态迁移到 `PreviewPane`。`BuilderPage` 继续持有：

- `selectionActionState`
- `selectedSelector`
- `hoveredSelector`
- `messageDecorator`
- `handleToggleSelectionMode`
- `clearSelection`

`PreviewPane` 只新增一个工具栏入口，并通过 props 接收：

- 当前选择状态或至少可推导的按钮状态
- 是否允许切换（如 agent 是否正在处理）
- 切换回调

这样做的原因：

- 选区结果最终仍然服务于消息发送链路，而消息发送入口在 `BuilderPage` / `AgentView` 一侧。
- 如果让 `PreviewPane` 持有主状态，后续还需要把已选区块再同步回 `BuilderPage`，会形成双向同步和状态错位风险。
- 这次变更本质是“入口迁移”，不是“状态模型重构”。

备选方案：

- 让 `PreviewPane` 自己维护 `selectionActionState` 并把结果反向同步到 `BuilderPage`。缺点是会把预览组件抬升成业务编排层，增加耦合。

### 2. 预览工具栏新增图标化区块选择入口，并与 `PC / Mobile` 归为同一控制组

新的选择入口放在 `PreviewPane` 左侧控制组中，与 `PC / Mobile` 设备模式切换并列，而不是放入导出、刷新、新窗口等项目级操作组。

按钮采用 `icon-only` 形态，但必须保留：

- `aria-label`
- `title`
- `aria-pressed`

按钮视觉状态建议直接映射现有三态：

- `idle`: 常规中性态
- `armed`: 已开启选择模式但尚未选中区块，使用轻高亮
- `selected`: 已选中区块，使用更明确的高亮

这样做的原因：

- 设备模式切换和区块选择都属于“预览交互模式”，与导出、刷新、新窗口等“页面操作”语义不同。
- 图标化后必须通过明确的 pressed/highlight 状态补足文字减少带来的语义损失。

备选方案：

- 继续把入口放在对话区，仅把样式做弱化。缺点是没有解决入口位置和操作目标分离的问题。
- 把按钮放在右侧操作组。可行，但会弱化它与预览交互模式的关系。

### 3. 隐藏 composer 侧入口，但保留底层状态与切换函数

这次不删除 `BuilderPage` 中已有的选择状态辅助方法，也不要求彻底移除与 composer 动作相关的所有代码路径。实现上优先做“停止向 `AgentView` 暴露可见入口”，而不是重构掉整个旧结构。

可行做法包括：

- 不再传入 `composerLeadingActions`
- 或传入空内容 / 不渲染入口

但保留：

- `handleToggleSelectionMode`
- `clearSelection`
- 选择状态与消息装饰链路

这样做的原因：

- 用户已经明确要求先隐藏而不是直接删除。
- 先隐藏入口、保留底层逻辑可以降低回退成本，也方便后续观察预览工具栏入口是否覆盖了全部使用场景。

备选方案：

- 直接移除 composer 入口相关所有逻辑。短期更干净，但会扩大改动面，也不符合当前阶段目标。

### 4. 再次点击预览工具栏入口时，复用现有 `clearSelection()` 完成退出与清空

新的工具栏入口在点击行为上复用现有模式切换逻辑：

- `idle -> armed`
- `armed -> idle`
- `selected -> idle`

当按钮处于 `armed` 或 `selected` 时再次点击，系统通过现有 `clearSelection()`：

- 清除当前 hover 高亮
- 清除当前 selected 区块
- 清除待替换图片等与当前选区绑定的临时上下文
- 让 `selectionModeEnabled` 变为 `false`
- 触发 `PreviewPane` 继续向 iframe 发送 `selection-clear`

这样做的原因：

- 退出选择模式和清空当前选区本来就是同一语义动作，不需要新增第二套“仅关闭按钮高亮、不清空选区”的中间状态。
- 复用现有清理函数可以保证图片区块工具条、消息装饰和桥接清选行为一起收敛。

### 5. 消息微调后的选区保留与刷新清理行为保持不变

入口迁移不改变当前微调链路：

- 已选区块后发送微调消息时，当前选区仍然保留
- 直到预览真正刷新或桥接发出 reset，系统才自动清空选区

这意味着新的预览工具栏按钮在“消息已发出但预览尚未刷新”的阶段仍然保持活动态，而不会因为点击发送按钮立即回到 `idle`。

这样做的原因：

- 这是当前 Builder 已经验证过的用户心智：消息发出后，仍然围绕当前区块等待结果。
- 若入口迁移后改为“发送即清空”，会造成同一能力在不同入口下行为不一致。

### 6. 测试以“入口迁移 + 状态不回归”为主

本次设计的测试重点应放在：

- `BuilderPage` 不再向 `AgentView` 提供可见的选择入口
- `BuilderPage` 继续把选择状态、切换回调和禁用态传给 `PreviewPane`
- `PreviewPane` 工具栏新增选择按钮，并能正确反映 `idle / armed / selected`
- 再次点击按钮会清空当前选区
- agent 处理中按钮保持禁用
- 已选区块后发送消息直到预览刷新前，按钮状态不回归

这样做的原因：

- 本次改动的主要风险不在 bridge 或后端，而在入口迁移后 UI 与状态机是否仍然一致。

## Risks / Trade-offs

- [Risk] 图标化入口降低了文字可见性，新用户可能不易第一时间理解按钮含义
  → Mitigation: 保留 `title` / `aria-label`，并通过明显的 `armed` / `selected` 高亮态增强反馈。

- [Risk] `PreviewPane` 接收更多与选择状态相关的 props，局部接口会变宽
  → Mitigation: 只传按钮渲染与切换所需的最小集合，不把消息装饰或业务逻辑下沉到 `PreviewPane`。

- [Risk] 旧 composer 入口隐藏但逻辑仍在，短期内会存在“代码保留、入口迁移”的过渡状态
  → Mitigation: 在设计和任务中明确这是有意的阶段性保留，不把它误当成遗留死代码。

- [Risk] 退出选择模式时自动清空当前已选区块，用户可能误操作丢失上下文
  → Mitigation: 保持按钮高亮足够明确，让“再次点击即关闭并清空”的行为具有清晰反馈。

## Migration Plan

1. 在 `BuilderPage` 中停止向 `AgentView` 暴露可见的选择按钮，但保留现有选择状态和切换逻辑。
2. 为 `PreviewPane` 新增选择入口 props，并在预览工具栏左侧控制组中渲染图标按钮。
3. 将按钮视觉状态映射到 `idle / armed / selected`，并在点击时调用父层切换逻辑。
4. 更新 `BuilderPage` 与 `PreviewPane` 测试，验证入口迁移、禁用态、清空选区和既有微调行为不回归。

回滚策略：

- 若预览工具栏入口的交互效果不符合预期，可恢复向 `AgentView` 暴露旧入口，同时保留 `PreviewPane` 内的新增控件代码做进一步迭代；由于底层状态模型未动，回滚成本较低。

## Open Questions

- 当前没有阻塞实现的开放问题。
