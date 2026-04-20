## Context

`page-builder` 当前的真实运行模型已经是 `HTML-first + host-managed CMS islands`：作者态页面写入 `workspace-files/index.html`，页面中的 `cms-catalog` / `cms-content` 作为 CMS source tags 保留在作者源码中；预览链路按需注入本地托管的 Vue full build 和 CMS bootstrap，并为每个顶层 CMS island 独立挂载 Vue app，而不是把整页变成单一 Vue root。

问题在于这套运行模型主要存在于 preview / rendering spec 与实现里，尚未被 prompt surfaces 直接讲成 Agent 可执行的规则。当前根模板和两个相关 skill 虽然已经约束了 CMS flow、source-atomic 边界和 canonical contract，但还没有足够直白地说明：

- `cms-*` 是宿主管理的 source tags，不是 author 自己搭整页 Vue app 的入口
- Vue template 语法只属于 `cms-*` 的 slot authoring
- Vue runtime、bootstrap 和 island mount 由宿主管理，而不是作者态 HTML 自己引入

实现层也存在第二个不对称点：`validateCmsRendering()` 已经会把 `cms-*` 外的 `v-*` / `@*` / `{{ }}` 视为 `OUTSIDE_CMS_VUE_SYNTAX`，但当前主 spec 还没有把这类边界明文化，也没有覆盖作者自行引入 Vue runtime、importmap、CDN 或 page-wide `createApp` / `mount` 的坏模式。

## Goals / Non-Goals

**Goals:**

- 把 page-builder 的作者态模型明确成 `HTML-first + host-managed CMS islands`
- 在根模板、普通页面 flow 和专用 CMS apply flow 中都写出一致的禁止项：不要自行引入 Vue runtime、不要整页 `createApp` / `mount`、不要把 `cms-*` 之外的页面写成 Vue authoring
- 为 page-builder 作者态补上 fail-closed guardrail，使作者自管 Vue runtime、整页 Vue 化、以及 `cms-*` 外的 Vue authoring 成为阻断性错误
- 复用现有 CMS validation、workspace HTML mutation 和 turn-end guardrail 流程，避免重复实现第二套扫描器

**Non-Goals:**

- 不改变当前 CMS preview / static export 的宿主管理架构
- 不把 page-builder 扩展成通用 Vue SPA authoring 环境
- 不允许作者在普通页面区域自由使用 Vue 指令、整页 mount 或作者自管 Vue 资源
- 不重构 CMS canonical contract、Phase 1A mapping 逻辑或现有 CMS selection protocol

## Decisions

### Decision: 把 `HTML-first + host-managed CMS islands` 作为共享心智模型，分别下沉到 root template 和两个 skill

根级 `CLAUDE.md` 负责给出全局不变量：

- page-builder 作者态是 HTML-first
- `cms-catalog` / `cms-content` 是宿主管理的 CMS source tags
- Vue runtime 与 bootstrap 由宿主注入
- 不要自行引入 Vue、不要整页 mount、不要把 `cms-*` 外的页面写成 Vue authoring

`page-builder-guided-generation` 和 `cms-binding-apply` 再分别承担各自场景下的执行边界：

- 普通 flow：即使页面里已有 CMS 区域，非 CMS 区域仍然保持普通 HTML/CSS/JS
- CMS apply flow：只 author 目标 `cms-*` source tag 与 slot templates，不 author runtime、importmap、bootstrap 或 page-wide mount

这样可以把“全局规则”和“场景执行规则”分层表达，而不是把整套运行时细节塞回根模板。

**Alternatives considered**

- 只在 `cms-binding-apply` 中补说明：不足，因为普通 flow 也会触达已有 CMS 区域，Agent 仍可能在普通页面迭代时把页面升级成整页 Vue authoring。
- 把全部说明都塞进根模板：会重新制造提示词重复，并把 skill 内部边界带回 root `CLAUDE.md`。

### Decision: 用一个新的 capability 明确定义 page-builder 的 Vue authoring boundary，而不是把这件事完全隐藏在实现细节里

新增 `page-builder-vue-authoring-boundaries` capability，专门表达以下系统行为：

- page-builder 作者态中，Vue template authoring 只允许存在于 `cms-*` slot templates
- 普通页面区域的 `v-*`、`@*`、`{{ }}` 不是合法的 page-builder 作者态
- 作者态 HTML 不允许自行引入 Vue runtime、Vue importmap、Vue CDN、inline Vue bootstrap 或 page-wide `createApp` / `mount`
- 这类边界违规在 page-builder 的写入与 guardrail 链路中必须 fail closed

这让当前已经存在但尚未被 spec 覆盖的 validator/guardrail 行为，得到清晰的契约归属。

**Alternatives considered**

- 只修改 `page-builder-cms-targeted-edit-guardrails`：范围过窄，该 spec 主要讨论已选 CMS island 的 source-first 编辑，不适合承接整个 page-builder 作者态的全局 Vue 边界。
- 只修改 `page-builder-cms-rendering-core`：它更偏向 CMS island 内部 contract 与 validator，本次问题同时涉及 prompt surfaces、普通 flow 和作者态全局约束。

### Decision: 复用现有 `validateCmsRendering()` 与 page-builder HTML guardrail service 作为唯一 enforcement 入口

当前链路已经具备较合适的 enforcement 位置：

- `validateCmsRendering()` 已经扫描并拒绝 `cms-*` 外的 Vue template syntax
- `pageBuilderWorkspaceHtmlService` 会把 CMS validation error 视为阻断性错误并回滚 mutation
- `finalizePageBuilderAgentHtmlGuardrails()` 会在 Agent 直接改写作者 HTML 后重跑校验，并在无效时保留失败状态与安全预览协同

本 change 继续沿用这套路径，只扩充 boundary diagnostics，不新建第二套独立扫描器。新增检测重点是作者自管 Vue runtime / bootstrap / page-wide mount 这些当前缺失的坏模式。

**Alternatives considered**

- 新建独立 “page-builder Vue validator”：会复制 DOM 解析和 mutation rollback 逻辑，增加诊断源分裂。
- 只做 prompt 约束不做运行时校验：不能 fail closed，仍会依赖模型自觉。

### Decision: 运行时检测聚焦“真实执行模式”，避免把普通文本提及误判成阻断错误

新增 guardrail 检测应优先落在真正会影响执行的作者态结构上，例如：

- 实际 `<script src="...vue...">`
- 实际 importmap / module import 指向 `vue`
- 实际 inline script 中的 Vue bootstrap / `createApp` / `mount`

而不是把普通文案里提到 “Vue” 一词都当成错误。这样可以把阻断错误聚焦到真实执行路径，降低误判。

对于 `cms-*` 外部的 `v-*` / `@*` / `{{ }}`，沿用现有的 HTML authoring boundary：这些本来就是作者态 DOM 级的 Vue template 语法，应继续作为阻断性错误。

## Risks / Trade-offs

- [Prompt surfaces 仍可能漂移] → 通过 root template + skill doc tests 同时覆盖 “no self-managed Vue runtime / no page-wide mount / Vue only inside `cms-*` slots” 这组关键词，减少文案漂移。
- [新增 runtime pattern 检测可能误伤普通脚本] → 只拦截 Vue-specific runtime/bootstrap 模式，不把所有 `<script>` 一刀切当成非法。
- [新 capability 与现有 CMS rendering specs 看起来有交叉] → 新 capability 只负责“page-builder 作者态 Vue 边界”，而不是重复 CMS island contract、preview asset delivery 或 SSR/export 细节。
- [Agent 仍可能在 CMS slot 内写出合法但不理想的 Vue 模板] → 这仍由 canonical contract、`cms-binding-apply` checklist 和现有 validator 继续约束；本 change 不扩大到新的 slot API 设计。

## Migration Plan

1. 更新 prompt surfaces，使新工作区和默认 skill 都明确使用统一的作者态模型。
2. 为 page-builder 作者态新增/补齐 Vue boundary spec 和 diagnostics。
3. 将新 diagnostics 接入现有 workspace mutation 与 direct-agent-edit guardrail 链路。
4. 补齐相关 prompt/validator/guardrail 测试。

回滚策略保持简单：若该 change 需要回退，可同时撤回新增 prompt 约束和新增 diagnostics，现有 CMS preview / apply architecture 不需要数据迁移。

## Open Questions

- 无阻断性开放问题。该 change 采用“page-builder 全局禁止作者自管 Vue runtime，并把 Vue template authoring 限定在 `cms-*` slot 内”的方向推进。
