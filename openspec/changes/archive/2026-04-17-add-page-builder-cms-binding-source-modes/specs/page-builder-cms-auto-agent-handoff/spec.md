## MODIFIED Requirements

### Requirement: CMS 自动 handoff 必须组装统一的 `PageBuilderCmsApplySkillInput`
系统 SHALL 在发起 CMS 自动 handoff 前，将确认结果组装为统一的 `PageBuilderCmsApplySkillInput`，并 SHALL 为第一阶段填入稳定的默认运行边界，而不得将关键字段留给模型自行从自由文本中反推；该输入 MUST 以 `targetSelection` 作为规范化目标入口，并 SHALL 在需要时保留 `targetBlock` 作为 parent block 上下文；该输入 MUST 原样保留新的 `sourceType` 与对应 durable payload。

#### Scenario: handoff 输入使用 selection-scoped Phase 1A 默认值
- **WHEN** 系统为一次 CMS 确认结果构建 handoff 输入
- **THEN** 系统 SHALL 生成新的 contract `version`
- **AND** 系统 SHALL 生成 `entryPoint: 'cms-browser-confirm'`
- **AND** 系统 SHALL 生成 `applyIntent: 'replace-current'`
- **AND** 系统 SHALL 生成 `workspacePolicy.scope: 'target-selection-only'`
- **AND** 系统 SHALL 生成 `workspacePolicy.allowPageRewrite: false`
- **AND** 系统 SHALL 生成 `workspacePolicy.allowCrossBlockMutation: false`
- **AND** 系统 SHALL 生成 `workspacePolicy.outputTarget: 'workspace-files/index.html'`
- **AND** 系统 SHALL 保留原始 `selection`
- **AND** 系统 SHALL 保留 `selection.siteId`
- **AND** 系统 SHALL 保留 `selection.sourceType` 及其对应的 `parentCatalogId`、`catalogId`、`catalogIds`、`contentIds` 与 `snapshot`
- **AND** 当 `selection.sourceType = contents-by-ids` 时，系统 SHALL 保留单一 `selection.catalogId`
- **AND** 系统 SHALL 保留 `targetSelection`

#### Scenario: 缺少 selection.siteId 时阻断自动 handoff
- **WHEN** 系统准备根据 CMS 选择结果构建自动 handoff 输入，但 `selection.siteId` 缺失、为空或不可用
- **THEN** 系统 SHALL 阻断本次自动 handoff
- **AND** 系统 SHALL NOT 继续构建 `cms-binding-apply` 输入
- **AND** 系统 SHALL 不得假设 `siteId = 1` 或写出任何新的 `cms-*` 标签

#### Scenario: CMS island handoff 输入显式声明 source-atomic 边界
- **WHEN** 系统为某个 `cms-island` 目标构建 handoff 输入
- **THEN** 系统 SHALL 在输入中保留该 `cms-island` 的源 CMS 标签选择器、所属 `parentBlockSelector` 与组件类型
- **AND** 系统 SHALL 在 `targetSelection` 中保留 `editBoundary: source-atomic`
- **AND** 系统 SHALL 明确声明该目标的编辑边界为整体 CMS 组件
- **AND** 系统 SHALL NOT 将预览中命中的渲染子节点选择器当作 handoff 的唯一事实目标

#### Scenario: 缺少稳定提示时不伪造可选字段
- **WHEN** 系统在 handoff 时没有稳定来源可判断 `blockTypeHint`、`blockLabel` 或 `snapshotAvailable`
- **THEN** 系统 SHALL 允许这些字段缺失
- **AND** 系统 SHALL NOT 仅依据 `selector` 字符串伪造这些字段
