## 1. 回归测试先行

- [x] 1.1 在 `packages/page-builder-cms-rendering/src/validation/cms-rendering-validator.test.ts` 增加 `{{ getDateDay(item.addedAt) }}`、`formatDate(...)` 等未声明 helper 被阻断的失败用例。
- [x] 1.2 增加 Vue 指令表达式中未声明 helper 被阻断的用例，例如 `:href="buildUrl(item.publishUrl)"` 或 `v-if="shouldShow(item)"`。
- [x] 1.3 增加合法表达式不误报的用例，覆盖 `item.addedAt`、`item.addedAt?.slice(0, 10)`、`items.slice(0, 3)`、`new Date(...)`、`Math.max(...)`、`JSON.stringify(...)` 与既有字段白名单校验并存。
- [x] 1.3.1 增加安全原生全局不误报和 Vue compiler 语法错误链路的用例，确认系统不实现复杂宿主全局/表达式 tokenizer。
- [x] 1.4 在 `apps/app/src/main/lib/page-builder-cms-rendering-tools.test.ts` 增加 `apply_cms_binding` 因未声明 helper 失败、不写入页面、错误信息紧凑且 decision 可重试的用例。
- [x] 1.5 增加 preserved-shell `ul` / `ol` 目标拒绝重复列表根、source-atomic 或 whole-component replacement 允许完整列表根的 apply 用例。
- [x] 1.6 在 `apps/app/src/main/lib/cms-binding-apply-skill.test.ts` 增加默认 skill/reference 文案用例，覆盖禁止未声明 helper、日期替代写法和 reference 路径以 skill root 解析。

## 2. CMS Rendering Core 实现

- [x] 2.1 在 canonical CMS authoring contract 或其派生 digest 中补充 slot expression/helper 边界，明确当前无隐式项目 helper allowlist，但允许 Vue 模板可执行的安全原生表达式。
- [x] 2.2 在 CMS validator 中基于 Vue 模板 AST 抽取 interpolation 与 directive expression，避免直接扫描整段 HTML。
- [x] 2.3 实现未声明裸项目 helper/function call 检测，返回稳定阻断性诊断码，例如 `UNKNOWN_SLOT_HELPER`，并保留 helper 名称与短上下文。
- [x] 2.4 确保成员访问和成员方法调用不被误判为裸 helper，同时继续复用既有未知字段、未知 slot 变量和 Vue 语法校验。
- [x] 2.4.1 收缩系统表达式校验范围：不实现 `FORBIDDEN_SLOT_GLOBAL` / `INVALID_SLOT_EXPRESSION` 复杂 tokenizer，将宿主能力和不可用对象/方法约束放到 skill guidance。
- [x] 2.5 增加可被 apply 链路复用的列表壳层边界校验能力，支持 preserved-shell `ul` / `ol` 冲突判断与 source-atomic 放行。
- [x] 2.6 修正 block target shell fact 推导，使 `ul` / `ol` block 目标默认进入 preserved-shell guardrails。

## 3. Apply Tool 写入门禁

- [x] 3.1 在 `mcp__cms__apply_cms_binding` 构造候选 CMS 标签后、写入 HTML 前运行完整 CMS validation，并对任一阻断性错误 fail closed。
- [x] 3.2 将 `UNKNOWN_SLOT_HELPER`、`DUPLICATE_LIST_SHELL` 以及既有确定性 Vue/contract 校验错误映射为单条紧凑工具错误，包含字段名、标识符/结构名和可执行重试动作指引。
- [x] 3.3 确保模板/preflight 失败不修改 `workspace-files/index.html`、不返回 `applied: true`，且在 authoring revision 与目标 identity 未变化时不消费 decision。
- [x] 3.4 将 preserved-shell `ul` / `ol` 重复列表根校验接入 apply plan structure guardrails，并保持 source-atomic / whole-component replacement 的完整动态区域能力。
- [x] 3.4.1 增加实际 DOM 写入前兜底：当目标 block 本身是 `ul` / `ol` 时，即使缺少显式 guardrails 也拒绝同类重复列表根。
- [x] 3.5 保持现有 `templateBody` / `emptyTemplate` / `errorTemplate` 单层 `<template v-slot:...>` 或 `<template #...>` 包装自动解包兼容，不因新增校验回退为硬拒绝。

## 4. Skill 与 Guidance 更新

- [x] 4.1 更新 `apps/app/default-skills/cms-binding-apply/SKILL.md`，在 ready checklist 和输入前置说明中明确禁止未声明项目 helper、宿主危险全局、不可用对象/方法和 Vue 模板不可执行表达式。
- [x] 4.2 更新 `cms-content-authoring.md`，将日期展示示例改为 `item.addedAt` 或带守卫的字符串/成员表达式，不使用 `getDateDay`、`getDateMonthYear` 或 `formatDate`。
- [x] 4.3 更新 `shared-authoring-rules.md`，补充“slot 表达式不包含隐式项目 helper、宿主危险全局、不可用对象/方法或不可执行语句式代码”的共享规则，并说明工具错误出现时应修正模板后重试。
- [x] 4.4 更新 reference 路径说明，明确 shell 读取时应相对当前 skill 文件或 workspace-local `skills/cms-binding-apply/` 目录解析，而不是相对 scratch cwd 的裸 `references/`。

## 5. 验证与收尾

- [x] 5.1 运行 `bun test packages/page-builder-cms-rendering/src/validation/cms-rendering-validator.test.ts` 并确认新增 validator 用例通过。
- [x] 5.2 运行 `bun test apps/app/src/main/lib/page-builder-cms-rendering-tools.test.ts apps/app/src/main/lib/cms-binding-apply-skill.test.ts` 并确认 apply tool 与 skill 文档用例通过。
- [x] 5.3 运行 `bun run typecheck` 或受影响 workspace 的等价类型检查，确认新增诊断类型、contract digest 与调用点类型一致。
- [x] 5.4 手动复核 MCP 工具错误文案，确认不会输出完整模板、大段 HTML 或完整页面源码。
