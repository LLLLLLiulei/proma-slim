## Context

当前 `page-builder` 已经具备两块前置能力：

- 区块级 CMS 入口，用户可以先选中页面区块，再打开 CMS 选择器。
- CMS 选择器确认后会返回结构化选择结果，能够区分栏目选择与固定内容条目选择。

但“确认 CMS 选择后如何自动进入 Agent 对话、如何由模型安全决策应用方式、何时发起澄清、何时拒绝应用”仍缺少一层稳定 contract。若这层缺位，后续自动 handoff、区块快照工具和本地 HTML 落地都会退化为临时 prompt 拼接与宿主分散规则，导致行为不可预期。

现有运行时还存在一个关键约束：`AgentView.prepareAgentSendPayload()` 目前只会从原始 `userMessage` 中提取 `/skill:xxx`，不会从隐藏拼装后的 `composedUserMessage` 中提取。因此，确认 CMS 选择后的自动对话如果要稳定调用专用 skill，后续模块不能只依赖隐藏提示词，而必须补齐程序化强制 skill 注入链路。

结合已确认的产品方向，Phase 1A 的主路径是：

1. 用户选中目标区块。
2. 用户打开 CMS 选择器并确认栏目或固定条目。
3. 系统自动发起一轮 Agent 对话。
4. 该轮对话显式交由专用 CMS 应用 skill 决策。
5. skill 在必要时通过 `AskUserQuestion` 做短澄清。
6. skill 最终把应用决策收束为本地页面区块的安全修改。

本 change 只负责先把第 4-5 步的 skill contract 设计清楚，为后续 handoff、tooling 和应用闭环提供稳定边界。

## Goals / Non-Goals

**Goals:**

- 定义一个以 `cms-binding-apply` 为代表的专用 skill contract，作为 CMS 选择确认后自动应用流程的主决策入口。
- 明确该 skill 的输入 payload、输出结果、澄清触发规则和拒绝条件。
- 将 Phase 1A 的适用范围收敛为 `replace-current` 单一路径，并对支持的区块类型和修改边界建立明确护栏。
- 为后续模块提供可复用的契约，使自动 handoff、区块快照工具和 HTML apply 流程都围绕同一输入输出边界演进。

**Non-Goals:**

- 本 change 不实现自动对话 handoff，不负责程序化强制 skill 注入本身。
- 本 change 不实现区块快照工具，也不定义其具体宿主 API。
- 本 change 不直接改写本地 HTML/CSS/JS，也不定义具体 DOM 编辑算法。
- 本 change 不处理“绑定某栏目下最新 N 条”、持续绑定渲染器、运行时自动刷新等后续能力。
- 本 change 不扩展多种应用模式，Phase 1A 不支持 append、merge、mixed-strategy 等分支。

## Decisions

### 1. 采用 skill-first，而不是 host-first resolver

CMS 确认后的主决策层定义为专用 skill，而不是先做一个宿主侧规则解析器，再让模型补充边缘情况。原因是本流程天然包含语义判断：

- 目标区块到底更像导航入口区、内容列表区，还是当前阶段不支持的其他类型。
- 所选栏目或条目集合是否能直接映射到该区块。
- 哪些情况下应自动应用，哪些情况下必须先澄清。

如果把这些判断大量前置到宿主代码里，会导致规则快速膨胀，且难以复用到后续持续绑定与模板渲染方案。skill-first 的做法更适合把“选择结果理解 + 区块语义判断 + 澄清 + 应用决策”收口到同一 contract 中。

备选方案是先做宿主 resolver，再把结果喂给模型。该方案的优点是看似可控，但缺点是会把真正复杂的部分拆碎，最终仍需要模型二次解释，而且宿主和 prompt 会形成双重真相源，因此不采用。

### 2. 本模块只定义 contract，不混入 handoff / tooling / apply 实现

本 change 的边界只到“skill 应该消费什么、产出什么、何时提问、何时拒绝”。后续能力拆分为独立模块：

- 自动对话 handoff 与强制 skill 注入
- 目标区块快照 tooling
- 本地 HTML apply 闭环

这样拆分的原因是当前最大的风险不是“工具做不出来”，而是“没有统一 contract，后续每层都按自己的假设设计”。先把 contract 固定住，后面模块才能围绕它实现而不发散。

备选方案是把 handoff、快照、apply 一次性设计到底。该方案会把一个 change 变成跨多个运行时面的复合改造，评审和回滚成本都更高，因此不采用。

### 3. skill 输入以结构化 `selection + targetBlock + executionContext` 为主

Phase 1A 的 skill 输入应采用结构化 payload，而不是自然语言自由描述。建议输入至少包含以下维度：

- `selection`
  - 直接复用 `PageBuilderCmsSelectionResult`
  - 支持 `catalogs` 与 `contents-fixed`
- `targetBlock`
  - 最低要求包含 `selector`
  - 允许后续模块补充 `blockLabel`、`blockTypeHint`、`snapshotAvailable` 等可选字段
- `entryPoint`
  - 固定标识为 `cms-browser-confirm`
- `applyIntent`
  - Phase 1A 固定为 `replace-current`
- `workspacePolicy`
  - 明确“只允许局部区块修改、禁止整页自由重写、以本地工作区为落点”
- `uiContext`
  - 可选，用于携带用户在确认前的显式说明或宿主补充上下文

这样设计的理由是：CMS 选择结果本身已经是结构化数据，继续把它转回自然语言只会丢失约束；同时 skill 又需要知道当前运行环境的护栏，避免它把页面看成一个无边界的编辑目标。

备选方案是只传选择结果与一段 prompt。该方案不利于后续对 skill 行为做验证，也不利于兼容宿主自动 handoff，因此不采用。

### 4. skill 输出采用判别式结果：`ready` / `needs-clarification` / `incompatible`

Phase 1A 的 skill 输出应统一为三类结果：

- `ready`
  - skill 已经具备足够信息，可以进入后续快照读取、应用规划与本地修改流程
  - 输出中应包含归一化后的应用意图，例如目标区块语义、内容映射方向、渲染模式建议
- `needs-clarification`
  - skill 识别到存在单个或少量关键歧义，需要宿主通过 `AskUserQuestion` 补齐
  - 输出中应包含结构化澄清问题，而不是只返回自由文本
- `incompatible`
  - 当前选择结果与目标区块明显不兼容，或者超出 Phase 1A 支持范围
  - 输出中应包含拒绝原因和可向用户展示的解释

这里不把“直接产出最终 HTML patch”纳入本模块输出，是因为后续 apply 模块仍需要快照、DOM/HTML 改写与预览反馈能力。当前模块只负责让“是否可进入 apply、还缺什么、为什么不支持”变得结构化可判定。

备选方案是二元输出（可用 / 不可用）。该方案无法表达“可以做，但先问一个问题”的场景，因此不采用。

### 5. `AskUserQuestion` 只承载短澄清，不承载主选择流程

CMS 主选择已经由浏览器弹框承担，skill 不应再用 `AskUserQuestion` 重新让用户选栏目或选内容。`AskUserQuestion` 在本流程中的职责仅限于：

- 澄清目标区块意图
- 澄清单个关键映射策略
- 澄清存在多个同等合理应用方式时的用户偏好

典型触发场景包括：

- 选中的是多个独立栏目，但目标区块更像单列导航，skill 需要确认是否只保留一级入口。
- 选中的是固定内容条目，但目标区块更像摘要列表，skill 需要确认是否接受统一卡片样式。
- 区块类型提示与选择结果存在冲突，skill 需要确认是否仍按当前区块替换。

不允许的使用方式包括：

- 重新让用户逐项浏览 CMS 数据
- 用冗长开放式提问替代结构化澄清
- 在已有足够信息时仍频繁提问

备选方案是完全不允许澄清，直接自动应用或失败。该方案虽然更简单，但会把大量低置信度情况都降级为失败，不符合用户希望“通过对话与澄清完成应用”的方向，因此不采用。

### 6. Phase 1A 仅支持 `replace-current`，并限定 block-scoped 修改

Phase 1A 的默认且唯一应用模式为 `replace-current`。该模式的含义是：

- 只替换当前选中区块内部与 CMS 内容渲染直接相关的结构
- 不跨区块级联修改
- 不做整页重排
- 不新增全局依赖，不引入全局状态同步机制

同时，skill contract 应明确只允许 block-scoped 修改。即使后续 apply 模块由 Agent 或宿主共同完成实际改写，也必须以 `targetBlock.selector` 为边界，不允许把这次任务扩展为无边界的整页重写。

备选方案是同时开放 append / merge。该方案会立即引入更复杂的布局与去重决策，超出 Phase 1A 的可控范围，因此不采用。

### 7. Phase 1A 仅支持 `nav` 与 `content-list` 两类区块语义

为了控制复杂度，Phase 1A 只允许 skill 对以下两类区块形成 `ready` 决策：

- `nav`
  - 更偏栏目入口、分类跳转、树状或平铺导航
- `content-list`
  - 更偏文章/图文/音视频/文件条目的列表型展示

其余区块语义，如轮播、复杂混排、多区域专题、表单、纯装饰区块等，在本阶段都应返回 `incompatible`，或在极少数可澄清后仍无稳定落地路径时返回 `needs-clarification` 并最终收敛为拒绝。

这样设计的原因是：固定条目 + 栏目入口这两类映射关系最清晰，且与“替换当前区块”路径天然兼容。过早开放更多区块类型，会把本模块变成泛化页面生成器前置层，失去边界。

### 8. 兼容性判断优先保护安全与可解释性

skill 在以下场景下应优先返回 `incompatible`，而不是勉强自动应用：

- 目标区块明显不是 `nav` 或 `content-list`
- 选择结果与目标区块语义强冲突，且无法通过一次简短澄清解决
- 需要全页级结构重排才能容纳结果
- 需要宿主当前尚不具备的运行时能力

在以下场景下更适合返回 `needs-clarification`：

- 存在 1 个关键歧义，补齐后即可进入应用
- 多种应用方式都合理，但用户偏好会显著影响结果
- 目标区块语义置信度不足，但仍在支持边界附近

该决策优先级的目的是保证整个链路“可失败、可解释、可逐步扩展”，而不是为了追求过度自动化。

### 9. skill 实体创建可借助 `skill-creator`，但不构成运行时依赖

本 change 关注的是 `cms-binding-apply` 的 contract 设计，但在后续真正落地 skill 实体时，可以显式借助 `skill-creator` 来完成初始脚手架创建与结构整理，包括：

- 生成标准的 `SKILL.md` 基础结构
- 规划是否需要 `references/`、`scripts/`、`agents/openai.yaml`
- 校准 skill 的触发描述、职责边界与渐进式加载结构

之所以把这点单独说明，是为了避免后续实现时把“skill contract 设计”与“skill 文件如何创建”混为一谈。`skill-creator` 只是交付加速器和规范化工具，不属于 `cms-binding-apply` 在运行时的输入输出 contract，也不会替代宿主侧 handoff、强制 skill 注入或 block snapshot tooling。

备选方案是手工直接编写 skill 文件。该方案并非不可行，但更容易在命名、目录结构和说明粒度上出现漂移，因此更建议在真正创建 skill 时复用 `skill-creator`。

## Risks / Trade-offs

- [skill contract 过严，短期内会增加 `incompatible` 比例] → 通过 `needs-clarification` 保留可恢复路径，并在后续模块中逐步扩展区块支持面。
- [输入 payload 只含 `selector`，区块语义信息不足] → 允许后续 handoff 或 snapshot tooling 回填 `blockTypeHint`、区块快照与辅助上下文，但 contract 先固定基础字段。
- [自动 handoff 若不能稳定强制注入 skill，设计会停留在纸面] → 在后续 Module 4 中显式补齐程序化 skill 注入，不依赖隐藏 prompt 自然命中。
- [模型决策可解释性不足，可能导致宿主难以判定下一步动作] → 输出结果必须结构化，尤其对 `needs-clarification` 与 `incompatible` 提供可机器读取的原因与问题对象。
- [后续持续绑定方案可能需要新的 render mode] → 在本阶段将 render mode 显式冻结为 `replace-current`，未来通过向后兼容的新字段扩展，而不是提前做宽泛抽象。

## Migration Plan

1. 基于本设计补齐 `page-builder-cms-apply-skill` 的 spec，冻结输入输出 contract、支持范围和澄清规则。
2. 在真正创建 `cms-binding-apply` skill 实体时，可使用 `skill-creator` 生成并整理 skill 脚手架，再将本设计中的 contract 映射到 skill 内容中。
3. 在后续 change 中实现确认选择后的自动对话 handoff，并增加程序化强制 skill 注入能力。
4. 增加区块快照 tooling，使 skill 可以在 `ready` 路径下读取目标区块上下文。
5. 实现本地 HTML/CSS/JS apply 闭环，让 `ready` 决策最终落地到本地页面并刷新预览。
6. 在 Phase 1A 路径稳定后，再评估是否扩展更多区块语义、应用模式和持续绑定能力。

回滚策略：

- 如果后续模块联调失败，可以保留当前 CMS 浏览器与结构化选择结果，不启用自动 handoff。
- skill contract 本身以文档和 spec 形式存在，不会直接破坏现有运行路径，因此回滚成本主要集中在后续实现模块。

## Open Questions

- 后续自动 handoff 是否需要在宿主层新增显式 `forcedSkills` 字段，还是复用现有 `mentionedSkills` 通道并由程序写入。
- `targetBlock` 是否应在进入 skill 前就补充稳定的区块元数据，例如区块名称、局部 HTML 摘要或 block type hint。
- `ready` 结果中应输出到什么粒度的应用计划，才能既支撑后续 apply 模块，又避免在本模块中提前绑定具体 DOM 改写实现。
