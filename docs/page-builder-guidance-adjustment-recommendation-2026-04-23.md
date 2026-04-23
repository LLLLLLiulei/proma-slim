# Page Builder Guidance 调整建议（2026-04-23）

> 相关背景文档：`docs/page-builder-cms-prompt-skill-tool-analysis-2026-04-22.md`

## 文档目的

本文用于沉淀本轮关于 page-builder 提示词注入、skill 路由、CMS authoring guidance、CMS MCP tool 分层方式的进一步分析结果。重点不是继续堆叠更多提示词，而是明确：

- 普通页面流应该由谁主控
- 已有 CMS 区域编辑应该如何分流
- 已确认 CMS 内容应用应该如何进入受控链路
- 宿主如何表达“当前这一轮到底应该听谁的”

## 本轮分析所基于的输入

本次结论主要来自以下几类输入：

1. 前面对 page-builder、CMS 相关 skill、MCP tool、宿主 handoff 机制的连续讨论结果。
2. 对当前 skill 文案和职责边界的复查，重点包括：
   - `brainstorming`
   - `page-builder-guided-generation`
   - `page-builder-cms-region-authoring-guidance`
   - `cms-binding-apply`
3. 对最近一次错误路由案例的复盘，即普通 footer 改版 turn 被错误带入 `brainstorming`，没有进入预期的 page-builder 主控 skill。
4. 对当前 CMS 两段式 tool 契约的复查：
   - `mcp__cms__decide_cms_binding`
   - `mcp__cms__apply_cms_binding`
5. 对当前宿主 prompt 注入结构的复查，包括页面级 CMS notice、target 级 CMS guidance，以及 confirmed handoff payload。

## 分析过程

本轮重点重新思考了 4 个问题。

### 1. `brainstorming` 是否还适合继续参与 page-builder 默认路由

结论：**不适合作为 page-builder 内的默认竞争 skill。**

`brainstorming` 当前的描述过宽、语气过强。它实际上是在告诉模型“凡是有创意性质的事，都要先走我这套流程”。这会导致它在 skill 发现阶段就开始和 page-builder 专用 skill 抢控制权。

而 page-builder 里大量请求其实并不是开放式产品设计，而是：

- 改一个已有区块的布局
- 调整一个 section 的视觉风格
- 对当前页面做轻量迭代

这些请求通常已经有明确目标，应该直接进入受控的页面编辑流程，而不是默认升级成设计评审或 spec 讨论。

### 2. `page-builder-guided-generation` 是否应该吸收一部分 `brainstorming` 的能力

结论：**应该吸收，但只吸收 page-builder 场景里真正有价值的轻量部分。**

建议吸收的能力：

- 先理解当前页面或当前选中块
- 在确实有关键歧义时补 1 个必要问题
- 做简短方向确认
- 然后直接生成或直接改页面

不应吸收的重流程：

- 多轮开放式脑暴
- 写 spec
- spec review loop
- 再转 implementation plan 作为固定下一步

也就是说，page-builder 需要的是“轻量澄清能力”，不是“完整产品设计工作流”。

### 3. CMS 相关 skill 是否应该全部合并

结论：**不应该全部合并。**

CMS 相关场景天然分成两类：

- 编辑页面里已经存在的 CMS 区域
- 将新确认的 CMS 数据选择结果应用到页面

这两类事情有关联，但不是一回事。

如果把它们合进一个大 skill，会带来几个问题：

- skill 体积进一步变重
- authoring boundary 更模糊
- 模型更容易把“改已有 CMS 区域的结构/样式”与“改数据来源/改绑定语义/新建绑定”混在一起

所以更合适的方式不是“合并成一个大全 skill”，而是保留两个 CMS 专用分支。

### 4. 当前问题是不是主要因为提示词还不够多

结论：**不是。**

当前真正的问题更偏向“控制权表达不清”和“路由不稳定”，而不是“完全没有知识”。

系统里已经有不少 CMS 相关知识和约束，模型不稳定更多是因为：

- 同一轮里出现了过多提示来源
- 同时暴露了多个 skill，却没有一个明确 owner
- 普通页面流、已有 CMS 区域编辑流、confirmed apply 流没有被宿主明确表达成三个不同的 controller 状态

## 当前存在的核心问题

### 问题 1：`brainstorming` 对 page-builder 来说过强

像下面这些普通请求：

- 重新设计一下这块布局
- 这一段改得更简洁一些
- 把这个页面做得更高级一点

本质上都应该留在 page-builder 的受控生成/编辑流程里，而不应该默认走成设计 spec 流。

只要 `brainstorming` 继续作为 page-builder 工作空间中的默认可见 skill 存在，它就有机会在更早的 skill 发现阶段把普通页面流抢走。

### 问题 2：每个 turn 的 skill owner 不够明确

当前宿主注入方式仍然容易在同一个 turn 中暴露多个 guidance 层和多个 skill。即便宿主“本意上”想让某个 skill 优先，prompt 形状本身依然可能让模型选错。

这在以下场景里尤其不稳定：

- 当前页面里有 CMS，但这次选中的只是普通静态块
- 页面级 CMS notice 和 CMS guidance skill 同时暴露在一个普通编辑 turn 中
- 一个泛化 meta skill 和一个 page-builder 专用 skill 同时可见

### 问题 3：CMS guidance 是必要的，但不应主导不相关 turn

如果当前页面某处存在 CMS 区域，模型当然应该被提醒：

- 不要发明新的 CMS 标签
- 不要猜 binding props
- 不要把整页改造成 Vue runtime

但这并不意味着“只要页面上有 CMS，就应该把当前 turn 交给 CMS skill”。

“页面里有 CMS”与“这一轮正在编辑 CMS 区域”必须明确区分。

### 问题 4：tool 安全方向是对的，但错误引导仍然重要

当前坚持 `decide -> apply` 两段式是正确方向。

`apply_cms_binding` 不应在没有有效 decision 状态的前提下直接写入页面。

但同时，错误调用时仍应做到：

- 可以兼容安全的 JSON string 归一化
- 返回明确错误，告诉模型缺少什么字段
- 明确指出当前是不是“调用过早”
- 明确提示下一步应该调用哪个 tool

这不属于“自动恢复”，而是“带可执行指导的安全拒绝”。

## 备选方案对比

### 方案 A：将 `brainstorming` 与 `page-builder-guided-generation` 完全合并

也就是让 page-builder 只有一个大 skill，统一承载 ideation、briefing、设计、生成。

看上去的优点：

- 可见 skill 更少
- 普通页面流似乎只有一个入口

问题在于：

- 容易把重设计流程带入普通页面迭代
- 无法自然解决 CMS 已有区域编辑和 confirmed apply 的分层问题
- 如果写得过强，很容易变成新的路由垄断者，再去压 CMS 专用链路

结论：**不是最优方案。**

### 方案 B：维持现状，只加强提示词文案

也就是 skill 基本不动，只靠多加文字说明去纠正模型行为。

优点：

- 改动成本低
- 无需明显的结构调整

问题在于：

- owner 仍然模糊
- 模型依然可能选错 skill
- 提示词会继续累积，注意力继续被稀释

结论：**不够。**

### 方案 C：一个普通页面主控 + 两个 CMS 专用分支

也就是：

- 普通 page-builder turn 走一个主控
- 已有 CMS 区域编辑走 CMS region guidance
- confirmed CMS apply 走 CMS apply 控制器

优点：

- 路由更清晰
- 每个 skill 更小、更容易理解
- CMS 安全边界更明确
- 宿主可以做到“每轮只注入一个 owner skill”

结论：**这是最合适的方案。**

## 推荐的最终结构

推荐的最终结构如下。

### 1. 普通页面流主控

由 `page-builder-guided-generation` 作为普通 page-builder flow 的唯一主控。

它负责：

- 新建页面
- 普通页面迭代
- 静态 block 改版
- 轻量澄清与确认
- 确认后直接生成页面或直接修改当前页面

它应吸收过去被 `brainstorming` 抢走的那部分轻量澄清能力，但本质上仍然是一个生产型 controller，而不是设计 spec controller。

### 2. 已有 CMS 区域编辑 guidance

保留 `page-builder-cms-region-authoring-guidance`，作为独立的 CMS 区域编辑 specialist skill。

它只在以下情况下使用：

- 当前选中的目标已经是 `cms-catalog` 或 `cms-content`
- 当前任务是在这个已有 CMS 区域上改 slot、结构、外壳或表现层

它不应成为“页面上只要有 CMS 就默认出现的主控 skill”。

### 3. confirmed CMS apply controller

保留 `cms-binding-apply`，作为独立的 confirmed apply controller。

它只在以下情况下使用：

- 用户已经完成 CMS 浏览与确认
- 宿主已经准备好了结构化 handoff
- 当前下一步是受控的 decide + apply

这里仍然是模型组织以下 tool 调用的正确位置：

- `mcp__cms__decide_cms_binding`
- `mcp__cms__apply_cms_binding`

## 宿主注入层的推荐改法

最重要的宿主侧调整是：

**每个 turn 只表达一个明确的 owner skill。**

不要在同一个 turn 里同时放多个“请立即调用此 skill”的候选。

### 推荐的 turn 状态表达

宿主可以将 page-builder turn 明确分成三类：

1. `ordinary-page-builder-turn`
2. `existing-cms-region-edit-turn`
3. `confirmed-cms-apply-turn`

每一类只映射一个 owner skill：

- `ordinary-page-builder-turn` -> `page-builder-guided-generation`
- `existing-cms-region-edit-turn` -> `page-builder-cms-region-authoring-guidance`
- `confirmed-cms-apply-turn` -> `cms-binding-apply`

其他 guidance 只作为 advisory 信息注入，而不是作为竞争 owner skill 暴露。

## 提示词注入的推荐分层

建议将 prompt 注入统一收敛成三层。

### 第 1 层：页面级 CMS notice

只要页面任意位置存在 CMS 区域，就可以注入一个轻量提醒。

它的作用是告诉模型：

- 不要 invent CMS tags
- 不要猜 binding props
- 不要加 page-wide Vue runtime
- 如果要改 CMS source tag 且不确定，先去读 CMS guidance

这一层本身不转移 skill owner。

### 第 2 层：target 级 CMS region digest

仅当当前选中目标本身就是 CMS 区域时注入。

它的作用是告诉模型：

- 当前目标是已有 CMS source region
- 当前 authoring boundary 是源标签本身，而不是渲染后的子节点
- 当前编辑能力是否降级、受限或完整支持

这一层是 `page-builder-cms-region-authoring-guidance` 的上下文补充。

### 第 3 层：confirmed CMS handoff payload

仅在 CMS 浏览选择完成并确认之后注入。

它的作用是：

- 携带结构化 apply 输入
- 明确这一轮是受控 apply turn
- 将控制权交给 `cms-binding-apply`

宿主自动 handoff 就应该发生在这一层。

## tool 契约的推荐方向

当前 tool 契约方向应继续保持：

- 保留 `decisionId` / apply plan 作为硬中间态
- 保留 `apply_cms_binding` 的“无 decision 不写入”

同时建议补充以下能力。

### 安全兼容

- 当输入本质正确，只是被包装成 JSON string 时，可以安全归一化后继续解析

### 明确拒绝

当调用无效时，tool 应给出足够清晰的报错，例如：

- 缺少哪个字段
- 当前是不是调用过早
- 下一步应该先调哪个 tool

这样模型才有机会稳定修正并重试，而不会继续乱试。

## 不建议做的事情

以下几个方向不建议继续推进。

### 1. 不要再让 `brainstorming` 参与 page-builder 默认路由

这会把已经暴露过的问题重新带回来。

### 2. 不要把 `page-builder-guided-generation` 改成新的全局垄断 skill

它应该是 page-builder ordinary flow 的 controller，而不是新的通用 “You MUST use this”。

### 3. 不要把 CMS 区域编辑和 confirmed apply 合并成一个大 skill

这两个场景边界不同，应该分开。

### 4. 不要继续依赖自然语言正则式分流

路由应来自显式宿主状态，而不是猜用户表达。

应优先使用的状态包括：

- 当前 selection kind
- 当前 target 是否为 CMS region
- 是否已经存在 confirmed CMS handoff

### 5. 不要试图靠继续堆提示词来修复稳定性

当前更大的问题是 owner 表达和路由控制，而不是文字不够多。

## 为什么这是当前最合适的方案

这套方案最符合目前已经讨论过的几个关键约束：

- 它能降低 skill 误路由，但不会再引入一个更大的总控
- 它保留了 CMS authoring 边界的清晰性
- 它不会明显增加程序端自动恢复复杂度
- 它让 prompt 注入结构更可预测
- 它让普通页面编辑更高效
- 它也让模型更容易判断：当前是直接改页面、先读 CMS guidance，还是进入 confirmed apply

## 建议的后续实施顺序

如果后续将这份建议落实为新的变更，推荐实施顺序如下：

1. 收窄或移除 page-builder 工作空间中的 `brainstorming` 暴露。
2. 调整 `page-builder-guided-generation`，让它完整接管 ordinary page-builder flow，包括轻量澄清。
3. 保留并收紧 `page-builder-cms-region-authoring-guidance`，明确它只服务于已有 CMS 区域编辑。
4. 保留并收紧 `cms-binding-apply`，明确它只服务于 confirmed apply。
5. 调整宿主注入逻辑，使每个 turn 只携带一个显式 owner skill。
6. 保持页面级 CMS notice 轻量且 advisory。
7. 保持 `decide -> apply` 的硬契约，并继续提升错误信息的可执行性。

## 最终建议

当前最合适的调整方向是：

**将 `brainstorming` 从 page-builder 普通路由中移出，让 `page-builder-guided-generation` 成为 ordinary flow 的唯一主控，同时保留两个独立的 CMS 专用分支，并让宿主在每个 turn 里只表达一个 owner skill；tool 层继续坚持以硬 decision 状态约束最终写入。**

相比“继续加提示词”或“把所有逻辑揉成一个大 skill”，这套结构更简单、更安全，也更稳定。
