## Context

当前 page-builder 的 CMS 绑定链路已经横跨多个模块：
- `apps/page-builder` 负责 CMS 选择结果、自动 handoff 与 Builder 上下文
- `apps/app` 负责默认 skills、正式 `apply_cms_binding` 工具、HTML mutation pipeline 与工作区 prompt
- `packages/page-builder-cms-rendering` 负责 `cms-catalog` / `cms-content` 运行时、模板扫描与 validator
- 若干 Markdown 引用与默认 skill 示例负责告诉模型如何写 CMS 标签

问题不在某一个模块的单点 bug，而在于 authoring contract 同时存在于多处且已经漂移：
- 示例与 skill 仍会引用运行时并不存在的字段，如 `item.url` / `item.link`
- 正式 apply 链路并未对所有 CMS authoring 错误 fail closed，部分无效模板仍可能写回
- 自动 handoff 会传 selection，但模型依然缺少“当前允许写什么、当前源标签长什么样”的稳定上下文
- 旧文档与过时引用仍可能被检索到，继续给模型提供错误示例
- 当前 turn 结束后已有 CMS 回滚 guardrail，但在同一 turn 内仍可能短暂写入无效作者态 HTML，导致预览抖动
- preview 服务当前直接读取工作区源码注入 CMS preview，缺少“当前源码无效时优先回退到最近安全预览”的降级层
- contract digest 目前主要暴露字段名数组，缺少类型、可选性、字段语义与推荐用法，导致模型虽然更少写错字段名，但仍会猜字段意义或漏写 `v-if`

本次变更的核心不是扩充更多 CMS 能力，而是收紧“允许怎么写”和“何时必须失败”的边界。

## Goals / Non-Goals

**Goals:**
- 建立单一的 CMS authoring contract，明确当前支持的组件、props、source modes、slot scope、字段白名单和禁用结构。
- 把 CMS authoring contract 从“字段名白名单”提升为“包含字段类型、可选性、语义与推荐用法”的语义合同。
- 让自动 handoff、`cms-binding-apply`、`apply_cms_binding`、validator 与相关 skill 示例统一消费同一套 contract。
- 在正式写入前增加更严格的结构化预检，并让统一 mutation pipeline 对阻断性 CMS 错误 fail closed。
- 缩短普通编辑链路把无效 CMS 作者态暴露给预览的窗口，并让 preview 对临时无效状态具备 graceful degradation。
- 保留旧页面“缺少 `site-id` 时按 `siteId = 1` 渲染”的兼容行为，但任何新建或重绑后的 CMS 标签都显式写出 `site-id`。
- 降低过时文档与错误示例对模型决策的干扰。

**Non-Goals:**
- 不重新设计 CMS Browser 的来源模式、站点选择或现有选择协议。
- 不扩充新的 CMS 组件类型，也不在本次引入未实现的 runtime 字段。
- 不允许在 CMS slot 中开放 `<script>`、`<style>` 或更自由的嵌套组件语法。
- 不承诺接管仓库里所有完全绕过 page-builder 流程的任意手写 HTML 编辑；本次优先收紧正式 handoff、skill、apply 与默认引导链路。
- 不在本次 change 中引入完整的 Vue SFC 编译器级静态分析；优先补足当前 HTML/template authoring 场景下最常见、最易误写的约束。

## Decisions

### Decision: 用一份机器可读的 contract 作为唯一真相源，再派生 skill / prompt / validator 所需视图

**Decision**
- 新增一个共享的 `CmsAuthoringContract` 定义，作为当前 CMS authoring 的唯一真相源。
- contract 至少覆盖：
  - `cms-catalog` / `cms-content` 允许的 props
  - 必填字段与互斥来源模式
  - `default / empty / error` slots 的统一 scope
  - `items[*]` 可用字段白名单
  - 字段类型、可选性、语义描述与推荐访问方式
  - 禁止结构：嵌套 `cms-*`、`<script>`、`<style>`、外层包裹 `template v-slot:*` 等
  - 旧页面兼容规则与“新写入必须显式 `site-id`”规则
- 运行时代码直接 import 该 contract。
- skills / prompts / 示例不再手写另一份自由描述，而是消费由该 contract 派生出来的紧凑 reference / digest。

**Rationale**
- 目前最主要的不稳定来源是 contract drift；如果不先消灭“多份真相”，后续继续补 validator 或 prompt 都会再次失效。
- 机器可读 contract 既能被 validator 使用，也能被 handoff/skill 序列化给模型，避免“代码一套、文档一套”。
- 仅有字段名不足以让模型稳定写对 slot 模板；字段元信息必须成为 contract 的一部分，而不是散落在示例里。

**Alternatives considered**
- 继续以 Markdown 文档作为唯一真相源，再让代码手动同步：最容易再次漂移。
- 仅靠测试约束现有散落常量：能发现部分问题，但无法为模型提供统一、稳定的输入边界。

### Decision: contract digest 与引用示例都从字段元信息派生，而不是手写维护第二份语义表

**Decision**
- 在 canonical contract 中为每个 `item` 字段补充结构化元信息，例如 `type`、`optional`、`description`、`recommendedUsage`。
- handoff digest 向模型透出当前组件/来源模式所需的最小字段元信息子集，而不是只暴露字段名数组。
- skill reference 和 contract examples 以该元信息为准更新示例、字段参考和可选字段守卫示范，避免继续手写一套与 contract 分离的解释。

**Rationale**
- 当前模型最常见的偏差已经从“明显写错不存在的字段”转向“字段名对了，但语义、可选性、模板守卫用错了”。
- 如果字段语义不进入 canonical contract，后续即使修一个示例，也会在其他 guidance 或 handoff 场景再次漂移。

**Alternatives considered**
- 在 skill 里直接手写一张字段说明表：短期有效，但仍然有同步漂移风险。
- 仅在运行时 ViewModel 上加注释：对 handoff 和 skill 没有直接帮助。

### Decision: 正式写入采用“预检 + pipeline 终检”的双层 fail-closed 校验

**Decision**
- 在 `cms-binding-apply` 与 `apply_cms_binding` 前增加结构化预检，校验：
  - source mode 与 props 组合是否合法
  - `site-id` / `catalog-id` / `ids` 等必填字段是否存在
  - slot 模板是否符合 Vue template 语法
  - 模板中访问的 `item.*`、slot 变量、组件名是否都在 contract 白名单内
  - 是否出现危险标签或禁止嵌套
- 统一 HTML mutation pipeline 保留最终 CMS validation，但不再只阻断少数错误类型；所有阻断性 CMS authoring 错误都必须让本次 mutation 失败。

**Rationale**
- 只在最终落盘阶段报错，模型已经生成了大量无效内容，反馈太晚。
- 只靠 prompt 提醒模型不要乱写，无法真正阻止字段猜测和模板语法错误。
- 双层校验能同时覆盖“输入尚未落盘前的结构问题”和“写回完整 HTML 后的最终一致性问题”。
- 但双层校验仍不足以解决 preview 抖动；还需要在 preview/turn guardrail 层补一层“无效时不直接暴露”的保护。

**Alternatives considered**
- 只保留 mutation pipeline 终检：实现更省，但错误反馈过晚，且技能层仍不清楚哪里错了。
- 只在 skill 层做校验：无法覆盖其它正式写入路径，且最终 HTML 仍可能因拼装细节失效。

### Decision: preview 对临时无效的 CMS 作者态优先回退到最近一次安全版本，而不是把失败直接暴露为最终预览状态

**Decision**
- 为 page-builder workspace preview 增加“最近一次安全 CMS 作者态”概念。
- 当当前 `index.html` 的 CMS authoring 校验失败，且失败属于可识别的 CMS authoring 问题时，preview 优先使用最近一次安全版本生成内容，并向调用方/会话保留结构化错误信息。
- Agent turn 结束后的回滚 guardrail 继续保留，作为最终一致性兜底；preview degrade 负责解决过程内可见抖动。

**Rationale**
- 当前系统已经做到“最终会回滚”，但还没做到“用户过程里看不到坏预览”。
- 对用户来说，过程内的 500、白屏、CMS fetch failure 和最终是否回滚是两个不同层面的稳定性问题。

**Alternatives considered**
- 只保留 turn 结束后回滚：实现更简单，但过程抖动仍然存在。
- 在每次写入前全面阻断所有 HTML 直接编辑：理论更理想，但当前架构中仍存在普通编辑路径，短期内无法一次性完全收敛。

### Decision: 自动 handoff 传递紧凑 contract digest 和源标签快照，而不是仅传 selection

**Decision**
- CMS 自动 handoff 除现有 `selection`、`targetSelection` 外，还应传递：
  - 与当前组件/来源模式相关的 contract digest
  - 当前目标源 CMS 标签的 `outerHTML` 或等价源码快照
  - 当前可安全修改的边界说明，例如“整体替换该源标签，不得操作渲染子节点”
- digest 保持紧凑，只包含当前决策真正需要的字段和示例，而不是整份长文档。

**Rationale**
- 仅传 selection 足以表达“选了什么”，但不足以表达“应该如何写”和“当前源码长什么样”。
- 源标签快照可以直接提醒模型它面对的是作者态 HTML，而不是预览态渲染 DOM。
- 组件/模式裁剪后的 digest 能控制 token 成本。

**Alternatives considered**
- 只保留当前自然语言可见消息：最不稳定，无法防止模型脑补。
- 把整份 contract 全量注入每次 handoff：理论更完整，但 token 成本高，且噪音过大。

### Decision: 旧页面维持读时兼容，但所有正式改写都升级为显式 `site-id`

**Decision**
- 运行时继续允许旧页面在缺少 `site-id` 时按 `siteId = 1` 兼容渲染。
- 但任何通过正式 apply、重绑或新建生成的 `cms-*` 标签，都必须显式写出 `site-id`。
- validator 区分“legacy read compatibility”与“new authoring requirement”，避免把隐式默认站点继续带入新的作者态源码。

**Rationale**
- 用户已确认旧页面兼容策略，但也明确要求新写入不能再依赖 `cms-settings.json` 或隐式默认。
- 这样可以避免一次性迁移所有历史页面，同时逐步把页面收敛到显式 contract。

**Alternatives considered**
- 立即强制所有旧页面都补全 `site-id`：更彻底，但迁移面过大。
- 保持所有新写入也允许省略 `site-id`：会继续制造未来的不确定性。

### Decision: 过时 CMS 指引不再保留为“普通可引用参考”

**Decision**
- 将已确认过时的 CMS 文档与示例归档，或至少加显式 superseded 标记。
- 默认 skills、workspace prompt 与相关引用只指向当前 contract reference。
- 用测试或快照校验关键引用中的字段名、props 与 contract 一致。

**Rationale**
- 即使代码和 validator 已收紧，只要模型还能检索到旧示例，错误仍会持续出现。
- 文档治理必须成为 contract 治理的一部分，而不是“实现后再看”。

**Alternatives considered**
- 仅更新 skill 主文案，不处理旧参考：误导源仍然存在，后续回归概率高。
- 直接删除所有旧文档：最干净，但对追溯历史背景不友好；归档或 superseded 更平衡。

## Risks / Trade-offs

- **[更严格的校验会让此前“碰巧可用”的写法直接失败]** → Mitigation: 为每类阻断错误返回可执行的明确原因，并保留旧页面读时兼容。
- **[contract digest 与源标签快照会增加 handoff token 成本]** → Mitigation: 只注入与当前组件和来源模式相关的最小子集，避免整份 contract 全量透传。
- **[字段白名单校验过严可能误伤合法但尚未建模的表达式]** → Mitigation: 首版优先支持明确受控的 `item` 字段访问语法，遇到未建模场景直接失败并补充 contract，而不是放任猜测。
- **[技能引用与代码 contract 仍可能再次漂移]** → Mitigation: 为关键引用建立同步测试或生成流程，确保字段名和 props 变化时能及时失败。
- **[本次只收紧正式链路，完全绕过正式工具的自由编辑仍可能存在风险]** → Mitigation: 默认 prompt / skill 统一切到新 contract，并在后续 change 中继续收紧更广泛的 targeted edit 路径。
- **[preview degrade 可能掩盖当前源码已失效的事实]** → Mitigation: 仅对可识别 CMS authoring 失败启用安全回退，同时保留显式状态消息或日志，避免 silent masking。
- **[字段元信息扩展会让 handoff digest 变大]** → Mitigation: 只下发当前组件、当前来源模式相关的最小字段元信息集合，并避免整份 contract 全量透传。

## Migration Plan

1. 定义共享 `CmsAuthoringContract`，并补全字段元信息，产出代码与人类可读引用的稳定视图。
2. 更新 CMS rendering core 的扫描、字段合同与 validator，使其直接消费该 contract，并补足常见作者态遗漏项诊断。
3. 更新 `cms-binding-apply`、默认 skills、workspace prompt 与自动 handoff，统一注入包含字段语义的 contract digest 和源标签上下文。
4. 更新 `apply_cms_binding` 与统一 HTML mutation pipeline，使阻断性 CMS validation fail closed，并在重写时显式补出 `site-id`。
5. 为 preview 与 Agent turn guardrail 增加最近一次安全版本回退能力，降低过程内 CMS 预览抖动。
6. 归档或 supersede 过时 CMS 文档，补充同步测试，防止字段/示例再次漂移。

**Rollback**
- 若严格校验短期内阻断过多工作流，可先保留共享 contract 与 handoff digest，同时将部分新校验暂时降为明确 warning，但不回退显式 `site-id` 写入与核心危险标签拦截。

## Open Questions

- 当前没有必须阻塞本次 change 的开放问题；用户已经确认：
  - 所有阻断性错误都应 fail closed
  - 旧页面只读兼容 `siteId = 1`
  - 一旦正式改写 CMS 标签，就必须显式写出 `site-id`
  - 过时 CMS 文档应被归档或显式标记为 superseded
