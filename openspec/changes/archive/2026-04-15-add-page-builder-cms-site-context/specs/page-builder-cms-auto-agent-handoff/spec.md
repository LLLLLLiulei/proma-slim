## ADDED Requirements

### Requirement: CMS 自动 handoff payload 必须保留确认结果中的显式站点上下文
系统 SHALL 在 CMS 自动 handoff 中保留确认结果中的显式 `siteId`，并 SHALL 使该站点上下文与 `selection`、`targetSelection`、`targetBlock` 一起进入 `PageBuilderCmsApplySkillInput` 与隐藏结构化 payload，而不得在 handoff 时重新从宿主配置推断站点。

#### Scenario: handoff 输入保留选择结果中的 siteId
- **WHEN** 系统为一次 CMS 确认结果构建自动 handoff 输入
- **THEN** 系统 SHALL 在 `selection` 中保留当前确认结果的 `siteId`
- **AND** 系统 SHALL 使后续 skill 能基于该显式站点做出 apply 决策

#### Scenario: 结构化 handoff payload 不再依赖宿主静态站点
- **WHEN** 系统通过 `composedUserMessage` 发送 CMS 自动 handoff 的隐藏结构化 payload
- **THEN** payload SHALL 显式包含当前选择结果的 `siteId`
- **AND** 系统 SHALL NOT 将站点上下文留给后续 Agent 从宿主静态 `siteID` 配置或默认环境中自行推断

#### Scenario: 缺失 siteId 时 handoff 必须立即失败
- **WHEN** 系统尝试为一条缺少 `selection.siteId` 的 CMS 选择结果构建自动 handoff payload
- **THEN** 系统 SHALL 立即报错并停止 handoff
- **AND** 系统 SHALL NOT 假设 `siteId = 1`

#### Scenario: handoff 指令明确约束新写入 CMS 标签的站点
- **WHEN** 系统构建自动 handoff 的隐藏指令
- **THEN** 指令 SHALL 明确要求新写入或重绑的 `cms-*` 标签显式写出 `site-id`
- **AND** 指令 SHALL 明确要求该 `site-id` 等于当前 `selection.siteId`
- **AND** 指令 SHALL 明确要求只有本次受控 CMS 选择流可以创建或重绑 `cms-*` 标签
