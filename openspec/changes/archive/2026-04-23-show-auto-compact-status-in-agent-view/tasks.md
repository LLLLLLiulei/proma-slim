## 1. Compact lifecycle state derivation

- [x] 1.1 在前端 stream state 中基于 `compacting` 生命周期事件派生中性 compact 开始提示，并保留 `isCompacting`
- [x] 1.2 在前端 stream state 中基于 `compact_complete` 生命周期事件派生成功提示 `已压缩，继续处理中`
- [x] 1.3 为 compact 派生提示增加本地 `kind = 'compact'` 元数据，避免误伤鉴权、限流等其他瞬时提示
- [x] 1.4 保持 compact 失败路径继续沿用现有错误收口，不新增持久化状态消息

## 2. Shared AgentView streaming state and rendering

- [x] 2.1 在共享 `AgentMessages` 中接入 `isCompacting`，把 loading 文案切换为“正在压缩上下文...”
- [x] 2.2 在共享 `AgentMessages` 中展示 compact 开始提示与成功提示，复用现有 `StatusNotice` 容器而不新增页面级提示组件
- [x] 2.3 在共享 `AgentMessages` 中展示 compact notice，并在文本、工具活动、`complete`、`error` 等后续事件到达时自动清理成功提示
- [x] 2.4 确认 page-builder、主应用与手动 `/compact` 均通过共享 `AgentView` 继承该行为，不新增页面级分叉逻辑

## 3. Regression protection

- [x] 3.1 更新 `AgentMessages` / `AgentView` 渲染测试，覆盖 compact 提示与 loading 文案切换
- [x] 3.2 更新前端 SSE / atom 测试，覆盖 compact notice 的设置、清理时机，以及对现有 auth / rate-limit notice 的隔离
- [x] 3.3 更新 orchestrator 回归测试，确认 auto-compact 嵌套 query 的 compact 生命周期事件仍能被前端消费
- [x] 3.4 运行受影响的 orchestrator、adapter、renderer 测试，确认 compact、鉴权 notice 与错误收口无回归
