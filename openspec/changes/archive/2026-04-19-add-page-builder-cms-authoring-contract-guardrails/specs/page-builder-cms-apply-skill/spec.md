## ADDED Requirements

### Requirement: CMS 自动应用专用 skill 必须在返回 `ready` 前按 canonical contract 校验候选 authoring
系统 SHALL 让 `cms-binding-apply` 在返回 `ready` 前，根据当前 canonical CMS authoring contract 校验候选 `cms-catalog` / `cms-content` 写法；当候选写法缺少必填 props、混用冲突来源字段、引用未支持字段、违反 slot 结构约束、或包含危险标签/嵌套结构时，skill MUST 返回阻断性结果，而不得继续进入 `ready`。

#### Scenario: 缺少必填 props 或混用来源字段时不进入 `ready`
- **WHEN** `cms-binding-apply` 识别到候选写法缺少 `site-id`、`catalog-id` 等必填 props，或同时混用 `ids` 与查询式来源字段
- **THEN** skill SHALL 返回 `incompatible`
- **AND** skill SHALL 明确指出缺失或冲突的 contract 条目
- **AND** 系统 SHALL NOT 继续形成可执行的正式 apply 决策

#### Scenario: 模板引用未支持字段或危险结构时不进入 `ready`
- **WHEN** `cms-binding-apply` 识别到候选 slot 模板引用了不在当前 contract 中的字段，或包含 `<script>`、`<style>`、嵌套 `cms-*`、外层 `template v-slot:*` 包装等禁止结构
- **THEN** skill SHALL 返回 `incompatible`
- **AND** skill SHALL NOT 继续调用正式 `apply_cms_binding`

#### Scenario: 只有 contract 校验通过时才能返回 `ready`
- **WHEN** `cms-binding-apply` 为某次 CMS 选择生成的写入方案满足当前组件、来源模式和模板结构的 contract 约束
- **THEN** skill SHALL 返回 `ready`
- **AND** `ready` 结果 SHALL 只包含可交给正式 apply 工具执行的、已通过 contract 校验的写入方案

### Requirement: CMS 自动应用专用 skill 的示例与推荐字段必须严格对齐当前 contract
系统 SHALL 让 `cms-binding-apply` 的主文案、内置示例与推荐片段严格使用当前 contract 中存在的字段，而不得继续使用过时 alias、历史字段或模型猜测字段。

#### Scenario: 栏目型推荐片段使用 `path` 而非过时链接 alias
- **WHEN** `cms-binding-apply` 为 `cms-catalog` 推荐导航或栏目列表模板
- **THEN** skill SHALL 使用当前 contract 中的栏目字段，例如 `item.path`
- **AND** skill SHALL NOT 推荐 `item.link`、`item.url` 或其他未实现字段

#### Scenario: 内容型推荐片段使用 `publishUrl` 和 `listLogoUrl`
- **WHEN** `cms-binding-apply` 为 `cms-content` 推荐内容列表模板
- **THEN** skill SHALL 使用当前 contract 中的内容字段，例如 `item.publishUrl` 与 `item.listLogoUrl`
- **AND** skill SHALL NOT 推荐历史遗留或未实现的字段别名

### Requirement: CMS 自动应用专用 skill 在缺少稳定 authoring 依据时必须短澄清而不是猜测
系统 SHALL 在 `cms-binding-apply` 无法根据当前 target snapshot、组件级 contract 与用户选择结果稳定决定 authoring 方案时，返回一次最小必要的短澄清，而不是自行猜测 props、字段或区块组织方式。

#### Scenario: 当前目标结构与推荐 CMS 组织方式不兼容时发起短澄清
- **WHEN** `cms-binding-apply` 发现当前目标结构无法在保持现有宿主壳子和 contract 约束的前提下稳定完成绑定
- **THEN** skill SHALL 返回 `needs-clarification`
- **AND** 该澄清 SHALL 仅请求当前 authoring 决策所需的最小补充信息
- **AND** skill SHALL NOT 擅自猜测一个新的通用列表或卡片结构
