## 1. Transcript Render Boundary

- [x] 1.1 为 `AgentMessages` 建立顶层渲染边界，确保普通 draft 更新不会在 `messages / streamState` 不变时默认重跑整段 transcript。
- [x] 1.2 补充回归测试，证明当前会话 draft 变化但消息区 props 不变时，消息区不会被重复渲染，同时现有消息展示语义保持不变。

## 2. History Item Isolation

- [x] 2.1 为 `AgentMessageItem` 建立细粒度渲染边界，保持现有 user / assistant / status 分支展示逻辑不变，并利用旧消息对象稳定性减少历史消息重复渲染。
- [x] 2.2 补充回归测试，证明追加新消息或更新尾部状态时，未变化的历史消息项不会被重复渲染。

## 3. Send-Semantics and Regression Verification

- [x] 3.1 补充回归测试，证明在最近输入后立即提交时，普通发送仍然使用该时刻用户可见的最新草稿内容。
- [ ] 3.2 运行针对 `AgentMessages`、`AgentView` 的定向测试，并分别在主对话页与 page-builder 内嵌对话的长会话样本上复测输入/发送体感，确认本次优化改善卡顿且未破坏流式、tool activity、error 或 compact 展示行为。
