## 1. 前端流状态自愈

- [x] 1.1 扩展 `AgentStreamState` 与 `useAgentSSE`，为每个会话记录最近流式活动时间并在初始化、收帧和收尾路径更新该时间
- [x] 1.2 在 `useAgentSSE` 中实现单 session 单飞、带冷却窗口的被动 reconcile 触发逻辑，并继续复用现有 `/activity` 作为权威会话活跃判断
- [x] 1.3 在检测到后端已空闲时，统一执行 stale controller 中止、本地 `finalizeStream()`、错误清理与消息刷新，确保不依赖“下一次发送”才能恢复
- [x] 1.4 保持 stop / detached / stopping 等现有分支语义不变，避免自动 reconcile 干扰用户主动停止流程

## 2. AgentView 与 page-builder busy 恢复

- [x] 2.1 在 `AgentView` 中接入挂载、窗口聚焦、页面可见性恢复和长时间无活动探测的被动 reconcile 触发点
- [x] 2.2 让普通发送与 programmatic send 在本地 busy 状态下共享相同的 stale-state 校准逻辑，只在后端真实活跃时继续阻断发送
- [x] 2.3 调整 `BuilderPage` 的 busy 锁定行为，确保页面级交互会在后端已空闲时自动恢复，而不会被陈旧本地 `running` 长期锁住
- [x] 2.4 校正 CMS auto handoff 的 busy / failure 路径，保证 stale busy 可自愈、真实 busy 仍阻断，并保留现有弹框与选择现场
- [x] 2.5 在刷新/重进会话且本地不 busy 但最后一条消息仍为 `user` 时，主动探测 `/activity` 并恢复真实 busy 状态，避免下一次发送直接撞到后端 409

## 3. 错误诊断信息贯通与展示

- [x] 3.1 补强后端 TypedError 与 catch 路径的错误持久化内容，为 status message 统一保留摘要、结构化详情和必要的上游原始错误
- [x] 3.2 升级 `AgentMessages` 的错误消息渲染，展示用户摘要，并以折叠区暴露诊断详情和原始错误文本
- [x] 3.3 保持实时错误提示、持久化状态消息与 page-builder handoff 失败反馈的可见摘要一致，避免前端展示与历史消息脱节

## 4. 生命周期日志与回归验证

- [x] 4.1 为前端发送、收帧、被动 reconcile、finalize、programmatic send 等关键阶段补充结构化日志，并统一携带 `sessionId` / `workspaceId` / `phase`
- [x] 4.2 为后端 `/send`、`/activity`、SSE create/close/cancel、`activeSessions` 生命周期和上游模型失败映射补充结构化日志
- [x] 4.3 更新 `useAgentSSE`、`AgentView`、`AgentMessages`、`BuilderPage` 以及相关错误处理测试，覆盖 stale-stream 自动恢复、programmatic handoff 自愈和错误详情展示
- [x] 4.4 运行受影响的 renderer、page-builder 和 main 侧测试，确认本次改动不会破坏现有停止生成、并发保护和错误持久化行为
- [x] 4.5 补充刷新后 busy 恢复与 409 接管测试，覆盖普通 Agent 会话和 builder 场景下的页面重载后恢复行为
