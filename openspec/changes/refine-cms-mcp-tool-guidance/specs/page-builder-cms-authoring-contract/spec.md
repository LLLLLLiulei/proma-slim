## ADDED Requirements

### Requirement: Human-readable CMS guidance examples must use current runtime enum values
系统 SHALL 让 human-readable CMS authoring guidance、默认 skill references、workspace prompt 和示例片段使用当前 runtime 与 canonical contract 支持的枚举值、字段名和参数语义；示例 MUST NOT 展示当前运行时不支持但容易被模型复制的历史写法。

#### Scenario: cms-catalog level examples only use root or children
- **WHEN** 系统展示 `cms-catalog` 的作者态源码示例或 apply 后生成源码示例
- **THEN** `level` 示例值 SHALL 只使用当前运行时支持的 `root` 或 `children`
- **AND** 文档 SHALL NOT 展示 `level="1"` 或其他数字 level 示例
- **AND** 当使用 `parent-id` 表达父栏目来源时，示例 SHALL 使用 `level="children"`

#### Scenario: Formal authoring examples use positive siteId and take semantics
- **WHEN** 系统展示新建或重绑后的 `cms-catalog` / `cms-content` 作者态示例
- **THEN** 示例 SHALL 显式写出大于等于 1 的 `site-id`
- **AND** `catalog-id`、`parent-id` 与 `ids` 示例 SHALL 使用来自 confirmed CMS selection 的正整数 ID 字符串
- **AND** 示例 SHALL NOT 使用 `news`、`root`、`news-root`、`n-101` 或其他语义别名表达 CMS source identity
- **AND** `take` 只 SHALL 用作可选的正整数限制示例
- **AND** 示例 SHALL NOT 使用 `take="0"` 表达不限数量或有效限制

### Requirement: CMS authoring contract must reject source prop values that runtime cannot honor
系统 SHALL 让 canonical CMS authoring contract、validator 与正式 apply preflight 对当前支持的 source props 执行可诊断校验；对于新建、重绑或正式 apply 生成的 CMS region，系统 MUST 拒绝 runtime 会静默忽略或无法稳定执行的枚举值与数字值，而不得只在文档中提示。

#### Scenario: Invalid cms-catalog level is rejected instead of silently ignored
- **WHEN** 新建、重绑或正式 apply 生成的 `cms-catalog` 使用了 `level` 属性
- **THEN** `level` SHALL 只允许 `root` 或 `children`
- **AND** 当 `level` 为 `1`、其他数字字符串、空字符串或未知枚举值时，系统 SHALL 返回 contract / validation 诊断
- **AND** 诊断 SHALL 指导 Agent 改为 `root` 或 `children`，而不是让 runtime 静默忽略该值
- **AND** 当使用 `parent-id` 表达父栏目来源时，系统 SHALL 要求 `level="children"`
- **AND** 当 `level="children"` 但缺少 `parent-id` 时，系统 SHALL 返回 contract / validation 诊断

#### Scenario: Formal CMS source props enforce positive numeric semantics
- **WHEN** 新建、重绑或正式 apply 生成的 `cms-catalog` / `cms-content` 包含正式 source props
- **THEN** `site-id` SHALL 是大于等于 1 的整数语义
- **AND** `catalog-id`、`parent-id` 与 `ids` SHALL 是 confirmed CMS selection 中的正整数 ID 字符串
- **AND** 系统 SHALL 拒绝或诊断 `catalog-id="news"`、`parent-id="root"`、`parent-id="news-root"`、`ids="news,products,about"`、`ids="n-101"` 等语义或伪造 ID
- **AND** `take` SHALL 是正整数语义，且 `take="0"` SHALL 被拒绝或诊断为无效限制
- **AND** 系统 SHALL 保持 legacy 读时兼容与 formal authoring 要求分离，不得因旧页面读取兼容而放宽新建/重绑输出

### Requirement: Human-readable CMS guidance must separate final source examples from MCP tool payload examples
系统 SHALL 在 human-readable CMS guidance 中明确区分最终作者态源码示例与 MCP tool payload 示例；最终源码示例 MAY 展示完整的 `cms-catalog` / `cms-content`、slot wrapper 和宿主管理注释，但 tool payload 示例 MUST 只展示工具实际接收的字段。

#### Scenario: Complete cms source examples are marked as generated source
- **WHEN** 文档展示包含外层 `cms-catalog` 或 `cms-content` 的完整片段
- **THEN** 文档 SHALL 明确该片段是最终作者态源码或工具生成结果
- **AND** 文档 SHALL 明确不得把该完整片段直接传入 `templateBody`、`emptyTemplate` 或 `errorTemplate`

#### Scenario: Tool payload examples remain executable as-is
- **WHEN** 文档展示 `mcp__cms__apply_cms_binding` 的 payload 示例
- **THEN** 示例 SHALL 只包含 `decisionId`、`templateBody`、`emptyTemplate?` 与 `errorTemplate?`
- **AND** 模板字段 SHALL 只包含 slot inner content 或可自动解包的单层匹配 slot wrapper
- **AND** 示例 SHALL NOT 要求模型额外传入 raw `siteId`、`targetSelection`、`kind` 或 source props
