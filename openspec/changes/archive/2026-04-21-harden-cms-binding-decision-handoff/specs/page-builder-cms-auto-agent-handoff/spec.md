## ADDED Requirements

### Requirement: CMS automatic handoff must enter the decision-backed apply chain
系统 SHALL 将 CMS browser confirm 后的自动 handoff 视为“进入 decision-backed confirmed apply flow”的开始，而不是仅仅把结构化 payload 发给模型后等待自由文本结论；在该链路中，任何正式 `apply_cms_binding` 写入前 MUST 先产生一次机器可判定的 `mcp__cms__decide_cms_binding` 结果。

#### Scenario: Confirmed handoff explicitly enables same-turn decision then apply
- **WHEN** 宿主根据一次有效 CMS confirm 结果发起 programmatic handoff
- **THEN** 系统 SHALL 继续显式注入 `mentionedSkills: ['cms-binding-apply']`
- **AND** 系统 SHALL 继续显式注入 `mentionedMcpServers: ['cms']`
- **AND** hidden payload 或等价宿主运行时上下文 SHALL 明确要求本次 confirmed flow 先创建机器可读 decision，再进入正式 apply

#### Scenario: Free-text readiness does not authorize formal apply
- **WHEN** 某次自动 handoff 之后 assistant 只产出普通文本形式的 `ready` 结论，但没有经过 `mcp__cms__decide_cms_binding`
- **THEN** 系统 SHALL NOT 把该自由文本视为正式写入 authority
- **AND** 系统 SHALL NOT 仅凭该文本继续执行正式 `mcp__cms__apply_cms_binding`

### Requirement: CMS automatic handoff must hard-bootstrap the apply skill instead of relying on prompt-only skill mention
系统 SHALL 让 confirmed CMS auto handoff 以宿主控制的方式进入 `cms-binding-apply` 语境，而 MUST NOT 仅依赖 `mentionedSkills` / `<mentioned_tools>` 这类 prompt-level 文本提示让模型自行决定是否先发一个显式 `Skill` tool。

#### Scenario: Programmatic handoff still enters the skill-controlled boundary even without an observable `Skill` tool call
- **WHEN** 宿主根据一次有效 CMS confirm 结果发起 programmatic handoff
- **THEN** 系统 SHALL 通过宿主 bootstrap 或等价 runtime-controlled 注入让本次 turn 进入 `cms-binding-apply` 的控制边界
- **AND** decision-backed apply chain 的 correctness SHALL NOT 依赖模型先显式发出一次可观察的 `Skill` tool 调用
- **AND** 系统 MAY 继续注入 `mentionedSkills: ['cms-binding-apply']` 作为提示与审计信号

### Requirement: CMS automatic handoff must preserve the context required to mint a stable decision
系统 SHALL 在 confirmed CMS handoff 中保留或关联创建 decision record 所需的完整上下文，包括 confirmed selection、`targetSelection`、`authoringContext`、`targetSnapshot` 以及当前作者态 revision 或等价 digest，而不得在进入 decision-backed flow 时丢失这些绑定依据。

#### Scenario: Handoff keeps target snapshot and current authoring revision for decision binding
- **WHEN** 宿主为一次 confirmed CMS apply 发起自动 handoff
- **THEN** 系统 SHALL 让后续 `mcp__cms__decide_cms_binding` 可以访问当前 `targetSnapshot`
- **AND** 系统 SHALL 让后续 decision record 绑定到当前作者态 revision 或等价 snapshot digest
- **AND** 系统 SHALL NOT 要求模型在自由文本中重新猜测这些绑定信息
