## ADDED Requirements

### Requirement: CMS 选择确认结果必须保留稳定的 CMS 目标 identity
系统 SHALL 在 CMS 选择器确认结果中的 `targetSelection` 里保留与 preview 选区一致的 CMS 目标 identity，使后续自动 handoff 与正式写入路径可以围绕同一个 source target 工作。

#### Scenario: 已选 CMS island 的确认结果保留 `sourceId`
- **WHEN** 用户在一个 `cms-island` 目标上下文中完成 CMS 选择确认，且该目标存在稳定 `sourceId`
- **THEN** 系统 SHALL 在确认结果的 `targetSelection` 中保留该 `sourceId`
- **AND** 系统 SHALL 继续保留源 CMS 标签 selector、所属 `parentBlockSelector`、组件类型和 `editBoundary: source-atomic`

#### Scenario: 旧页面缺少 `sourceId` 时确认结果仍保留 source-atomic 语义
- **WHEN** 用户在一个来自旧页面、尚未补齐 `sourceId` 的 `cms-island` 目标上下文中完成 CMS 选择确认
- **THEN** 系统 SHALL 继续返回 `kind: cms-island`
- **AND** 系统 SHALL 继续返回源 CMS 标签 selector、所属 `parentBlockSelector` 与 `editBoundary: source-atomic`
- **AND** 系统 SHALL NOT 伪造一个与源 CMS 标签无关的 identity
