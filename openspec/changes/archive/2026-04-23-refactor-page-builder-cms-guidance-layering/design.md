## Context

当前 page-builder 已经把 confirmed CMS selection 之后的 apply 链路收敛到了 `cms-binding-apply -> mcp__cms__decide_cms_binding -> mcp__cms__apply_cms_binding`，这条链路的 authority 和 fail-closed 边界相对清楚。真正不稳定的部分发生在 ordinary flow：模型虽然通常知道 `cms-catalog` / `cms-content` 是特殊标签，但在修改已有 CMS 区域时仍然容易在未充分理解 contract 的前提下直接猜写法、混用示例、或把 confirmed apply skill 当作普通 CMS literacy 的默认入口。

现有分层也导致了注意力问题：

- 根级 `CLAUDE.md` 已经承担全局边界与路由，但仍缺少“命中宿主管理 CMS 构造时先 consult canonical guidance”的统一规则。
- `page-builder-guided-generation` 同时承担 ordinary page-builder 控制流和一部分已有 CMS 区域 guidance，导致 CMS 细则仍然偏重、偏散。
- `cms-binding-apply` 的职责已经较清楚，但普通编辑场景仍容易把它误当作默认 CMS 说明书。
- canonical contract 能派生 confirmed apply 所需 digest，但 ordinary flow 还缺少一个更轻量、目标感更强的“已有 CMS 区域 authoring digest”。
- 当页面本身已经存在 CMS 区域但当前回合没有显式命中某个 `cms-island` 时，模型也缺少一个足够轻量的 page-level 提醒，容易把整页继续当作纯普通 HTML 区域来理解。

这次 change 的约束也很明确：优先减少模型乱猜，优先把正确 guidance 顶到前面，而不是通过更复杂的程序端自动恢复来纠偏。

## Goals / Non-Goals

**Goals:**

- 让模型在命中已有 `cms-catalog` / `cms-content` 区域时，先进入正确 guidance 语境，再开始普通编辑。
- 把 CMS 相关提示词和 skill 重新分层，降低单个 skill 的负担与重复规则。
- 新增一个专门面向“已有 CMS 区域普通修改”的轻量 guidance capability，而不是继续把普通 CMS literacy 塞进 `page-builder-guided-generation` 或 `cms-binding-apply`。
- 让宿主通过 runtime-controlled 的方式稳定激活新的已有 CMS 区域 guidance，而不是仅依赖模型自己发现 skill 文件。
- 让宿主在明确命中已有 CMS 区域时，优先注入最小 component-aware digest，而不是依赖模型自己去翻长 references。
- 让宿主在页面已经含有已有 CMS 区域但当前回合没有显式 target 时，仍能注入轻量 page-level guidance notice，先提醒模型进入正确 CMS authoring 语境。
- 保持 confirmed CMS apply 仍然由 `cms-binding-apply` 和 `decide/apply` 工具链负责。

**Non-Goals:**

- 不在这一轮中重新设计 CMS browser、confirmed handoff 或 decision/apply 协议。
- 不在这一轮中引入复杂的程序端自动恢复、自动修补或“写坏后再智能纠偏”机制。
- 不在这一轮中穷举所有 props 的参数级拦截矩阵。
- 不把所有 host-managed constructs 一次性抽象成通用框架；本轮先聚焦 page-builder CMS 场景。
- 不在这一轮中修改 `page-builder-cms-targeted-edit-guardrails` 已定义的 rollback / turn recovery 语义；如需调整该行为，另起 change。

## Decisions

### Decision 1: 采用“四层 guidance authority”而不是继续堆叠单个 skill

这次改动采用以下 authority 分层：

1. 根级 `CLAUDE.md`：只保留全局稳定边界、场景路由和“命中 CMS 先 consult canonical guidance”的规则。
2. `page-builder-guided-generation`：继续担任 ordinary page-builder controller，只负责普通用户交互、普通迭代和高层 CMS 边界。
3. 新的 `page-builder-cms-region-authoring-guidance`：专门承接已有 CMS 区域普通修改时的理解顺序、普通 authoring guidance 和“不要猜”的边界。
4. `cms-binding-apply`：继续只负责 confirmed CMS selection 之后的 Phase 1A controller 和 `decide -> apply` 协议。

选择这种分层，而不是继续把更多 CMS 细则堆进 `page-builder-guided-generation` 的原因是：ordinary controller 与组件级 CMS literacy 是两类不同职责；继续混放只会让默认 skill 越来越长，且更难稳定触发模型的正确阅读顺序。

备选方案是“仅精简现有 skill，不新增新的 guidance capability”。这个方案实现更少，但仍然保留了“已有 CMS 区域普通修改没有独立 guidance 入口”的结构性空档，因此不采用。

### Decision 2: 新增一个面向“已有 CMS 区域普通修改”的轻量 skill，而不是把普通 CMS literacy 塞进 apply skill

新增 capability 会对应一个新的 workspace-local skill，职责是：

- 说明当前命中的是宿主管理 CMS 区域，而不是普通 HTML/Vue 片段。
- 规定普通编辑场景下的 canonical 阅读顺序：先看宿主注入的最小 digest，再按需读该 skill，再在 confirmed apply 场景读取工具协议。
- 说明普通修改可以调整已有 CMS 区域的 template/structure/style，但在缺少稳定依据时不得猜字段、猜 props 或猜 runtime-only attrs。
- 说明哪些请求属于 ordinary CMS authoring，哪些请求应升级到 confirmed CMS flow。

该 skill 必须保持轻量，而不能再次长成新的“大而全 CMS 说明书”。因此第一阶段会把内容继续分层为：

- 主 skill：只保留阅读顺序、不要猜测、ordinary/confirmed 边界和最小行动规则；
- contract-derived digest：提供当前目标组件、字段语义和当前 authoring surface；
- 小型 component/shared guidance：按需承接 `cms-catalog`、`cms-content` 与共享边界的补充说明；
- references：只保留示例、反例和扩展阅读。

不把这些内容塞进 `cms-binding-apply` 的原因是：`cms-binding-apply` 是 confirmed selection 后的协议控制器，强调 same-turn decision/apply 和 Phase 1A 边界；如果再承担 ordinary literacy，会重新变重，也会模糊 ordinary 与 confirmed 两条链路。

### Decision 3: 新的 ordinary CMS guidance 必须通过宿主显式 surfacing，而不是被动等待模型自行发现

这次 change 的基线不是“把 skill 放进工作区就算完成”，而是宿主在命中已有 CMS 区域时必须显式把对应 guidance 顶到当前 prompt 前面。实现上可以通过 `mentionedSkills`、`bootstrappedSkills` 或等价的 runtime-controlled surfacing 完成；当页面已包含已有 CMS 区域但当前回合没有显式 target 时，宿主也可以只注入轻量 page-level notice 和对应 guidance surfacing，而不注入 target-scoped digest。无论哪种情况，都不能只依赖：

- skill 文件存在于 workspace
- 根级 `CLAUDE.md` 提了一句“如不确定请阅读 skill”
- 模型自行判断要不要去读

这样设计的原因是：当前真正的问题不是缺文档，而是正确 guidance 没有稳定出现在正确场景里。只有把 surfacing 本身做成宿主责任，新的分层才会落地。

### Decision 4: ordinary CMS guidance 采用“宿主先注入 page-level notice / 最小 digest，再按需读 skill”的阅读顺序

在普通编辑中，模型不应该一上来就去翻长 references，也不应该先看 MCP tool schema。更稳的顺序是：

1. 全局约束先声明当前构造是 host-managed CMS construct。
2. 如果当前页面已经存在已有 CMS 区域，宿主先注入轻量 page-level CMS guidance notice，提醒模型不要把页面继续当作纯普通 HTML authoring surface。
3. 宿主在明确命中已有 CMS 区域时再注入最小 component-aware digest。
4. 模型在 notice / digest 仍不足以安全修改时，再读取新的已有 CMS 区域 guidance skill。
5. 只有确认进入 confirmed apply 场景时，才进入 `cms-binding-apply` 与 MCP tool guidance。

这样设计的原因是：

- page-level notice 负责“当前页面存在 host-managed CMS 区域，需要先切换 authoring mindset”；
- digest 负责“当前这个目标到底是什么”；
- guidance skill 负责“普通修改时应该怎样理解和行动”；
- tool guidance 负责“正式 apply 协议是什么”。

备选方案是“只给一个新 skill，不做 digest 注入”。这个方案仍然过度依赖模型自己去读 skill，稳定性不足，因此不采用。

### Decision 5: ordinary digest 必须从 canonical CMS authoring contract 派生，而不是再维护一套独立提示词白名单

这次 change 不会再新建一套独立的 ordinary CMS knowledge table。ordinary digest 必须从现有 canonical CMS authoring contract 派生，并根据当前命中的组件和来源模式裁剪为最小视图。该 digest 至少应能表达：

- `component`
- `sourceType`
- `allowedProps`
- `requiredProps`
- `slotScope`
- `itemFieldMeta`
- `recommendedLinkField`
- `recommendedImageField`
- `forbiddenStructures`
- ordinary authoring 需要的附加边界，例如“不理解时先读 guidance”“不要猜 runtime-only attrs”“不要直接绕过 confirmed flow”

选择 contract-derived digest 的原因是：避免代码、skill 和 prompt 各自维护不同的 CMS authoring 白名单，继续贯彻“single source of truth”。

### Decision 6: 第一阶段重点是 guidance layering，不把复杂自动恢复作为核心方案

这次 change 会明确 ordinary CMS authoring 的 guidance 和阅读顺序，但不会把复杂的程序端自动恢复、自动修补或 speculative rollback 作为设计核心。对这轮来说，更优先的是：

- 让正确 guidance 在正确时机稳定出现；
- 降低模型在不理解时直接动手的概率；
- 把 confirmed apply controller 与 ordinary CMS guidance 彻底分开。

备选方案是同时引入更强的 ordinary flow runtime hard gate 和自动回退。虽然长期可能需要更硬的执行边界，但这会把 change 范围迅速扩大到 mutation rejection、preview rollback 和 turn recovery，不符合本轮“先把 guidance 分层做稳”的目标。

## Risks / Trade-offs

- [新 skill 增加后反而让模型更困惑] → 通过宿主按场景自动 mention/bootstrap，避免完全依赖模型自己发现 skill。
- [全局约束、digest、skill 三层同时存在，仍然可能重复] → 严格约束每一层职责：全局只放稳定边界，digest 只放目标事实，skill 只放场景 guidance，并要求新的 ordinary CMS guidance 保持轻量。
- [digest 过长导致普通页面回合噪音增加] → 第一阶段只在明确命中已有 CMS 区域时注入 target-scoped digest；没有显式 target 但页面已含 CMS 区域时，仅注入轻量 page-level notice，不做全局常驻 digest 注入。
- [ordinary guidance 与 contract 派生视图发生漂移] → 要求 ordinary digest 与人类可读 guidance 都从 canonical contract 或其派生视图生成，并补充测试。
- [只做 guidance layering 仍不能完全阻止所有越界修改] → 这是已知取舍；本轮优先减少模型误判与技能负担，把更强 runtime gate 视为后续独立 change。
- [已有 rollback spec 与本轮“不做复杂自动恢复”的基调容易混淆] → 在 proposal/design 中显式声明本轮不修改 `page-builder-cms-targeted-edit-guardrails` 的 rollback 语义。

## Migration Plan

1. 更新 proposal 覆盖的 capability specs，明确新的 guidance layering、skill 职责边界和 ordinary digest 需求。
2. 新增 workspace-local 的已有 CMS 区域 guidance skill，并让 workspace 初始化逻辑能复制该 skill。
3. 调整 page-builder 根级 `CLAUDE.md` 与 `page-builder-guided-generation` / `cms-binding-apply` 的文案职责边界，并保持新的 ordinary CMS guidance 只承担轻量规则。
4. 在普通编辑命中已有 CMS 区域时，为 prompt assembly 增加新的最小 digest 注入和 host-controlled skill surfacing；当页面已含 CMS 区域但当前回合没有显式 target 时，增加轻量 page-level notice 注入。
5. 更新 tests，覆盖 skill copying、prompt injection、ordinary CMS target 命中时的 guidance 可见性，以及 confirmed apply 仍保持原控制器链路。

这次 change 不涉及数据迁移，也不需要持久化 schema 迁移。回滚策略是移除新增 guidance skill 和对应注入逻辑，并恢复现有 prompt layering；现有 targeted-edit guardrails 的 rollback 语义不在本轮回滚范围内。

## Open Questions

- 除了“页面已含 CMS 区域时的 page-level notice”和“显式命中 `cms-island` 时的 target-scoped digest”之外，后续是否还需要覆盖更多隐式已有 CMS authoring 场景。当前实现先以这两类触发为 v1 基线。
- 新 capability 的最终命名是否保持 `page-builder-cms-region-authoring-guidance`。若没有额外偏好，继续使用该命名。
