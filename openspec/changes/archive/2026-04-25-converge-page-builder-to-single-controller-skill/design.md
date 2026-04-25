## Context

当前 `page-builder` 的能力面已经同时包含：

- 根级 `CLAUDE.md` 的全局约束
- 普通页面主控 `page-builder-guided-generation`
- 已有 CMS 区域 guidance `page-builder-cms-region-authoring-guidance`
- confirmed CMS apply controller `cms-binding-apply`
- 通用讨论型 skill `brainstorming`
- 多个视觉 worker skills

问题不在于“没有能力”，而在于 ordinary flow 的控制权表达仍然不够稳定：

- 模型能看到很多 skill，但“可见”不等于“当前这一轮应该先用谁”
- `brainstorming` 仍带有 “You MUST use this before any creative work” 这类过强描述，容易抢走 page-builder 的普通主控
- 页面里存在 CMS 区域时，普通页面编辑、已有 CMS 区域局部 authoring、confirmed CMS apply 三类场景容易在 prompt 层被混淆
- 当前集成对“skill A 稳定再调 skill B”没有 SDK 级强保障，更多依赖宿主 surfacing 与模型当轮理解

用户已经明确拒绝“宿主为 ordinary flow 做细粒度多 owner 场景判定”的方案，原因是这种判定不稳定、容易误判，也会让程序端越来越复杂。新的收敛方向是：

- ordinary page-builder turn 统一先进入一个主控 skill
- specialist skills 作为 consult-only 能力存在
- confirmed CMS apply 仍保留宿主硬切换
- `brainstorming` 从默认前置 skill 收敛为显式进入的讨论型 skill

## Goals / Non-Goals

**Goals:**

- 让 ordinary `page-builder` turn 始终先由单一 controller 承接，减少 owner 竞争
- 保留 CMS 相关两层结构：ordinary flow 中的 consult guidance 与 confirmed apply flow 中的专用 controller
- 让根级 `CLAUDE.md`、turn-level prompt surfacing、主控 skill、specialist skill 的职责边界一致
- 让模型在修改已有 CMS 区域时先进入正确 guidance 语境，但不把该 guidance 升格成普通流并列 owner
- 改写 `brainstorming` 的 contract，使其不再覆盖 workspace-specific controller flow

**Non-Goals:**

- 不新增新的 CMS MCP tool 协议，也不替换现有 `decide -> apply` confirmed CMS 链路
- 不通过更复杂的宿主文本规则、正则或自动恢复逻辑来“纠正”模型每一次误用
- 不要求隐藏所有其他 skills；本次只区分“工作区可见”与“当前 turn 被默认提升”
- 不把 ordinary flow 中的已有 CMS 区域修改再次改造成宿主多 owner 场景路由

## Decisions

### 1. Ordinary page-builder flow 收敛为单一 controller

决定：

- 除 confirmed CMS apply 外，ordinary page-builder turn 一律先进入 `page-builder-guided-generation`
- 这包括首轮创建、普通迭代、repair、redo、selected-block follow-up，以及选中已有 `cms-island` 后的普通样式/slot 迭代

原因：

- 宿主无法稳定判断 ordinary flow 内部的所有软意图
- 让 ordinary flow 先进入单一 controller，比在宿主侧预判多个 owner 更稳定
- 这样可以把“问用户、澄清、确认、决定是否需要 specialist”统一放在一个地方完成

备选方案：

- 继续保留 ordinary flow 内的多 owner 路由
  - 放弃原因：场景判定越细，误判越多，宿主逻辑也会继续膨胀

### 2. Specialist skills 保留，但改为 consult-only

决定：

- `page-builder-cms-region-authoring-guidance` 不再作为 ordinary flow 的并列 controller
- 它只负责在“当前目标已经是已有 CMS 区域”时提供组件级 canonical guidance
- `taste-skill` 与 `redesign-skill` 保留为下游 visual workers，由主控 skill 决定何时调用

原因：

- specialist 的价值在于提供精确约束，而不是接管普通用户交互
- 当前系统没有可靠的“嵌套 skill 调用栈”保证，因此 specialist 必须既能被显式调用，也能被宿主 bootstrap/consult
- 把 specialist 设计成 consult-only，更适合当前 prompt-layered 的实际运行方式

备选方案：

- 让已有 CMS 区域 guidance 直接成为 explicit target edit 的 owner
  - 放弃原因：这会把 ordinary flow 再次拆成多 owner，重新引入场景判定不稳定问题

### 3. 保留 confirmed CMS apply 的宿主硬切换例外

决定：

- 当 workflow 已经拥有确认完成的 CMS selection、目标上下文和 apply 边界时，宿主继续把该 turn 硬切到 `cms-binding-apply`
- 普通主控 skill 遇到“要换栏目、换内容、改 query props、重绑 source”的需求时，必须升级回正式 CMS 选择，再进入 confirmed apply

原因：

- 新建或重绑 `cms-*` 标签是高风险写入，不适合留在 ordinary flow 中自由发挥
- 当前 `decision-backed apply` 已经是更可控的协议边界，应继续保留

备选方案：

- 让 ordinary controller 直接改已有 `cms-*` 的绑定 props
  - 放弃原因：会破坏 decision/apply 链路，也会让 ordinary flow 与 confirmed flow 的边界再次变模糊

### 4. 区分“工作区可见 skills”与“当前 turn 被默认提升的 skills”

决定：

- Skills 可以继续在工作区中保持可见
- 但 ordinary turn 默认提升和 bootstrapping 只围绕 `page-builder-guided-generation`
- 当命中已有 CMS 区域时，额外 consult `page-builder-cms-region-authoring-guidance`
- `brainstorming` 保留可见，但不再作为默认 promoted competitor

原因：

- “默认都暴露”与“默认都提升”为两件不同的事
- 当前问题恰恰出在 turn-level promotion 太散，导致模型很难判断这轮真正该跟随谁

备选方案：

- 直接隐藏所有非 controller skills
  - 放弃原因：会损失显式调用和人工阅读价值，也不利于其他明确场景下的能力复用

### 5. `brainstorming` 改为显式进入的讨论型 skill

决定：

- `brainstorming` 不再声称“任何 creative work 前都必须使用”
- 它改为“当用户明确要求 brainstorm / 比较方案 / 先讨论再做”时才进入
- 即便在 page-builder 中显式进入 `brainstorming`，它也只负责讨论和方案分析，不接管后续的页面生成、确认或 ordinary edit control

原因：

- `brainstorming` 的当前文案会直接与 workspace-specific controller 冲突
- page-builder 场景的大多数请求并不需要先进入泛化 brainstorming

备选方案：

- 保持 `brainstorming` 现状不变
  - 放弃原因：它会持续抢占普通 page-builder flow 的控制权

## Risks / Trade-offs

- [主控 skill 责任变重] → 通过把 CMS 组件细则、视觉 worker、confirmed apply 分层出去，避免 `page-builder-guided-generation` 继续膨胀成大而全总表
- [模型仍可能跳过 consult guidance] → 通过宿主在相关 turn 显式 surfacing guidance / digest，并在主控 skill 中写死“命中已有 CMS 区域先 consult”的规则降低风险
- [visible 与 promoted 并存，仍可能产生一定噪音] → 保留可见性，但严格收敛默认 turn-level promotion，只让单主控进入竞争面
- [`brainstorming` 降级后，部分显式讨论场景需要额外切换] → 接受这一点，以换取 ordinary flow 的稳定性；显式 brainstorm 仍可用，但不再默认抢主控

## Migration Plan

1. 更新 page-builder 相关 spec，使 ordinary flow、prompt layering、CMS guidance、brainstorming 的职责重新对齐。
2. 修改根级 `CLAUDE.md` 模板，明确“单主控 + consult specialist + confirmed apply 例外”的分层。
3. 改写 `page-builder-guided-generation`，让其成为 ordinary flow 的唯一 controller，并显式说明如何 consult CMS guidance / visual workers。
4. 改写 `page-builder-cms-region-authoring-guidance`，使其成为 consult-only specialist guidance。
5. 改写 `brainstorming` skill 的 contract，去掉 universal preflight gate 语义。
6. 调整 Builder 发送准备与 prompt surfacing 逻辑，保证 ordinary turn 只默认提升一个 controller。
7. 增加针对 skill surfacing、owner promotion、selected CMS island ordinary follow-up、confirmed apply exception 的验证。

回滚策略：

- 如需回滚，可恢复旧的 skill 文案与 prompt surfacing 逻辑；本次不引入新的外部依赖或数据迁移。

## Open Questions

- 当前无阻塞性开放问题。用户已确认：保留 skill + tool 两层；confirmed CMS apply 继续硬切换；ordinary flow 收敛到单一主控；`brainstorming` 改为显式进入。
