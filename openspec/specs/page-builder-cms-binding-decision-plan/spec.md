## Purpose

定义 confirmed CMS apply 在正式写入前的 decision record / apply plan 持久化语义、失效规则与重试/消费边界，使 `decisionId` 成为受控 CMS 正式写入的唯一 authority。

## Requirements

### Requirement: Confirmed CMS apply must materialize a host-managed binding decision record
系统 SHALL 为 confirmed CMS apply 提供宿主管理的 `mcp__cms__decide_cms_binding` 工具，用来消费 confirmed handoff 阶段由宿主预注册的 selection / target / authoring 上下文，并接收模型在 `cms-binding-apply` 语境下得出的 `handoffId` 与候选结论，返回机器可判定的 decision 结果；当结果为 `ready` 时，系统 SHALL 持久化 decision record 与完整 apply plan，并返回 `decisionId` 与机器可读的 decision summary。

#### Scenario: Ready decision returns `decisionId` and a machine-readable summary while persisting the full plan host-side
- **WHEN** 模型基于当前 confirmed CMS apply 输入调用 `mcp__cms__decide_cms_binding`，并提供当前 confirmed handoff 的 `handoffId`，且该次候选结论满足当前 Phase 1A 的目标语义、来源模式和 authoring contract
- **THEN** 系统 SHALL 返回 `status: ready`
- **AND** 系统 SHALL 返回新的 `decisionId`
- **AND** 系统 SHALL 返回机器可读的 decision summary，其中至少包含正式 `toolKind`、目标组件、当前 `targetSelection` 以及继续正式 apply 所需的摘要信息
- **AND** 系统 SHALL 在宿主侧持久化完整归一化 apply plan，而不是要求调用方自行保存并回传整份正式写入计划

#### Scenario: Non-ready decision returns structured status without `decisionId`
- **WHEN** 模型调用 `mcp__cms__decide_cms_binding`，但当前候选结论仍属于 `needs-clarification` 或 `incompatible`
- **THEN** 系统 SHALL 返回对应的结构化 decision 结果
- **AND** 系统 SHALL NOT 返回 `decisionId`
- **AND** 系统 SHALL NOT 持久化可执行的 apply plan

### Requirement: Ready decision records must be bound to the current authoring target identity and workspace revision
系统 SHALL 将每个 `ready` decision record 绑定到当前 workspace/session、confirmed selection、`targetSelection`、`authoringContext`、`targetSnapshot` 以及当前作者态 HTML revision 或等价 snapshot digest；当这些绑定条件在正式 apply 前发生变化时，系统 MUST 将该 decision 视为失效或冲突，而不得继续复用。

#### Scenario: Workspace revision changes invalidate an existing ready decision
- **WHEN** 某个 `ready` decision 已经生成，但其绑定的作者态 HTML revision 或等价 snapshot digest 在正式 apply 前发生变化
- **THEN** 系统 SHALL 将该 `decisionId` 视为 stale
- **AND** 系统 SHALL 拒绝后续使用该 `decisionId` 的正式 apply

#### Scenario: Target or selection mismatch invalidates an existing ready decision
- **WHEN** 某个 `decisionId` 对应的 confirmed selection、`targetSelection` 或 `targetSnapshot` 与当前正式 apply 请求解析出的上下文不一致
- **THEN** 系统 SHALL 将该 `decisionId` 视为 conflicting or target-mismatched
- **AND** 系统 SHALL 拒绝该次正式 apply

### Requirement: Ready decision records must persist structure guardrails together with the normalized apply plan
系统 SHALL 在每个 `ready` decision 对应的宿主 apply plan 中持久化与当前 `targetSnapshot` 对齐的结构 guardrails，而不只保存 target/source identity。该 guardrail 信息 MUST 足以表达当前目标是保留壳层还是整体替换，以及 major layout container 应由外层 shell 还是 CMS slot 拥有。

#### Scenario: Block-target ready decision persists shell-preservation guardrails
- **WHEN** 某个 `ready` decision 对应的正式目标是 block target，且其当前 `targetSnapshot` 显示外层壳层已承担主布局职责
- **THEN** 宿主 apply plan SHALL 持久化“保留当前壳层”的结构 guardrail
- **AND** apply plan SHALL 记录 major container 归属仍在外层 shell，而不是默认转交给 slot

#### Scenario: Source-atomic CMS island ready decision persists whole-component replacement semantics
- **WHEN** 某个 `ready` decision 对应的正式目标是 `cms-island`
- **THEN** 宿主 apply plan SHALL 持久化该目标的 source-atomic whole-component replacement 语义
- **AND** apply plan SHALL 允许正式 apply 围绕该源 CMS 标签 author 完整动态区域，而不需要再保留 block-level outer shell ownership 假设

### Requirement: The decision tool must not mutate HTML or bypass the formal apply path
系统 SHALL 让 `mcp__cms__decide_cms_binding` 只负责 decision 校验、归一化与持久化，而 MUST NOT 直接写入 `workspace-files/index.html`、修改 preview HTML、刷新 manifest/preview state，或绕过正式 `mcp__cms__apply_cms_binding` 直接生成新的作者态 `cms-*` 标签。

#### Scenario: Ready decision leaves authoring HTML unchanged
- **WHEN** 某次 `mcp__cms__decide_cms_binding` 调用返回 `ready`
- **THEN** 系统 SHALL 只返回 `decisionId` 与 apply plan 摘要
- **AND** 系统 SHALL NOT 在该步骤中修改任何 workspace HTML 文件

### Requirement: Ready decisions must support safe retry before success but reject duplicate successful replay
系统 SHALL 允许同一个 `ready` decision 在其绑定上下文仍然有效且尚未成功 apply 的前提下被重复用于模板修正重试；但一旦某个 `decisionId` 对应的正式 apply 成功完成，系统 MUST 将其消费或失效，并拒绝后续重复成功重放。

#### Scenario: Template validation failure keeps the decision reusable while context is unchanged
- **WHEN** 某个带 `decisionId` 的正式 apply 因模板 contract 校验失败或其他未落盘错误而终止
- **THEN** 系统 MAY 保持该 `decisionId` 继续有效
- **AND** 前提 SHALL 是其绑定的 authoring target identity 与 workspace revision 仍未变化

#### Scenario: Successful formal apply consumes the decision
- **WHEN** 某个 `decisionId` 对应的正式 apply 成功写回作者态 HTML
- **THEN** 系统 SHALL 消费或失效该 `decisionId`
- **AND** 系统 SHALL 拒绝随后对同一个 `decisionId` 的重复成功 replay
