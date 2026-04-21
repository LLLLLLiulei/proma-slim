## ADDED Requirements

### Requirement: CMS 自动应用专用 skill references 必须按决策入口、共享边界与组件说明分层组织
系统 SHALL 将 `cms-binding-apply` 的 references 组织为清晰分层的结构，而不是继续依赖单一混合大文件；其中 decision contract 与最小 payload/result 示例 MUST 作为轻量入口保留，`cms-catalog` 与 `cms-content` 的 authoring guidance MUST 分别保留在组件专项说明中，两个组件共享的 HTML-first / slot / Vue boundary / anti-pattern 规则 MUST 保留在单独的共享 rules 文档中。

#### Scenario: 轻量入口文件只保留 decision contract 与最小示例
- **WHEN** 系统为 `cms-binding-apply` 提供 payload shape、`ready`、`needs-clarification`、`incompatible` 或 malformed payload 这类 decision 示例
- **THEN** 系统 SHALL 将这些内容保留在轻量入口 reference 中
- **AND** 该入口 reference SHALL NOT 再承担完整的 `cms-catalog` / `cms-content` authoring 教程

#### Scenario: 组件专项说明与共享规则分别承载不同知识面
- **WHEN** 系统为 `cms-binding-apply` 提供 `cms-catalog` / `cms-content` 的 authoring guidance
- **THEN** 系统 SHALL 将组件特有的适用场景、source modes、props、字段语义和常见写法保留在对应组件说明中
- **AND** 系统 SHALL 将两个组件共享的 slot inner content、HTML-first、Vue boundary、anti-pattern 和 apply payload 边界保留在共享 rules 文档中

### Requirement: CMS 自动应用专用 skill 必须按当前 selection 与 component 路由读取对应 guidance
系统 SHALL 让 `cms-binding-apply` 在消费 references 时，先读取轻量 decision 入口，再根据当前 `selection.selectionKind` 或 `authoringContext.component` 路由到对应的组件专项说明；当需要确认共享 authoring 边界时，系统 SHALL 再读取共享 rules 文档，而不得默认要求模型先扫描全部混合示例。

#### Scenario: 栏目选择优先路由到 `cms-catalog` 说明
- **WHEN** `cms-binding-apply` 处理 `selection.selectionKind = catalogs` 的 confirmed CMS selection，或 `authoringContext.component = cms-catalog`
- **THEN** 系统 SHALL 明确把 `cms-catalog` 专项说明作为当前组件 guidance
- **AND** 系统 SHALL NOT 默认要求模型先阅读 `cms-content` 的字段和 recipe

#### Scenario: 内容选择优先路由到 `cms-content` 说明
- **WHEN** `cms-binding-apply` 处理 `selection.selectionKind = contents` 的 confirmed CMS selection，或 `authoringContext.component = cms-content`
- **THEN** 系统 SHALL 明确把 `cms-content` 专项说明作为当前组件 guidance
- **AND** 系统 SHALL NOT 默认要求模型先阅读 `cms-catalog` 的字段和 recipe

#### Scenario: 共享边界通过共享 rules 文档补充而不是在组件说明里重复展开
- **WHEN** `cms-binding-apply` 需要确认 slot inner content、HTML-first、禁止自管 Vue runtime、禁止 page-wide mount 或其他共享 anti-pattern
- **THEN** 系统 SHALL 将这些内容路由到共享 rules 文档
- **AND** 系统 SHALL NOT 要求每个组件说明都各自重复完整共享边界库
