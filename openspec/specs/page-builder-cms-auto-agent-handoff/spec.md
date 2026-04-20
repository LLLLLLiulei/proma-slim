## Purpose

定义 `page-builder` 中 CMS 选择确认后的自动 Agent handoff 行为，约束当前 Builder 会话如何自动发起一轮专用决策消息、如何注入统一结构化 payload 与 skill，以及 busy / 失败场景下如何保持用户现场。

## Requirements

### Requirement: CMS 确认选择后必须自动发起当前 Builder 会话的 Agent 回合
系统 SHALL 在用户于 `page-builder` 的 CMS 选择器中确认一次有效选择后，自动发起一轮新的 Agent 消息，并 SHALL 复用当前 Builder 正在使用的会话，而不得要求用户再手动补发一条消息。

#### Scenario: 确认选择后自动触发 handoff
- **WHEN** 用户在当前 Builder 页中确认一个有效的 `PageBuilderCmsSelectionResult`
- **THEN** 系统 SHALL 自动开始一次新的 Agent 发送
- **AND** 系统 SHALL 不要求用户再通过右侧 composer 手动点击发送

#### Scenario: 自动 handoff 复用当前 Builder 会话
- **WHEN** 系统为一次 CMS 确认结果发起自动 handoff
- **THEN** 系统 SHALL 复用当前 Builder 的 `sessionId` 与 `workspaceId`
- **AND** 系统 SHALL NOT 为该次 handoff 创建新的 Agent 会话或独立对话线程

### Requirement: CMS 自动 handoff 必须组装统一的 `PageBuilderCmsApplySkillInput`
系统 SHALL 在发起 CMS 自动 handoff 前，将确认结果组装为统一的 `PageBuilderCmsApplySkillInput`，并 SHALL 为第一阶段填入稳定的默认运行边界，而不得将关键字段留给模型自行从自由文本中反推；该输入 MUST 以 `targetSelection` 作为规范化目标入口，并 SHALL 在需要时保留 `targetBlock` 作为 parent block 上下文；该输入 MUST 原样保留新的 `sourceType` 与对应 durable payload。

#### Scenario: handoff 输入使用 selection-scoped Phase 1A 默认值
- **WHEN** 系统为一次 CMS 确认结果构建 handoff 输入
- **THEN** 系统 SHALL 生成新的 contract `version`
- **AND** 系统 SHALL 生成 `entryPoint: 'cms-browser-confirm'`
- **AND** 系统 SHALL 生成 `applyIntent: 'replace-current'`
- **AND** 系统 SHALL 生成 `workspacePolicy.scope: 'target-selection-only'`
- **AND** 系统 SHALL 生成 `workspacePolicy.allowPageRewrite: false`
- **AND** 系统 SHALL 生成 `workspacePolicy.allowCrossBlockMutation: false`
- **AND** 系统 SHALL 生成 `workspacePolicy.outputTarget: 'workspace-files/index.html'`
- **AND** 系统 SHALL 保留原始 `selection`
- **AND** 系统 SHALL 保留 `selection.siteId`
- **AND** 系统 SHALL 保留 `selection.sourceType` 及其对应的 `parentCatalogId`、`catalogId`、`catalogIds`、`contentIds` 与 `snapshot`
- **AND** 当 `selection.sourceType = contents-by-ids` 时，系统 SHALL 保留单一 `selection.catalogId`
- **AND** 系统 SHALL 保留 `targetSelection`

#### Scenario: 缺少 selection.siteId 时阻断自动 handoff
- **WHEN** 系统准备根据 CMS 选择结果构建自动 handoff 输入，但 `selection.siteId` 缺失、为空或不可用
- **THEN** 系统 SHALL 阻断本次自动 handoff
- **AND** 系统 SHALL NOT 继续构建 `cms-binding-apply` 输入
- **AND** 系统 SHALL 不得假设 `siteId = 1` 或写出任何新的 `cms-*` 标签

#### Scenario: CMS island handoff 输入显式声明 source-atomic 边界
- **WHEN** 系统为某个 `cms-island` 目标构建 handoff 输入
- **THEN** 系统 SHALL 在输入中保留该 `cms-island` 的源 CMS 标签选择器、所属 `parentBlockSelector` 与组件类型
- **AND** 系统 SHALL 在 `targetSelection` 中保留 `editBoundary: source-atomic`
- **AND** 系统 SHALL 明确声明该目标的编辑边界为整体 CMS 组件
- **AND** 系统 SHALL NOT 将预览中命中的渲染子节点选择器当作 handoff 的唯一事实目标

#### Scenario: 缺少稳定提示时不伪造可选字段
- **WHEN** 系统在 handoff 时没有稳定来源可判断 `blockTypeHint`、`blockLabel` 或 `snapshotAvailable`
- **THEN** 系统 SHALL 允许这些字段缺失
- **AND** 系统 SHALL NOT 仅依据 `selector` 字符串伪造这些字段
### Requirement: CMS 自动 handoff 必须分离可见消息、隐藏结构化 payload 与强制 skill 注入
系统 SHALL 将自动 handoff 的可见时间线文本、隐藏运行时 payload 与 skill 装载指令分离处理，以保证用户可读性与运行时稳定性同时成立；当目标是 `cms-island` 时，隐藏 payload MUST 显式表达该目标的 source-atomic 组件语义。

#### Scenario: 自动 handoff 写入短可见消息并携带隐藏 payload
- **WHEN** 系统发起一次 CMS 自动 handoff
- **THEN** 系统 SHALL 向当前会话写入一条简短的用户可见触发消息
- **AND** 系统 SHALL 通过 `composedUserMessage` 传递机器可读的结构化 handoff payload
- **AND** 系统 SHALL NOT 仅依赖用户可见消息中的自然语言来表达完整输入

#### Scenario: CMS island handoff payload 显式声明整体更新规则
- **WHEN** 系统为某个 `cms-island` 目标发送自动 handoff 消息
- **THEN** `composedUserMessage` 中的结构化 payload SHALL 显式声明该目标对应源 CMS 标签边界
- **AND** payload SHALL 显式包含 `targetSelection.editBoundary: source-atomic`
- **AND** payload SHALL 明确要求后续 agent 以整体组件级别更新该目标
- **AND** payload SHALL NOT 将渲染子节点描述为可独立写回的静态源码目标

#### Scenario: 自动 handoff 显式强制注入 `cms-binding-apply`
- **WHEN** 系统发送 CMS 自动 handoff 消息
- **THEN** 系统 SHALL 通过 `mentionedSkills` 显式指定 `cms-binding-apply`
- **AND** 系统 SHALL NOT 仅依赖用户可见消息中的 `/skill:cms-binding-apply` 文本来触发 skill 装载

### Requirement: CMS 自动 handoff 不得消费当前 composer 草稿或待发送附件
系统 SHALL 将 CMS 自动 handoff 视为独立的 programmatic send，而不得把它当作一次普通的 composer 提交，从而破坏用户当前正在编辑的草稿或待发送附件。

#### Scenario: 自动 handoff 保留当前草稿与附件
- **WHEN** 用户确认 CMS 选择时，右侧 composer 中已经存在未发送草稿或待发送附件
- **THEN** 系统 SHALL 仅发送本次自动 handoff 的短触发消息
- **AND** 系统 SHALL 保留当前 composer 草稿文本
- **AND** 系统 SHALL 保留当前待发送附件

#### Scenario: 自动 handoff 仍在当前时间线中可见
- **WHEN** 系统开始一次 CMS 自动 handoff
- **THEN** 系统 SHALL 在当前会话时间线中展示本次自动 handoff 的可见触发消息
- **AND** 系统 SHALL 不要求用户等到整轮流式完成后才看见该次触发

### Requirement: CMS 自动 handoff 在 busy 与失败场景下必须阻断或保留现场
系统 SHALL 在当前会话不适合继续发送时阻断新的 CMS 自动 handoff，并 SHALL 在失败时保留弹框与选择现场，以支持用户理解原因并重试。

#### Scenario: 会话忙碌时阻断新的自动 handoff
- **WHEN** 当前 Agent 会话正在 streaming，或当前已经存在一个未完成的 CMS handoff 请求
- **THEN** 系统 SHALL 阻断新的自动 handoff 发送
- **AND** 系统 SHALL 保持 CMS 弹框打开
- **AND** 系统 SHALL 向用户提供当前会话忙碌的明确反馈

#### Scenario: 自动 handoff 成功后关闭弹框但保留区块选中态
- **WHEN** 一次 CMS 自动 handoff 发送成功开始执行
- **THEN** 系统 SHALL 关闭 CMS 弹框
- **AND** 系统 SHALL 保留当前页面区块的选中态

#### Scenario: 自动 handoff 发送失败后保留选择结果
- **WHEN** 一次 CMS 自动 handoff 在发送阶段失败
- **THEN** 系统 SHALL 保持 CMS 弹框打开
- **AND** 系统 SHALL 保留当前已选栏目或内容结果
- **AND** 系统 SHALL 保留当前页面区块的选中态
- **AND** 系统 SHALL 允许用户在原地重试

### Requirement: CMS 自动 handoff payload 必须继承稳定 runtime locator identity 和 targeted edit guardrails
系统 SHALL 在为 `cms-island` 目标构建自动 handoff payload 时，继承与普通选区消息一致的稳定 runtime locator identity 和 source-first targeted edit guardrails，而不得只传轻量 selector 语义。

#### Scenario: 自动 handoff 为 CMS island 保留稳定 runtime locator
- **WHEN** 系统为某个 `cms-island` 目标构建自动 handoff payload
- **THEN** payload SHALL 保留该目标的 `htmlPath`、源 CMS 标签 selector、所属 `parentBlockSelector`、组件类型和 `editBoundary: source-atomic`
- **AND** 系统 SHALL NOT 要求该 payload 继续携带作者态 `sourceId`

#### Scenario: 自动 handoff 明确声明不得越界改写
- **WHEN** 系统为某个 `cms-island` 目标发送自动 handoff
- **THEN** payload SHALL 明确要求后续写入只能围绕当前 source target 进行
- **AND** payload SHALL 明确禁止修改 sibling block 或在当前目标旁边追加新的 `cms-*` 组件
- **AND** payload SHALL 明确禁止把渲染态子节点当作独立源码目标写回

#### Scenario: 自动 handoff 明确禁止 CMS slot 危险标签
- **WHEN** 系统为某个 `cms-island` 目标发送自动 handoff
- **THEN** payload SHALL 明确禁止在 `cms-catalog` / `cms-content` 的 slot 中写入 `<script>` 或 `<style>`

### Requirement: 旧页面或兼容页面的 CMS island handoff 必须保持 locator-first 语义且不改变目标类型
系统 SHALL 对来自旧页面或兼容页面的 `cms-island` 目标保持 locator-first handoff；即使作者态源码中不存在 `sourceId`，该兼容模式 MUST 继续维持 `cms-island` 语义，而不得将其静默改造成普通 block handoff。

#### Scenario: 不依赖 `sourceId` 的旧 CMS island 继续作为 `cms-island` handoff
- **WHEN** 系统为某个旧 `cms-island` 目标构建自动 handoff，且该目标仅能提供 runtime locator
- **THEN** payload SHALL 继续保留 `kind: cms-island`
- **AND** payload SHALL 继续保留 `htmlPath`、源 CMS 标签 selector、所属 `parentBlockSelector` 与 `editBoundary: source-atomic`
- **AND** 系统 SHALL NOT 因作者态 `sourceId` 缺失而把该 handoff 退化为普通 block handoff

### Requirement: CMS 自动 handoff payload 必须携带组件级 authoring contract digest
系统 SHALL 在 CMS 选择确认后的自动 handoff payload 中携带与当前选择结果相匹配的组件级 authoring contract digest，而不得只传 `selection` 与自然语言触发消息；该 digest MUST 至少覆盖当前组件、当前来源模式下的必填 props、互斥来源字段、统一 slot scope、可用 `item` 字段和禁止结构。

#### Scenario: 栏目绑定 handoff 携带 `cms-catalog` contract digest
- **WHEN** 用户确认的 CMS 选择结果对应 `cms-catalog` 写入
- **THEN** 自动 handoff payload SHALL 携带与 `cms-catalog` 对应的 authoring contract digest
- **AND** 该 digest SHALL 明确当前来源模式需要的 props 与禁止混用的字段组合
- **AND** 该 digest SHALL 明确 `cms-catalog` 当前可用的 slot 字段白名单

#### Scenario: 内容绑定 handoff 仅携带 `cms-content` 所需的 contract digest
- **WHEN** 用户确认的 CMS 选择结果对应 `cms-content` 写入
- **THEN** 自动 handoff payload SHALL 携带与 `cms-content` 对应的 authoring contract digest
- **AND** 系统 SHALL NOT 同时注入与当前内容绑定无关的 `cms-catalog` authoring 细节

### Requirement: CMS 自动 handoff payload 必须携带作者态目标快照而不是仅依赖渲染态选择器
系统 SHALL 在自动 handoff payload 中携带当前目标的作者态源码快照，使后续模型明确知道自己要修改的是作者态 HTML，而不是预览中渲染后的 DOM；当目标是普通 block 时，该快照 MUST 对应当前目标 block 的源码片段；当目标是 `cms-island` 时，该快照 MUST 对应源 CMS 标签本身的作者态 `outerHTML`。

#### Scenario: 普通 block 目标 handoff 携带当前 block 源码快照
- **WHEN** 用户选中一个普通 block 并通过 CMS 选择器确认一次绑定
- **THEN** 自动 handoff payload SHALL 携带该目标 block 的作者态源码快照或等价结构化摘要
- **AND** payload SHALL 明确要求后续写入优先保留当前 block 的宿主结构与样式壳子

#### Scenario: CMS island 目标 handoff 携带源 CMS 标签快照
- **WHEN** 用户选中一个 `cms-island` 并通过 CMS 选择器确认一次绑定
- **THEN** 自动 handoff payload SHALL 携带该源 CMS 标签的作者态 `outerHTML` 或等价源码快照
- **AND** payload SHALL 明确声明该快照对应 source-atomic 编辑边界
- **AND** 系统 SHALL NOT 仅把预览中命中的渲染子节点 selector 作为唯一事实输入
