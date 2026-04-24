## Context

`page-builder` 当前已经具备 ordinary page flow、existing CMS region guidance、confirmed CMS apply、visual design skills 与 preview selection 注入等能力，但这些能力在真实运行时仍会同时出现在一个 Builder turn 中竞争控制权。日志显示，普通页面 redesign turn 即使显式提及了 `page-builder-guided-generation`，模型仍可能转去调用 `brainstorming`，或者在设计确认后直接 `Read` / `Edit`，而没有经过预期的 visual worker 链路。

当前造成不稳定的关键因素已经比较清楚：

- 宿主虽然会在普通 turn 中提及 `page-builder-guided-generation`，但它只是软提示，模型仍能自由改调其他看起来“更像入口”的 skill。
- 根级 `CLAUDE.md` 只承载了部分场景路由信息，没有把 owner、secondary skill 角色与 handoff 规则提升为所有 turn 都能先读到的硬边界。
- `page-builder-cms-region-authoring-guidance`、`brainstorming`、`taste-skill`、`redesign-skill` 在描述上仍然容易被模型理解成“入口型能力”，而不是分别服务于 consult / discussion / execute 的二级角色。
- explicit existing CMS region ordinary edit 与 confirmed CMS apply 的区分虽然存在，但 owner-controller 的选择没有形成“宿主先定 owner、当前 turn 锁定 owner”的稳定闭环。
- `taste-skill` 的定位仍偏向“首轮整页生成”，而 block 级显著重设计的首轮执行角色没有被稳定归一。

本次变更要解决的不是单个 skill 的文案问题，而是 page-builder 的整体编排问题：需要明确每一层放什么信息、每一类 skill 在运行时承担什么角色，以及谁拥有 turn-level owner 的选择权。

## Goals / Non-Goals

**Goals:**

- 让 page-builder 每个 turn 都先由宿主根据结构化上下文决定当前 scene 与唯一 owner-controller。
- 让 ordinary page flow 与 explicit existing CMS region ordinary edit 继续共享同一个 owner-controller：`page-builder-guided-generation`。
- 让 confirmed CMS apply 继续由 `cms-binding-apply` 独占 owner-controller。
- 让 owner-controller 通过 bootstrapped prompt 成为本轮硬上下文，并在 turn 内锁定，不允许模型自由切换到另一个 owner skill。
- 让 `CLAUDE.md` 只承载工作区硬规则、scene routing、skill 角色分层与 handoff 规则，而不重复 skill 内部的细流程。
- 让 `brainstorming` 收敛为 discussion-only，`page-builder-cms-region-authoring-guidance` 收敛为 consult-only，`taste-skill` / `redesign-skill` 收敛为 execute-only。
- 让 `taste-skill` 成为首轮视觉执行 worker，既用于首轮整页生成，也用于首轮 block 级明显视觉重设计；`redesign-skill` 仅用于第二阶段提质、升级或精修。
- 移除隐藏 follow-up target continuity，避免宿主为了“猜用户是不是还在改刚才那块”而重新引入消息文本启发式判断。

**Non-Goals:**

- 不重做已有 CMS `decide -> apply` tool contract，也不放松 “无 decision 不写入” 的硬门禁。
- 不把所有 page-builder 与 CMS skill 合并成一个大 skill。
- 不让模型在同一 turn 内自己切换 owner-controller；owner 切换仍由宿主 handoff 触发。
- 不在本次变更中扩大非 page-builder 工作区的默认 routing 机制。
- 不把 `soft-skill` 升级成新的 page-builder 默认 visual worker。

## Decisions

### Decision 1: 宿主先决定 scene，再映射到唯一 owner-controller

page-builder 的 turn-level routing 不再让模型自己从多个 skill 中判断“谁来接管本轮”。宿主会先根据结构化上下文把请求分类，再映射到唯一 owner-controller。

scene classification 仍可区分为三类：

- `ordinary-page-flow`
- `existing-cms-region-ordinary-edit`
- `confirmed-cms-apply`

但 owner-controller 只保留两个：

- `ordinary-page-flow` -> `page-builder-guided-generation`
- `existing-cms-region-ordinary-edit` -> `page-builder-guided-generation`
- `confirmed-cms-apply` -> `cms-binding-apply`

其中 `existing-cms-region-ordinary-edit` 不是第三个 owner，而是 ordinary owner 需要 consult CMS specialist guidance 的一个子场景。

scene classification 的依据会优先使用宿主拥有的结构化信号，例如：

- 当前 `targetSelection` / target kind
- 当前 workflow 是否已经进入 confirmed CMS selection / decision / apply 阶段
- `page_builder_selection` / `page_builder_cms_guidance_notice` / `page_builder_cms_region_authoring` 等宿主注入元数据

自由文本内容仍可作为 owner skill 的语义输入，但宿主不得再通过 message verb regex、关键词 pattern 或其他纯文本启发式去决定 scene、是否续写同一 target，或是否清空当前 target。

**Alternatives considered**

- 继续让模型在多个 skill 中自行判断主控：被拒绝，因为这正是当前不稳定的根因。
- 把 explicit existing CMS region ordinary edit 升级为第三个 owner-controller：被拒绝，因为这会重新让 `page-builder-cms-region-authoring-guidance` 与 ordinary controller 形成并列入口竞争。
- 继续用消息关键词、动词 pattern 或正则做主要分流：被拒绝，因为这会把宿主结构化上下文重新降级为脆弱的文本猜测。

### Decision 2: 每个 turn 只允许一个 owner-controller，并由宿主锁定

一旦宿主在本轮选择了 owner-controller，该 owner 就必须通过 bootstrapped prompt 进入本轮上下文，并在当前 turn 内保持锁定。

这意味着：

- 当前 owner skill 通过 `bootstrappedSkills` 或等价的宿主预加载机制进入 prompt
- prompt 中同时注入 turn-level routing metadata，显式说明当前 `sceneKind`、`ownerSkill`、`ownerLockedForTurn`
- pre-tool guardrail 需要拦截 “owner-controller -> owner-controller” 的越权切换
- owner 变化必须走宿主 handoff 或开启新 turn，而不是由模型在同一轮里自行跳转

consult-only、discussion-only、execute-only skills 仍可由当前 owner 调用，但它们不会改变 turn owner。

**Alternatives considered**

- 继续只用 `<mentioned_tools>` 里的“请立即调用此 Skill”来表达 owner：被拒绝，因为日志已经证明这只是软提示。
- 不做 tool-level owner guardrail，只靠文案提醒模型不要换 owner：被拒绝，因为 owner 错切换属于应由宿主防守的运行时约束。

### Decision 3: `CLAUDE.md`、turn 注入与 skill 文档各自只回答一个问题

为避免 `CLAUDE.md`、主 skill、specialist skill 与动态 notice 在同一问题上重复甚至冲突，需要明确每一层的职责：

`CLAUDE.md` 承担：

- page-builder 工作区输出规则
- 普通用户交互硬边界
- scene routing 与 owner / secondary role taxonomy
- owner 变化必须由宿主 handoff 的规则
- CMS / Vue 的全局安全边界

turn-level routing metadata 与 notices 承担：

- 当前 `sceneKind`
- 当前 `ownerSkill`
- 当前 `targetSelection`
- 当前是否命中 explicit existing CMS region
- 当前是否进入 confirmed CMS apply
- 当前允许哪些 secondary skills / consult digests

owner skill 承担：

- 当前 owner scene 下的详细执行流程
- 问答节奏、确认边界、下游调度规则

secondary skills 承担：

- 自己的局部角色和边界
- 何时被调用、何时交回 owner

这样可以避免“同一规则在 `CLAUDE.md` 与多个 skill 中重复，但口径又不完全一致”的问题。

**Alternatives considered**

- 把主 skill 全量复制进 `CLAUDE.md`：被拒绝，因为会让根级模板过重并继续制造重复。
- 只依赖主 skill，不在 `CLAUDE.md` 中写 controller 规则：被拒绝，因为模型如果没先调用主 skill，就仍然看不到这些硬边界。

### Decision 4: secondary skill 必须显式区分 discussion-only / consult-only / execute-only

为了防止多个 skills 再次像入口一样竞争，page-builder 默认相关 skills 需要具备稳定的角色语义：

- `page-builder-guided-generation`: `owner-controller`
- `cms-binding-apply`: `owner-controller`
- `page-builder-cms-region-authoring-guidance`: `consult-only`
- `brainstorming`: `discussion-only`
- `taste-skill`: `execute-only`
- `redesign-skill`: `execute-only`
- `soft-skill`: 不参与 page-builder 默认竞争面

这些角色不仅要体现在 skill 正文里，也要体现在 description、`CLAUDE.md` 和 turn-level surfacing 逻辑里。否则模型即使知道 skill 存在，仍可能把 `brainstorming`、`taste-skill` 或 `page-builder-cms-region-authoring-guidance` 误解为新的 owner 入口。

**Alternatives considered**

- 保留所有 skills 的泛化描述，只靠更多规则提醒模型区分：被拒绝，因为会继续提高路由歧义。
- 完全隐藏所有 secondary skills：未采用，因为 owner 仍需要稳定调用它们完成 discussion / consult / execute 工作。

### Decision 5: explicit existing CMS region ordinary edit 继续由 ordinary owner 主控，guidance 只 consult

当前 target 明确命中 existing `cms-catalog` / `cms-content` / `cms-island` 时，本轮并不会切换成新的 owner-controller。

正确链路应该是：

- owner 仍为 `page-builder-guided-generation`
- 宿主在 turn 中注入 target-scoped digest 与 `page-builder-cms-region-authoring-guidance`
- ordinary owner 先 consult 该 guidance，再执行 existing-region ordinary edit
- 如果用户实际想改变 binding identity，则 ordinary owner 请求宿主升级回 confirmed CMS browser / handoff / apply flow

这样可以保持：

- ordinary flow 的单 owner 稳定性
- 组件级 CMS literacy 由 specialist guidance 提供
- confirmed apply 仍保持 decision-backed 的正式链路

**Alternatives considered**

- 把 explicit existing CMS target ordinary edit 升级为 `page-builder-cms-region-authoring-guidance` owner：被拒绝，因为它会把 consult-only specialist 再次推回并列 owner 竞争面。

### Decision 6: `taste-skill` 是首轮视觉执行 worker，`redesign-skill` 只做第二阶段提质

page-builder 里视觉 worker 的角色也需要从“泛化设计能力”收敛到稳定执行链路。

本次明确：

- `taste-skill` 用于首轮视觉执行
  - 首版整页生成
  - 首轮 block 级明显视觉重设计
- `redesign-skill` 用于已有结果基础上的第二阶段提质、升级、精修

用户不再需要在两者之间自行选择，ordinary owner 根据当前任务阶段决定调用哪个 execute-only worker。

这样可以避免“block redesign 到底算首版还是 redesign”这类歧义继续留给模型自由理解。

**Alternatives considered**

- 继续把 `taste-skill` 限定为首轮整页生成：被拒绝，因为 block 级明显重设计场景会失去稳定的一阶段视觉执行 worker。
- 让 `redesign-skill` 同时承担首轮 block redesign：被拒绝，因为会让两者的职责边界继续重叠。

### Decision 7: 移除隐藏 follow-up target continuity，发送阶段只信当前显式结构化选区

宿主不再保留隐藏的 follow-up target context。一次带 `targetSelection` 的发送完成后，系统会清除当前可见选区；后续 turn 是否继续围绕某个 block 或 `cms-island`，必须来自新的显式选区、显式 CMS handoff，或未来单独设计的可见 authoring scope，而不是来自宿主对自由文本 continuation 的猜测。

这意味着：

- 发送阶段只信当前显式 `selectedTargetSelection`
- 没有显式选区时，本轮发送回落到 page-level ordinary flow
- “继续改刚才那块”“整页重做”“换个方向”等语义由当前 owner skill 理解与澄清，而不是由宿主通过文本启发式改写 target 上下文

**Alternatives considered**

- 继续保留隐藏 follow-up target，并只把它用于 target continuity：未采用，因为宿主一旦保留隐藏 target，就不可避免地需要根据消息文本去猜何时沿用、何时清空，这与“宿主只判断结构化事实”的目标冲突。
- 让 follow-up target context 直接决定 owner：未采用，因为 target continuity 只能说明“还在改哪个对象”，不能单独说明“当前是否已进入 confirmed apply 等专用流程”。

## Risks / Trade-offs

- [Risk] owner-controller lock 过严，可能挡住模型在同一轮里试图自行跳转到另一个 owner
  → Mitigation: 只拦截 owner-controller 之间的切换；discussion / consult / execute skills 仍允许调用。

- [Risk] `CLAUDE.md` 承载更多主控规则后，模板长度上升
  → Mitigation: 只上移硬边界与角色分层，不复制 skill 细流程。

- [Risk] explicit existing CMS region ordinary edit 继续由 ordinary owner 主控，可能让 CMS authoring 相关逻辑看起来“绕一层”
  → Mitigation: 保留 target-scoped digest 与 consult-only guidance，把 CMS literacy 放在 specialist guidance 中而不是重新开一个 owner。

- [Risk] 移除隐藏 follow-up target 后，局部续写可能要求用户重新显式选区
  → Mitigation: 先优先保证宿主不再猜意图；如后续需要恢复便利性，应新增可见 authoring scope，而不是重新引入隐藏 target 与文本启发式。

- [Risk] `soft-skill` 不再进入默认竞争面后，部分历史行为可能变化
  → Mitigation: 保留 skill 文件与显式调用能力，但从默认竞争面中移出。

## Migration Plan

1. 更新 page-builder 相关 spec 文档，把 owner-controller、secondary role taxonomy、host handoff 规则与 visual worker 边界收敛到统一口径。
2. 更新 Builder send preparation 与 prompt layering，使宿主能够在发送前完成 scene 分类、owner 选择、owner lock 注入与 target-scoped secondary surfacing。
3. 更新 page-builder 根级 `CLAUDE.md` 模板与相关 skills 的 description / body，使其与新的 owner / consult / discussion / execute 分层一致。
4. 增加回归测试，覆盖：
   - host-owned owner selection
   - single owner lock per turn
   - explicit existing CMS region ordinary edit 的 consult-only guidance 链路
   - 发送后不再隐式复用旧 target，后续 turn 只依赖当前显式选区
   - `taste-skill` 首轮整页生成与首轮 block redesign 的 worker 角色
   - `redesign-skill` 第二阶段提质角色

回滚策略：

- 恢复旧的 page-builder workspace 默认 skill surfacing 与 routing 行为
- 取消 owner-controller lock guardrail
- 恢复旧的 `page-builder-cms-region-authoring-guidance` owner 定位

## Open Questions

- 当前没有阻断实现的开放问题。
