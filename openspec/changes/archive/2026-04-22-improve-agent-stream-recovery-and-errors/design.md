## Context

当前 Agent 流式链路对“会话是否仍在处理中”的判断存在两个不同来源：

- 前端本地 `agentStreamingStatesAtom` 中的 `running`
- 后端 `isAgentSessionActive(sessionId)` 暴露的 `/activity`

现状下，前端主要依赖 SSE 正常 EOF 后的 `finalizeStream()` 来清理 `running`。`reconcileSessionStreaming()` 虽然已经能够基于 `/activity` 清理陈旧的本地状态，但它几乎只在再次发送前触发。结果是：只要本地流式状态残留，用户即使单纯等待也不会自动恢复，page-builder 又把大量交互直接锁在 `running` 上，导致“后端可能已结束，但前端仍像卡住”的体感问题。

同时，后端虽然已经会为 TypedError 或 catch 路径持久化部分错误字段，但前端消息视图目前只渲染简化后的错误正文，没有把结构化诊断信息和原始上游错误有效暴露出来。前后端日志也缺少一条可串起来的流式生命周期时间线，排查时很难区分：是 stale UI、是真实后端活跃、还是上游模型 / SDK 失败。

## Goals / Non-Goals

**Goals:**
- 让前端在不依赖下一次发送的前提下，自动收敛 stale 的本地 streaming 状态。
- 让 page-builder 的 busy 锁定建立在真实后端活跃状态之上，避免陈旧本地状态长期锁住交互。
- 贯通错误持久化与错误展示，保留用户可读摘要、结构化诊断详情和必要的上游原始错误。
- 为前端流式生命周期、后端会话执行和上游错误映射补充详细日志，形成可追踪时间线。

**Non-Goals:**
- 不在本次 change 中引入新的 SSE terminal event 或新的推送协议。
- 不修改后端 `activeSessions` 的生命周期语义。
- 不实现通用的后端 stall watchdog 或长时间无事件自动中止逻辑。
- 不改变 page-builder 现有的业务流程边界，例如 CMS handoff 的结构化 payload 和选择保留规则。

## Decisions

### Decision: 将 stale-stream 自愈集中在 `useAgentSSE`，由 `AgentView` 触发被动 reconcile

本次不在 page-builder 单独实现一套修补逻辑，而是把 stale-stream 自动恢复做成通用 Agent 会话能力：

1. `useAgentSSE` 继续保留 `reconcileSessionStreaming(sessionId)` 作为唯一对账入口。
2. `AgentView` 在以下时机触发被动 reconcile：
   - 会话视图挂载或切换到某个 `sessionId` 后，若本地仍为 `running`
   - 刷新后重新加载消息时，若本地不 busy 但最后一条持久化消息仍是 `user`
   - 窗口重新聚焦或页面从 hidden 变为 visible，若本地仍为 `running`
   - 本地 `running` 持续一段时间且长期没有新流式活动时
3. page-builder 继续通过 `AgentView` 复用这套能力，不单独维护另一套探测逻辑。

选择这一方案而不是 page-builder 定制补丁的原因：

- stale 状态不是 page-builder 专属问题，普通 AgentView 也会受影响。
- page-builder 目前只是被 `running` 依赖放大了问题，不是问题根源。
- 统一在 `useAgentSSE` / `AgentView` 收敛，可以让普通发送和 programmatic send 共享同一套恢复行为。

替代方案：

- 只在 page-builder 的 `BuilderPage` 里做 busy 解锁：实现更快，但会让普通 Agent 会话继续保留 stale 行为。
- 在 `agent-atoms` 收到 `complete` 后直接 `running=false`：会引入“前端已放开、后端仍 active”的竞态。

### Decision: 刷新后以“最后一条消息仍为 `user` + `/activity`”恢复本地 busy，而不是等发送时撞 409

刷新页面会断开 SSE，但不会隐式中止后端执行，因此“本地不 busy”与“后端已空闲”并不等价。本次补充一条刷新恢复策略：

1. `AgentView` 在完成消息加载后，若本地不处于 `running`，但消息历史最后一条仍为 `user`，则主动探测 `/activity`。
2. 当后端返回 `active=true` 时，前端重新建立本地 busy 状态，并复用现有被动 reconcile / stale finalize 逻辑继续等待恢复。
3. 若用户发送时仍撞到后端 409，前端将其视为“已有执行仍在进行”的状态接管信号，而不是普通发送失败提示。

选择这一方案的原因：

- 刷新后的根问题是“前端不知道已有执行仍在继续”，应在会话恢复阶段尽早修正，而不是留到下一次发送时才发现。
- 仅依赖发送时处理 409 会先暴露一次误导性的错误文案，体验仍然割裂。
- 继续使用 `/activity` 作为权威事实，可以在不新增 SSE 订阅协议的前提下覆盖刷新重进场景。

### Decision: 为前端流式状态增加最近活动时间，基于“无新活动”而不是仅凭 `startedAt` 触发 reconcile

现有状态只有 `startedAt`，无法区分“刚开始处理”和“已经很久没有新帧但仍未 finalize”。本次将补充一个最近流式活动时间字段，例如 `lastActivityAt`，并在以下路径更新：

- 开始发送、初始化 streaming state 时
- 每次成功解析并应用 SSE frame 时
- 需要时在显式 finalize 时保留收尾时间用于日志

被动 reconcile 的长时间探测将基于“当前仍 running 且 `lastActivityAt` 距今超过阈值”来触发，而不是仅看 `startedAt`。

选择这一方案的原因：

- 可以避免对刚开始的正常请求过早触发 activity probe。
- 可以为日志提供更有意义的“最后一次有流式活动”时间点。
- 可以让普通会话和 page-builder 程序化发送共享统一阈值逻辑。

替代方案：

- 继续只用 `startedAt`：难以区分长任务和陈旧残留。
- 完全靠 focus / visibility 事件触发：对长期停留在当前页且不切换焦点的场景恢复不够及时。

### Decision: 继续以后端 `/activity` 作为是否仍 busy 的权威事实，不新增本次协议

本次不引入新的 SSE 终止事件。被动 reconcile 仍使用现有 `/api/sessions/:sessionId/activity` 判断真实活跃状态：

- `active=true`：保持当前 busy 状态，不自动解锁。
- `active=false`：中止陈旧的本地 controller、调用 `finalizeStream()`、清理错误横幅并触发消息刷新。

选择这一方案的原因：

- 现有后端接口和 `reconcileSessionStreaming()` 已具备核心能力。
- 本次目标是先解决“假忙”，不额外扩大到流式协议重构。
- 不改 `activeSessions` 语义，可以减少对现有并发保护与 stop 流程的影响。

替代方案：

- 新增 terminal event：方向合理，但会把本次改动扩大到前后端协议层。
- 仅按前端本地时间自行清理：风险过高，容易在后端仍 active 时误解锁。

### Decision: 错误链路统一保留“摘要 + 结构化详情 + 原始错误”，前端默认折叠展示详情

本次将统一错误的三个层次：

- 用户摘要：适合直接阅读的错误文案
- 结构化诊断：错误代码、标题、详情列表、可重试动作等
- 原始错误：Provider / SDK / stderr / stack 中必要的原始文本

后端将继续把 TypedError 的结构化字段写入 status message，并补强 catch 路径，让普通失败也尽量写入 `errorDetails` / `errorOriginal`。前端 `AgentMessages` 将把这些信息渲染为：

- 主区域展示摘要
- 折叠区展示诊断详情
- 另一折叠区展示原始错误

page-builder 的 handoff 失败将继续保留弹框与现场，同时同步展示可读失败摘要；完整诊断上下文仍以对话中的错误消息为主。

选择这一方案的原因：

- 满足排查需求，同时避免默认把底层噪声直接压到主时间线文案。
- 复用现有 status message 存储结构，不引入新的错误消息类型。
- 能区分“流式状态异常”和“上游模型失败”。

替代方案：

- 只显示 toast / banner 摘要：诊断价值不足。
- 默认直接展示全部 raw error：会显著降低时间线可读性。

### Decision: 为前后端补充结构化生命周期日志，并优先使用同一组上下文字段

本次日志目标不是“更多 console”，而是让一次会话可以被串成完整时间线。前端与后端日志都统一尽量带上：

- `sessionId`
- `workspaceId`（若有）
- `phase`
- `source`（普通发送、programmatic send、reconcile、stop 等）

前端重点记录：

- 发送开始
- streaming state 初始化
- 收到首帧 / 末帧 / complete 语义
- 被动 reconcile 触发与结果
- finalize 与错误收敛
- page-builder programmatic handoff 发送与 settled

后端重点记录：

- `/send` 接入与并发拒绝
- `activeSessions` add/delete
- `callbacks.onError` / `callbacks.onComplete`
- SSE session create / close / cancel
- 上游 SDK / Provider 错误摘要与原始错误映射

选择这一方案的原因：

- 不改变现有业务协议即可显著提升排查效率。
- 能快速区分 stale UI 与真实后端活跃。
- 能为后续若仍需引入 terminal event 或 stall watchdog 提供证据。

替代方案：

- 仅补后端日志：无法解释前端为什么一直保持 `running=true`。
- 仅补前端日志：无法确认后端是否仍 active。

## Risks / Trade-offs

- [被动 reconcile 触发过于频繁] → 通过单 session 单飞、冷却窗口和“仅在仍 running 时触发”来限制频率。
- [错误详情过多导致 UI 噪声上升] → 默认折叠展示结构化诊断和原始错误，只把摘要放在主区域。
- [catch 路径原始错误包含过多技术细节] → 前端优先展示摘要，原始错误作为显式展开内容，并在实现时对明显敏感字段做基础裁剪。
- [前端自动恢复与用户手动 stop 互相干扰] → 继续保留现有 stop / detached / stopping 分支语义，只在后端明确 idle 时触发被动 finalize。
- [page-builder 仍可能遇到“后端真忙”场景] → 这是有意保留的范围边界，本次只解决 stale local busy，不解决通用 stall。

## Migration Plan

1. 扩展前端流式状态结构，补充最近活动时间并在收帧路径更新。
2. 在 `useAgentSSE` 中抽出可复用的被动 reconcile 触发策略，保证与现有 `reconcileSessionStreaming()` 逻辑一致。
3. 在 `AgentView` 中接入挂载、focus、visibility 和长时间无活动探测。
4. 让 page-builder 继续通过 `AgentView` 复用上述能力，并补齐 programmatic handoff 的失败反馈。
5. 补强后端错误持久化字段，前端升级 status/error 消息渲染。
6. 为前端和后端关键生命周期节点增加结构化日志。
7. 更新相关测试，验证 stale state 自动恢复、programmatic handoff 自愈和错误详情展示。

回滚策略：

- 若被动 reconcile 触发策略引发副作用，可先回滚触发入口，仅保留现有“发送前 reconcile”逻辑。
- 错误详情展示可与底层错误持久化分离回滚，必要时先保留后端字段增强，关闭前端折叠区渲染。

## Open Questions

- 暂无阻塞本次实现的开放问题。
- 若后续仍频繁出现“后端真实活跃但长期无事件”的场景，应在下一次 change 中单独设计通用 stall watchdog，而不是继续扩大本次范围。
