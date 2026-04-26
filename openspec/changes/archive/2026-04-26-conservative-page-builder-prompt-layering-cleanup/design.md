## Context

当前 `page-builder` 的模型可见提示面由多层叠加构成：运行时 `system prompt`、dynamic context、宿主注入的当前 turn payload、根级 `CLAUDE.md`、bootstrapped skill，以及后续显式 skill 调用。这个架构的原始目的不是“最短 prompt”，而是确保宿主可以稳定锁定 scene / owner / CMS handoff 边界，即使模型没有显式调用 skill，也仍然遵守当前 turn 的控制协议。

问题在于，当前多层提示面已经出现两类退化：

- 同一规则跨层重复，且不总是落在最合适的层级，例如系统身份约束在 system prompt 内部自重复，subagent/worktree 规则同时存在于 system prompt 与 dynamic context。
- `taste-skill` / `redesign-skill` 仍保留偏 React / Next.js / Tailwind 工程的默认假设，而 page-builder 实际默认产物是 `workspace-files/index.html` 的 HTML/CSS/JS 预览页。这会让 visual worker 在普通页面流中偏离当前工作区现实。

这次 change 的约束是“保守优化”：

- 不改变宿主决定 `scene / owner / ownerLockedForTurn` 的机制
- 不用 `CLAUDE.md` 取代 bootstrapped owner skill
- 不引入新的 bootstrap 摘要抽取机制
- 不改 confirmed CMS apply 的 decision / MCP tool 受控链路

## Goals / Non-Goals

**Goals:**

- 收敛 page-builder 提示词分层，使 system prompt、dynamic context、`CLAUDE.md`、owner skill、worker skill 各自只承担最适合自己的信息。
- 在不改变宿主 handoff / owner 锁定机制的前提下，减少明显重复和错层。
- 让 `taste-skill` / `redesign-skill` 在 page-builder 中拥有稳定的 page-builder override，默认遵守 HTML-first、`workspace-files` 输出和 CMS 高层边界。
- 保持 ordinary flow、confirmed CMS apply、existing CMS region consult guidance 这三条链路的职责边界不变。

**Non-Goals:**

- 不重写 page-builder 的 owner routing 机制。
- 不把 bootstrapped skill 全量替换为 `CLAUDE.md` 或 workspace skill 目录发现机制。
- 不在本次 change 中引入新的 bootstrap digest 文件、skill 嵌套调用协议或新的宿主场景分类器。
- 不修改 CMS MCP 工具的 decision-gated apply 契约。

## Decisions

### Decision 1: 保留现有宿主 owner / handoff / bootstrap 机制，仅做文案层纠偏

**Decision**

本次 change 保留 `<page_builder_turn_routing>`、owner lock、bootstrapped skill 和 confirmed CMS auto handoff 机制不变，只收敛这些机制周围的文案层。

**Why**

- 当前系统已经通过宿主元数据而不是关键词匹配来判定 `scene / owner`，这是稳定性的基础。
- `bootstrapped_skills` 当前承担的是“本轮已生效协议”，而不是普通 discoverability 目录；直接移除或让 `CLAUDE.md` 取代它，会把当前 turn owner 协议重新退回给模型自行理解。
- 本次 change 的主要问题是规则错层与 worker 默认假设错误，不是宿主控制链路本身失效。

**Alternatives considered**

- 用 `CLAUDE.md` 替代 bootstrapped skill：拒绝。`CLAUDE.md` 是工作区常驻边界，不适合承载当前 turn 已选 owner 的协议。
- 直接引入 bootstrap digest 机制：暂缓。这是合理的第二阶段方向，但不是最保守的第一阶段。

### Decision 2: `CLAUDE.md` 只保留跨 skill 共享硬边界，不再承载 ordinary flow 手册

**Decision**

根级 `CLAUDE.md` 保留工作区输出规则、普通用户交互硬边界、共享 AskUserQuestion 边界、CMS 高层安全边界和 scratch/source-of-truth 说明；ordinary flow 的提问阈值、确认步骤、worker 分派细节和 detailed CMS apply 说明留在 owner skill 或 specialist skill。

**Why**

- `CLAUDE.md` 的优势是共享和常驻，不是“最详细”。把 owner 协议写进 `CLAUDE.md` 会让该文件与 `page-builder-guided-generation` 持续重复。
- worker / consult skill 需要的是共享法律，而不是完整 owner 手册。
- 把 `CLAUDE.md` 收敛为共享硬边界后，后续才能更明确地区分“工作区法律”和“当前 owner 协议”。

**Alternatives considered**

- 保持现状：拒绝。当前重复已经足够重，且 `CLAUDE.md` 和 controller skill 的语义边界不清。
- 激进压缩为极短模板：拒绝。会丢失跨 skill 兜底边界，尤其是 CMS 高层规则。

### Decision 3: system prompt 与 dynamic context 以“全局规则 / 运行时事实”分层

**Decision**

- `system prompt` 保留助手身份、语言、破坏性确认和通用 subagent/worktree 规则。
- dynamic context 只保留路径、时间、scratch、memory、内部预览地址以及与这些值强绑定的最小使用说明。
- dynamic context 不再重复完整的 subagent/worktree 行为规则。

**Why**

- system prompt 是全局规则层，适合描述“任何会话都成立”的行为边界。
- dynamic context 的价值在于当前运行时事实。把通用行为规则塞到 dynamic context，会让事实层和政策层混杂。
- 这项调整几乎不改变当前能力面，只是恢复层级一致性。

**Alternatives considered**

- 完全删除 dynamic context 的 scratch 说明：拒绝。模型仍需要知道当前 cwd 不是默认 repo root。
- 保持双层重复：拒绝。会继续造成“哪个版本是权威规则”的歧义。

### Decision 4: visual worker 不拆新 skill，而是在现有 skill 顶部增加强优先级 page-builder override

**Decision**

保留 `taste-skill` / `redesign-skill` 作为 canonical visual workers，但在其 page-builder 顶层角色段中增加硬约束 override：

- 在 page-builder 中默认目标是 `workspace-files/index.html`
- 默认作者态是 plain HTML / CSS / JS
- 不默认假设 `package.json`、React、Next.js、Tailwind 存在
- 保持 HTML-first，不引入 page-wide Vue runtime
- 遇到已有 CMS 区域时遵守共享 CMS 高层边界

**Why**

- 这两个 skill 当前已经承担 visual execution 角色，复用它们比复制一套 page-builder 专用版本更稳。
- 真正的问题是默认假设错误，而不是 worker 角色本身错误。
- 在顶层加入强 override，可以用最小改动修正最多的偏移行为。

**Alternatives considered**

- 为 page-builder 新建一套独立的 taste/redesign worker：拒绝。维护成本高，容易和现有设计能力漂移。
- 仅在 controller 里提醒 worker：拒绝。worker 在独立执行时仍需要看到自己的 page-builder 合同。

### Decision 5: 第一阶段不压缩 `workspace_state` discoverability 面

**Decision**

本次 change 不把 `workspace_state` 的技能目录激进压缩成 names-only，也不把 bootstrapped skill 发现改为完全依赖 `workspace_state`。

**Why**

- 当前已有“部分 skill 不好触发”的现象，激进压缩 discoverability 会进一步削弱 optional skills 的可见性。
- 在未引入 bootstrap digest 之前，先修正分层与 worker 默认，比压缩能力目录更重要。

**Alternatives considered**

- 立即把 `workspace_state` skills 列表改成只有名称：暂缓。收益有，但不属于当前最保守阶段。

## Risks / Trade-offs

- [`CLAUDE.md` 瘦身过头] → 保留输出规则、普通用户边界、共享 AskUserQuestion 边界和 CMS 高层安全边界，不把它压成纯索引页。
- [worker override 不够强，仍被长篇通用前端规则盖过] → 把 page-builder override 放到 skill 顶层角色段，并用明确的 MUST/DO NOT 语气覆盖 generic stack 假设。
- [只做文案调整，token 收益有限] → 接受该 trade-off；本次 change 优先修正确性和层级，再考虑第二阶段的 bootstrap 摘要化。
- [spec 与代码落地范围不一致] → 只把真正需要 spec-level 约束的行为写进 delta specs；纯措辞去重留在实现阶段处理。

## Migration Plan

1. 更新相关默认 skill、`CLAUDE.md` 模板和 prompt builder 源码。
2. 用现有测试覆盖点验证：
   - ordinary owner / confirmed apply owner 不变
   - consult guidance surfacing 不变
   - visual worker page-builder 角色段包含新的 override
3. 将更新后的默认 skill 和 `CLAUDE.md` 同步到现有 page-builder 工作区。
4. 本次 change 不需要迁移数据模型，也不引入新的 runtime dependency。

## Open Questions

- 暂无必须在 implementation 前阻断的开放问题。
- 第二阶段是否要引入 bootstrap digest / `SKILL.md` 分段抽取机制，留待本次保守清理完成后再评估。
