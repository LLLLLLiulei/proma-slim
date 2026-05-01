## ADDED Requirements

### Requirement: ordinary CMS 区域 guidance 必须描述增强后的栏目和内容字段语义
系统 SHALL 让 ordinary existing-region guidance 与 canonical CMS authoring contract 中增强后的字段语义保持一致；当用户普通编辑已有 `cms-catalog` 或 `cms-content` 区域时，系统 MUST 指导模型继续使用现有 canonical 字段，而不是直接引用上游原始字段别名。

#### Scenario: 普通编辑已有 cms-catalog 时使用 item.path 和 item.logoUrl
- **WHEN** ordinary flow 命中已有 `cms-catalog` 区域并需要调整链接或图文结构
- **THEN** guidance SHALL 指导模型使用 `item.path` 渲染栏目跳转链接
- **AND** guidance SHALL 指导模型使用带守卫的 `item.logoUrl` 渲染栏目封面
- **AND** guidance SHALL 明确不要猜测 `item.link`、`item.url` 或 `item.logoFile`

#### Scenario: 普通编辑已有 cms-content 时使用 item.publishUrl 和 item.listLogoUrl
- **WHEN** ordinary flow 命中已有 `cms-content` 区域并需要调整链接或图文结构
- **THEN** guidance SHALL 指导模型使用 `item.publishUrl` 渲染内容跳转链接
- **AND** guidance SHALL 指导模型使用带守卫的 `item.listLogoUrl` 渲染内容封面
- **AND** guidance SHALL 明确不要猜测 `item.link`、`item.url` 或 `item.logoFile`

### Requirement: ordinary CMS 区域 guidance 必须推荐声明式 anchor 而不是事件跳转
系统 SHALL 在 ordinary existing-region guidance 中把 CMS 链接 authoring 表达为声明式 `<a href>` 结构；系统 MUST 避免鼓励模型通过点击事件、DOM mutation 或未声明字段来完成栏目/内容跳转。

#### Scenario: 普通编辑列表或导航链接时保留声明式 href
- **WHEN** 用户要求把已有 CMS 栏目或内容列表改成可点击列表、导航条或图文列表
- **THEN** guidance SHALL 推荐在当前 CMS slot 内使用 `<a>` 标签与 canonical href 字段
- **AND** guidance SHALL 推荐适合外部打开时使用 `target="_blank"` 与 `rel="noopener noreferrer"`
- **AND** guidance SHALL NOT 推荐 `@click`、`window.location` 或原生 `onclick` 作为跳转默认方案
