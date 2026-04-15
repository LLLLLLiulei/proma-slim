## ADDED Requirements

### Requirement: CMS 自动应用专用 skill 输入与 ready 决策必须保留显式站点上下文
系统 SHALL 让 `cms-binding-apply` 的结构化输入与 `ready` 决策保留显式 `siteId`，使后续正式 `apply_cms_binding` 工具能够生成带站点属性的 `cms-catalog` / `cms-content`，而不是继续依赖宿主静态站点配置或隐式默认站点。

#### Scenario: 结构化 selection 输入保留 siteId
- **WHEN** 用户在 `page-builder` 中确认一次 CMS 栏目或内容选择，并触发 `cms-binding-apply`
- **THEN** 系统 SHALL 在 skill 输入中的 `selection` 对象里保留显式 `siteId`
- **AND** 系统 SHALL 继续同时保留 `targetSelection`、`targetBlock` 与现有运行边界字段

#### Scenario: ready 结果面向 apply tool 保留站点信息
- **WHEN** `cms-binding-apply` 对某次输入返回 `ready`
- **THEN** 系统 SHALL 使该 ready 路径面向正式 `apply_cms_binding` 工具保留显式 `siteId`
- **AND** 后续正式写入 SHALL 能据此生成带 `site-id` 的 `cms-catalog` 或 `cms-content`

#### Scenario: 缺失显式 siteId 时停止正式写入流程
- **WHEN** `cms-binding-apply` 接收到缺少显式 `selection.siteId` 的输入
- **THEN** 系统 SHALL 将该输入视为 `malformed-payload`
- **AND** 系统 SHALL NOT 假设 `siteId = 1`
- **AND** 系统 SHALL NOT 继续进入正式 `apply_cms_binding` 写入路径

### Requirement: 只有受控 CMS 选择流程可以创建或重绑 CMS 标签
系统 SHALL 约束 `cms-binding-apply` 只服务于“已确认的 CMS 选择结果”这一受控插入流程；普通页面生成或普通页面迭代 MUST NOT 凭空新增 `cms-catalog` / `cms-content`。

#### Scenario: 受控选择流可以创建或重绑 CMS 标签
- **WHEN** 用户先完成 CMS 浏览选择，再触发 `cms-binding-apply`
- **THEN** 系统 SHALL 允许该流创建新的 `cms-catalog` / `cms-content`，或整体重绑现有 CMS 源标签

#### Scenario: 普通页面迭代仅调整现有 CMS 区域内部结构
- **WHEN** 页面已经存在 CMS 标签，且后续是普通页面迭代而非 CMS 选择流
- **THEN** 系统 SHALL 仅允许调整现有 CMS 区域的 slot 模板、内部结构与样式
- **AND** 系统 SHALL NOT 在该普通迭代流中新增新的 `cms-catalog` / `cms-content`
- **AND** 系统 SHALL NOT 在该普通迭代流中静默改写 `site-id`、`catalog-id`、`page-size` 等查询属性
