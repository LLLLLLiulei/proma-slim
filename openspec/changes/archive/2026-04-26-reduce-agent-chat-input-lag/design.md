## Context

当前共享 `AgentView` 同时订阅当前会话草稿、流式状态和本地消息缓存，并在同一组件中直接渲染 `AgentMessages` 与 `RichTextInput`。长会话下，普通输入会通过 `agentSessionDraftsAtom -> AgentView rerender` 将整段 transcript 一起带入 render/reconcile，随后每条消息继续重跑 `parseAttachedFiles`、`extractToolActivities`、transient shell 判断和相关子树构造，形成可感知的 typing lag。

已有排查结论表明，这个问题的首要瓶颈不是“历史消息 DOM 每次输入都被重新 commit”，而是“输入草稿更新和消息区渲染未隔离，导致不必要的渲染计算反复发生”。同时，`RichTextInput` 自身每次输入仍然执行 `getHTML -> htmlToMarkdown -> countEditorLines`，会放大每键成本，但它不是解释“消息越多越卡”的第一主因。

这次 change 的目标是做一轮**保守**优化：

- 优先减少无效的消息区重渲染
- 不改变现有会话行为、流式行为、tool activity 展示、compact/error 展示和发送语义
- 不引入新的前端状态模型、虚拟化依赖或输入节流机制

## Goals / Non-Goals

**Goals:**

- 为共享 `AgentView` 的消息区建立渲染边界，使普通输入草稿变化不再默认重跑整段 transcript。
- 为历史消息项建立细粒度渲染隔离，降低追加消息、流式收口和父级重渲染时的重复派生成本。
- 保持 page-builder 内嵌对话与主对话页使用同一套优化后的共享行为。
- 通过回归测试明确约束“性能优化不改变发送结果与消息展示语义”。

**Non-Goals:**

- 不在本次 change 中重构 `agentSessionDraftsAtom` 为 per-session atom / atom family。
- 不在本次 change 中给 `RichTextInput` 增加 debounce、RAF 节流或异步输入同步。
- 不在本次 change 中引入消息虚拟化、替换 `use-stick-to-bottom`、改写 minimap 结构或新增第三方依赖。
- 不追求一次性解决所有长会话性能问题；本次只解决最保守、最高性价比的一层。

## Decisions

### Decision 1: 先在 `AgentMessages` 建立顶层渲染边界

`AgentMessages` 是最合适的第一层优化边界，因为：

- 它承接了整段 transcript 的遍历和 transient shell 计算。
- 普通输入时，`messages`、`streaming`、`streamState` 在大多数情况下并不会变化。
- 它目前只在共享 `AgentView` 的消息区位置使用，影响面可控。

因此第一步采用：

- 将 `AgentMessages` 包装为 `React.memo`
- 第一版优先依赖默认浅比较，而不是立即引入复杂自定义 comparator

这样可以在 draft 变化但消息区 props 稳定时，直接跳过整段 transcript 子树。

**Alternatives considered**

- 先拆 `AgentView` 为 `ComposerPane + TranscriptPane`
  - 优点：结构上更彻底
  - 缺点：改动面更大，涉及附件、banner、状态通知、发送链路，超出本次“保守优化”目标
- 先改 `agentSessionDraftsAtom` 为 per-session 订阅
  - 优点：从源头减少父组件更新
  - 缺点：需要调整状态模型和现有测试，不适合第一步

### Decision 2: 第二阶段再给 `AgentMessageItem` 建立细粒度隔离

即使 `AgentMessages` 被 memo 住，发送新消息、流式状态变化或历史消息数组变化时，消息列表仍会重新 render。为此第二阶段采用：

- 将 `AgentMessageItem` 包装为 `React.memo`
- 优先依赖 `message` 对象 identity 和默认浅比较
- 不在第一版手写复杂 comparator

这样可以利用当前消息更新路径中的对象稳定性：追加新消息时旧消息对象引用保留，只有新增项或真实变化项需要重新渲染。

**Alternatives considered**

- 直接给 `AgentMessageItem` 写自定义 comparator
  - 优点：理论上可更精细
  - 缺点：容易漏掉 `attachments`、`error*`、`model`、`events` 等影响 UI 的字段，回归风险高
- 只做 `AgentMessageItem` memo，不做 `AgentMessages` memo
  - 优点：实现简单
  - 缺点：父级消息列表的 `messages.map(...)`、transient shell 和 minimap 派生仍会在普通输入时重跑，收益不如先卡顶层边界

### Decision 3: 本次不动 `RichTextInput` 的同步节奏

虽然 `RichTextInput` 的 `onUpdate` 明显存在每键成本，但本次明确不做 debounce/RAF 节流，原因是当前发送链路直接从父组件 `inputValue` 读取待发送文本：

- `handleSend -> sendDraftMessage(inputValue)`

如果先延迟 `onChange` 同步而不同时重构发送来源，就会引入“刚输入最后几个字立即回车，发出去的是旧内容”的风险。

因此本次策略是：

- 保持 `RichTextInput` 的同步语义不变
- 先通过消息区渲染隔离拿到主要收益
- 后续若仍需继续优化，再单独设计“最新可见草稿与发送源保持一致”的方案

**Alternatives considered**

- 先给 `RichTextInput` 做 debounce
  - 缺点：高概率破坏立即发送语义
- 先在 `RichTextInput` 内维护独立 submit source
  - 缺点：这已经不是保守修复，而是输入/发送链路设计变更

### Decision 4: 用行为测试补充“渲染边界不被打穿”的回归护栏

现有测试对消息展示行为和 `AgentView` 发送行为覆盖较多，但缺少“父级 draft 变化不应导致消息区重渲染”的直接约束。本次会补充至少两类测试：

- draft 变化但 `messages / streamState` 不变时，消息区不应被重复渲染
- 追加新消息时，旧消息项在对象 identity 不变的情况下不应被重复渲染

这类测试比纯肉眼性能验证更适合作为长期护栏。

## Risks / Trade-offs

- **[`AgentMessages` 仍会在流式阶段频繁更新]** → 这是预期内权衡。本次首先解决“空闲态输入卡顿”，不承诺完全消除流式阶段的所有重渲染。
- **[`AgentMessageItem` 默认浅比较依赖上游对象稳定性]** → 当前消息更新路径已经在追加场景保留旧消息对象引用；同时补充回归测试，防止未来有人改成原地 mutate 或无谓重建。
- **[`userProfileAtom` 变化仍可能触发消息子树重渲染]** → 这类变化频率很低，接受为本次保守方案之外的残余成本。
- **[只做 memo 不能解决 `RichTextInput` 自身的每键转换成本]** → 这是已知限制，但先解决消息区无效 render 后再评估剩余瓶颈，能避免过早动输入/发送语义。
- **[性能收益需要以同规模长会话复测验证]** → 在实现任务中加入同一会话规模下的回归验证，确保优化方向确实命中实际瓶颈。

## Migration Plan

本次 change 不涉及数据迁移、接口迁移或部署迁移。

建议的实施与验证顺序：

1. 先为 `AgentMessages` 建立渲染边界并验证输入场景
2. 再为 `AgentMessageItem` 建立渲染边界并验证发送/追加场景
3. 使用现有长会话样本复测输入 long task、掉帧和发送体感
4. 若收益不足，再评估是否需要单开后续 change 处理 `RichTextInput` 或更深层状态拆分

回滚策略也很简单：

- 如出现行为回归，可分别回退 `AgentMessages` 或 `AgentMessageItem` 的 memo 改动
- 不会影响消息持久化格式、API 契约或历史会话数据

## Open Questions

- 在仅完成 `AgentMessages` memo 后，typing lag 是否已足够缓解，还是必须进入 `AgentMessageItem` 阶段才能达到可接受水平。
- `RichTextInput` 的全量转换成本在去掉消息区无效 render 后是否仍然显著，需要后续单独开 change 深挖。
