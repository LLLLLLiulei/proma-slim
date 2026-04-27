## ADDED Requirements

### Requirement: `decide_cms_binding` rejections must tell the agent how to recover a valid handoff context
系统 SHALL 在 `mcp__cms__decide_cms_binding` 因 handoff 上下文缺失、过期、会话不匹配或当前目标上下文不再可复用而拒绝继续时，向 agent 返回单条 plain-text 工具错误；该错误 MUST 说明当前 decision 为什么不能继续、下一步应如何重新获取有效 handoff，以及 agent 不得伪造或复用哪些失效上下文。

#### Scenario: Missing or stale handoff tells the agent to reacquire CMS handoff first
- **WHEN** `mcp__cms__decide_cms_binding` 收到的 `handoffId` 不存在，或其绑定的作者态 revision / target snapshot 已经过期
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
