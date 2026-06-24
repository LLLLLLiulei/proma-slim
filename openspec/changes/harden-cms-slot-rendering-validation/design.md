## Context

CMS 绑定链路目前已经有 canonical authoring contract、`validateCmsRendering()`、`apply_cms_binding` 预检与 preview/export 共享渲染 core。但实际问题暴露出一个校验缺口：slot 模板访问的字段和 slot 变量都能被检查，未声明项目 helper/function call 没有被统一拦截。Agent 生成 `{{ getDateDay(item.addedAt) }}` 这类模板时，Vue compile 可以通过，只有 preview/runtime render 才抛 `ReferenceError`，最终表现为 CMS 接口返回了数据但页面区域为空；同时 `ul` 目标壳层中再写入 `<ul>` slot 根也会造成异常嵌套。

这次改动必须在系统层面阻断可确定识别的错误模板，而不是只修改某一次生成的页面。约束包括：不引入隐式日期 helper；不把错误信息变成长 HTML/code dump；保持 `templateBody` 可兼容“直接传 slot 内部内容”和“传单层 `<template v-slot:...>` 包装后自动解包”的既有行为；合法旧模板不能因为本次强化被无关破坏。系统层不实现复杂 JavaScript/Vue 表达式 tokenizer，不尝试静态识别所有宿主全局或不可用对象/方法，这类约束主要放到 `cms-binding-apply` skill guidance。

## Goals / Non-Goals

**Goals:**

- 在 CMS core validation 阶段发现未声明项目 helper/function call，并作为阻断性错误返回。
- 让正式 `apply_cms_binding` 在写入前 fail closed，模板不合法时不修改 `workspace-files/index.html`。
- 让错误结果足够短，并明确告诉 Agent 下一步是删除未声明 helper、改用 contract 字段/安全 Vue 表达式，或调整模板结构后重试。
- 更新默认 `cms-binding-apply` guidance，使 Agent 不再把 skill references 当成 scratch cwd 下的 `references/*`，也不再推荐未声明 helper。
- 补上列表壳层边界：当保留外层 `ul` / `ol` 壳层时，slot 不得再生成同类外层列表容器。

**Non-Goals:**

- 不为 CMS slot 注入 `getDateDay`、`formatDate` 等运行时 helper。
- 不在本变更中自动修复已经生成到 workspace 的错误 HTML。
- 不把 CMS slot authoring 扩展为完整 Vue 应用开发能力，也不允许 page-wide Vue runtime/bootstrap。
- 不把所有 JavaScript 表达式都做完整静态类型推断；本次优先覆盖会导致运行时失败的未声明项目 helper 调用和已知结构坏模式。
- 不在系统 validator 中实现宿主全局、对象方法可用性或任意 Vue/JavaScript 表达式语义检查；这些复杂且易误报的 authoring 约束由 skill guidance 提前约束，确定性语法错误继续交给 Vue compiler 诊断。

## Decisions

1. **把“项目 helper 是否存在”定义在 contract/validator，而不是 runtime fallback。**
   - 决策：当前 contract 不提供隐式 helper surface；validator 发现 `getDateDay(...)`、`formatDate(...)`、`buildUrl(...)` 等未声明裸函数调用时返回 `UNKNOWN_SLOT_HELPER` 阻断性诊断。
   - 理由：runtime fallback 会掩盖 Agent authoring 错误，并把页面行为绑定到不可见 helper；contract fail-fast 更符合当前 CMS authoring 的“字段白名单 + 受控 slot scope”。
   - 替代方案：注入一组常用 helper。拒绝该方案，因为 helper 名称、语言环境、时区和格式化语义都难以稳定，且会鼓励模型继续发明函数。

2. **表达式扫描从 Vue 模板 AST 抽取表达式，再做受控 token/call 检查。**
   - 决策：复用 `@vue/compiler-dom` 解析出的 interpolation/directive expression 内容，仅在 Vue 表达式内扫描函数调用；忽略普通文本、HTML 属性文本和代码块字符串。
   - 判定规则：标识符后紧跟 `(` 且不是成员调用的一部分时，视为裸函数调用；若该标识符不是 contract 声明 helper，也不是安全原生全局（例如 `Date`、`Math`、`JSON`），则按未声明项目 helper 阻断。成员方法调用如 `item.addedAt?.slice(0, 10)` 不按裸 helper 处理，但其根字段仍要通过既有字段白名单检查。
   - 理由：直接正则扫整段 HTML 容易误伤 CSS/URL/文本；完整 JS parser 成本更高。基于 Vue AST 抽表达式后做小范围检查，能覆盖当前问题并控制误报。
   - 替代方案：只依赖 Vue compile。拒绝该方案，因为 compile 不会发现运行期未定义标识符。

3. **系统层收缩表达式校验，避免复杂 tokenizer 造成不稳定误拒。**
   - 决策：`new Date(item.addedAt).getDate()`、`Math.max(...)`、`JSON.stringify(...)` 等 Vue 模板可执行的安全原生表达式允许通过；validator 只把这些安全原生全局排除在 `UNKNOWN_SLOT_HELPER` 之外，不再尝试识别 `FORBIDDEN_SLOT_GLOBAL` 或 `INVALID_SLOT_EXPRESSION`。`window`、`document`、`globalThis`、`eval`、`Function`、`fetch`、storage、timer、网络/DOM 入口等宿主能力由 `cms-binding-apply` skill 明确禁止 Agent 生成。
   - 理由：CMS slot 是 Vue 模板表达式 authoring surface，但系统层用轻量 tokenizer 静态判定所有 Vue/JavaScript 能力边界会变得复杂且不稳定。当前真实故障来自未声明裸 helper，适合用窄规则 fail-fast；宿主能力和不可用对象/方法更适合作为 authoring guidance，由 Vue compiler/运行时和后续专项变更处理确定性问题。

4. **正式 apply 使用同一 validation 结果作为写入门禁。**
   - 决策：`apply_cms_binding` 构造候选 CMS 标签后，先运行标准 validation；任何阻断性 error 都转换为工具失败，不执行落盘、manifest 刷新或成功返回。
   - 失败恢复：模板/preflight 失败时保留未消费的 `decisionId`，允许 Agent 在 authoring revision 未变化时修正模板后重试。
   - 理由：把问题挡在 mutation pipeline 前，可以避免“预览坏了但工具显示成功”的不一致。

5. **错误信息短而可操作，不携带大段模板源码。**
   - 决策：工具错误只返回错误类别、字段名、最多少量标识符/结构名和下一步动作。例如：`templateBody 使用了未声明 helper getDateDay；请删除该函数调用，改用 item.addedAt 或 item.addedAt?.slice(...) 后重试。`
   - 理由：CMS MCP 工具错误会进入 Agent 上下文；大段 HTML 会挤占上下文并降低修复质量。

6. **列表壳层边界按 apply plan 和实际 DOM 双重处理。**
   - 决策：当 apply plan 表示保留外层壳层且目标壳层根为 `ul` 或 `ol` 时，`templateBody` 的单一根节点不得再是同类 `ul` / `ol`；应改为生成 `li` 条目或要求重新生成 source-atomic/完整动态区域策略。若目标为 `cms-island` source-atomic 或 whole-component replacement，则仍允许 slot 内包含完整 `ul` / `ol`。同时，真实选中 DOM 本身是 `ul` / `ol` 时，即使旧 decision 未带 guardrails，apply 写入前也按 preserved-shell 兜底校验。
   - 理由：当前 guidance 推荐完整动态区域，但 preserved-shell 场景的事实外壳已经承担列表语义，重复列表根会造成 `ul > ul` / `ol > ol` 或选择边界错位。

7. **skill reference 路径明确以 skill root 为基准。**
   - 决策：默认 skill 文案和测试要明确 references 位于 `skills/cms-binding-apply/references/` 或当前 skill 文件同级 `references/`，不能从 Agent scratch cwd 直接解析为 `<session>/references/*`。
   - 理由：这不是渲染根因，但会导致 Agent 错过 canonical guidance，从而更容易发明字段或 helper。

## Risks / Trade-offs

- **Risk: 表达式扫描误报合法 JavaScript helper/global。** → Mitigation: 收缩系统规则，只阻断未声明项目裸函数；安全原生全局只用于避免误报 `UNKNOWN_SLOT_HELPER`；成员方法与字段访问继续走既有规则；如未来确需项目 helper，通过 contract 显式声明 allowlist 后再放行。
- **Risk: skill guidance 不能像 validator 一样强制阻断宿主能力。** → Mitigation: 默认 skill 和 reference 明确禁止 `window`、`document`、`fetch`、`eval` 等宿主能力和 Vue 模板不可执行代码；系统仍保留 Vue compiler 语法诊断、HTML 安全边界、未知字段/slot 变量、嵌套 CMS island 和列表壳层等确定性门禁。若后续出现稳定可复现的宿主能力问题，再单独设计低误报 validator。
- **Risk: 列表壳层规则与“templateBody 承载完整动态区域”的既有 guidance 产生表面冲突。** → Mitigation: 规则只在 preserved-shell 且外层壳层已是 `ul` / `ol` 时触发；source-atomic/whole-component replacement 不受该限制。
- **Risk: 更严格校验会让部分现有坏模板无法再次 apply。** → Mitigation: 这是预期 fail-fast；运行时读取旧页面可继续兼容，但新建/重绑/正式改写必须通过新校验。

## Migration Plan

- 新增 validator 与 apply tool 回归测试，先覆盖未声明项目 helper、允许成员方法/安全原生全局、紧凑错误、不落盘、列表壳层边界，并保持 Vue compiler 已有语法错误链路。
- 更新实现后运行 targeted tests：`packages/page-builder-cms-rendering` validation 测试、`apps/app` CMS apply tool 测试、`cms-binding-apply` skill 文档测试。
- 发布无需数据迁移；如发现误报，可通过 contract allowlist 或 scanner 规则补丁回滚单项行为，不需要回滚 CMS 存量页面。

## Open Questions

无当前阻断问题。后续如果需要内置日期格式化能力，应另起变更定义正式 helper 名称、参数、国际化/时区语义和 preview/export 一致性，而不是在本变更中隐式加入。
