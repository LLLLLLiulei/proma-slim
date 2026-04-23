## ADDED Requirements

### Requirement: CMS authoring contract MUST derive a target-scoped ordinary authoring digest for existing CMS region edits
系统 SHALL 让 canonical CMS authoring contract 能为 ordinary flow 中命中的已有 `cms-catalog` / `cms-content` 区域派生出一个目标感更强的最小 digest，使宿主能够在普通编辑时优先提供当前组件、当前边界与当前字段语义，而不是继续要求模型先阅读长 references 或 confirmed apply checklist。

#### Scenario: ordinary 既有 CMS 区域 digest 暴露当前组件的最小 authoring surface
- **WHEN** 系统为一次命中已有 CMS 区域的 ordinary 请求生成当前目标的最小 digest
- **THEN** 该 digest SHALL 至少暴露 `component`、`sourceType`、`allowedProps`、`requiredProps`、`slotScope`、`itemFieldMeta`、`recommendedLinkField`、`recommendedImageField` 与 `forbiddenStructures`
- **AND** 该 digest SHALL 只包含当前命中组件相关的 CMS authoring surface，而不是混入另一个组件的无关信息

#### Scenario: ordinary digest 暴露当前 target boundary 而不是 confirmed apply checklist
- **WHEN** 系统为 ordinary 既有 CMS 区域修改生成最小 digest
- **THEN** 该 digest SHALL 明确表达当前 source-first / source-atomic 边界、runtime-only attrs 不属于作者态 surface，以及当前 authoring 需要遵守的共享 Vue/HTML 边界
- **AND** 该 digest SHALL NOT 默认混入 confirmed apply 的 decision/apply checklist 或正式 tool payload 细则

### Requirement: CMS authoring contract MUST support mode-specific derived guidance for ordinary region authoring
系统 SHALL 让 canonical CMS authoring contract 支持按使用场景派生不同的 guidance 视图，至少区分“ordinary existing-region authoring”与“confirmed apply authoring”；ordinary 视图 MUST 服务于已有 CMS 区域的理解和普通修改，confirmed apply 视图 MUST 继续服务于 `cms-binding-apply` 和正式 tool protocol。

#### Scenario: ordinary region guidance 视图不再承担 confirmed apply 协议噪音
- **WHEN** 系统基于 canonical contract 发布或消费 ordinary existing-region guidance
- **THEN** 该 guidance 视图 SHALL 只聚焦当前组件、字段语义、普通修改边界和不要猜测的 authoring 规则
- **AND** 该 guidance 视图 SHALL NOT 默认重复 `cms-binding-apply` 的 same-turn `decide -> apply` 执行协议

#### Scenario: confirmed apply 视图仍可从同一 contract 派生
- **WHEN** 系统基于 canonical contract 为 confirmed CMS selection 场景准备 apply guidance
- **THEN** 系统 SHALL 继续从同一 canonical contract 派生 confirmed apply 所需的 authoring 视图
- **AND** 系统 SHALL 保持 ordinary guidance 与 confirmed apply guidance 共享同一真相源，而不是重新分叉出第二份独立白名单
