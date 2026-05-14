## ADDED Requirements

### Requirement: CMS 集成模式自动 handoff 必须遵守 project binding siteId
系统 SHALL 在 CMS 集成模式下把自动 handoff 的 `selection.siteId` 校验为当前 Builder Access Session 对应 project binding 的 `siteId`，不得让手写 payload 越过当前 workspace/project 的 CMS 站点边界。

#### Scenario: selection siteId 与 project binding 一致时允许继续
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且系统准备根据 CMS 选择结果构建自动 handoff 输入
- **AND** 请求已通过 Builder Access Session、可信来源和 edit lock 校验
- **AND** `selection.siteId` 等于当前 project binding 的 `siteId`
- **THEN** 系统 SHALL 继续按既有 CMS 自动 handoff 流程构建 `PageBuilderCmsApplySkillInput`
- **AND** 系统 SHALL 保留原始 `selection.siteId`

#### Scenario: selection siteId 与 project binding 不一致时阻断
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且系统准备根据 CMS 选择结果构建自动 handoff 输入
- **AND** 请求体 `selection.siteId` 不等于当前 project binding 的 `siteId`
- **THEN** 系统 SHALL 阻断本次自动 handoff
- **AND** 响应 SHALL 表示 `code: "builder_access_mismatch"`
- **AND** 系统 SHALL NOT 继续构建 `cms-binding-apply` 输入
- **AND** 系统 SHALL NOT 将该 selection 发送给 Agent

#### Scenario: standalone 模式自动 handoff 保持既有 siteId 语义
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且系统准备根据 CMS 选择结果构建自动 handoff 输入
- **THEN** 系统 SHALL 保持既有 `selection.siteId` 校验与保留语义
- **AND** 系统 SHALL NOT 要求存在 CMS project binding
