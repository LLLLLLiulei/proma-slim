## Context

当前 `page-builder` 的主运行提示面分散在三个层级：工作区根级 `CLAUDE.md`、`page-builder-guided-generation`、`cms-binding-apply`。这些文档分别承担工作区约束、普通用户专题页引导、确认 CMS 选择后的 apply 决策，但实际内容已经出现明显交叉：

- 根级 `CLAUDE.md` 同时复述了普通专题页的提问 contract、设计 skill 调用方式和 CMS slot authoring 细节。
- `page-builder-guided-generation` 一边承担普通用户 briefing，一边仍保留“产出新的 CMS 区块”的职责，使其和受控 CMS apply flow 发生边界冲突。
- `cms-binding-apply` 自身已有正确的 Phase 1A 决策边界，但主文案内部又重复出现 siteId、pageSize、in-place replace、preserve shell 等规则，降低模型对主路径的抓取效率。

这次变更不会引入新的运行时系统，也不改变 CMS contract 或 apply tool 的底层协议；核心是重构 prompt surfaces，让模型更容易判断“当前是哪类场景”和“这一轮应该完成什么工作”。

## Goals / Non-Goals

**Goals:**
- 明确 page-builder 根级 `CLAUDE.md`、`page-builder-guided-generation`、`cms-binding-apply` 三层之间的职责边界。
- 让普通专题页生成、普通迭代、CMS 预选择、已确认 CMS apply 这几类场景具有稳定分流。
- 收缩重复提示词，把详细执行 contract 留在真正负责该场景的 skill / reference 中。
- 让文档测试验证“职责分层”而不是要求同一句规则在多个文件中重复出现。

**Non-Goals:**
- 不改动 CMS authoring contract 的字段白名单、slot scope 或 apply tool 输入协议。
- 不新增新的 CMS 运行时工具、选择器能力或 preview/export 链路。
- 不把 `_cn` skill 或 `zh-CN` 模板纳入新的主运行链路；它们仍是备用和阅读材料。

## Decisions

### Decision: 将 page-builder prompt surfaces 固定为“三层分工”

`CLAUDE.md` 只保留工作区级硬约束和场景路由；`page-builder-guided-generation` 只保留普通用户专题页 flow；`cms-binding-apply` 只保留确认 CMS 选择后的 Phase 1A 决策与 apply 执行边界。

选择这个方案，是因为当前问题的根源不是单条规则错误，而是同一条规则在多个层级重复出现。根级 prompt 适合做“路由器”，而不是做“超级 skill”；skill 主文应该只覆盖自己真正负责的工作流。

备选方案是继续在根级 `CLAUDE.md` 保留大量重复提醒，以提高首轮稳定性。没有采用这个方案，因为它会继续放大维护成本，并让模型在第一屏就读到过多与当前场景无关的细节。

### Decision: 普通专题页 flow 与 CMS apply flow 以“确认选择结果”作为分界点

当用户只是表达 CMS 意图、但尚未完成 CMS 选择时，仍处于普通引导或 CMS 预选择场景；只有在系统已经拥有确认完成的 CMS 选择结果、目标选择上下文和 apply 边界时，才进入 `cms-binding-apply`。

这样做的原因是当前最容易出错的地方就是模型把“用户想接 CMS”误判成“现在就该写 `cms-*` 标签”。用“是否已有 confirmed selection payload”做分界最稳定，也与现有 auto handoff 链路一致。

备选方案是让 `page-builder-guided-generation` 同时承担预选择和 apply 前 authoring 猜测。没有采用，因为它会继续制造普通 flow 和专用 apply flow 的职责冲突。

### Decision: `page-builder-guided-generation` 不再负责新 CMS authoring，只允许处理已有 CMS 区域

`page-builder-guided-generation` 将被明确为普通用户专题页的 briefing / confirm / generate / iterate 主控 skill。对 CMS，它只需要知道两个边界：

- 新建或重绑 `cms-*` 标签不属于普通 flow。
- 如果页面中已经有 CMS 区域，普通迭代只能在不改查询绑定的前提下、按 source-atomic 边界整体处理已有 CMS source tag，并调整其 slot 模板、内部结构和样式。

选择这个方案，是因为现有 spec 和产品目标都已经指向“受控 CMS 选择链路是唯一新建 CMS 标签的入口”。保留 guided-generation 的新 CMS authoring 职责只会让模型在普通页面生成中继续越界。

### Decision: `cms-binding-apply` 文案按“决策算法 + ready checklist”重组

`cms-binding-apply` 会保留结构化输入、三态决策、短澄清、正式 apply、contract 校验等行为，但文案组织要围绕实际执行路径展开：

1. 输入前提
2. 决策结果
3. `ready` 时的 apply checklist
4. 一次短澄清边界
5. 反例与长示例留在 reference

选择这个方案，是因为该 skill 的任务天然是“做判断并继续执行”，模型更适合读取算法式、checklist 式文案，而不是在多个章节中反复消费同一条护栏。

### Decision: 测试从“重复字符串存在性”改为“职责边界存在性”

现有文档测试会同时断言同一句规则出现在 root template、skill 和 reference 中，这会把重复永久固化。此次会把测试改成：

- 根模板只检查全局边界和场景路由。
- `page-builder-guided-generation` 只检查普通用户引导 contract。
- `cms-binding-apply` 只检查 Phase 1A 决策与 apply checklist。
- references 只检查示例与反例。

这样做的原因是文档测试本来应该保护行为边界，而不是强制复制提示词。

## Risks / Trade-offs

- [首轮 root prompt 过度精简导致模型分流不稳] → 在根级 `CLAUDE.md` 保留明确的场景矩阵和默认 skill 路由，不把它缩成只有输出路径。
- [guided-generation 缩减 CMS 细节后，对已有 CMS 区域的普通迭代可能失去必要约束] → 保留“已有 CMS 区域可调、按 source-atomic 边界处理、不得改绑定 props、遵守 canonical contract”的最小边界，并让 contract 细节继续由 reference / contract digest 提供。
- [cms-binding-apply 文案精简后漏掉关键 apply 护栏] → 把 preserve shell、in-place replace、单次澄清、same-turn apply、no sibling append 这些行为升格为 capability requirements，并让长示例保留在 reference 中。
- [文档测试重写后，备用 `_cn` / `zh-CN` 文档更容易与主运行文档漂移] → 先以主运行链路为唯一事实源，待主文档稳定后再做人工同步，而不是反向约束主链路。

## Migration Plan

1. 重写主运行文档：
   - 收缩 `apps/app/resources/templates/page-builder-workspace-claude.md`
   - 重构 `apps/app/default-skills/page-builder-guided-generation/SKILL.md`
   - 重构 `apps/app/default-skills/cms-binding-apply/SKILL.md`
2. 精简或重排相关 references，使长示例和反例留在 reference，行为边界留在主 skill。
3. 更新与 prompt 文案绑定的测试，使其按职责层级断言，而不是按重复文案断言。
4. 运行相关文档/单测验证，确认 `proposal -> specs -> design -> tasks` 所需的主运行链路都与新分层一致。
5. 在主运行文档稳定后，再决定是否同步 `_cn` / `zh-CN` 备用文档。

## Open Questions

- 当前主运行链路没有未决问题。备用 `_cn` / `zh-CN` 文档本次不进入实现范围，继续作为备用和阅读材料；如需同步，放在主运行文档稳定后的后续人工整理中处理。
