## MODIFIED Requirements

### Requirement: Builder 普通对话发送必须由宿主先完成 scene 分类与 owner 映射
系统 SHALL 在 `page-builder` 的 Builder 发送准备阶段先结合宿主拥有的结构化目标上下文与 workflow 状态，把本轮请求分类为 `ordinary-page-flow`、`existing-cms-region-ordinary-edit` 或 `confirmed-cms-apply` 三种 scene，并 SHALL 只为该次发送显式装载与 scene 对应的唯一 owner skill；其中 `ordinary-page-flow` 与 `existing-cms-region-ordinary-edit` 的唯一 owner 都为 `page-builder-guided-generation`，`confirmed-cms-apply` 的唯一 owner 为 `cms-binding-apply`。当 scene 为 `existing-cms-region-ordinary-edit` 时，系统 MAY 额外注入 target-scoped 的 `page-builder-cms-region-authoring-guidance` 作为 consult-only guidance，但 SHALL NOT 把它提升为并列 owner 或替代 owner。系统 SHALL NOT 要求用户手动输入 skill 调用指令，也 SHALL NOT 在同一轮中并列追加多个 controller skill。自由文本内容 MAY 作为 owner skill 的语义输入，但宿主 SHALL NOT 仅凭关键词、动词模式、正则匹配或 continuation 文本去恢复、延续、清空或改写 `targetSelection`。

#### Scenario: 普通消息进入单一 ordinary owner
- **WHEN** 用户在 `page-builder` 的 Builder 对话区提交一条普通页面创建、普通迭代、普通修复或当前已选 block 的 follow-up 消息，且当前发送未显式命中已有 CMS target，也未进入 confirmed CMS apply
- **THEN** 系统 SHALL 在该次发送中显式装载且只装载 `page-builder-guided-generation`
- **AND** 系统 SHALL NOT 额外追加 `cms-binding-apply` 作为并列 owner

#### Scenario: 显式命中已有 CMS target 时保持 ordinary owner 并注入 consult guidance
- **WHEN** 当前 Builder 发送已经带有明确的 existing `cms-island` 或 source CMS tag target，且该任务仍属于已有 CMS 区域 ordinary authoring，而不是 confirmed apply
- **THEN** 系统 SHALL 在该次发送中显式装载且只装载 `page-builder-guided-generation` 作为 owner
- **AND** 系统 MAY 额外提供 `page-builder-cms-region-authoring-guidance` 与当前目标 digest 作为 consult-only guidance
- **AND** 系统 SHALL NOT 将 `page-builder-cms-region-authoring-guidance` 作为新的 owner 或并列 owner 注入

#### Scenario: 没有显式 target 的后续消息不会被宿主自动恢复旧 target
- **WHEN** 用户此前已经发送过一条带 `targetSelection` 的消息，但当前这一轮发送没有新的显式 target，也没有 confirmed CMS workflow state
- **THEN** 系统 SHALL 不再自动恢复上一轮的旧 `targetSelection`
- **AND** 系统 SHALL 将该次发送视为无显式 target 的 ordinary flow

#### Scenario: confirmed CMS apply 使用专用 owner
- **WHEN** 当前 Builder workflow 已经拥有确认完成的 CMS 选择结果并进入 decision-backed confirmed CMS apply
- **THEN** 系统 SHALL 在该次发送中显式装载且只装载 `cms-binding-apply`
- **AND** 系统 SHALL NOT 再额外追加 `page-builder-guided-generation` 或 `page-builder-cms-region-authoring-guidance`

#### Scenario: 已由宿主写入唯一 owner 的程序化发送不再被默认 ordinary owner 覆盖
- **WHEN** 某次 Builder 发送已经由宿主场景分类或专用工作流写入与当前 scene 对应的唯一 owner skill
- **THEN** 系统 SHALL 保留该唯一 owner
- **AND** 系统 SHALL NOT 再额外追加默认 `page-builder-guided-generation`
