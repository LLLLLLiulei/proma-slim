## Context

当前后端的 auto-compact 恢复流程已经存在：

- `agent-orchestrator` 会在上下文过长的 typed error / catch 路径触发嵌套 `/compact` 恢复。
- `claude-agent-adapter` 已经把 SDK system 消息翻译为 `compacting` 与 `compact_complete` 事件。
- 前端 `agent-atoms` 已接收并维护 `isCompacting` 状态，但 `AgentMessages` 还没有把它渲染给用户。
- 共享的 `StatusNotice` 目前只承载鉴权、限流等瞬时提示，也没有被 auto-compact 使用。
- 用户显式发送 `/compact` 时，同样会经历相同的 compact 生命周期事件。

因此，系统实际上已经具备“知道 compact 正在发生”的能力，只缺少统一的用户可见表达。由于 page-builder 和主应用都复用了共享 `AgentView`，本次变更不需要增加 page-builder 专属机制，只需要把共享会话流式 UI 补齐。

## Goals / Non-Goals

**Goals:**
- 在所有共享 `AgentView` 场景中展示 compact 的开始与成功状态。
- 明确区分“正在压缩上下文”和普通“正在处理中”。
- 成功文案固定为 `已压缩，继续处理中`。
- 让 compact 提示保持瞬时状态，不写入持久化消息历史。
- 在恢复后的真实执行继续推进时自动清理成功提示，避免界面长期悬挂旧状态。

**Non-Goals:**
- 不把 auto-compact 状态写成新的会话消息或新的持久化消息类型。
- 不为手动 `/compact` 设计另一套独立文案或单独 UI 流程。
- 不重做整套 `status_notice` 体系，也不为 `AgentEvent` 引入新的 compact 专用事件类型。
- 不修改 page-builder 的单独页面逻辑；page-builder 只通过共享 `AgentView` 继承该能力。

## Decisions

### Decision: 复用现有 compact 生命周期事件，并在前端本地派生 compact 提示

用户可见状态采用“两层信号”：

- `compacting` / `compact_complete` 继续作为机器可判定的生命周期事件，用来驱动本地 `isCompacting`。
- 共享 `AgentView` 基于这些生命周期事件在前端本地派生瞬时提示：
  - 开始时显示中性文案 `正在压缩上下文，请稍候…`
  - 成功后显示 `已压缩，继续处理中`

选择这一方案而不是新增专用 `auto_compact_status` 事件的原因：

- 现有 SSE 合同已经能表达 compact 生命周期，无需再加一类专门事件。
- 手动 `/compact` 与自动恢复共享同一套 compact 生命周期，因此不需要再区分 auto / manual 来源。
- `StatusNotice` 已经是共享 `AgentView` 中现成的瞬时提示区域，复用成本最低。

替代方案：

- 新增专用前后端事件类型：语义更强，但对这次变更过重。
- 后端额外发 `status_notice`：可行，但在 auto / manual 已统一的前提下会引入不必要的事件分叉。
- 只改 loading 文案，不显示 notice：用户仍然难以理解是 compact 还是一般处理中。

### Decision: 开始提示使用中性文案，成功提示继续使用既定文案

本次不再使用“上下文过长”或“自动压缩”作为开始提示，而是统一使用中性文案 `正在压缩上下文，请稍候…`；成功提示保持为用户已确认的 `已压缩，继续处理中`。

原因：

- 手动 `/compact` 同样需要展示 compact 状态，原先的“上下文过长 / 自动恢复”表述会产生事实错误。
- 成功文案已经被明确敲定，不需要再做分支化处理。
- 开始态使用中性文案后，所有 compact 场景都可以共用同一套提示。

### Decision: 在共享 `AgentMessages` 中使用 `isCompacting` 切换 loading 文案

`AgentMessages` 继续作为所有 `AgentView` 的统一流式外壳：

- 当 `isCompacting = true` 时，loading 文案优先显示为 `正在压缩上下文...`。
- 当收到 `compact_complete` 且当前 turn 尚未结束时，界面继续显示瞬时外壳，文案为 `已压缩，继续处理中`。

选择这一方案而不是在 `AgentView` 上层逐个页面拼装提示的原因：

- page-builder 与主应用本来就共享 `AgentMessages`。
- 统一在共享瞬时 shell 层实现，最容易避免多入口行为分叉。

### Decision: 成功提示按事件驱动清理，而不是定时器

`已压缩，继续处理中` 应在“恢复后的真实工作开始出现”时自然消失，而不是靠固定延时：

- 文本开始输出时清理
- 工具活动开始时清理
- 若恢复后直接结束或报错，也在终态时清理

实现上，前端可在本地 stream state 中把 compact 相关 notice 标记为 `kind = 'compact'`，从而仅对这类提示应用“遇到后续真实事件即清理”的规则，不误伤鉴权、限流等其他 notice。

选择事件驱动而不是定时器的原因：

- 上游恢复耗时不稳定，固定时长容易过早消失或长期残留。
- 清理时机应绑定真实执行进展，而不是主观猜测。

### Decision: compact 提示保持瞬时 UI，不持久化到会话历史

compact 状态只服务于当前流式恢复过程，不应写入 JSONL 历史，也不应在用户重新进入会话时回放。

选择这一方案而不是持久化状态消息的原因：

- compact 是内部恢复动作，不是稳定的对话内容。
- 历史消息中长期保留“正在压缩/已压缩”会污染用户真正关心的对话记录。

## Risks / Trade-offs

- [compact notice 与其他状态提示重叠] -> 通过本地 `kind = 'compact'` 标记和后续真实事件清理，只对 compact notice 应用特定清理规则。
- [手动 `/compact` 与自动恢复文案不一致] -> 使用中性开始文案和统一成功文案，不再区分 auto / manual。
- [成功 notice 在无后续文本时残留] -> 对 `complete` / `error` 终态同样执行清理。
- [不同界面未来想要不同文案] -> 本次刻意统一共享 AgentView 体验；若后续需要差异化，应新增明确的 UI 配置入口，而不是在单页面绕过共享组件。

## Migration Plan

1. 在前端 stream state reducer 中基于 `compacting` / `compact_complete` 生命周期事件派生 compact notice，并保留 `isCompacting`。
2. 在本地 stream state 中为 compact notice 增加 `kind = 'compact'` 元数据，用于后续事件驱动清理。
3. 在 `AgentMessages` 中接入 `isCompacting`，切换 loading 文案并展示 compact notice。
4. 更新共享 `AgentView` / `AgentMessages` 测试，验证主应用、page-builder 与手动 `/compact` 均使用同一行为。
5. 保留并补强 orchestrator 相关回归测试，确认 auto-compact 嵌套 query 的 compact 生命周期事件仍能被前端看见。

回滚策略：

- 若 notice 清理策略导致其他瞬时提示回归，可先回滚为只显示 compact loading 文案、不显示成功 notice，同时保留现有 compact 生命周期事件不变。

## Open Questions

- 暂无阻塞实现的开放问题。
- 若后续希望把 compact 提示升级为更可视化的阶段指示器，而不只是 `StatusNotice + loading` 组合，应作为独立 change 处理。
