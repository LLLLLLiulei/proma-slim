# Page Builder Guidance 调整建议（2026-04-23）

> 相关背景文档：`docs/page-builder-cms-prompt-skill-tool-analysis-2026-04-22.md`

## 文档目的

本文用于沉淀本轮关于 page-builder 提示词注入、skill 路由、CMS authoring guidance、视觉设计 skill 分层、以及 CMS MCP tool 分层方式的进一步分析结果。

这次更新不再只停留在“理想结构”，而是加入了：

- 当前代码实现的实际状态
- 最近真实运行日志里的行为证据
- 现阶段仍然需要调整的功能项与优先级

重点不是继续堆叠更多提示词，而是明确：

- 普通页面流到底由谁主控
- 页面里“存在 CMS”与“当前正在编辑 CMS”如何严格区分
- skill 的“暴露、被提及、被实际调用”三层分别出了什么问题
- 视觉设计类 skill 和 CMS 类 skill 应该如何稳定地成为下游能力，而不是继续抢主控

## 本轮分析基于哪些输入

本次结论主要来自以下几类输入：

1. 前面对 page-builder、CMS 相关 skill、MCP tool、宿主 handoff 机制的连续讨论结果。
2. 对当前 skill 文案和职责边界的复查，重点包括：
   - `brainstorming`
   - `page-builder-guided-generation`
   - `page-builder-cms-region-authoring-guidance`
   - `cms-binding-apply`
   - `taste-skill`
   - `redesign-skill`
   - `soft-skill`
3. 对当前宿主 prompt 注入结构的复查，包括：
   - `defaultMentionedSkills`
   - `mentionedSkills`
   - `<page_builder_selection>`
   - `<page_builder_cms_guidance_notice>`
   - `<page_builder_cms_region_authoring>`
   - confirmed CMS handoff payload
4. 对 page-builder 工作区模板和 skill 文档的一致性复查，包括：
   - `apps/app/resources/templates/page-builder-workspace-claude.md`
   - `apps/app/default-skills/page-builder-guided-generation/SKILL.md`
5. 对真实运行日志的复盘，重点观察：
   - 某个 skill 是否“被暴露”
   - 某个 skill 是否“被 prompt 强提示”
   - 某个 skill 是否“真的被模型调用”
   - 续接回合是否仍然带着当前 selection 继续工作

## 先校准 3 个概念

当前很多讨论容易把 “skill 可见” 和 “skill 会触发” 混在一起。为了减少误判，先明确 3 个不同层级。

### 1. 暴露层

指 skill 是否出现在最终 prompt 的 `Skills:` 列表里。

这一层当前基本是正常的：

- workspace 初始化时会把默认 skills 复制到工作区
- prompt builder 会把这些 skills 全量列进 `Skills:`

结论：

- `redesign-skill`、`taste-skill`、`soft-skill` 当前并不是“没有暴露”
- 它们是暴露了，但暴露并不等于会被调用

### 2. 提及层

指宿主是否通过 `defaultMentionedSkills` / `mentionedSkills` / 明确文案把某个 skill 提升为当前 turn 的候选甚至“请立即调用”。

这一层当前存在明显问题：

- 普通页面 turn 本应只由 `page-builder-guided-generation` 主控
- 但当前页面只要存在 CMS 区域，普通 turn 里仍会附带 `page-builder-cms-region-authoring-guidance`
- 某些 turn 最终 prompt 中同时出现两个“请立即调用此 Skill”

也就是说，宿主虽然已经开始表达主控意图，但当前表达仍然不够纯净，竞争者仍然太多。

### 3. 执行层

指模型在真实对话里到底调用了哪个 skill / tool。

这层才是真正的“行为结果”。

本轮从真实日志里看到：

- 某些 turn 明明显式要求调用 `page-builder-guided-generation`
- 但模型实际调用的只有 `brainstorming`
- 后续进入实现时，又直接 `Read` / `Edit`
- `redesign-skill`、`taste-skill`、`soft-skill` 并没有真正被调用

结论：

- 当前问题不是“完全没有知识”
- 而是“主控表达仍然不够硬，竞争 skill 太多，技能命名也不完全一致，导致执行层选错或跳过”

## 当前实现状态快照

这部分用于明确：哪些方向已经对了，哪些地方还没有真正收口。

### 已经对齐的部分

#### 1. page-builder 普通流已经开始以 `page-builder-guided-generation` 为默认 skill

当前 `AgentView` 侧默认提及的是 `page-builder-guided-generation`，说明整体方向已经转向“普通页面流由 page-builder 专用 controller 主控”。

这是正确方向。

#### 2. confirmed CMS apply 已经保留了独立控制链

`cms-binding-apply` 仍然作为 CMS 浏览确认后的专用 controller 存在，且和 `decide -> apply` 两段式 tool 契约保持一致。

这也是正确方向。

#### 3. workspace skill 的真实调用名已经统一走 helper

当前运行时实际调用名已经明确为：

`<workspace-slug>:<skill-slug>`

这一点本身是正确的，也已经有 helper 统一生成。

### 仍未真正收口的部分

#### 1. 页面级 CMS notice 仍然在普通 turn 中带入 CMS guidance skill 候选

当前实现里，只要页面存在 CMS 区域，普通 turn 就会：

- 注入页面级 CMS notice
- 同时把 `page-builder-cms-region-authoring-guidance` 也加进 `mentionedSkills`

这与“页面里有 CMS，不代表本轮正在编辑 CMS 区域”这一原则仍然不完全一致。

#### 2. `brainstorming` 仍然在 page-builder 工作区中暴露，并且文案极强

它的描述是：

- 在任何 creative work 之前都必须使用

这个语气对于 page-builder 是明显过强的，因为 page-builder 中大量请求本来就是：

- 改一个区块
- 重做一个 section
- 调整现有页面

这些都应该由 page-builder 普通流直接处理，而不是默认升级成脑暴工作流。

#### 3. skill 文档内部仍然存在命名漂移

当前运行时可调用名已经是：

- `taste-skill`
- `redesign-skill`
- `soft-skill`

但 `page-builder-guided-generation` 文档里仍然写着旧名字：

- `design-taste-frontend`
- `redesign-existing-projects`

并且同一个 skill 文档内部又出现了新旧命名混用的情况。

这会直接降低模型“真的去调用下游 skill”的稳定性。

#### 4. 续接回合并不总是持续携带当前 selection

在真实日志中可以看到：

- 首轮“重新设计这块布局”带了 `<page_builder_selection>`
- 后续 `ok / 继续 / 好好好` 这些回合，不一定继续带 selection

这意味着后续实现阶段更依赖模型记忆，而不是宿主持续锚定当前编辑目标。

对于稳定编辑来说，这不是理想状态。

## 真实运行日志确认了什么

本轮复盘重点看了一个真实 page-builder 工作空间中的最近对话。

### 关键观察 1：默认 skills 确实暴露了

真实最终 prompt 中，可以看到以下技能都已出现在 `Skills:` 列表中：

- `page-builder-guided-generation`
- `page-builder-cms-region-authoring-guidance`
- `cms-binding-apply`
- `brainstorming`
- `taste-skill`
- `redesign-skill`
- `soft-skill`

所以：

- `redesign-skill` 当前不是“没暴露”
- 它是“暴露了但没有被实际选中调用”

### 关键观察 2：普通设计 turn 里仍然同时出现多个强候选

在真实 turn 中可以看到：

- `page-builder-guided-generation` 被标成“请立即调用”
- `page-builder-cms-region-authoring-guidance` 也被标成“请立即调用”
- 页面级 CMS notice 同时存在

这说明当前普通页面 turn 的主控表达仍然不够干净。

### 关键观察 3：真实执行层里，模型调用的是 `brainstorming`

在“重新设计 footer 布局”“彻底重新设计轮播区”等 turn 中，真实日志显示：

- 实际启动的 skill 是 `brainstorming`
- 不是 `page-builder-guided-generation`
- 也不是 `redesign-skill`

这说明：

- 仅仅把某个 skill 放进 `defaultMentionedSkills` 还不够
- 如果同时暴露一个更强势、更泛化、又带 MUST 语气的 meta skill，模型仍然可能被抢走

### 关键观察 4：进入实现后，模型往往直接 `Read` / `Edit`

在后续实现 turn 中，真实日志表现为：

- 直接 `Read`
- 直接 `Edit`
- 失败后继续 `Read` / `Edit`

而没有先进入 `redesign-skill` 或 `taste-skill`

这进一步说明：

- 视觉下游 skill 当前并没有形成稳定的“被 page-builder controller 调起”的链路
- 它们更多只是“看得见”，但不一定真的进入执行链

## 核心判断

### 判断 1：当前主问题不是“知识不足”，而是“控制权表达不够硬”

系统里已经有很多 CMS 边界知识，也有普通页面流 skill、CMS skill、visual skill。

问题不在于“没有知识”，而在于：

- 同一轮里候选太多
- 主控表达不够单一
- page 级提醒和 target 级 specialist 还没有彻底分开
- skill 命名不一致，进一步削弱了调用稳定性

### 判断 2：`page-builder-guided-generation` 的方向是对的，但还没有真正成为普通流唯一主控

它现在已经是默认 page-builder controller 的正确候选。

但从运行结果看，它还没有真正做到：

- 被稳定优先选中
- 独占普通 turn 控制权
- 稳定拉起下游 visual skill

### 判断 3：CMS 页面级提醒仍然是必要的，但应该彻底降级为 advisory

只要页面里存在 CMS 区域，模型就应该被提醒：

- 不要发明新的 CMS 标签
- 不要猜 binding props
- 不要把整页改成 Vue runtime

但这一层只应该是“全局边界提醒”，不应继续携带“像 owner 一样的 skill 候选语义”。

### 判断 4：visual skill 当前更适合作为下游 worker，而不是继续作为用户可感知的平行入口

对于普通用户来说，不应该让其感知到：

- `taste-skill`
- `redesign-skill`
- `soft-skill`

这几个技能之间的选择。

更合理的方式是：

- `page-builder-guided-generation` 负责用户对话和主控
- 它内部根据场景去调用对应视觉 worker

## 当前最需要调整的功能项

以下部分按优先级拆分。

## P0：必须优先收口的调整

### 1. 普通 page-builder turn 只能有一个 owner skill

当前最核心的调整，不是再加文案，而是让宿主真的做到：

- 普通页面 turn：只由 `page-builder-guided-generation` 主控
- 选中的是已有 CMS 区域：才切到 `page-builder-cms-region-authoring-guidance`
- 已确认 CMS 内容应用：才切到 `cms-binding-apply`

对应地：

- 普通页面 turn 中不应再显式提及 `page-builder-cms-region-authoring-guidance`
- 页面级 CMS notice 继续保留，但只做 advisory

### 2. 让“页面里有 CMS”和“当前正在改 CMS”彻底分开

当前普通 block turn 里，如果页面只是“某处存在 CMS”，仍然会把 CMS guidance skill 加进候选。

这层需要收紧为：

- page 级：只有轻量 notice
- target 级：只有当前 target 真的是 CMS source region 时，才引入 specialist guidance

否则模型仍会把普通设计流误判为 CMS editing flow。

### 3. 收窄 `brainstorming` 在 page-builder 中的可见性或优先级

当前它之所以容易抢控制权，不是因为能力强，而是因为：

- 语义过泛
- MUST 语气过强
- 刚好覆盖了“重新设计”“重新布局”这类普通 page-builder 请求

最优方向不是继续让它参与 page-builder 默认竞争，而是：

- 不在 page-builder 工作区里默认暴露它
- 或至少不让 page-builder 普通 turn 看到它作为同级候选

这一步非常关键。

### 4. 修复 visual skill 的命名漂移

当前至少需要做到以下之一：

#### 方案 A：统一 skill slug 与 frontmatter `name`

例如统一成：

- `taste-skill`
- `redesign-skill`
- `soft-skill`

然后所有 skill 文档、模板、引用都用这套名字。

#### 方案 B：如果前台名称必须保留旧别名

那就必须在 prompt 暴露层同时显示：

- 实际调用名
- 可读别名

避免模型在文档里看到旧名字、在运行时又只能调用新 slug。

当前更推荐方案 A，因为它更简单、更稳。

### 5. 让 `page-builder-guided-generation` 真正承担“主控 + 下游调度”

当前它已经写了很多主控职责，但还不够落到真实调用链上。

下一步应进一步明确：

- 普通页面首轮生成时，何时调起 `taste-skill`
- 何时把已有页面改版交给 `redesign-skill`
- `soft-skill` 是否还有必要默认暴露

重点不是让用户来选 skill，而是让 `page-builder-guided-generation` 自己决定。

## P1：重要但可在 P0 之后推进的调整

### 6. 让续接回合更稳定地保留当前编辑目标

真实日志表明，首轮带了 `<page_builder_selection>`，但后续 `ok / 继续` 回合不总是带。

这会带来几个风险：

- 模型更依赖记忆，而不是结构化上下文
- 后续实现时更容易跑偏
- 目标 block 越复杂，风险越高

建议方向：

- 当一个任务已经以“当前选中 block”为起点进入 ordinary flow 时
- 在用户尚未切换 selection、也没有明确退出当前任务前
- 宿主应持续保留该 selection 作为当前 turn 的结构化上下文

这不属于“程序自动恢复”，而是“宿主持续保留当前编辑范围”。

### 7. 收紧页面级 CMS notice 的字段语义

当前页面级 notice 中仍然带有类似 `consultSkill` 的信息，这容易让 notice 从“提醒”变成“弱路由提示”。

建议：

- page 级 notice 只保留边界提醒
- target 级 digest / targeted guidance 才携带更明确的 specialist 语义

这样更符合“page 级是 advisory，target 级才是 authoring guidance”的边界。

### 8. 重新评估 `soft-skill` 是否还需要默认暴露

当前 visual 相关 skill 中：

- `taste-skill`
- `redesign-skill`
- `soft-skill`

存在明显重叠。

在当前主问题还没解决之前，继续默认暴露三个视觉 skill 只会增加发现噪音。

建议优先级：

1. 先保证 `page-builder-guided-generation -> taste/redesign` 的稳定调用链
2. 再判断 `soft-skill` 是否值得继续默认暴露

如果没有明确场景，默认不暴露会更稳。

### 9. 让模板、skill、宿主注入、测试保持同一套话术

当前至少存在以下不完全对齐的风险：

- `page-builder-workspace-claude.md` 的原则
- `page-builder-guided-generation` 的 skill 文案
- `BuilderPage` 的实际 `mentionedSkills` 注入逻辑
- prompt 中最终显示给模型的实际名字

后续应把它们当成同一个系统来维护，而不是分别修。

### 10. 保持 `decide -> apply` 硬门禁，同时继续提升 tool 错误可执行性

当前 CMS tool 层的大方向仍然是正确的：

- `decide_cms_binding` 负责产生可执行 decision / apply plan
- `apply_cms_binding` 保持“无 decision 不写入”

这条硬边界不应被放松。

但当前仍建议继续增强两类能力：

#### 安全兼容

当输入本质正确，只是被包装成 JSON string 时，可以做安全归一化后再校验。

这不属于“程序自动恢复业务语义”，只是对常见封装形式做兼容。

#### 明确拒绝

当调用无效时，tool 需要返回更可执行的错误信息，例如：

- 缺少哪个字段
- 当前是不是调用过早
- 当前缺的是 decision 还是 target / selection / apply plan
- 下一步应该先调用哪个 tool

这样模型才有机会稳定修正并重试，而不是继续乱试或退回到直接改 HTML。

## P2：中长期可考虑的增强项

### 11. 将 “owner skill” 从概念升级为一等运行时字段

当前系统本质上仍然是通过：

- `defaultMentionedSkills`
- `mentionedSkills`
- prompt 文案

来“模拟 owner skill”。

如果后续还想进一步提升稳定性，可以考虑增加明确的运行时字段，例如：

- `ownerSkill`

让宿主直接表达：

- 这轮应该由谁主控
- 其他 skills 只是可选辅助，不是并列竞争者

这不是当前必须马上做的改动，但从长期稳定性看，这会比继续依赖 `mentionedSkills` 更稳。

### 12. 增加面向路由的专项测试

建议后续增加以下测试：

- 普通 block turn on CMS page：只应主控 `page-builder-guided-generation`
- 当前选中 CMS 区域：才应出现 `page-builder-cms-region-authoring-guidance`
- confirmed CMS apply turn：只应进入 `cms-binding-apply`
- “重新设计这块布局”类 turn：不应再被 `brainstorming` 抢走
- 首轮带 selection 的 ordinary flow，后续确认回合仍应保持目标一致性

## 当前推荐的目标结构

```text
                  ┌──────────────────────────────┐
                  │ ordinary page-builder turn   │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
              page-builder-guided-generation
                                 │
                  ┌──────────────┴───────────────┐
                  │                              │
                  ▼                              ▼
             taste-skill                  redesign-skill
        (首轮生成 / 定调)              (已有页面改版 / 精修)


        page has CMS?  ───────────────►  只注入 advisory notice
        current target is CMS? ───────►  切到 cms region specialist
        CMS selection confirmed? ─────►  切到 cms-binding-apply


existing CMS region edit turn
    └── page-builder-cms-region-authoring-guidance

confirmed CMS apply turn
    └── cms-binding-apply
          └── decide_cms_binding
                └── apply_cms_binding
```

这套结构里最关键的不是 skill 数量多少，而是：

- 普通流有且仅有一个 controller
- CMS specialist 只在确实需要时出现
- 视觉 skill 作为下游 worker，而不是并列主控

## 不建议继续做的事情

### 1. 不要让 `brainstorming` 继续参与 page-builder 默认竞争

这会把已经暴露出来的问题重新带回来。

### 2. 不要把 CMS 区域编辑和 confirmed apply 合并成一个大 skill

这两个场景边界不同，合并后只会让模型更容易混淆：

- 改表现层
- 改数据来源
- 新建绑定

### 3. 不要继续依赖自然语言正则来猜分流

分流应该来自结构化宿主状态，而不是“猜用户是不是在说 CMS”。

### 4. 不要试图靠继续堆提示词来修复稳定性

当前更大的问题是：

- owner 不够单一
- guidance 层级不够纯净
- 执行链不够明确

不是“字还不够多”。

### 5. 不要让普通用户感知 visual skill 的内部选择

用户只是在说：

- 帮我重新设计
- 这块不好看
- 改高级一点

不应该被迫理解：

- `taste-skill`
- `redesign-skill`
- `soft-skill`

这些都应该是系统内部的下游能力选择。

## 建议的实施顺序

如果后续将这份建议落实为新的变更，推荐顺序如下：

1. 收紧 ordinary turn 的 owner skill，只保留 `page-builder-guided-generation`。
2. 将页面级 CMS notice 彻底降为 advisory，不再让其顺带提起 CMS region skill 候选。
3. 将 `page-builder-cms-region-authoring-guidance` 收紧到“仅当前 target 为已有 CMS source region 时才出现”。
4. 将 `brainstorming` 从 page-builder 默认竞争中移除或显著降权。
5. 修复 visual skill 命名漂移，统一运行时名字与文档名字。
6. 明确 `page-builder-guided-generation` 到 `taste-skill` / `redesign-skill` 的内部调度规则。
7. 评估 `soft-skill` 是否仍需要默认暴露。
8. 改进 ordinary flow 的 selection 持续性，让后续确认回合不丢失当前编辑目标。
9. 增加专项测试，验证“暴露、提及、执行”三层都符合预期。

## 最终建议

当前最需要调整的，不是继续增加 prompt 内容，而是继续把 page-builder 的运行时控制面收紧成下面这套规则：

- 普通页面流只有一个主控：`page-builder-guided-generation`
- 页面级 CMS 提醒只做边界提醒，不再作为竞争 owner 的弱信号
- 只有当前 target 真的是已有 CMS 区域时，才切到 `page-builder-cms-region-authoring-guidance`
- 只有 CMS 浏览确认完成后，才进入 `cms-binding-apply`
- `brainstorming` 不再参与 page-builder 默认竞争
- visual skill 变成 `page-builder-guided-generation` 的下游 worker，并统一真实调用名

相比“继续加提示词”或者“把所有逻辑揉成一个大 skill”，这套结构更简单、更安全，也更符合当前代码和真实日志暴露出来的问题本质。
