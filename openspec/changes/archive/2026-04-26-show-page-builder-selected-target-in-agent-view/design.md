## Context

`page-builder` 当前已经在 [BuilderPage](/Users/liu/Documents/work/learning/Proma/apps/page-builder/src/renderer/pages/BuilderPage.tsx) 中维护 `selectedTargetSelection`，并在发送下一条消息前把该目标通过结构化 `targetSelection` 注入给 agent。右侧对话区当前不会把这份目标信息展示给用户，因此用户只能依赖左侧高亮记忆当前编辑目标。

现有 UI 结构允许在 `AgentView` 的 composer 容器中插入 page-builder 专用 notice，因此该提示可以放在输入框上方，不需要改动消息列表结构。与此同时，预览桥接层已经会为选中框解析一份面向用户的显示标签，右侧 notice 应该复用这份标签，而不是重新从 `selector` 或 `sourceSelector` 猜测文案。

当前选择模型分为两类：

- `block`：以 `selector` 作为目标标识
- `cms-island`：以 `sourceSelector`、`parentBlockSelector`、`htmlPath` 共同描述目标

预览层的显示标签与底层选择模型不同：

- 普通 `block` 优先显示预览层已有的 tag/命名标签，而不是原始 `selector`
- `cms-island` 显示与预览一致的组件标签，例如 `cms-content`、`cms-catalog`

## Goals / Non-Goals

**Goals:**

- 当 Builder 当前存在已选目标时，在右侧对话输入框上方显示一个高亮的当前目标提示
- 该提示只展示与预览层选中框一致的标签文案
- 用户可以直接在该提示中点击图标取消当前选中
- 使该提示与现有选区生命周期一致，包括切换选中目标、发送成功清空、发送失败保留、预览失效后清空
- 保持现有隐藏 `targetSelection` 注入链路与消息正文行为不变

**Non-Goals:**

- 修改 `targetSelection` 的语义、后端 API 或持久化结构
- 把当前选中目标写入消息列表、系统消息或用户消息正文
- 在默认 UI 中展示 `selector`、`sourceSelector`、`htmlPath` 或 `parentBlockSelector`
- 引入多选区块、历史目标列表或额外的目标管理面板

## Decisions

### Decision: 在 `AgentView` composer 内为 page-builder 增加输入框上方 notice 展示位

右侧当前选中目标属于临时的宿主 UI 上下文，而不是对话内容。将它放在输入框上方的 notice 区域可以让提示与发送动作保持最近距离，并比底部 footer 行更显眼。

备选方案：

- 在消息列表中插入系统消息。放弃原因是会污染对话历史，并且与“选区只是下一条消息上下文”的现有模型不一致。
- 在对话面板顶部新增常驻 banner。放弃原因是距离输入动作更远，而且会扩大 page-builder 对通用 Agent 布局的侵入面。
- 继续复用 composer footer 的 `composerLeadingActions`。放弃原因是位置在输入框下方，显著性不够，也不符合当前“输入框上方高亮展示”的要求。

### Decision: 展示文案直接来源于预览桥接层的 `displayLabel`

右侧提示不再直接从 `selectedTargetSelection` 推导可见文本，而是复用预览桥接层已经计算好的 `displayLabel`。这样做的原因是：

- 预览层已经有一套用户可见标签解析逻辑，右侧应与左侧选中框保持完全一致
- `selector` / `sourceSelector` 更适合内部定位，不适合作为默认的用户可见文案
- `cms-island` 在预览层里展示的是组件标签，直接复用可避免宿主侧再做重复映射

宿主侧因此维护两份紧密同步的状态：

- `selectedTargetSelection`：继续用于隐藏上下文注入
- `selectedTargetDisplayLabel`：只用于显示 notice 中的用户可见标签

当 bridge 未提供有效 `displayLabel` 时，notice 不展示回退 selector，避免把内部定位信息误暴露给用户。

备选方案：

- 直接展示 `selector` / `sourceSelector`。放弃原因是这与预览层看到的内容不一致，并且可读性更差。
- 仅依赖 `selectedTargetSelection` 在宿主侧重新推导标签。放弃原因是会复制一套解析逻辑，并引入桥接层与宿主层文案漂移风险。
- 在 notice 中继续保留固定前缀文案。放弃原因是用户已经明确要求只展示标签本身。

### Decision: notice 末尾增加一个图标化的取消选中操作

notice 除了展示标签外，还在末尾提供一个 icon-only 按钮，通过现有 `clearSelection()` 清除当前选区。这样用户无需再回到预览区重复点击才能解除当前目标。

备选方案：

- 不提供取消操作，只保留纯展示。放弃原因是交互闭环不完整，用户仍需切回预览处理。
- 使用文本按钮如“取消选中”。放弃原因是用户要求不显示额外中文文本，保持输入区更紧凑。

### Decision: 右侧提示遵循现有选区生命周期，不单独持久化

提示的显示与隐藏完全依赖现有选区生命周期：

- 选中后显示
- 重新选中时更新为最新目标
- 发送成功、取消选区、预览重载或失效后隐藏
- 发送失败时由于选区本身保留，因此提示继续保留

这保证了行为与现有 requirement 一致，并避免在刷新或会话恢复时引入新的持久化语义。

### Decision: 保持隐藏上下文注入逻辑不变

本次只增加可见反馈，不改变 `decoratePageBuilderSelectionMessage(...)`、`prepareSendPayload(...)` 或 `targetSelection` 的结构化注入协议。这样可以把变更限制在宿主 UI 层，降低回归风险。

补充说明：虽然隐藏上下文注入逻辑不变，但预览桥接消息会新增一个可选 `displayLabel` 字段，供宿主 UI 复用，不影响后端或持久化层。

## Risks / Trade-offs

- [bridge 文案未透传导致左右不一致] -> 在 preview bridge、`PreviewPane`、`BuilderPage` 三层统一传递 `displayLabel`
- [notice 显示内部 selector 暴露实现细节] -> 缺失 `displayLabel` 时不回退展示内部定位字符串
- [新增清除交互与现有选区流转不一致] -> 直接复用 `clearSelection()`，不引入新的清除分支
- [跨模块修改带来测试回归] -> 为 preview bridge、`PreviewPane`、`BuilderPage` 分别补充透传与交互测试

## Migration Plan

这是一个前端桥接与宿主 UI 联动改动，不涉及数据迁移或后端部署顺序。由于 `displayLabel` 是可选字段，可随常规前端发布上线。

若需要回滚，只需移除 `BuilderPage` notice、`PreviewPane` 转发以及 preview bridge `displayLabel` 注入，不影响现有选区隐藏上下文链路。

## Open Questions

- None.
