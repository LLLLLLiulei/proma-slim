## ADDED Requirements

### Requirement: CMS rendering manifest 和 validator 必须保留并校验稳定 source identity
系统 SHALL 在 CMS rendering manifest 和结构化校验结果中保留顶层 CMS island 的稳定 source identity，并 MUST 对 identity 冲突执行阻断性校验，而不得让多个顶层 source target 共享同一个稳定身份。

#### Scenario: manifest entry 保留显式 `sourceId`
- **WHEN** 某个顶层 `cms-catalog` 或 `cms-content` 在作者态源码中显式写出稳定 `sourceId`
- **THEN** 该 island 的 manifest entry SHALL 保留这个 `sourceId`
- **AND** 后续 preview、selection、handoff 与 apply 链路 SHALL 能复用该 identity

#### Scenario: 顶层 CMS island 的重复 `sourceId` 被标记为 error
- **WHEN** 作者态 HTML 中有两个或以上顶层 `cms-*` island 共享同一个稳定 `sourceId`
- **THEN** validator SHALL 输出 `error` 级 diagnostic
- **AND** 系统 SHALL NOT 将这组冲突 identity 视为合法的 CMS source target 集合

### Requirement: CMS 危险标签错误必须阻断受支持的作者态 HTML mutation
系统 SHALL 将 CMS island 内的 `DANGEROUS_TAG` error 从“可报告 diagnostics”提升为“阻断性 mutation 失败条件”，确保相关 HTML 不会被正式写回作者态工作区。

#### Scenario: mutation pipeline 在 `DANGEROUS_TAG` error 时拒绝落盘
- **WHEN** 某次受支持的 page-builder 作者态 HTML mutation 的 validation 结果包含 `DANGEROUS_TAG` error
- **THEN** 系统 SHALL 拒绝该次 mutation
- **AND** 系统 SHALL NOT 将包含危险标签的 HTML 写回 `workspace-files/index.html`
- **AND** 系统 SHALL NOT 将本次失败 mutation 视为 manifest 已成功刷新

#### Scenario: mutation 失败时回滚派生产物
- **WHEN** 某次受支持的 page-builder 作者态 HTML mutation 因 `DANGEROUS_TAG` error 被拒绝
- **THEN** 系统 SHALL 保留 mutation 前的作者态 HTML
- **AND** 系统 SHALL 保留 mutation 前的 CMS rendering manifest
