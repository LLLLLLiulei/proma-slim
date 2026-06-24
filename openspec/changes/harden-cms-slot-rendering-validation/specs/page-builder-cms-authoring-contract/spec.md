## ADDED Requirements

### Requirement: CMS authoring contract 必须定义 slot 表达式 helper 边界
系统 SHALL 在 canonical CMS authoring contract 及其派生 guidance 中定义 CMS slot 表达式可使用的标识符边界；当前正式 authoring surface MUST NOT 包含未声明的项目裸 helper/function call，除非该 helper 被 contract 显式列入 allowlist。系统 MAY 允许 Vue 模板可执行的安全原生全局表达式。宿主危险全局和命令式 DOM/网络/存储能力 MUST 在 guidance/skill 层明确禁止，但 validator 不要求实现复杂静态识别。

#### Scenario: 未声明 helper 不属于当前 slot authoring surface
- **WHEN** 系统为 `cms-catalog` 或 `cms-content` 派生 authoring contract digest 或人类可读 guidance
- **THEN** 输出 SHALL 明确表达 slot 模板不得调用 `getDateDay`、`formatDate`、`buildUrl` 或其他 contract 未声明 helper
- **AND** 系统 SHALL 要求模板优先使用统一 slot scope、当前组件 item 字段、HTML 结构和受控 Vue 表达式完成展示

#### Scenario: 安全原生全局不属于项目 helper surface
- **WHEN** 系统说明 CMS slot 表达式边界
- **THEN** guidance SHALL NOT 把 `Date`、`Math`、`JSON` 等 Vue 模板可执行的安全原生全局描述为项目自定义 helper
- **AND** validator SHALL NOT 仅因这些安全原生全局返回 `UNKNOWN_SLOT_HELPER`

#### Scenario: 宿主危险全局不属于 authoring surface
- **WHEN** 系统说明 CMS slot 表达式边界
- **THEN** guidance SHALL 明确禁止 `window`、`document`、`globalThis`、`eval`、`Function`、`fetch`、storage、timer 或 DOM/网络相关宿主能力
- **AND** guidance SHALL 指导 Agent 改用 contract 字段、声明式链接、受支持 Vue 表达式或 CMS 数据，不依赖宿主能力
- **AND** validator 不要求将这些标识符识别为阻断性 authoring 错误；如后续确需系统门禁，必须另起变更设计低误报规则

#### Scenario: 日期字段展示不依赖隐式 helper
- **WHEN** 系统为 `cms-content` 的 `item.addedAt` 生成推荐用法或示例
- **THEN** guidance SHALL 使用 `item.addedAt`、带守卫的字符串切片，或其他不依赖隐式 helper 的表达式
- **AND** guidance SHALL NOT 推荐调用未由 contract 声明的日期格式化函数

#### Scenario: 未来 helper 必须先进入 contract allowlist
- **WHEN** 后续变更确实需要提供内置 CMS slot helper
- **THEN** 该 helper SHALL 先在 canonical contract 中声明名称、参数、返回语义和 preview/export 一致性要求
- **AND** validator、apply tool 与 default skill SHALL 从该声明派生允许规则，而不得各自硬编码不同 helper 白名单
