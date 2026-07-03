## MODIFIED Requirements

### Requirement: Ready decision records must be bound to the current authoring target identity and workspace revision
系统 SHALL 将每个 `ready` decision record 绑定到当前 workspace/session、confirmed selection、`targetSelection`、`authoringContext`、`targetSnapshot` 以及创建 decision 时的作者态 HTML revision 或等价 snapshot digest；其中 revision / digest SHALL 作为审计与排查上下文保存，但系统 MUST NOT 仅因页面 revision 在正式 apply 前发生变化就把该 decision 自动视为 stale。正式 apply 的安全边界 SHALL 由 workspace/session 匹配、decision 消费状态、target/selection identity、runtime locator、parent block 校验、结构 guardrails 与统一 mutation pipeline 共同保证。

#### Scenario: Workspace revision changes do not automatically invalidate an existing ready decision
- **WHEN** 某个 `ready` decision 已经生成，但作者态 HTML revision 或等价 snapshot digest 在正式 apply 前发生变化
- **THEN** 系统 SHALL NOT 仅凭 revision 变化拒绝该 `decisionId`
- **AND** 系统 SHALL 在 apply 阶段继续通过当前 target locator、parent block、组件类型和结构 guardrails 校验实际写入目标
- **AND** 当这些 apply 阶段校验仍通过时，系统 SHALL 允许正式 apply 继续

#### Scenario: Target or selection mismatch invalidates an existing ready decision
- **WHEN** 某个 `decisionId` 对应的 confirmed selection、`targetSelection`、`targetSnapshot`、runtime locator 或 session 与当前正式 apply 上下文不一致
- **THEN** 系统 SHALL 将该 `decisionId` 视为 conflicting or target-mismatched
- **AND** 系统 SHALL 拒绝该次正式 apply

### Requirement: Ready decisions must support safe retry before success but reject duplicate successful replay
系统 SHALL 允许同一个 `ready` decision 在其 workspace/session、target identity 与 decision 消费状态仍然有效且尚未成功 apply 的前提下被重复用于模板修正重试；但一旦某个 `decisionId` 对应的正式 apply 成功完成，系统 MUST 将其消费或失效，并拒绝后续重复成功重放。

#### Scenario: Template validation failure keeps the decision reusable while target identity is still valid
- **WHEN** 某个带 `decisionId` 的正式 apply 因模板 contract 校验失败或其他未落盘错误而终止
- **THEN** 系统 MAY 保持该 `decisionId` 继续有效
- **AND** 前提 SHALL 是其绑定的 workspace/session 与 authoring target identity 仍然可校验
- **AND** 系统 SHALL NOT 仅因 workspace revision 变化自动阻断使用同一 `decisionId` 修正模板后重试

#### Scenario: Successful formal apply consumes the decision
- **WHEN** 某个 `decisionId` 对应的正式 apply 成功写回作者态 HTML
- **THEN** 系统 SHALL 消费或失效该 `decisionId`
- **AND** 系统 SHALL 拒绝随后对同一个 `decisionId` 的重复成功 replay

### Requirement: `decide_cms_binding` rejections must tell the agent how to recover a valid handoff context
系统 SHALL 在 `mcp__cms__decide_cms_binding` 因 handoff 上下文缺失、会话不匹配或当前目标上下文不再可复用而拒绝继续时，向 agent 返回单条 plain-text 工具错误；该错误 MUST 说明当前 decision 为什么不能继续、下一步应如何重新获取有效 handoff，以及 agent 不得伪造或复用哪些失效上下文。系统 SHALL NOT 把普通页面 revision 变化描述为 handoff 自动过期原因。

#### Scenario: Missing handoff tells the agent to reacquire CMS handoff first
- **WHEN** `mcp__cms__decide_cms_binding` 收到的 `handoffId` 不存在，或宿主找不到对应的 confirmed CMS 选择上下文
- **THEN** 系统 SHALL 返回指出当前 CMS handoff 上下文不可用的 plain-text 工具错误
- **AND** 错误内容 SHALL 指出 agent 必须基于当前最新选中区域和作者态上下文重新发起 CMS handoff，再重新调用 `mcp__cms__decide_cms_binding`
- **AND** 系统 SHALL NOT 返回 `decisionId`
- **AND** 错误内容 SHALL 明确禁止 agent 猜测 `handoffId`、沿用旧 handoff 摘要，或在未重新获取 handoff 的情况下直接调用 `mcp__cms__apply_cms_binding`

#### Scenario: Session or target mismatch tells the agent to refresh the current target context
- **WHEN** `mcp__cms__decide_cms_binding` 收到的 `handoffId` 属于不同 workspace/session，或其 `targetSelection` / confirmed selection 与当前上下文不一致
- **THEN** 系统 SHALL 返回指出当前 handoff 与当前目标不匹配的 plain-text 工具错误
- **AND** 错误内容 SHALL 指出 agent 必须先确认当前选中目标，再基于该目标重新创建 handoff 与 decision
- **AND** 系统 SHALL NOT 返回 `decisionId`
- **AND** 错误内容 SHALL 明确禁止 agent 复用旧目标上的 handoff 结果去推断当前目标的 CMS binding 方案
