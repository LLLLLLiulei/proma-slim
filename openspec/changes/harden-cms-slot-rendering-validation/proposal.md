## Why

当前 CMS 绑定链路会允许包含未声明 Vue helper 的 slot 模板通过 validation 并写入页面，例如 `{{ getDateDay(item.addedAt) }}`，最终在 preview/export 渲染时抛出运行时错误，导致 CMS 数据已取到但区域不渲染。这个问题属于系统校验缺口，不能只依赖 Agent 自觉阅读示例或人工修正生成代码。

## What Changes

- 增强 CMS island template validation：将 slot 表达式中的未声明项目 helper/function call 识别为阻断性错误，并继续保留既有 Vue compiler 语法、字段、slot 变量、HTML 安全边界和 CMS 结构边界校验，避免非法模板进入 preview 或 export。
- 明确 CMS authoring contract 的表达式边界：slot 模板只能使用统一 slot scope、当前 item 字段、Vue 模板基础表达式和安全原生全局/方法（例如 `Date`、`Math`、`JSON`）；不得假设存在 `formatDate`、`getDateDay` 等隐式项目 helper。`window`、`document`、`eval`、`fetch` 等宿主能力作为 skill/guidance 层的禁止项约束 Agent 生成，不在 validator 中实现复杂 host-global tokenizer。
- 强化 `apply_cms_binding` 写入前预检：模板 contract/preflight 失败时不得写回，并返回紧凑、可执行的诊断和重试方向。
- 更新 `cms-binding-apply` 默认 skill 与 references：明确禁止未声明 helper，给出不依赖 helper 的日期/字段展示写法，并修正 reference 路径指导，减少 Agent 误读相对路径。
- 增加列表壳层边界校验：对 `ul` / `ol` 等目标壳层与 `templateBody` 重复生成同类外层列表容器的情况给出阻断性结构诊断，避免渲染后出现非法或异常嵌套结构。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-cms-authoring-contract`: 补充 CMS slot 表达式允许范围，明确当前不提供隐式项目 helper/function authoring surface，但允许 Vue 模板可执行的安全原生表达式。
- `page-builder-cms-rendering-core`: 增强 CMS validation/compile 前置规则，阻断未声明项目 helper 调用和列表壳层重复结构，并保留确定性的 Vue 语法、字段、slot 变量、HTML 安全与 CMS 结构校验。
- `page-builder-cms-rendering-apply-tool`: 强化正式 apply 的 fail-closed 预检和紧凑错误返回，确保非法模板不会写入页面。
- `page-builder-cms-apply-skill`: 更新默认 skill guidance 与 references，指导 Agent 使用 contract 字段和内联安全表达式，不发明 helper、不访问宿主能力，也不读取错误路径。

## Impact

- 影响代码：`packages/page-builder-cms-rendering` 的 validator/template utilities、`apps/app` 中 `apply_cms_binding` 工具链、默认 skill `apps/app/default-skills/cms-binding-apply` 及相关测试。
- 影响行为：已有合法 CMS 模板不应受影响；包含未声明项目 helper、Vue compiler 可确定识别的模板语法错误、未知字段/slot 变量或重复列表外壳的 CMS 绑定将从“写入后运行时失败”变为“写入前明确失败并提示重试”。宿主能力和不可用对象/方法主要通过 skill guidance 约束 Agent，不作为复杂系统 tokenizer 门禁。
- 影响 Agent：错误信息需要短小明确，指出修改哪个模板字段、删除哪个 helper 或调整哪类结构；不得返回大量 HTML 或长代码片段占用上下文。
- 不引入新的运行时隐式 helper，也不自动修复已生成页面；修复重点是阻止后续非法 CMS 模板进入系统链路。
