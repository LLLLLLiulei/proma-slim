## Context

当前 page-builder 的进入模型把“进入页面”和“拿到编辑锁”强绑定，并且把 workspace 下任一活跃 Agent 会话直接视为不可进入的 busy 状态。这个模型可以防止并发写冲突，但在用户关闭 builder 页面后再次打开同一项目时，会把“原会话仍在后台执行”的场景误判为普通阻断，导致无法恢复原来的 Agent 处理上下文。

本次变更面向 page-builder 的进入链路、编辑锁判定、首页历史入口和 builder 恢复逻辑，目标不是削弱并发保护，而是把“可恢复的同一 active session”与“其他页面持有的有效编辑锁”区分开来。这里的关键约束是：页面关闭后不自动停止 Agent，但重新进入时应该优先恢复仍在活跃的同一会话；只有确实存在其他编辑锁或不可恢复冲突时，才继续阻断。

## Goals / Non-Goals

**Goals:**
- 允许用户在关闭 builder 页面后重新进入并恢复仍在执行的同一 Agent 会话。
- 将“其他页面持有编辑锁”和“当前 workspace 下存在活跃 Agent 会话”拆开表达，避免把可恢复场景报成普通锁冲突。
- 让首页历史项目入口在存在活跃会话时优先恢复该会话，而不是只按最近会话或硬失败处理。
- 保持现有编辑锁、TTL、续约和释放机制的并发安全语义不变。
- 保持关闭页面后 Agent 默认继续执行，不引入页面卸载自动 stop 的副作用。

**Non-Goals:**
- 不改变 Agent 会话执行模型，不把关闭页面自动等价为停止 Agent。
- 不引入新的分布式锁存储方案。
- 不重构 CMS handoff/access session 机制本身。
- 不尝试在本次变更中解决多实例共享 active session 的跨进程一致性问题。

## Decisions

### 1. 以“可恢复 active session”扩展 edit state，而不是把它当成纯 busy 错误
现有 edit state 只有 `available`、普通锁定、Agent busy 和 export busy 几类语义。为了支持恢复，设计上需要把 workspace 下的 active Agent session 变成可被前端消费的显式状态信息，而不是只有一个布尔 busy 结果。这样首页和 builder 都可以识别“这是同一会话可恢复”还是“这是别的页面/别的 holder 的冲突”。

**备选方案：**
- 方案 A：继续只返回 `locked / available`，前端通过其他接口自行猜测 active session。缺点是恢复行为容易分散到多个调用点，且无法避免误判。
- 方案 B：让 `editState` 带上 active session 标识，并在 `acquire` 阶段区分同 session 恢复和他人占用。这个方案更直接，也更容易让首页和 builder 保持一致。

**结论：采用方案 B。**

### 2. 编辑锁判定必须先区分“其他有效锁”与“同 session 恢复”
当前锁模型是 workspace 级别的独占锁，但用户关闭页面后可能残留一个短时间的 pending release 或 TTL 未过期锁。设计上必须先判断：
- 是否存在别的页面持有有效编辑锁；
- 是否当前 URL / 当前上下文对应的会话仍然活跃；
- 是否可以把当前请求视为恢复而非新进入。

如果当前请求对应的 session 与活跃 Agent session 一致，且现有锁没有明确属于其他 session，就应该允许恢复或重发放锁。页面关闭后遗留的同 session 旧 holder 锁不应被视为“别人正在编辑”；它可以在恢复时被续约、接管或替换。只有锁属于不同 session，或后端能确认当前请求不是 active session 的恢复请求时，才按其他编辑者冲突阻断。

**备选方案：**
- 方案 A：只要 workspace 有 active Agent 就拒绝。实现简单，但会继续保留当前体验问题。
- 方案 B：引入“同 session 恢复优先”规则，并在 edit lock acquire 时允许恢复当前 active session。这个方案更符合用户关闭页面后重新进入的场景。

**结论：采用方案 B。**

### 3. 首页历史入口应优先打开 active session，而不是仅依赖 latest session
首页历史区当前按最近活跃时间展示项目，但恢复时需要打开的不是“最近更新的会话”，而是“当前仍在执行的会话”。因此设计上首页应优先使用后端返回的 `activeSessionId`；只有不存在 active session 时，才继续使用 latest session 或创建新 session。项目摘要只需要暴露恢复所需的 `activeSessionId`，不要求在本次变更中额外暴露 active session 的更新时间。

**备选方案：**
- 方案 A：继续只用 latestSessionId。缺点是可能把用户带到错误的历史会话，无法恢复后台 Agent。
- 方案 B：项目摘要额外暴露 active session 标识，首页打开时优先恢复 active session。这个方案更准确。

**结论：采用方案 B。**

### 4. Builder 页面进入时要支持恢复态，而不是只支持新进入态
Builder 页面目前在进入时默认会申请编辑锁，并将失败视为阻断。恢复方案下，Builder 页面需要支持两种进入方式：
- 正常新进入：无 active Agent，无有效锁，申请新锁。
- 恢复进入：URL 指向的 session 仍活跃，且无其他页面占用同 workspace 锁，则恢复同一会话并继续展示执行状态。
- 切换恢复：URL 指向的 session 不是 active session，但同 workspace 存在另一个 active session，则自动切换到该 active session 的 builder URL 并恢复它。

恢复态下 UI 应继续显示消息、流式状态和现有停止 Agent 操作，但不应把“可恢复的 active session”渲染成普通错误页。本次变更不新增单独的“停止后台任务并进入编辑”流程，只复用已有的停止 Agent 能力。

### 5. 不引入关闭页面即停止 Agent 的生命周期绑定
从体验上看，用户关闭页面不等于“明确放弃任务”。如果在页面卸载时自动 stop Agent，容易导致半成品、消息不完整或意外中止。因此设计上仍保持 Agent 独立于浏览器页面生命周期：页面关闭只影响前端连接和编辑锁续期，不自动停止后端 Agent。

### 6. CMS 集成入口保持 primary session 绑定语义
CMS 集成模式下，`handoff` 与 access cookie 仍 SHALL 绑定到 project binding 的 `primarySessionId`，不在本次变更中根据 workspace 下任意 active session 改写 CMS builder URL 或 access session。原因是 CMS access session、project binding、workspace-scoped CMS APIs 当前共同依赖 primary session 语义；在 `handoff/open` 阶段单点切换到另一个 active session 会造成 builder-context 与后续 CMS API 校验不一致。

因此 CMS 模式下的恢复边界是：如果正在运行的 Agent 就是该 project binding 的 primary session，编辑锁恢复逻辑 SHALL 允许重新进入并恢复；如果未来需要支持 CMS project 在多个 session 间切换恢复，需要单独设计 CMS binding / access session 的一致性迁移机制，不应混入本次 page-builder 恢复变更。

## Risks / Trade-offs

- [Risk] 恢复逻辑如果只依赖 latest session，仍可能把用户带到错误会话。→ [Mitigation] 后端显式暴露 active session 标识，首页和 builder 均优先使用该标识。
- [Risk] 编辑锁残留 60 秒会让“页面关闭后立刻重开”看起来像仍然被锁住。→ [Mitigation] 在恢复路径里明确区分“同 session 恢复”和“他人持锁”，对同 session 优先续期/恢复。
- [Risk] 多实例或外部进程共享 active session 的一致性暂时无法完全保证。→ [Mitigation] 本次仅在单实例语义下实现恢复，文档中明确说明跨实例一致性不是当前范围。
- [Risk] builder 恢复态需要前端调整较多。→ [Mitigation] 先保持后端语义清晰，再逐步让前端把硬失败改成恢复态。
- [Risk] CMS 模式下 workspace 中存在非 primary 的 active session 时，本次不会自动切换 CMS handoff 到该 session。→ [Mitigation] 遵守本变更 Non-Goal，保持 CMS handoff/access 体系一致；跨 session CMS 恢复作为后续独立变更处理。

## Migration Plan

1. 扩展 edit state 与项目摘要，让后端能表达 workspace 当前 active session。
2. 调整 edit lock acquire 逻辑，支持当前 session 的恢复语义。
3. 调整首页历史项目打开逻辑，优先恢复 active session。
4. 调整 BuilderPage 初始化与错误处理，让恢复态继续进入页面而不是直接报错。
5. 补充/更新单元测试和恢复场景测试。
6. 若回滚，需要恢复原有的“active Agent 直接阻断进入”逻辑，并把首页打开行为退回 latestSessionId 语义。

## Open Questions

当前无阻塞性未决问题。实现时 SHALL 按本文决策执行：项目摘要暴露 `activeSessionId`，旧 URL 命中非 active session 时自动切换到同 workspace 的 active session，恢复态复用现有停止 Agent 能力。
