## ADDED Requirements

### Requirement: 系统必须为 CMS authoring 提供唯一真相源 contract
系统 SHALL 提供一份机器可读的 CMS authoring contract，作为 `cms-catalog` / `cms-content` 受支持 authoring 能力的唯一真相源；运行时、正式 apply 工具、validator、自动 handoff、default skills 与相关引用示例 MUST 统一消费或派生自这同一份 contract，而不得继续各自维护分散的 props、字段或禁用结构列表。

#### Scenario: 代码与 skill 引用从同一 contract 派生能力视图
- **WHEN** 运行时代码需要判断某个 `cms-*` 组件是否支持某个 props、字段或模板结构，且默认 skill / prompt 也需要向模型展示对应能力边界
- **THEN** 系统 SHALL 让这些消费者使用同一份 CMS authoring contract 或其派生视图
- **AND** 系统 SHALL NOT 允许代码和 skill 各自维护彼此独立的能力白名单

#### Scenario: contract 可按当前组件和来源模式裁剪为紧凑视图
- **WHEN** 系统只需要为某次 `cms-catalog` 或 `cms-content` 写入提供当前组件、当前来源模式相关的 authoring 约束
- **THEN** 系统 SHALL 能从该 contract 派生出紧凑的组件级能力摘要
- **AND** 该摘要 SHALL 不包含与当前组件无关的其他 CMS 组件能力噪音

### Requirement: CMS authoring contract 必须显式定义当前支持的 props、slot scope 与字段白名单
系统 SHALL 在 CMS authoring contract 中显式定义当前正式支持的组件表面，而不得依赖隐式示例或模型猜测；其中 `cms-catalog` 当前受支持的作者态 props MUST 限定为 `site-id`、`ids`、`level`、`parent-id`、`content-type`、`search-keyword` 与 `take`，`cms-content` 当前受支持的作者态 props MUST 限定为 `site-id`、`ids`、`catalog-id`、`keyword`、`page-index` 与 `page-size`；两个组件的统一 slot scope MUST 为 `{ items, loading, error, empty }`；`cms-catalog` 的 `items[*]` 可用字段 MUST 限定为 `id`、`name`、`path`、`parentId`、`logoUrl`、`hasChild`、`total`、`contentType`、`contentTypeName` 与 `children`；`cms-content` 的 `items[*]` 可用字段 MUST 限定为 `id`、`catalogId`、`title`、`summary`、`publishUrl`、`listLogoUrl` 与 `addedAt`。

#### Scenario: 模型与工具只能看到 contract 中列出的当前正式字段
- **WHEN** 系统向模型、validator 或其他消费者提供某个 `cms-*` 组件的 authoring 能力说明
- **THEN** 系统 SHALL 只暴露该 contract 当前列出的 props、slot scope 与字段白名单
- **AND** 系统 SHALL NOT 继续暴露 `item.link`、`item.url`、`shape`、`assetHints` 或其他当前运行时未实现字段

#### Scenario: contract 显式区分 `cms-catalog` 与 `cms-content` 的字段表面
- **WHEN** 系统为 `cms-catalog` 或 `cms-content` 生成作者指导、校验规则或调用约束
- **THEN** 系统 SHALL 使用与对应组件匹配的字段白名单
- **AND** 系统 SHALL NOT 将 `cms-catalog` 的 `path` 错误映射为 `cms-content` 的详情跳转字段
- **AND** 系统 SHALL NOT 将 `cms-content` 的 `publishUrl` 或 `listLogoUrl` 暴露为 `cms-catalog` 的字段

### Requirement: CMS authoring contract 必须为字段提供结构化语义元信息
系统 SHALL 在 CMS authoring contract 中为当前暴露给模型和 validator 的 `item` 字段提供结构化元信息，而不得仅提供裸字段名数组；这些元信息 MUST 至少覆盖字段类型、是否可选、简要语义说明，以及在适用时的推荐用法。

#### Scenario: contract digest 暴露字段类型与可选性
- **WHEN** 系统为某次 `cms-catalog` 或 `cms-content` authoring 生成组件级 contract digest
- **THEN** 该 digest SHALL 暴露每个 `item` 字段的类型和是否可选
- **AND** digest SHALL 不再只提供无语义的字段名数组

#### Scenario: 可选字段在 contract 中被显式标注
- **WHEN** 某个字段在运行时可能缺省，例如栏目图片或内容列表图片/时间字段
- **THEN** contract SHALL 将该字段标注为可选
- **AND** 系统 SHALL 能基于该元信息指导模型为对应 URL/图片字段补充守卫

### Requirement: CMS authoring contract 必须区分 legacy 读时兼容与新作者态要求
系统 SHALL 在 CMS authoring contract 中显式区分“旧页面读时兼容”和“新建/重绑作者态要求”；旧页面中缺少显式 `site-id` 的 `cms-*` 标签 MAY 在运行时按 `siteId = 1` 兼容读取，但任何新建、重绑或正式改写后的 `cms-*` 标签 MUST 显式写出 `site-id`，并 SHALL NOT 再依赖隐式默认站点。

#### Scenario: 旧页面在读时兼容缺省站点
- **WHEN** 某个已有作者态页面包含缺少 `site-id` 的 `cms-catalog` 或 `cms-content`
- **THEN** 系统 SHALL 允许运行时按 legacy 兼容语义读取该标签
- **AND** 该兼容行为 SHALL 仅用于读取而不是新的正式 authoring 输出

#### Scenario: 新建或重绑后的 CMS 标签必须显式写出 `site-id`
- **WHEN** 系统通过正式 CMS 绑定流程新建或重绑某个 `cms-catalog` 或 `cms-content`
- **THEN** 生成后的作者态标签 SHALL 显式写出 `site-id`
- **AND** 系统 SHALL NOT 继续生成省略 `site-id` 的新 CMS 标签

### Requirement: 人类可读的 CMS guidance 必须与当前 contract 保持一致
系统 SHALL 让默认 skills、workspace prompt、示例引用与其他面向模型的 CMS guidance 与当前 CMS authoring contract 保持一致；已过时或与当前 contract 冲突的 CMS 引用 MUST 被归档或显式标记为 superseded，而不得继续作为普通参考被默认消费。

#### Scenario: 默认 guidance 不再引用过时字段或旧 contract
- **WHEN** 默认 skill、prompt 或引用示例向模型展示 `cms-catalog` / `cms-content` 写法
- **THEN** 这些 guidance SHALL 只引用当前 contract 中存在的 props、slot scope 与字段
- **AND** 系统 SHALL NOT 再把过时字段、旧的返回 shape 或过期站点依赖作为默认指导内容

#### Scenario: 过时 CMS 文档被归档或显式标记为 superseded
- **WHEN** 仓库中存在与当前 CMS authoring contract 不一致的历史文档或示例
- **THEN** 系统 SHALL 将这些文档归档，或显式标记为 superseded
- **AND** 系统 SHALL 让默认 CMS guidance 不再把它们当作当前实现依据
