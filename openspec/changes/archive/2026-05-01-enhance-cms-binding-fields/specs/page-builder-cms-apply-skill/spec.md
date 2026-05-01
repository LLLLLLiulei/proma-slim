## ADDED Requirements

### Requirement: `cms-binding-apply` 必须使用增强后的 canonical CMS 字段编写链接和封面
系统 SHALL 让 `cms-binding-apply` 在 confirmed CMS apply 中只使用 canonical authoring contract 暴露的字段来编写栏目和内容链接/封面；当生成导航、列表或图文列表时，系统 MUST 使用增强后的 `item.path`、`item.logoUrl`、`item.publishUrl` 与 `item.listLogoUrl`，而不得猜测上游原始字段别名。

#### Scenario: 栏目导航使用 item.path 和声明式 anchor
- **WHEN** `cms-binding-apply` 为栏目选择生成导航或栏目列表模板
- **THEN** 生成模板 SHALL 使用 `item.path` 作为栏目链接 href
- **AND** 当模板展示栏目封面时 SHALL 使用 `item.logoUrl` 并为该可选字段提供守卫
- **AND** 生成模板 SHALL NOT 使用 `item.link`、`item.url`、`item.logoFile` 或点击事件作为默认实现

#### Scenario: 内容列表使用 item.publishUrl 和 item.listLogoUrl
- **WHEN** `cms-binding-apply` 为内容选择生成内容列表或图文列表模板
- **THEN** 生成模板 SHALL 使用 `item.publishUrl` 作为内容链接 href
- **AND** 当模板展示内容封面时 SHALL 使用 `item.listLogoUrl` 并为该可选字段提供守卫
- **AND** 生成模板 SHALL NOT 使用 `item.link`、`item.url`、`item.logoFile` 或点击事件作为默认实现

### Requirement: `cms-binding-apply` guidance 必须优先推荐新窗口安全链接属性
系统 SHALL 在 `cms-binding-apply` 的 component references 和共享 authoring rules 中推荐 CMS 外部目的地使用新窗口安全链接属性；该推荐 MUST 作为默认 guidance 输出，但 MUST NOT 变成阻断已有合法模板的强制 validator 规则。

#### Scenario: 生成可点击栏目或内容名称时推荐 target 和 rel
- **WHEN** `cms-binding-apply` 需要让栏目名称或内容标题可点击打开 CMS 目的地
- **THEN** guidance SHALL 推荐 `<a>` 标签使用 canonical href 字段
- **AND** guidance SHALL 推荐在适合新窗口打开时添加 `target="_blank"` 与 `rel="noopener noreferrer"`
- **AND** 系统 SHALL NOT 仅因为旧模板缺少这些属性就把模板判定为不合法
