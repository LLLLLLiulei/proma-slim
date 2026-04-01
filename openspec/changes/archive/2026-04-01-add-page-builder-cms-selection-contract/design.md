## Context

当前 `page-builder` 已经具备：

- `BuilderPage` 持有页面区块选择状态与当前选中 `selector`
- `PreviewPane` 和区块工具条可以围绕已选区块打开 `CmsBrowserDialog`
- `CmsBrowserDialog` 已经支持栏目多选、内容固定条目勾选、分页与确认

但这条链路在“确认选择之后”仍然停留在 UI 结果层。当前 [`CmsBrowserDialog.tsx`](/Users/liu/Documents/work/learning/Proma/apps/page-builder/src/renderer/components/builder/CmsBrowserDialog.tsx) 的返回值只能表达：

- 用户当前停留在哪个页签
- 选中了哪些栏目对象或内容对象

它还不能表达：

- 这些 CMS 数据是准备绑定到哪个页面区块
- 这是“栏目选择”还是“固定内容集合选择”的绑定候选
- 哪些字段适合后续持久化，哪些只是本次确认时的快照

如果不先建立这层选择协议，后续的绑定模型、模板渲染和 Agent / 宿主协同都会建立在一个不稳定的 UI 返回值之上。

本次设计需要在不引入绑定持久化、不处理模板渲染、也不支持“最新 N 条”等动态查询语义的前提下，把现有 CMS 弹框升级为“区块绑定候选生成器”。

## Goals / Non-Goals

**Goals:**

- 定义 CMS 选择器打开时需要接收的区块上下文输入结构。
- 定义 CMS 选择器确认时返回的统一结构化结果，而不是继续返回原始 UI 选择结果。
- 在协议中显式区分两类固定选择语义：
  - 栏目选择
  - 固定内容条目选择
- 让确认结果可以携带当前目标区块 `selector`，为后续绑定模型提供稳定输入。
- 将后续真正可持久化的字段与仅供当前确认态显示的快照字段拆开。
- 保持现有 CMS 弹框 UI 主体不被大幅推翻，尽量在现有多选栏目 / 固定内容勾选能力上升级协议。

**Non-Goals:**

- 不支持“某栏目最新 N 条”“动态查询结果”等查询型内容来源。
- 不定义 Module 3 所需的 binding 持久化结构、存储位置或生命周期。
- 不定义 `renderMode`、模板 ID、模板配置或页面刷新策略。
- 不实现 CMS 选择确认后的自动回填、自动改写页面或 Agent 自动继续执行。
- 不在本次引入稳定 `blockId`；目标区块上下文仍以 `selector` 为主。

## Decisions

### 1. 将协议拆成“输入上下文 contract”和“确认结果 contract”两层

本次不把 CMS 选择协议设计成一个单独的返回值扩展，而是明确拆成两层：

```text
BuilderPage / Agent path
  -> 打开 CMS 选择器
  -> 传入当前目标区块上下文

CmsBrowserDialog
  -> 用户确认选择
  -> 返回统一结构化结果
```

建议输入 contract 至少包含：

- `targetBlock.selector`
- 可选的 `entryPoint`，例如 `block-toolbar` / `agent-flow`

建议输出 contract 至少包含：

- `version`
- `targetBlock.selector`
- `selectionKind`
- `sourceType`
- `selectionMode`
- `catalogIds`
- `contentIds`（仅内容结果）
- `snapshot`

这样做的原因：

- “选到了什么”与“这些结果准备给哪个区块”是两类不同信息，应该从 contract 层明确区分。
- 后续无论是区块工具条路径还是对话触发路径，都可以复用同一个输入 / 输出结构。
- 这能避免未来把 `selector` 通过闭包、局部状态或上层额外拼装回结果对象，导致结果协议不完整。

备选方案：

- 只定义输出结果，不定义输入上下文。缺点是选择器对目标区块完全无感，结果对象只能由上层二次拼接，协议边界会变得模糊。

### 2. 输出结果使用判别联合，而不是延续 `tab + catalogs[] + contents[]` 的松散结构

当前 `CmsBrowserDialogSelection` 是一个“两个数组二选一”的轻量结构。它适合 UI，但不适合作为绑定候选协议。

本次建议将输出结果改为判别联合，至少分为两类：

```text
catalogs
  - sourceType: catalogs
  - selectionMode: single | multiple

contents
  - sourceType: contents-fixed
  - selectionMode: fixed-items
```

这样做的原因：

- 后续消费方可以先按 `selectionKind` / `sourceType` 分流，再读取对应字段，不需要再根据空数组猜测语义。
- `tab` 只是 UI 当前页签，并不等同于业务语义；真正重要的是“栏目绑定候选”还是“固定内容集合绑定候选”。
- 判别联合更适合作为共享类型放到 `packages/shared`，供 renderer、host 和后续 binding 层共同消费。

备选方案：

- 保持 `tab + catalogs[] + contents[]`，只额外附加 `targetBlockSelector`。缺点是仍然把 UI 概念暴露为业务协议，后续很快会失稳。

### 3. 第一版只编码“固定条目”语义，不为未来的动态查询预留半成品字段

产品已明确：当前阶段不处理“最新 N 条”。因此本次设计不引入：

- `latest-by-catalog`
- `querySpec`
- `limit`
- `dynamic-query`

第一版只保留三种选择语义：

- 栏目单选
- 栏目多选
- 固定内容多选

这样做的原因：

- 可以让协议与现有弹框能力完全对齐，不需要为了未来能力引入当前 UI 无法稳定采集的字段。
- 避免出现“字段已经有了，但没有可用 UI 和运行时语义”的空壳设计。
- 后续如果真的增加动态查询，可以通过协议版本扩展或新增 union 分支演进。

备选方案：

- 现在就预留 `querySpec?: null` 之类字段。缺点是会让第一版协议看起来像在承诺一个尚未存在的能力。

### 4. 结果中同时保留 durable payload 和 snapshot，但两者职责必须分离

本次结果协议建议明确区分两层数据：

`durable payload`
- `catalogIds`
- `contentIds`
- `selectionKind`
- `sourceType`
- `selectionMode`
- `targetBlock.selector`

`snapshot`
- `catalogs`
- `contents`

其中 durable payload 面向后续绑定模型；snapshot 面向当前确认态展示、摘要回显和调试。

这样做的原因：

- 后续 Module 3 需要的是稳定可持久化的数据，而不是本次交互时临时拿到的完整对象快照。
- `snapshot` 仍然有价值，因为确认态 UI 和 Agent 回显都可能需要标题、栏目名、内容摘要等信息。
- 如果不拆开，两种用途会混在一起，后续很容易把临时快照误当成绑定真相。

备选方案：

- 只返回 IDs。缺点是当前交互结束后就丢失了用户刚刚选择的可读信息，不利于确认态和可观测性。
- 只返回完整对象。缺点是后续持久化和比较更新会变重，也会让协议更脆弱。

### 5. 内容结果中的 `catalogIds` 采用“从已选内容去重得到的所有栏目 ID”，而不是仅依赖当前选中栏目

尽管当前 UI 实际上是“左侧单栏目选择，右侧固定内容勾选”，本次结果协议仍建议为内容结果保留 `catalogIds: string[]`，并由已选内容的 `catalogId` 去重得到。

这样做的原因：

- 协议层不应过度绑定当前 UI 实现；即使后续内容选择支持跨栏目固定集合，协议也不需要改形状。
- 对后续 binding 层来说，同时拿到 `catalogIds` 和 `contentIds` 更利于推导来源范围。
- 即便第一版通常只得到一个栏目 ID，数组形式也更稳定。

备选方案：

- 仅返回当前左侧选中的单个 `catalogId`。缺点是协议隐含依赖当前 UI 结构，扩展性较差。

### 6. `BuilderPage` 继续作为区块上下文的拥有者，`CmsBrowserDialog` 只消费传入的目标区块

当前 `BuilderPage` 已经拥有：

- `selectedSelector`
- `cmsBrowserOpen`
- 区块工具条打开弹框的主路径

本次保持这一边界：

- `BuilderPage` 负责决定当前是否存在有效目标区块
- `BuilderPage` 打开 `CmsBrowserDialog` 时传入目标区块上下文
- `CmsBrowserDialog` 不自行推导或缓存目标区块来源

这样做的原因：

- 目标区块上下文本来就属于 Builder 工作流，而不是 CMS 浏览弹框的本地业务状态。
- 这样可以避免弹框在打开期间再去耦合预览桥接、区块选择或消息装饰器逻辑。
- 后续如果 Agent 流程也要打开同一个弹框，只需要提供同样的 request context 即可。

备选方案：

- 让 `CmsBrowserDialog` 自行从全局状态或其他上下文读取目标区块。缺点是会扩大组件职责，并让选择协议的来源变得隐式。

### 7. 本模块不强迫 UI 重做，只在现有确认时机生成结构化结果

当前 CMS 弹框已经有明确的确认交互：

- 栏目页签：多选栏目 → 点击确认
- 内容页签：勾选固定内容 → 点击确认

本次设计不要求重做交互，而是在现有确认动作发生时，把结果从原始 UI 结构映射为统一协议。

必要的 UI 变化只限于：

- 可选地在弹框内展示当前目标区块摘要，以增强“这是给哪个区块选数据”的感知
- 不新增动态查询模式切换

这样做的原因：

- Module 2 的核心是协议，而不是新的浏览 UI。
- 保持 UI 稳定有利于后续把实现风险集中在类型、数据流和事件回调上。

备选方案：

- 在本次同时加入更多交互模式。缺点是会把协议设计与后续高级选择能力耦合在一起，范围失控。

## Risks / Trade-offs

- [Risk] `selector` 作为目标区块标识仍然不稳定，后续页面结构变化可能导致绑定目标漂移
  → Mitigation: 本模块只把 `selector` 作为当前阶段 contract；在 Module 3 中再讨论是否引入稳定 `blockId`。

- [Risk] `snapshot` 与后续真实 CMS 数据可能发生漂移
  → Mitigation: 在 design 中明确 `snapshot` 仅供确认态和展示使用，不作为后续持久化真相。

- [Risk] 当前协议只覆盖固定条目，未来引入“最新 N 条”时可能需要扩展 union 分支
  → Mitigation: 保留 `version` 字段，并使用判别联合，后续新增分支时不会破坏现有固定条目语义。

- [Risk] 若对话触发路径未来允许“未选中区块也能打开 CMS 选择器”，本协议会出现缺少目标区块的问题
  → Mitigation: 保持 Module 2 假设“选择器打开前已有目标区块”；无目标区块的处理继续留在主工作流层解决。

- [Risk] 内容结果返回 `catalogIds[]` 可能看起来比当前 UI 复杂
  → Mitigation: 在共享类型注释和测试中明确其语义是“已选内容来源栏目去重集合”，而不是要求 UI 支持跨栏目勾选。

## Migration Plan

1. 在 `packages/shared` 中新增或升级 CMS 选择器输入 / 输出相关类型，定义统一的结果协议。
2. 调整 `CmsBrowserDialog` props，使其在打开时接收目标区块上下文，并在确认时返回结构化结果。
3. 在 `BuilderPage` 中把当前 `selectedSelector` 作为 request context 传入 `CmsBrowserDialog`。
4. 更新 CMS 弹框测试，覆盖栏目单选 / 多选、固定内容多选以及目标区块上下文透传后的确认结果结构。
5. 为后续 Module 3 保留 clear handoff：后续绑定模型直接消费 Module 2 的结构化结果，而不再依赖原始 UI 返回值。

回滚策略：

- 若协议升级带来下游联调问题，可先让 `CmsBrowserDialog` 同时保留旧的原始返回值和新的结构化结果一段时间，再在后续 change 中完全切换。

## Open Questions

- 弹框头部是否需要显示当前目标区块的简要摘要，以强化“这是对哪个区块进行绑定”的心智模型？这不阻塞协议定义，但会影响最终交互清晰度。
- 如果未来 Agent 流程也复用该选择器，是否需要把 `entryPoint` 正式纳入 request context，还是等该路径真正实现时再补？
