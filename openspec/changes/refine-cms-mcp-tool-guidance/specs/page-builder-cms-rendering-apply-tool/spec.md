## ADDED Requirements

### Requirement: `apply_cms_binding` template fields must use slot-inner payload semantics
系统 SHALL 将 `mcp__cms__apply_cms_binding` 的 `templateBody`、`emptyTemplate` 与 `errorTemplate` 解释为对应 slot 的内部内容；工具 SHALL 自动生成外层 `cms-catalog` / `cms-content` source tag、宿主管理注释和 slot wrapper。调用方 MUST NOT 在这些字段中传入外层 `cms-catalog` / `cms-content` 标签或嵌套 CMS island。

#### Scenario: Outer cms source tag is rejected with field-specific guidance
- **WHEN** `templateBody`、`emptyTemplate` 或 `errorTemplate` 包含外层 `cms-catalog` 或 `cms-content` 标签
- **THEN** 系统 SHALL 拒绝本次 apply
- **AND** 错误 SHALL 指出具体违规字段
- **AND** 错误 SHALL 指出工具会自动生成外层 CMS 标签，调用方应只传 slot 内部内容

#### Scenario: Single matching slot wrapper can be unwrapped but nested wrappers are rejected
- **WHEN** 某个模板字段只包含单层最外层且语义匹配的 `<template v-slot:...>` 或 `<template #...>` wrapper
- **THEN** 系统 MAY 自动解包后继续 apply
- **AND** 当 wrapper 与字段语义不匹配或出现嵌套 slot wrapper 时，系统 SHALL 拒绝本次 apply
- **AND** 错误 SHALL 指出具体字段和期望的 slot 语义

#### Scenario: Preserved shell conflict error identifies the affected template field
- **WHEN** preserved-shell apply plan 要求保留外层主容器，而 `templateBody`、`emptyTemplate` 或 `errorTemplate` 中再次生成竞争性的主 grid/list/nav 容器
- **THEN** 系统 SHALL 拒绝本次 apply
- **AND** 错误 SHALL 指出具体冲突字段
- **AND** 错误 SHALL 指导 Agent 改为复用现有壳层并只传入兼容的内部动态节点

### Requirement: CMS apply preflight validation must only block the generated CMS region
系统 SHALL 在正式 apply 前校验即将生成的 CMS region 是否符合当前 CMS authoring contract，但该 preflight MUST 聚焦本次工具生成的 `cms-catalog` / `cms-content` 区域；系统 SHALL NOT 因目标页面其他 CMS island 外部已有的 `v-`、`:xxx`、`@xxx` 或 `{{ }}` 语法而阻断本次 CMS apply。

#### Scenario: Vue syntax outside the generated CMS region is not reported as apply failure
- **WHEN** 当前页面中本次目标 CMS region 之外存在历史遗留的 Vue-like 语法
- **AND** 本次 `apply_cms_binding` 生成的 CMS source tag 与 slot templates 符合 contract
- **THEN** 系统 SHALL 允许本次 apply 继续执行
- **AND** 系统 SHALL NOT 返回 `OUTSIDE_CMS_VUE_SYNTAX` 作为本次 apply 失败原因

#### Scenario: Invalid Vue syntax inside generated slot is field-specific
- **WHEN** 本次 `apply_cms_binding` 的某个模板字段在生成 CMS slot 后包含不合法 Vue 模板语法
- **THEN** 系统 SHALL 拒绝本次 apply
- **AND** 错误 SHALL 指出违规字段与语法问题摘要
- **AND** 错误 SHALL 要求修正该模板字段后重试，而不是要求重新选择 CMS 数据
