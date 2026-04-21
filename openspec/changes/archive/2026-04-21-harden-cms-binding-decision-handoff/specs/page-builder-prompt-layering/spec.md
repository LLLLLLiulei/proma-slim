## MODIFIED Requirements

### Requirement: CMS 相关请求必须按“预选择”与“已确认 apply”两个场景分流
系统 SHALL 将 page-builder 中与 CMS 相关的请求明确分流为“用户尚未完成 CMS 选择的预选择场景”和“已拥有确认选择结果的 apply 场景”；普通引导 flow MUST NOT 越过 CMS 选择阶段直接新建或重绑 `cms-*` 标签，而 confirmed CMS selection MUST 进入 `cms-binding-apply`、机器可读 decision 与正式 apply 链路。

#### Scenario: 尚未确认 CMS 选择时不直接新建或重绑 `cms-*`
- **WHEN** 用户表达某个区块需要接 CMS 数据，但当前并不存在已确认的 CMS 选择结果与目标上下文
- **THEN** 系统 SHALL 将该请求视为 CMS 预选择场景
- **AND** 系统 SHALL NOT 直接新建或重绑 `cms-catalog` / `cms-content`
- **AND** 系统 SHALL 要求先进入正式 CMS 选择流程

#### Scenario: 已确认 CMS 选择后进入 decision-backed confirmed apply flow
- **WHEN** 系统已经拥有一次确认完成的 CMS 选择结果、目标选择上下文和 Phase 1A apply 边界
- **THEN** 系统 SHALL 将后续决策路由到 `cms-binding-apply`
- **AND** 系统 SHALL 要求 confirmed CMS apply 先物化机器可读 decision，再继续正式 `mcp__cms__apply_cms_binding`
- **AND** 系统 SHALL NOT 继续让 `page-builder-guided-generation` 持有该次确认后的 CMS apply 执行权

### Requirement: Selected `cms-island` follow-up messages must distinguish style iteration from binding re-entry
系统 SHALL 在用户选中一个已存在的 `cms-island` 后，对后续普通消息做意图分流：样式/slot 迭代继续走 ordinary `page-builder-guided-generation`，但任何会改变 binding identity 的请求 MUST 回到 CMS browser confirm 与 decision/apply chain，而不能继续停留在 ordinary flow。

#### Scenario: Style-only follow-up on a selected CMS island stays in ordinary iteration with source-atomic semantics
- **WHEN** 用户选中一个 `cms-island`，并提出布局、样式、图片比例、slot 内结构或等价的视觉调整请求
- **THEN** 系统 SHALL 继续将该消息路由到 `page-builder-guided-generation`
- **AND** 系统 SHALL 保留 `source-atomic`、`replace-whole-source-component` 与禁止 rendered-child writes 的选择语义

#### Scenario: Binding-identity changes on a selected CMS island return to the controlled CMS flow
- **WHEN** 用户选中一个 `cms-island`，并提出更换栏目、重新选择 CMS 内容、改变 `site-id`、`catalog-id`、`ids`、`page-size`、`take` 或等价 binding identity 的请求
- **THEN** 系统 SHALL 将该请求重新路由回 CMS browser confirm 与 decision-backed confirmed apply flow
- **AND** 系统 SHALL NOT 仅通过 ordinary `page-builder-guided-generation` 直接修改已有 `cms-*` 的 query props
