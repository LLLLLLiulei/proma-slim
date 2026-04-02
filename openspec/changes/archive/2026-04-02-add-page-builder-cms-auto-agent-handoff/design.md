## Context

当前 `page-builder` 在 CMS 绑定主路径上已经具备三个前置能力：

- 区块级入口与已选区块上下文，`BuilderPage` 能稳定持有当前 `selectedSelector`
- `CmsBrowserDialog` 的结构化确认结果，能返回 `PageBuilderCmsSelectionResult`
- `cms-binding-apply` skill contract，能约束确认后的自动应用决策输入输出

但主路径仍然断在“确认选择”这一步。当前 [`BuilderPage.tsx`](/Users/liu/Documents/work/learning/Proma/apps/page-builder/src/renderer/pages/BuilderPage.tsx) 的 `handleCmsSelectionConfirm` 只做日志输出，尚未把确认结果升级为一次真正的 Agent handoff。

与此同时，运行时其实已经具备 Module 4 需要的关键基础设施：

- `AgentSendInput` 已支持 `composedUserMessage` 与 `mentionedSkills`
- `agent-orchestrator` 已支持程序化 `mentionedSkills`，并会注入 `<mentioned_tools>`
- page-builder 工作区内的 `AskUserQuestion` 已支持在同一会话内阻塞澄清并回流答案

因此，本次 design 的重点不是重新设计 skill，也不是提前做 HTML apply，而是把“确认 CMS 选择”可靠地接到“当前 Builder 会话中的下一轮 Agent 回合”上。

需要额外注意的现实约束有两点：

- 自动 handoff 不能要求用户再手动补发一条消息
- 自动 handoff 不能破坏当前聊天面板的消息时间线、输入草稿和会话连续性

## Goals / Non-Goals

**Goals:**

- 在用户确认 CMS 选择后，自动向当前 Builder 会话发起一轮 Agent 消息。
- 将本次 handoff 的运行时输入稳定组装为 `PageBuilderCmsApplySkillInput`。
- 明确可见消息、隐藏结构化 payload 与程序化 skill 注入三者的分层关系。
- 显式强制调用 `cms-binding-apply`，而不是依赖用户可见消息中的 `/skill:` 文本。
- 保持当前会话连续性，并让后续 `AskUserQuestion` 澄清仍然落在同一条对话时间线内。
- 定义发送中、会话忙碌、发送失败时的 UI 规则，确保失败不会丢失当前 CMS 选择结果。

**Non-Goals:**

- 不在本模块中识别目标区块的最终语义类型，`blockTypeHint` 仍保持可选。
- 不在本模块中提供 block snapshot tooling。
- 不在本模块中实现本地 HTML/CSS/JS 修改、预览刷新或持续绑定持久化。
- 不新增一个新的“系统消息”类型来替代当前用户消息时间线。
- 不处理对话驱动打开 CMS 选择器的次路径；本模块只处理“确认选择后的自动 handoff”。

## Decisions

### 1. `BuilderPage` 继续作为自动 handoff 的编排拥有者

本次 handoff 的发起点放在 `BuilderPage` 的 `handleCmsSelectionConfirm`，而不是下沉到 `CmsBrowserDialog` 或上推到主进程。

链路保持为：

```text
CmsBrowserDialog onConfirmSelection
  -> BuilderPage.handleCmsSelectionConfirm
  -> 组装 skill input 与 handoff request
  -> 触发当前 AgentView 执行一次 programmatic send
```

这样做的原因：

- `BuilderPage` 本来就是当前页面区块上下文、当前 sessionId / workspaceId、预览状态与 CMS 弹框开关的拥有者。
- `CmsBrowserDialog` 只负责“浏览与确认”，不应该承担发送 Agent 消息的职责。
- 主进程并不知道当前弹框、区块选中和聊天面板的细粒度 UI 状态，不适合直接编排确认后的 UI 行为。

备选方案：

- 由 `CmsBrowserDialog` 直接触发发送。缺点是组件职责失衡，并且会把弹框耦合到 Agent 运行时。
- 由主进程在收到选择结果后自行发起会话。缺点是丢失前端 UI 状态协同能力，且不利于失败重试。

### 2. 自动 handoff 仍由 `BuilderPage` 发起，但发送执行委托给 `AgentView`

本次不让 `BuilderPage` 直接调用底层 `sendMessage`，而是由 `BuilderPage` 生成一个 programmatic send request，再交给右侧已挂载的 `AgentView` 执行发送。

建议新增一个窄接口，例如：

```text
BuilderPage
  -> 传入 AgentView.programmaticSendRequest
AgentView
  -> watch 新 requestId
  -> 调用内部发送逻辑
  -> 回调 onProgrammaticSendSettled(result)
```

核心原因：

- `AgentView` 已持有本地消息列表、optimistic user message、streaming 状态、草稿输入与待发送附件等状态。
- 如果 `BuilderPage` 绕过 `AgentView` 直接走底层 SSE 发送，聊天列表在发送开始时拿不到本地 optimistic user message，只会在流结束后通过刷新回补，时间线体验会变差。
- `AgentView` 的普通输入框发送逻辑还会合并 `workspaceId`、attached directories、错误恢复与流式状态；自动 handoff 复用同一发送宿主更稳妥。

这里的关键不是把编排权交给 `AgentView`，而是把“真正写入当前会话 UI 时间线”的执行权留在 `AgentView` 内部。

备选方案：

- `BuilderPage` 直接调用 `useGlobalAgentListeners().sendMessage`。优点是实现简单；缺点是会绕开 `AgentView` 的 optimistic message、本地草稿保护和现有发送状态编排。
- 给 `AgentView` 暴露一个 imperative ref。可行，但会让控制流更隐式；prop-driven request 更符合当前 React 数据流。

### 3. 为自动 handoff 单独引入一条“programmatic send”发送分支，而不是复用 composer draft 发送

`AgentView` 当前的 `sendDraftMessage()` 以“输入框当前草稿 + 待发送附件”为前提，并会在成功后清空草稿和附件。自动 handoff 不应复用这条路径。

本次建议将 `AgentView` 内部发送拆成两层：

- 通用底层发送执行函数：负责 optimistic message、streaming、实际 `sendMessage()` 调用与错误恢复
- 两个上层入口：
  - composer draft send
  - programmatic handoff send

programmatic handoff send 的特殊规则：

- 不读取用户当前输入框草稿
- 不消费当前待发送附件
- 不在成功后清空草稿或附件
- optimistic message 只使用自动 handoff 的短可见消息

这样做的原因：

- 用户可能在打开 CMS 弹框前已经在输入框里写了一段草稿；自动 handoff 不应该把这段草稿抹掉。
- 自动 handoff 是一条系统编排触发的会话消息，而不是输入框当前内容的另一种提交方式。

备选方案：

- 直接复用现有 `sendDraftMessage()`。缺点是会错误清空输入框状态，并把用户草稿误当成这次 handoff 的一部分。

### 4. handoff payload 采用“可见短消息 + 隐藏结构化 `composedUserMessage`”双层结构

本次 handoff 的输入不通过自然语言自由拼接，而是明确拆成两层：

`userMessage`
- 写入用户可见时间线
- 内容保持简短，例如“请根据刚确认的 CMS 选择结果，判断如何应用到当前区块。”

`composedUserMessage`
- 只给运行时消费，不写入可见消息历史
- 包含稳定的结构化 payload 和少量运行提示

建议形态：

```text
请处理刚确认的 CMS 选择结果，并仅在当前区块范围内判断是否可以 replace-current。
<cms_binding_apply_input>
{ ...PageBuilderCmsApplySkillInput JSON... }
</cms_binding_apply_input>
```

这样做的原因：

- 可见时间线保持简洁，用户能理解系统刚刚自动做了什么。
- 运行时拿到的是稳定 JSON，而不是“从一大段自然语言里猜结构”。
- `composedUserMessage` 本来就是当前运行时支持的隐藏消息通道，适合承载本模块的结构化 handoff。

同时，本次明确不复用 `decoratePageBuilderSelectionMessage()`：

- 那条路径只会附加选中的 `selector`
- 这次 handoff 已经持有完整的 `PageBuilderCmsApplySkillInput`
- 再叠一层通用 selection decorator 只会造成重复与语义混杂

备选方案：

- 只发自然语言，不发结构化 payload。缺点是无法稳定对齐 Module 3 contract。
- 把全部 JSON 直接写进 `userMessage`。缺点是污染聊天时间线，且用户不可读。

### 5. skill 注入通过程序化 `mentionedSkills` 完成，不依赖可见 `/skill:` 文本

本次 handoff 明确使用：

```text
mentionedSkills: ['cms-binding-apply']
```

而不是把 `/skill:cms-binding-apply` 拼进可见消息正文。

这样做的原因：

- 运行时已经明确支持程序化 skill 注入，这条链路比依赖可见文本正则更稳定。
- 用户可见消息应服务于理解时间线，而不是承载运行时控制指令。
- 这能避免未来因为用户可见消息被本地化、改文案或被 UI 包裹而影响 skill 装载。

备选方案：

- 在可见消息前面硬插 `/skill:cms-binding-apply`。缺点是把控制语义暴露到聊天时间线，且耦合到 UI 层的正则提取实现。
- 只在 `composedUserMessage` 中写提示，不传 `mentionedSkills`。缺点是 skill 装载链路不够硬。

### 6. `PageBuilderCmsApplySkillInput` 由前端显式组装，并使用固定的 Phase 1A 默认值

本模块不让 skill 自己从松散上下文反推输入，而是在确认 CMS 选择后由前端一次性构建完整 input。

建议固定组装：

```text
version: 1
entryPoint: 'cms-browser-confirm'
applyIntent: 'replace-current'
workspacePolicy:
  scope: 'target-block-only'
  allowPageRewrite: false
  allowCrossBlockMutation: false
  outputTarget: 'workspace-files/index.html'
targetBlock:
  selector: selection.targetBlock.selector
selection: 原始 PageBuilderCmsSelectionResult
uiContext:
  notes:
    - opened-from:block-toolbar
```

本次不强制生成：

- `blockTypeHint`
- `blockLabel`
- `snapshotAvailable`

理由：

- 这些字段当前没有稳定来源，硬生成会把 Module 4 误做成区块语义识别模块。
- Module 3 已允许它们保持可选，后续由 snapshot tooling 和 skill fallback 补足即可。

备选方案：

- 只传 `selection` 和 `selector`，其余字段交给 skill 自行猜测。缺点是违背 Module 3 中“统一结构化输入”的目标。

### 7. 发送状态采用“阻断并保留现场”的策略，不做排队或抢占

自动 handoff 在以下场景必须阻断：

- 当前 Agent 会话正在 streaming
- 当前已经存在一个未完成的 CMS handoff request

建议 UI 规则：

- 确认按钮在 busy 时禁用，或点击后给出明确提示
- 成功发送后关闭 CMS 弹框
- 发送失败时保持 CMS 弹框打开，并保留当前已选栏目 / 内容结果
- 发送失败时不清空当前选中的页面区块

这样做的原因：

- 当前运行时本身已经拒绝并发发送；前端不应继续堆积一个不可执行的请求。
- 用户刚完成的 CMS 勾选具有较高操作成本，失败后必须允许原地重试。
- 保留当前区块选中态，有助于用户继续理解这次自动应用针对的是哪个目标。

备选方案：

- 当前会话 busy 时自动 stop 再发送。缺点是会打断用户现有回合，风险太高。
- 做发送排队。缺点是超出本模块范围，也会让错误恢复和时间线更复杂。

## Risks / Trade-offs

- [Risk] 通过 `AgentView` 新增 programmatic send 通道，会增加聊天组件的表面积
  → Mitigation: 接口保持极窄，只接受显式 request 和 settled 回调，不让外部操纵其内部草稿或消息状态。

- [Risk] 自动 handoff 的可见消息仍以 `user` 角色落到时间线中，长期看不够语义化
  → Mitigation: 第一阶段接受“短用户消息”方案，后续若需要更强区分，再单独设计系统消息类型，而不是在本 change 中提前扩展消息模型。

- [Risk] `BuilderPage` 和 `AgentView` 之间会新增一次双向协同，测试面扩大
  → Mitigation: 将协同边界收敛为 request / settled 两个接口，并补足 `BuilderPage` 与 `AgentView` 的单元测试覆盖。

- [Risk] 自动 handoff 期间如果 `AgentView` 尚未准备好上下文，可能导致附加目录或本地状态不完全一致
  → Mitigation: `AgentView` 继续作为发送宿主，由其沿用既有 workspace / session 上下文解析逻辑；programmatic send 不单独复制一套路径。

- [Risk] `entryPoint` 的命名仍容易和 CMS 选择器的 UI 入口混淆
  → Mitigation: 在 design 和后续 spec 中明确：skill input 的 `entryPoint` 固定表示“本轮 handoff 的触发来源”，UI 原始入口作为 `uiContext.notes` 保存。

## Migration Plan

1. 在 `BuilderPage` 中新增 CMS handoff request 状态，替换当前仅日志输出的 `handleCmsSelectionConfirm`。
2. 在 `AgentView` 中新增 programmatic send request / settled 回调能力，并将现有发送逻辑拆成 draft send 与 programmatic send 两个入口。
3. 在 `BuilderPage` 中组装 `PageBuilderCmsApplySkillInput`，生成可见消息、隐藏 `composedUserMessage` 与 `mentionedSkills`。
4. 让 `BuilderPage` 根据 `AgentView` 的 settled 结果处理弹框关闭、失败保留与重试提示。
5. 更新测试：
   - `BuilderPage` 不再只断言 `console.info`
   - 覆盖“确认后生成 request”“busy 时阻断”“失败保留选择”“成功关闭弹框”
   - 覆盖 `AgentView` programmatic send 不清空 draft / attachments、能写入 optimistic user message、能透传 `composedUserMessage` 和 `mentionedSkills`

回滚策略：

- 若 programmatic send 路径引入不可接受回归，可先移除 `BuilderPage` 到 `AgentView` 的 request 连线，退回到“确认后仅记录结果”的现状，而不影响既有手动对话发送链路。

## Open Questions

- 当前阶段无阻塞性开放问题。
- 后续可评估：是否需要为自动 handoff 引入一种区别于普通用户输入的消息展示样式，但这不应阻塞 Module 4 的实现。
