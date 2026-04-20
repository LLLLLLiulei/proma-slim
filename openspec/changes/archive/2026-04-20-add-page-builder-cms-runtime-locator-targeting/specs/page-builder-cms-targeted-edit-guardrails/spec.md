## MODIFIED Requirements

### Requirement: Selected CMS target edits MUST use source-first guardrails
系统 SHALL 在用户以普通选区消息编辑一个已选中的 `cms-island` 时，将该目标视为源 CMS 标签整体，而不是预览中渲染出来的子节点集合；相关隐藏上下文和运行时约束 MUST 围绕单一 source target 的 runtime locator 工作。

#### Scenario: 已选 CMS island 的下一条消息携带 source-first guardrails
- **WHEN** 用户已在 Builder preview 中选中一个 `cms-island`，并发送下一条普通消息让 Agent 修改该区域
- **THEN** 系统 SHALL 向该次消息的隐藏上下文传递该目标的 `targetSelection`
- **AND** 该 `targetSelection` SHALL 保留 `kind: cms-island`、`editBoundary: source-atomic`、`htmlPath`、`sourceSelector`、所属 `parentBlockSelector` 与组件类型
- **AND** 系统 SHALL NOT 要求该 `targetSelection` 继续携带作者态 `sourceId`
- **AND** 系统 SHALL 明确声明后续修改只能围绕该源 CMS 标签整体进行，而不得直接把渲染态 `li`、`a`、`img`、`article` 等子节点当作可独立写回的源码目标

#### Scenario: 普通 CMS 选区消息禁止越界改写
- **WHEN** 系统为一次已选 `cms-island` 的普通消息构造 guardrail
- **THEN** guardrail SHALL 明确禁止修改其他 sibling block
- **AND** guardrail SHALL 明确禁止在当前选中目标旁边追加新的 `cms-catalog` 或 `cms-content`
- **AND** guardrail SHALL 明确要求在结构不兼容时先澄清，而不是擅自把当前区域改造成新的通用列表或卡片块

### Requirement: Supported CMS target writes MUST fail closed on stale or conflicting targets
系统 SHALL 对所有显式消费 `targetSelection` 的 page-builder 正式写入路径，在目标是 `cms-island` 时执行 locator-scoped、fail-closed 的目标解析，而不得在目标失效、命中不唯一或 identity 冲突时猜测回退到其他 block。

#### Scenario: runtime locator 唯一命中时按该 source target 写入
- **WHEN** 某个正式 page-builder 写入路径收到 `kind: cms-island` 的 `targetSelection`，且其 runtime locator 在当前作者态 HTML 中唯一命中源 CMS 标签
- **THEN** 系统 SHALL 优先使用该 runtime locator 定位唯一的源 CMS 标签
- **AND** 系统 SHALL 仅允许围绕该 source target 执行本次写入

#### Scenario: 目标 locator 冲突或命中不唯一时阻断写入
- **WHEN** 某个正式 page-builder 写入路径解析 `cms-island` 目标时，发现 locator 指向的目标不存在、命中不唯一、组件不匹配或 parent block 校验失败
- **THEN** 系统 SHALL 阻断本次写入
- **AND** 系统 SHALL NOT 猜测回退到 parent block、相邻 CMS 标签、旧 `sourceId` 或其他结构相似的目标
