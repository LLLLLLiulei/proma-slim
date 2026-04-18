## Context

当前 CMS 相关作者态链路已经分成两类：

- 受控 CMS apply 链路：通过 CMS 浏览器确认结果、`cms-auto-agent-handoff`、`cms-binding-apply` skill 和 `apply_cms_binding` 工具完成，约束相对完整。
- 普通选区消息链路：用户在 preview 中选中目标后直接发送下一条消息，系统只会注入 `<page_builder_selection>` 隐藏上下文，后续仍主要依赖模型根据 prompt 自行遵守边界。

这两条链路对 `cms-island` 的约束强度并不一致。现有 preview 运行时可以把渲染结果映射回源 CMS 标签 selector，并标记 `editBoundary: source-atomic`，但它仍以 selector snapshot 为主身份表达。与此同时，CMS validator 已能识别 `<script>` / `<style>` 等危险标签，却没有在所有支持的作者态 mutation 写入边界上 fail-closed。

本次变更跨越 shared types、preview runtime、selection/handoff payload、manifest/validation、page-builder HTML mutation 以及 workspace guidance，属于典型的跨模块 guardrail 收口。

## Goals / Non-Goals

**Goals:**

- 为顶层 `cms-catalog` / `cms-content` 建立稳定的 source identity，并在 preview 选择、CMS 选择结果与自动 handoff 中统一传递。
- 让普通选区消息链路与 CMS 自动 apply 链路对 `cms-island` 使用一致的 source-first guardrail 语义。
- 在支持 `targetSelection` 的正式 page-builder 写入路径中，对 `cms-island` 执行 source-scoped、fail-closed 的目标解析。
- 将 CMS slot 内的 `<script>` / `<style>` 约束升级为阻断性写入校验，而不是仅返回 diagnostics。
- 对旧页面保持兼容：旧的无 source id CMS 标签仍可继续工作，但遇到歧义时必须失败而不是猜测。

**Non-Goals:**

- 不改变 CMS 数据查询能力、栏目/内容 source mode 或站点选择协议。
- 不把渲染后的完整 DOM 片段直接作为 Agent 可编辑输入传递。
- 不试图为所有任意文件写入场景立即建立通用 AST 级 diff 审计框架。
- 不调整非 CMS block 的普通选择、内联文字编辑或图片替换语义。

## Decisions

### 1. 为 `cms-island` 引入持久化 `sourceId`，并保留 selector 作为兼容回退

顶层 `cms-catalog` / `cms-content` 将引入新的稳定 source identity，并通过 shared `PageBuilderCmsIslandTargetSelection`、manifest entry 和 preview 注解属性贯通。`selector` 仍保留，但降级为兼容定位与调试信息；当 `sourceId` 和 `selector` 同时存在时，正式写入路径优先按 `sourceId` 解析，`selector` 仅用于一致性校验和旧页面兼容。

选择这个方案的原因：

- 结构性 selector 在节点插入、同类标签重排后容易漂移。
- `sourceId` 可以让“预览命中了谁”和“源码该改谁”脱离 `nth-of-type` 路径耦合。
- 保留 `selector` 可避免一次性打破旧页面和现有工具输入。

替代方案：

- 继续只依赖 selector snapshot：实现最小，但无法消除结构漂移。
- 用 `blockId + islandIndex` 组合代替 source id：比 selector 稳定一些，但在同 block 多 island 增删时仍会漂移。

### 2. 统一普通选区消息和 CMS 自动 handoff 的 CMS guardrail 语义

普通“选中区块后发送下一条消息”的隐藏上下文将不再只传轻量 `selectionSemantics`，而是与 CMS 自动 handoff 共享一套更强的 source-first CMS guardrail 表达。两条链路都必须明确：

- 当前目标是源 CMS 标签，而不是渲染子节点。
- 必须整体更新该 source target，不能改兄弟 block，不能在旁边追加新的 CMS 组件。
- 不得向 `cms-*` slot 中写入 `<script>` / `<style>`。

选择这个方案的原因：

- 现有自动 handoff 已有更强的自然语言约束，普通选区消息链路与之长期分叉会继续产生行为不一致。
- 共享 guardrail 生成逻辑能降低 prompt 漂移和回归风险。

替代方案：

- 只给普通选区消息增加更多 JSON 标志位：机器可读性更强，但对模型执行面的约束不足。
- 仅修改 workspace 模板说明：改动小，但不能解决不同入口语义不一致的问题。

### 3. 支持 `targetSelection` 的正式写入路径必须对 `cms-island` 做 source-scoped fail-closed 解析

凡是支持 `targetSelection` 的 page-builder 正式写入路径，在收到 `kind: cms-island` 目标时，都应执行统一的解析策略：

- 优先按 `sourceId` 定位唯一源 CMS 标签。
- 若缺少 `sourceId`，允许按 `selector` 兼容回退。
- 若 `sourceId` 与 `selector` 对不上、任一定位结果不唯一或目标已失效，则直接失败并要求重新选择。

该策略至少覆盖：CMS apply tool、区块删除等已经围绕 `targetSelection` 工作的正式 HTML mutation 入口；这些入口在进入统一 HTML mutation pipeline 前就要完成目标收敛。

选择这个方案的原因：

- “猜一个最像的 block”会直接破坏 source-atomic 语义。
- fail-closed 比 silent fallback 更适合作者态场景，用户可以重新选择，但不能容忍误改别的区块。

替代方案：

- 仅靠 prompt 约束模型：对直接文件编辑没有可靠兜底。
- 在 mutation 之后再做全文 diff 审计：理论上更强，但实现和回滚成本明显更高，适合后续独立演进。

### 4. 危险标签阻断分两层做：工具入口直接拒绝，统一 mutation pipeline 再兜底

`templateBody` / `emptyTemplate` / `errorTemplate` 将新增危险标签检查，`apply_cms_binding` 在构造 `cms-*` 前就直接拒绝 `<script>` / `<style>`。同时，统一 HTML mutation pipeline 在执行 CMS rendering validation 后，若存在阻断性 `DANGEROUS_TAG` error，也必须拒绝落盘并回滚派生产物。

选择这个方案的原因：

- 单层防御不足以覆盖所有入口。
- 工具入口先拒绝能给出更直接的错误，pipeline 再兜底可以覆盖其它复用该校验器的写入路径。

替代方案：

- 仅依赖 validator diagnostics：现在已经证明不够，因为错误可以被发现但仍被写入。
- 只在 prompt 中声明禁止：没有正式系统边界。

### 5. 对旧页面采用“兼容运行、增量收敛”的迁移策略

旧的 `cms-*` 标签暂时允许没有 `sourceId`。在这类页面上：

- preview 和 selection 仍可继续工作；
- target 解析允许按 selector 回退；
- 只要出现不唯一或失配，就直接失败；
- 一旦页面经过受支持的 CMS 写入路径更新，应补齐缺失的 source id，使后续链路进入稳定模式。

选择这个方案的原因：

- 不需要一次性迁移所有旧页面。
- 可以把稳定身份的收敛嵌入后续正常作者态编辑流程。

替代方案：

- 打开 preview 时静默重写所有页面补 source id：落地快，但会在无显式作者动作的情况下改写源码。
- 要求先跑一次离线迁移：流程更重，不适合当前 Builder 日常迭代场景。

## Risks / Trade-offs

- [旧页面在未补 source id 前仍需 selector 回退] → 通过 fail-closed 规则限制风险，只要不唯一就阻断。
- [shared `targetSelection` 协议变更会波及 preview、CMS dialog、auto handoff、tool schemas 和测试] → 统一先从 shared type 和 contract examples 收敛，再分层更新调用方。
- [普通选区消息链路仍然无法对所有任意文件写入做强制拦截] → 先统一 source-first hidden context 和 workspace guidance，再在正式 `targetSelection` 写入路径中落实 fail-closed enforcement。
- [给作者态源码新增内部 source id 属性会增加 HTML 噪声] → 使用稳定的内部命名并限制在顶层 `cms-*` 标签，避免扩散到普通静态节点。

## Migration Plan

1. 扩展 shared targetSelection 与 manifest contract，加入 `cms-island.sourceId`。
2. 更新 preview bootstrap / bridge / selection / CMS dialog / auto handoff，使新身份贯穿前端链路。
3. 更新 HTML mutation pipeline 与 `apply_cms_binding`，落实危险标签阻断和 source-scoped fail-closed 解析。
4. 更新 workspace template、CMS apply skill 和 contract examples，使普通选区消息链路与受控 apply 链路使用一致约束。
5. 为旧页面保留 selector 回退，并在受支持的 CMS 写入路径中补齐 source id。

回滚策略：

- 如果新 source id 解析出现严重兼容问题，可暂时仅保留 `selector` 路径作为回退，但必须继续保留危险标签阻断逻辑。
- 由于本次主要增加内部属性与更严格校验，回滚不需要数据迁移，只需恢复旧类型和解析逻辑。

## Open Questions

- 当前阶段不额外引入通用 post-write diff 审计；如果后续仍发现普通 Agent 直接写文件导致跨 block 误改，再单独起 change 处理“选中目标范围内写入审计”。
