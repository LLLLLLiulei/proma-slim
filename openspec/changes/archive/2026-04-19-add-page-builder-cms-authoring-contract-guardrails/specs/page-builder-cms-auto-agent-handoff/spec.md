## ADDED Requirements

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
