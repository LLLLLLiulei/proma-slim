## MODIFIED Requirements

### Requirement: `apply_cms_binding` 工具必须只生成当前 runtime 已支持的组件与 props
系统 SHALL 只为当前正式 runtime 已支持的 `cms-catalog` 与 `cms-content` 组件生成标记，并 MUST 将 binding source 收敛到当前已实现的 props 集合；该集合 MUST 同时支持“查询式来源”和“fixed-ids 来源”，而不得要求上层通过手工拼装或全量加载绕过正式来源模型；对于固定集合来源，作者态标签 MUST 使用稳定的 `ids` 属性按顺序序列化。

#### Scenario: `catalog-nav` 绑定可生成父栏目来源或固定栏目集合来源
- **WHEN** 调用方请求生成 `catalog-nav` 绑定
- **THEN** 系统 SHALL 生成 `cms-catalog` 标记
- **AND** 当来源模式为父栏目来源时，系统 SHALL 只生成 `site-id`、`level="children"` 与 `parent-id`
- **AND** 当来源模式为固定栏目集合时，系统 SHALL 只生成 `site-id` 与 `ids`
- **AND** 生成的 slot 模板 SHALL 使用完整 `v-slot:default` 写法，而不是 `#default` 等简写

#### Scenario: `content-list` 绑定可生成按栏目取内容来源或固定内容集合来源
- **WHEN** 调用方请求生成 `content-list` 绑定
- **THEN** 系统 SHALL 生成 `cms-content` 标记
- **AND** 当来源模式为按栏目取内容时，系统 SHALL 只生成 `site-id`、`catalog-id`、`keyword`、`page-index` 与 `page-size`
- **AND** 当来源模式为固定内容集合时，系统 SHALL 生成 `site-id`、`catalog-id` 与 `ids`

#### Scenario: fixed-ids 来源按输入顺序写出稳定 `ids` 属性
- **WHEN** `apply_cms_binding` 成功生成 fixed-ids 模式的 `cms-catalog` 或 `cms-content`
- **THEN** 系统 SHALL 将 `ids` 作为作者态显式属性写出
- **AND** `ids` SHALL 按输入顺序稳定序列化
- **AND** 系统 SHALL 不改写该顺序

#### Scenario: 新生成的 CMS 标签始终显式写出 site-id
- **WHEN** `apply_cms_binding` 成功生成新的 `cms-catalog` 或 `cms-content`
- **THEN** 系统 SHALL 在生成后的作者态标签上显式写出 `site-id`
- **AND** 该值 SHALL 来自当前正式输入中的显式 `siteId`

#### Scenario: 新建或重绑 CMS 标签时缺少 siteId 立即失败
- **WHEN** `apply_cms_binding` 试图生成新的 `cms-catalog` 或 `cms-content`，但调用输入缺少显式 `siteId`
- **THEN** 系统 SHALL 拒绝本次 apply
- **AND** 系统 SHALL NOT 擅自写出 `site-id="1"` 或任何其他猜测值
- **AND** 系统 SHALL NOT 产生新的 CMS 组件标记

#### Scenario: 混合来源字段或未支持字段被拒绝
- **WHEN** 调用输入同时混用 `ids` 与 `parent-id`、`catalog-id`、分页查询字段，或包含 alias 查询、`contentSelectType` 等当前 runtime 未支持的字段
- **THEN** 系统 SHALL 拒绝本次 apply
- **AND** 系统 SHALL NOT 写入任何新的 CMS 组件标记
