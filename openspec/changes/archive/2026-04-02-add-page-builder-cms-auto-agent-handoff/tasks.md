## 1. Shared Handoff Contract

- [x] 1.1 为 CMS 自动 handoff 定义前端可复用的 request / settled 类型，覆盖可见消息、`composedUserMessage`、`mentionedSkills` 与 requestId。
- [x] 1.2 提供 `PageBuilderCmsApplySkillInput` 的组装辅助逻辑，固化 Phase 1A 默认值并保留原始 `selection` / `targetBlock.selector`。
- [x] 1.3 为 handoff payload 组装补充类型测试或单元测试，确保不会伪造 `blockTypeHint` 等可选字段。

## 2. AgentView Programmatic Send

- [x] 2.1 在 `AgentView` 中新增 programmatic send request 输入通道与 settled 回调，不影响现有 composer draft send。
- [x] 2.2 抽取 `AgentView` 的底层发送执行逻辑，使 draft send 与 programmatic send 共用 optimistic message、SSE 发送与错误恢复能力。
- [x] 2.3 确保 programmatic send 不读取或清空当前 composer 草稿与待发送附件，并能透传 `composedUserMessage` / `mentionedSkills`。

## 3. BuilderPage Auto Handoff Flow

- [x] 3.1 在 `BuilderPage` 中将 `handleCmsSelectionConfirm` 从日志输出升级为 handoff request 生成逻辑。
- [x] 3.2 基于当前 `sessionId`、`workspaceId` 与 CMS 选择结果，生成自动 handoff 的短可见消息和隐藏结构化 payload。
- [x] 3.3 增加会话 busy 与重复 handoff 阻断逻辑，在不适合发送时保持弹框打开并给出明确反馈。
- [x] 3.4 根据 programmatic send settled 结果处理成功关闭弹框、失败保留选择结果与区块选中态。

## 4. Tests And Regression Coverage

- [x] 4.1 更新 `BuilderPage` 测试，覆盖确认后生成 handoff request、busy 阻断、成功关闭弹框、失败保留现场。
- [x] 4.2 为 `AgentView` 增加 programmatic send 测试，覆盖 optimistic message、`mentionedSkills` / `composedUserMessage` 透传，以及不清空 draft / attachments。
- [x] 4.3 运行 page-builder 与 agent 相关测试或类型检查，确认自动 handoff 没有破坏现有手动发送链路。
