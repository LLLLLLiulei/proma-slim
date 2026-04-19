## ADDED Requirements

### Requirement: CMS rendering core 必须基于 canonical contract 暴露统一 authoring 元数据
系统 SHALL 让 `packages/page-builder-cms-rendering` 的扫描、编译、运行时与 validator 基于 canonical CMS authoring contract 工作，而不得继续各自维护分散的 props、字段或禁用结构判断逻辑。

#### Scenario: 扫描与 validator 使用同一份 contract 判断合法 props
- **WHEN** 模板扫描器、props 归一化逻辑和 validator 判断某个 `cms-*` 标签是否使用了受支持 props
- **THEN** 系统 SHALL 基于同一份 canonical contract 做出判断
- **AND** 系统 SHALL NOT 让这些模块各自维护不同的 props 白名单

#### Scenario: 组件字段元数据与 contract 保持一致
- **WHEN** `cms-catalog` 或 `cms-content` 的 ViewModel 字段被暴露给编译器、validator 或其他消费者
- **THEN** 系统 SHALL 使这些字段元数据与 canonical contract 中声明的字段保持一致
- **AND** 系统 SHALL NOT 额外暴露 contract 未声明的字段给默认 authoring 流程消费

### Requirement: 模板编译与 validation 必须拒绝超出 contract 的字段访问和结构
系统 SHALL 在 CMS island 模板编译与 validation 阶段拒绝任何超出 canonical contract 的字段访问、slot 变量或结构；只要作者模板访问了未声明字段、使用了未声明 slot 变量，或出现禁止结构，系统 MUST 将其视为阻断性错误。

#### Scenario: 未声明字段访问被视为阻断性错误
- **WHEN** 某个 `cms-catalog` 或 `cms-content` 的作者模板访问 `item.url`、`item.link` 或其他当前 contract 未声明字段
- **THEN** CMS 模板 validation SHALL 将其视为阻断性错误
- **AND** 系统 SHALL NOT 将该模板编译为可继续使用的 render 表示

#### Scenario: 未声明 slot 变量或禁止结构被视为阻断性错误
- **WHEN** 某个 CMS 作者模板引用了不在统一 slot scope 中的变量，或包含 `<script>`、`<style>`、嵌套 `cms-*`、外层 `template v-slot:*` 包装等禁止结构
- **THEN** CMS 模板 validation SHALL 将其视为阻断性错误
- **AND** 系统 SHALL 不把该模板视为合法的 CMS island 作者模板

### Requirement: CMS validation 必须对常见高风险 Vue 作者态坏模式给出稳定诊断
系统 SHALL 为当前 CMS island 作者模板中的常见高风险 Vue 作者态坏模式提供稳定诊断，以减少“字段名写对了但模板仍不稳”的情况；这些坏模式至少包括 `v-for` 缺少稳定 `:key`，以及对可选 URL/图片字段缺少显式守卫。

#### Scenario: `v-for` 缺少 `:key` 时给出稳定诊断
- **WHEN** 某个 CMS slot 模板包含 `v-for` 循环，但未提供稳定的 `:key`
- **THEN** CMS validation SHALL 产出稳定诊断
- **AND** 该诊断 SHALL 能被正式写入链路、测试或指导材料消费

#### Scenario: 可选 URL 或图片字段缺少守卫时给出稳定诊断
- **WHEN** 某个 CMS slot 模板直接绑定可选 URL 或图片字段，但未用 `v-if`、`v-else-if` 或等价守卫限制渲染
- **THEN** CMS validation SHALL 产出稳定诊断
- **AND** 该诊断 SHALL 反映当前 contract 中对可选字段的语义约束
