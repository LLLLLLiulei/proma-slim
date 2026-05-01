## ADDED Requirements

### Requirement: CMS authoring contract 必须描述归一化链接和封面字段的作者态语义
系统 SHALL 在 canonical CMS authoring contract 的字段元信息中描述 `cms-catalog` 与 `cms-content` 当前归一化字段的含义、使用场景和推荐写法；系统 MUST 保持现有字段名不变，并 MUST NOT 在 agent-facing metadata 中暴露上游字段取值优先级或为同一语义新增默认可用的 `item.link`、`item.url`、`item.logoFile` 等上游别名字段。

#### Scenario: 栏目字段元信息描述导航链接与封面语义
- **WHEN** 系统生成 `cms-catalog` 的 authoring contract digest
- **THEN** `item.path` 的元信息 SHALL 表达其用于栏目导航或跳转链接
- **AND** `item.logoUrl` 的元信息 SHALL 表达其用于栏目封面、缩略图或图文列表图片，并提示该字段可选且需要守卫
- **AND** 该 digest SHALL 继续将 `path` 标记为推荐链接字段
- **AND** 该 digest SHALL 将 `logoUrl` 标记为栏目推荐图片字段
- **AND** 该 digest SHALL NOT 描述 `listLink`、`link`、`url`、`path` 或 `logoFile` 的上游取值优先级

#### Scenario: 内容字段元信息描述详情链接与列表封面语义
- **WHEN** 系统生成 `cms-content` 的 authoring contract digest
- **THEN** `item.publishUrl` 的元信息 SHALL 表达其用于内容详情或跳转链接
- **AND** `item.listLogoUrl` 的元信息 SHALL 表达其用于内容列表封面、缩略图或图文列表图片，并提示该字段可选且需要守卫
- **AND** 该 digest SHALL 继续将 `publishUrl` 标记为推荐链接字段
- **AND** 该 digest SHALL 继续将 `listLogoUrl` 标记为推荐图片字段
- **AND** 该 digest SHALL NOT 描述 `link`、`url`、`publishUrl` 或 `logoFile` 的上游取值优先级

### Requirement: CMS authoring contract 必须推荐声明式链接写法
系统 SHALL 在 CMS authoring contract 的字段推荐用法中引导模型使用声明式 `<a href>` 绑定栏目或内容跳转链接；对于列表、导航条或图文列表中的栏目/内容名称，系统 MUST 推荐使用 canonical 链接字段作为 `href`，并避免通过点击事件或未声明字段完成跳转。

#### Scenario: 栏目和内容链接推荐使用 href 而不是点击事件
- **WHEN** 系统向模型提供 `cms-catalog` 或 `cms-content` 字段推荐用法
- **THEN** 系统 SHALL 推荐通过 `:href="item.path"` 或 `:href="item.publishUrl"` 生成链接
- **AND** 对适合新窗口打开的 CMS 目的地，系统 SHALL 推荐 `target="_blank"` 与 `rel="noopener noreferrer"`
- **AND** 系统 SHALL NOT 推荐 `@click`、`window.location`、`item.link` 或 `item.url` 作为默认跳转写法
