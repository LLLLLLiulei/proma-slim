## ADDED Requirements

### Requirement: CMS runtime SDK tool guidance must match executable tool contracts
系统 SHALL 让 `mcp__cms__list_catalogs`、`mcp__cms__list_contents`、`mcp__cms__decide_cms_binding` 与 `mcp__cms__apply_cms_binding` 暴露给 Agent 的 tool description、字段 description、示例 payload 与实际 tool schema / 运行时校验保持一致；这些说明 MUST 使用可以直接调用工具的 payload 形状，而不得混入最终作者态源码示例或 schema 不支持的字段。

#### Scenario: Decision ready examples cover every supported Phase 1A target kind
- **WHEN** 系统向 Agent 展示 `mcp__cms__decide_cms_binding` 的 `ready` 示例
- **THEN** 示例 SHALL 至少覆盖 `nav`、`catalog-list`、`content-list` 与 `content-list fixed ids`
- **AND** `catalog-list` 示例 SHALL 使用 `targetBlockKind: "catalog-list"`、`mappingKind: "catalog-nav"` 与 `toolKind: "catalog-nav"`
- **AND** 示例 SHALL 使用 `supportedRenderModes: ["replace-current"]`，不得使用 slot-keyed 对象或字符串化 JSON

#### Scenario: Content lookup guidance requires catalogId in both content modes
- **WHEN** 系统向 Agent 展示 `mcp__cms__list_contents` 的使用说明
- **THEN** 说明 SHALL 明确栏目分页查询和 fixed ids 查询都需要 `catalogId`
- **AND** fixed ids 查询示例 SHALL 明确禁止同时传入 `keyword`、`pageIndex` 或 `pageSize`
- **AND** 工具参数校验失败时 SHALL 指出缺失或冲突字段并要求修正参数后重试

#### Scenario: Numeric constraints are consistent across schema and guidance
- **WHEN** 系统向 Agent 展示 CMS formal apply 相关的 `siteId`、`catalogId`、`parentId`、`ids`、`take`、`pageSize` 参数说明
- **THEN** 新建或重绑 CMS 标签所需的 `siteId` SHALL 被描述为大于等于 1 的整数语义
- **AND** 正式写入链路的 `catalogId`、`parentId` 与 `ids` SHALL 被描述为来自 confirmed CMS selection 的正整数 ID 字符串
- **AND** `take` SHALL 被描述为可选的正整数限制语义，不得把 `0` 作为有效限制示例
- **AND** ids SHALL 被描述为正整数 string / number 扁平数组，数字 ID 仅允许规范化为字符串，不得使用 `{ "item": [...] }` 包装或 `news`、`root`、`news-root`、`n-101` 这类语义别名

#### Scenario: Formal decision schemas reject values that would be ignored by runtime
- **WHEN** Agent 调用 `mcp__cms__decide_cms_binding` 并传入 `ready` decision
- **THEN** 正式写入链路的 `source.siteId` SHALL 拒绝 `0`、负数、空字符串或非整数值
- **AND** `source.catalogId`、`source.parentId` 与 `source.ids` SHALL 拒绝空字符串、`0`、负数、非整数值和语义别名
- **AND** `catalog-nav` 的 `source.take` SHALL 拒绝 `0`、负数或非整数值
- **AND** 错误 SHALL 指出需要修正对应 source 字段后重新调用 decision tool

#### Scenario: Decision guidance recommends object payload while legacy compatibility remains non-preferred
- **WHEN** 系统向 Agent 展示 `mcp__cms__decide_cms_binding` 的 `decision` 参数说明
- **THEN** guidance SHALL 推荐传入嵌套结构化对象
- **AND** 所有示例 SHALL 使用对象形态，而不是 JSON 字符串
- **AND** 若实现保留 legacy JSON string 或 loose object 兼容路径，该兼容 SHALL 仅用于恢复旧调用，不得作为推荐调用形态暴露

### Requirement: CMS runtime MCP availability must be explicit to the agent
系统 SHALL 在 page-builder 会话的动态上下文中说明 CMS MCP 是宿主运行时注入的 SDK MCP server，而不是 workspace `mcp.json` 中的持久配置；系统 MUST 在 CMS runtime 可用或不可用时给 Agent 明确边界，避免 Agent 因读取 `mcp.json` 或缺少工具列表而伪造 CMS 数据。

#### Scenario: CMS runtime available context explains host-injected tools
- **WHEN** 某个 page-builder 会话满足 CMS runtime SDK tools 挂载条件
- **THEN** 系统 SHALL 向 Agent 明确说明可使用宿主运行时注入的 `mcp__cms__list_catalogs`、`mcp__cms__list_contents`、`mcp__cms__decide_cms_binding` 与 `mcp__cms__apply_cms_binding`
- **AND** 说明 SHALL 表达这些工具不来自 workspace `mcp.json`
- **AND** Agent SHALL NOT 被要求向 workspace `mcp.json` 写入 CMS server 配置

#### Scenario: CMS runtime unavailable context forbids fabricated CMS data
- **WHEN** 某个 page-builder 会话未挂载 CMS runtime SDK tools，或 CMS 配置不可用
- **THEN** 系统 SHALL 向 Agent 明确说明当前不能执行 CMS 读取或 CMS binding apply
- **AND** 系统 SHALL 指导 Agent 停止 CMS 调用链或要求宿主侧恢复 CMS runtime
- **AND** 系统 SHALL 禁止 Agent 伪造栏目、内容、`handoffId`、`decisionId` 或宣称 CMS 绑定成功

### Requirement: CMS runtime SDK tool errors must be actionable and non-conflicting
系统 SHALL 将 CMS runtime SDK tool 的输入错误、decision 冲突、apply 校验失败和上游异常格式化为 Agent 可执行的 plain-text 错误；错误 MUST 指出当前工具步骤未完成、具体失败字段或失败边界、下一步可恢复动作，以及本轮禁止继续执行的动作。

#### Scenario: Input validation error asks the agent to fix payload before retrying
- **WHEN** CMS runtime SDK tool 因 payload 缺字段、字段类型错误或字段组合非法而失败
- **THEN** 错误 SHALL 指出具体字段路径或字段组合
- **AND** 错误 SHALL 要求 Agent 修正 tool 参数后重试
- **AND** 错误 SHALL 禁止 Agent 在不修改参数的情况下重复调用同一工具

#### Scenario: Decision or apply error does not claim success
- **WHEN** `mcp__cms__decide_cms_binding` 或 `mcp__cms__apply_cms_binding` 失败
- **THEN** 错误 SHALL 明确表示当前 CMS 步骤未完成
- **AND** 错误 SHALL 禁止 Agent 宣称 CMS 绑定已经成功
- **AND** 错误 SHALL 禁止 Agent 伪造 `handoffId`、`decisionId`、栏目或内容数据

#### Scenario: Error guidance reflects non-expiring decision semantics
- **WHEN** CMS runtime SDK tool 返回 handoff 或 decision 不可用错误
- **THEN** 错误 SHALL 只基于上下文缺失、workspace/session 不匹配、target/selection 冲突或 decision 已消费来说明失败原因
- **AND** 错误 SHALL NOT 把普通页面 revision 变化描述为 handoff 或 decision 自动过期原因
