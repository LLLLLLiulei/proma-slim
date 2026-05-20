## 1. 后端状态与类型

- [x] 1.1 扩展共享的 page-builder edit state / project summary 类型，使 `reason: agent` 能携带 active session 标识。
- [x] 1.2 在 Agent 会话服务层补充按 workspace 查询 active page-builder session 的能力，避免调用方只拿到 boolean busy。
- [x] 1.3 更新 page-builder 项目摘要生成逻辑，在历史项目列表中返回可恢复的 active session 信息。
- [x] 1.4 为 page-builder app 增加恢复 active session 所需的前端路由与进入态判断字段。

## 2. 编辑锁恢复语义

- [x] 2.1 调整 edit lock acquire 逻辑，区分其他页面持有有效锁、同 session active Agent 恢复、其他 session active Agent 三种情况。
- [x] 2.2 支持同 session active Agent 在没有其他有效编辑者时恢复或重新获取编辑锁。
- [x] 2.3 保持其他页面持有有效锁、导出进行中、项目删除 busy 等现有阻断语义不被绕过。
- [x] 2.4 更新 edit lock 冲突响应，使可恢复场景返回恢复信息，真正冲突场景返回准确文案。
- [x] 2.5 明确同 session 残留旧锁可以被恢复流程接管或续约，而不应被误判为其他编辑者。

## 3. Builder 恢复流程

- [x] 3.1 调整 BuilderPage 初始化逻辑，使同 session active Agent 的 edit lock acquire 结果进入恢复态，而不是硬错误态。
- [x] 3.2 在恢复态下重新加载消息、恢复会话 active/streaming 展示，并保持停止 Agent 操作可用。
- [x] 3.3 Agent 完成后自动从恢复态回到正常编辑态，并确保编辑锁续约继续生效。
- [x] 3.4 对打开非 active session 但 workspace 存在 active session 的场景，按设计跳转或切换到 active session。
- [x] 3.5 确认关闭或刷新 Builder 页面不会自动 stop Agent。

## 4. 首页历史入口

- [x] 4.1 调整历史项目编辑入口，优先打开 editState 中的 active session。
- [x] 4.2 没有 active session 时继续使用 latestSessionId；没有可用 session 时继续自动创建新 session。
- [x] 4.3 优化首页忙碌状态文案，区分 Agent 处理中、其他页面编辑中和导出中。
- [x] 4.4 在首页卡片与 builder 进入路径中覆盖 active session 自动切换行为。

## 5. 测试与验证

- [x] 5.1 补充 edit lock service 单元测试，覆盖同 session active 恢复、其他 session active 阻断、其他 holder 持锁阻断。
- [x] 5.2 补充 page-builder routes / project summary 测试，验证 active session 信息正确返回。
- [x] 5.3 补充 BuilderPage 测试，覆盖关闭后重新进入同 active session 的恢复流程。
- [x] 5.4 补充首页历史入口测试，覆盖 active session 优先打开和 fallback 到 latest session。
- [x] 5.5 运行相关单元测试、typecheck 与 OpenSpec strict validate。
- [x] 5.6 补充旧 URL 非 active session 自动切换到 active session 的测试。
