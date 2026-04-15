## Context

当前 page-builder 已经具备 `cms-catalog` / `cms-content` 的预览渲染、CMS island 选择、`apply_cms_binding` 正式写入、manifest 派生与结构化校验能力，但这些能力主要解决的是“能不能渲染、能不能选中、能不能写回”。作者态源码该如何组织，尤其是动态区域的主要 HTML 壳子应放在 CMS 组件内还是外，仍缺少统一约束。

现状里，`apply_cms_binding` 已经固定生成：

- 外层 `cms-catalog` / `cms-content`
- `v-slot:default`
- 可选 `v-slot:empty`
- 可选 `v-slot:error`

但 `templateBody`、`emptyTemplate` 与 `errorTemplate` 的内容如何组织，仍然主要依赖 skill 与调用方自行约定。这会让系统继续生成两类源码：

1. 推荐结构：`cms-*` 作为动态区域顶层，`ul` / `section` / `article` / grid 容器都写在 slot 中。
2. 反模式结构：把 `ul`、`section`、列表容器等主要动态壳子留在 `cms-*` 外部，只在 slot 中写 `li`、`article` 等零散子节点。

第二类结构虽然能运行，但会让三条边界继续错位：

- 作者态源码中的原子 CMS 边界
- 预览里用户看到并尝试选择的一整块内容边界
- agent 后续应整体替换的更新边界

本 change 面向的主要 stakeholder 是：

- 普通 page-builder 生成链路中的主控 skill
- CMS 选择后的 `cms-binding-apply` skill
- `mcp__cms__apply_cms_binding` 的正式写入入口
- page-builder 作者态 validator 与 diagnostics 消费者

## Goals / Non-Goals

**Goals:**

- 定义统一的 CMS 作者态结构指导：`cms-catalog` / `cms-content` 应尽量成为动态区域的顶层节点，相关 HTML 壳子应尽量组织到 slot 中。
- 让 `page-builder-guided-generation` 与 `cms-binding-apply` 在示例、提示词与产出约束上都默认遵循该结构。
- 让 `apply_cms_binding` 的调用契约与示例明确把 `templateBody` / `emptyTemplate` / `errorTemplate` 视为“完整动态区域结构”的承载位置，而不是仅承载零散条目。
- 为明显的“容器在外、条目在内”反模式增加 warning 级 diagnostics，帮助后续修正，但不阻断现有页面运行。

**Non-Goals:**

- 不把该规则升级为 error，也不阻断保存、预览、导出或 apply。
- 不自动重写已存在的旧页面结构。
- 不试图用 validator 精确理解任意复杂布局语义，只覆盖明显反模式。
- 不改变 CMS island 的 source-atomic 选择协议与正式写入边界。

## Decisions

### Decision: 把“slot 内组织完整动态区域”定义为作者态主约束

系统将明确推荐以下组织方式：

- `cms-catalog` / `cms-content` 尽量作为该动态区域源码上的顶层节点。
- `ul`、`ol`、`section`、`article`、`div.grid`、卡片列表容器，以及 empty / error 态结构，尽量写在 `default / empty / error` slot 中。
- 组件外只保留真正与这份 CMS 数据无直接关系的页面级外层布局壳子。

这样做的原因是，预览里用户实际看见并会整体操作的区域，可以更稳定地映射回一个源 CMS 组件，而不是映射回外层静态壳子与内层动态条目之间的混合结构。

备选方案：

- 继续允许自由组织，不做统一约束。
  问题是系统会持续生成边界错位的作者态结构，后续选择、删除、重绑与 agent 更新都更难稳定。
- 强制 `cms-*` 必须始终成为 block 的唯一顶层节点。
  这会误伤一部分合理的页面级外层布局场景，也超出当前所需。

### Decision: 主约束放在 skill 与 tool guidance，validator 只做软提示

这条规则本质上是“作者态组织约定”，而不是“运行时合法性条件”。因此分层如下：

- 第一层：`page-builder-guided-generation` 与 `cms-binding-apply` 的 skill 文案、示例与引用文档。
- 第二层：`apply_cms_binding` tool surface 的文案与示例，明确 `templateBody` 等字段应承载完整动态区域结构。
- 第三层：validator warning，提醒当前写法不推荐，但不阻断执行。

这样既能让新生成内容优先走推荐结构，也能保证旧页面与例外布局不被硬拦截。

备选方案：

- 直接在 validator 中报错。
  这会让结构偏好变成硬门槛，不符合“软约束”的目标。
- 只改 skill，不改 validator。
  这样旧页面与手写页面没有统一反馈入口，也缺少后续治理抓手。

### Decision: validator 只识别“明显反模式”，不做广义布局语义推断

作者 HTML validator 只能看到源码，不能真正理解“视觉上哪些元素与 CMS 数据直接相关”。因此 warning 检测应保守，优先覆盖明显反模式，例如：

- `ul > cms-catalog > template > li`
- `section.news-list > cms-content > template > article`

也就是：主要集合容器在组件外，而 slot 中只剩条目级节点。

推荐结构如：

- `cms-catalog > template > ul > li`
- `cms-content > template > section.news-list > article`

不应触发 warning。

对于更复杂、混合静态说明与动态列表的布局，本 change 不尝试做完整语义判断，避免高误报率。

### Decision: 不对旧页面做自动迁移，只在未来生成与后续修订中逐步收敛

当前仓库里已经存在若干合法但不推荐的结构。自动重写这些页面会引入不必要的 diff 和布局回归风险。本 change 只做：

- 新生成内容默认遵守推荐结构
- validator 给出 warning
- 让 agent 在后续编辑时知道更推荐的组织方式

这样可以把治理成本控制在最小范围内。

## Risks / Trade-offs

- [Risk] validator 的 warning 规则过宽，误伤带静态标题或说明文案的合理布局。 → Mitigation: 仅对“容器在外、slot 内只剩条目节点”的明显反模式给 warning，不做广义 DOM 语义推断。
- [Risk] 只改 prompt/skill 文案后，不同 agent 仍可能偶尔产出旧结构。 → Mitigation: 同时更新 skill 主文案、references、workspace 模板提示和 tool 文案，并补对应文档测试。
- [Risk] 用户可能把“最好作为顶层”误解为硬性禁止外层布局壳子。 → Mitigation: 在 skill 和 spec 中明确“这是软约束，页面级静态外壳仍可存在，但主要动态容器应尽量放进 slot”。
- [Risk] apply tool spec 如果只强调写入行为，不补作者态组织示例，调用方仍可能继续传入碎片化 `templateBody`。 → Mitigation: 在 apply 相关 contract 中新增“完整动态区域结构由 slot 模板承载”的 requirement 和示例。

## Migration Plan

1. 更新 `cms-binding-apply` skill 主文案与 references，加入推荐/反模式示例。
2. 更新 `page-builder-guided-generation` skill 与 workspace template 提示，要求 CMS 相关结构优先收敛到 slot 中。
3. 更新 `apply_cms_binding` tool 文案、辅助示例或测试契约，明确 `templateBody` 等字段应承载完整动态区域结构。
4. 在 `cms-rendering-validator` 中新增 warning 级诊断与测试，覆盖明显反模式和推荐结构。
5. 保持旧页面可运行；若 warning 误报，再通过收窄启发式规则回滚该诊断，不影响正式写入链路。

## Open Questions

- 当前没有阻塞性开放问题。
- 后续可以再评估是否需要为 page-builder UI 增加“结构建议”呈现，但这不属于本 change。
