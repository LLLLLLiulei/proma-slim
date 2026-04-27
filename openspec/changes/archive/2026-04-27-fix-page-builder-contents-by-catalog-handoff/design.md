## Context

当前 `contents-by-catalog` 的 confirmed handoff 会把 CMS 浏览树节点里的 `selection.snapshot.catalog` 原样送入 `PageBuilderCmsApplySkillInput.selection`。该树节点来自 `/api/catalogsTree`，而这一路返回的 `total`、`path`、`hasChild` 与真实栏目内容列表并不总是一致。后续 `cms-binding-apply` 会把这些树节点字段当作正式来源事实，从而把可绑定的目录误判为“空目录”或 malformed payload。

这次变更只修 `contents-by-catalog` 这条 confirmed handoff 与决策链路，不重构 CMS 浏览器树、不替换浏览阶段的数据源，也不修改外部 `PageBuilderCmsSelectionResult` 协议。目标是在最小改动范围内，为 Agent 决策建立稳定的信任边界。

## Goals / Non-Goals

**Goals:**
- 在 `contents-by-catalog` confirmed handoff 进入 agent 决策前，基于 `siteId + catalogId` 重新解析权威栏目和最小内容探针。
- 保留用户确认时的原始 `selection`，同时为 handoff / skill 输入增加独立的 authoritative source context。
- 让 `cms-binding-apply` 在 `contents-by-catalog` 场景下优先使用权威来源上下文，而不是继续依赖树节点 `snapshot.catalog.total`。
- 让内容目录当前无内容时仍可作为合法的 `cms-content` 绑定来源，以便后续使用 `emptyTemplate` 表达空态。
- 让 `cms-binding-apply` 的兼容性判断只基于目标结构、authoring contract 和运行时边界，而不是基于 CMS 内容主题是否像当前静态模块文案。

**Non-Goals:**
- 不移除 CMS 浏览器对 `/api/catalogsTree` 的浏览用途。
- 不把 CMS 树浏览改成 lazy loading 或按需子节点拉取。
- 不修改 `contents-by-ids`、`catalogs-by-parent` 或 `catalogs-by-ids` 的决策语义，除非为了共享内部结构而发生纯实现层复用。
- 不在本次变更中调整正式 `apply_cms_binding` 的模板 contract。

## Decisions

### Decision: 保持外部 selection contract 不变，在 handoff 输入中增加内部 authoritative source context

`PageBuilderCmsSelectionResult` 继续表示“用户在 CMS 浏览器中确认了什么”，不承载宿主后补的事实纠偏。`PageBuilderCmsApplySkillInput` 新增一个仅供 confirmed handoff / skill 消费的 authoritative source context，用来表达宿主重新解析后的栏目 metadata 与最小 contents probe 结果。

这样做的原因：
- 保留审计价值：日志里仍能区分“用户当时选中的树节点快照”和“宿主判定时使用的权威来源”。
- 降低改动面：不需要改 Builder 前端选择器结果协议，也不会影响现有 UI 状态管理。
- 明确信任边界：agent 决策可以被要求显式优先使用 authoritative source context。

替代方案：
- 直接在后端覆写 `selection.snapshot.catalog`。代价是语义混淆，后续难以从日志判断用户原始选择与宿主纠偏的区别。
- 修改前端在确认前自行补查权威数据。代价是 UI 逻辑更复杂，而且真正的信任边界仍然应该在宿主后端。

### Decision: authoritative refresh 放在后端 `cms-auto-handoff` 阶段，而不是浏览阶段

confirmed handoff 的路由和服务层已经是正式进入 `cms-binding-apply` 链路的边界，因此 authoritative refresh 放在 `createPageBuilderCmsAutoAgentHandoff` 之前最合适。这里可以复用宿主已有 CMS gateway，按 `siteId + catalogId` 查询：
- 精确栏目 metadata：`/api/page-builder/cms/catalogs?ids=<catalogId>`
- 最小 contents probe：`/api/page-builder/cms/contents?catalogId=<catalogId>&pageSize=1`

这样做的原因：
- 后端是最终事实源，不能把“刷新成功与否”的责任放给前端。
- 同一条 confirmed handoff 无论来自哪个 UI 入口，都能共享同一套纠偏逻辑。
- 可以在失败时统一阻断 handoff，而不是让前端和 agent 各自做一套兜底。

替代方案：
- 仅在前端确认时发额外查询。代价是后端仍会接收并注册不可信的树节点快照，系统边界没有真正收紧。

### Decision: authoritative refresh 失败时 fail closed，不回退到树节点 snapshot

如果精确栏目查询或 contents probe 失败，本次 `contents-by-catalog` auto handoff 直接失败，并保留现有“保留 CMS 弹框与选择现场”的失败反馈机制。系统不得回退去信任 `selection.snapshot.catalog`。

这样做的原因：
- 这次变更的目标就是把 `/api/catalogsTree` 从正式绑定事实源中移除。
- 如果 refresh 失败时仍回退使用树节点 snapshot，误判路径仍然存在，只是变成概率性复发。

替代方案：
- refresh 失败时降级回树节点快照。实现更简单，但不能真正修复问题。

### Decision: contents probe `total = 0` 只代表当前无内容，不自动等于 incompatible

`cms-content` 本身支持 `emptyTemplate`，因此“当前目录暂无内容”属于运行时数据状态，不应自动视为 binding 非法。`cms-binding-apply` 在 `contents-by-catalog` 场景中可以基于空目录返回 `ready`，由模板 authoring 决定是否提供空态展示；只有结构不兼容、authoring contract 不支持、或 payload 缺失关键字段时，才进入 `incompatible`。

这样做的原因：
- 真实空目录仍可能是合法的动态数据源。
- 这能同时修复“误判为空目录”和“真实空目录也被过度拒绝”两个问题。

替代方案：
- `total = 0` 时统一返回 `needs-clarification`。更保守，但会给正常的空态绑定引入多余交互。

### Decision: 兼容性只按结构与 contract 判断，不按内容主题相似度判断

`cms-binding-apply` 的职责是判断当前目标是否能被选中的 CMS 数据结构安全驱动，而不是判断“新闻内容是否适合当前写着汽车文案的模块”这类语义匹配问题。只要当前目标壳层可以由可用字段、支持的 slot 结构和运行时边界驱动，就应继续走 `ready` 或必要的结构性澄清，而不是因为主题不一致拒绝绑定。

这样做的原因：
- Builder 当前静态区块里的标题、摘要、行业词经常只是占位文案，不能作为数据源兼容性的事实依据。
- 语义相似度属于创意判断，交给这个 skill 会导致稳定性差、误拒绝高。
- 本次 change 的目标是修 confirmed handoff 的事实边界与结构兼容性，不是增加内容策划层判断。

替代方案：
- 继续允许 agent 按当前模块文案和 CMS 内容主题做“是否适配模块”的主观判断。代价是会重复引入误判，并与 authoritative source / empty-state-capable 的方向冲突。

## Risks / Trade-offs

- [新增内部 handoff 字段会扩大 skill 输入体积] → 只为 `contents-by-catalog` 增加最小字段，contents probe 仅保留 `total` 和少量样本项，避免上下文膨胀。
- [skill 文档更新不完整会导致 agent 继续参考旧的 `selection.snapshot.catalog`] → 同步更新主 skill 文案、content authoring reference 和相关 contract tests，明确 authoritative source context 优先级。
- [未明确禁止语义型 gating 会让 agent 继续按主题匹配误拒绝] → 在 spec、主 skill、shared rules 和 contract examples 中统一声明“只按结构兼容判断”，并补测试锁定。
- [refresh 失败直接阻断会让某些临时上游异常更显性] → 复用现有 auto handoff 失败保留现场机制，让用户可以原地重试，而不是静默生成错误决策。

## Migration Plan

1. 扩展 `PageBuilderCmsApplySkillInput` 的内部 authoritative source context 定义，并保持外部 selection contract 不变。
2. 在 `page-builder-cms-auto-agent-handoff-service` 中为 `contents-by-catalog` 增加 authoritative refresh，并在 handoff 注册与发送前写入新的内部上下文。
3. 更新 `cms-binding-apply` skill 文案与 reference，明确优先使用 authoritative source context，且空目录不自动拒绝，并明确只按结构 / contract 兼容性判断。
4. 更新相关 unit / contract tests，覆盖：
   - 树节点 `total = 0` 但 authoritative contents probe `total > 0`
   - authoritative refresh 失败时阻断 handoff
   - authoritative contents probe `total = 0` 时仍允许内容绑定进入可用路径
   - 当前模块文案与 CMS 内容主题不一致，但结构与 contract 兼容时仍保持 `ready`

回滚策略：
- 如需回滚，只需移除新的 authoritative source context 和 refresh 逻辑，confirmed handoff 将恢复为直接依赖原始 selection snapshot。

## Open Questions

- None.
