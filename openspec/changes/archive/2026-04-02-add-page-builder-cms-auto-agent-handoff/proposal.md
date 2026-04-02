## Why

当前 `page-builder` 已经具备区块级 CMS 入口、结构化 CMS 选择结果，以及 `cms-binding-apply` 的 skill contract，但在用户点击“确认选择”后，流程仍然停留在前端日志层，无法自动继续进入 Agent 应用回合。若不补齐这段自动 handoff，主路径仍然要求用户手动补发消息，既破坏了“确认后自动继续”的产品体验，也无法稳定保证专用 skill 被显式注入和执行。

## What Changes

- 新增一个面向 `page-builder` 的 CMS 自动 handoff 能力，在用户确认 CMS 选择后自动向当前 Builder 会话发起一轮 Agent 消息。
- 定义该次 handoff 如何围绕 `PageBuilderCmsApplySkillInput` 组装消息内容，包括可见触发语、隐藏结构化 payload，以及程序化 `mentionedSkills` 注入。
- 明确第一阶段自动 handoff 的运行边界，包括复用当前会话、会话忙碌时的阻断规则、发送失败时的保留与重试行为，以及弹框 / 选区状态如何变化。
- 明确该能力与现有 `page-builder-cms-selection-contract`、`page-builder-cms-apply-skill` 的职责边界，使本 change 只负责“确认后自动发起对话”，而不提前承担 block snapshot tooling、本地 HTML 修改或持续绑定持久化。

## Capabilities

### New Capabilities
- `page-builder-cms-auto-agent-handoff`: 定义 CMS 选择确认后如何自动向当前 Builder 会话发起 Agent 回合、注入结构化上下文，并显式强制调用 `cms-binding-apply` skill。

### Modified Capabilities
- None.

## Impact

- Affected specs and contracts:
  - `openspec/specs/page-builder-cms-selection-contract/spec.md`
  - `openspec/specs/page-builder-cms-apply-skill/spec.md`
  - 新增 `page-builder-cms-auto-agent-handoff` spec
- Affected page-builder systems:
  - `BuilderPage` 中的 CMS 确认回调与当前会话发送编排
  - CMS 弹框确认后的发送中、失败重试与状态保留行为
  - Builder 页右侧 Agent 会话与自动消息触发的衔接
- Affected runtime surfaces:
  - `AgentSendInput` 中 `composedUserMessage` / `mentionedSkills` 的程序化使用路径
  - `agent-orchestrator` 中强制 skill 注入的运行时行为
  - page-builder 工作区内 `AskUserQuestion` 后续澄清链路所依赖的同会话连续性
