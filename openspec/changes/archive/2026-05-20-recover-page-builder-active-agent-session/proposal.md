## Why

当用户关闭 page-builder 页面后，后台的 Agent 任务可能仍在继续执行；如果此时重新进入同一项目，当前实现会把“仍在运行的同一会话”误判为普通锁冲突，导致用户无法恢复原来的工作上下文，只能看到阻断提示。这个问题会破坏 Agent 处理中断后的连续性，也让“页面关闭但任务继续”的预期体验无法成立。

## What Changes

- 允许 page-builder 在重新进入同一项目时恢复仍在活跃的 Agent 会话，而不是把它直接当成不可进入的冲突状态。
- 将“其他页面持有编辑锁”和“当前 workspace 下仍有活跃 Agent 会话”拆成可区分的状态，避免把可恢复场景误报为编辑冲突。
- 当用户从首页或旧 URL 重新进入时，如果目标 workspace 对应的 Agent 会话仍在执行，系统 SHALL 优先恢复该活跃会话，并继续沿用原有对话与执行状态。
- 当确实存在其他页面持有有效编辑锁时，系统 SHALL 继续阻止恢复，以避免多个编辑上下文同时写入同一 workspace。
- 调整首页项目入口与 builder 进入流程，使其在可恢复场景下不再只显示“正在构建中，请稍后再试”的硬失败提示。

## Capabilities

### New Capabilities
- `page-builder-active-agent-session-recovery`: 支持在 page-builder 页面关闭后恢复仍在执行的同一 Agent 会话，并区分可恢复与不可恢复的锁冲突状态。

### Modified Capabilities
- `page-builder-app`: Builder 页面进入逻辑需要支持恢复仍在执行的同一 Agent 会话，而不是把可恢复的 active session 当成普通进入失败。
- `page-builder-edit-lock`: 编辑锁能力需要区分“其他页面持有锁”和“同 workspace 的活跃 Agent 会话可恢复”两类状态，并暴露恢复所需的会话上下文。
- `page-builder-home-history`: 首页历史项目的编辑入口需要优先恢复活跃 Agent 会话，而不是只按最近会话或硬冲突处理。

## Impact

- 影响 page-builder 首页到 builder 的进入链路。
- 影响编辑锁服务、项目可用状态判断、首页历史区以及 builder 初始化恢复逻辑。
- 影响 session 与 workspace 在 page-builder 入口中的恢复目标选择，以及相关前端错误提示与恢复交互。
- 需要补充/调整相关单元测试和页面恢复流程测试。
