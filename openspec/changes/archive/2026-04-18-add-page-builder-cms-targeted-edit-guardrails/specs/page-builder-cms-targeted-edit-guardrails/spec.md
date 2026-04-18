## ADDED Requirements

### Requirement: Selected CMS target edits MUST use source-first guardrails
系统 SHALL 在用户以普通选区消息编辑一个已选中的 `cms-island` 时，将该目标视为源 CMS 标签整体，而不是预览中渲染出来的子节点集合；相关隐藏上下文和运行时约束 MUST 围绕单一 source target 工作。

#### Scenario: 已选 CMS island 的下一条消息携带 source-first guardrails
- **WHEN** 用户已在 Builder preview 中选中一个 `cms-island`，并发送下一条普通消息让 Agent 修改该区域
- **THEN** 系统 SHALL 向该次消息的隐藏上下文传递该目标的 `targetSelection`
- **AND** 该 `targetSelection` SHALL 保留 `kind: cms-island`、`editBoundary: source-atomic`、源 CMS 标签选择器、所属 `parentBlockSelector` 与组件类型
- **AND** 当稳定 `sourceId` 可用时，系统 SHALL 一并传递该 `sourceId`
- **AND** 系统 SHALL 明确声明后续修改只能围绕该源 CMS 标签整体进行，而不得直接把渲染态 `li`、`a`、`img`、`article` 等子节点当作可独立写回的源码目标

#### Scenario: 普通 CMS 选区消息禁止越界改写
- **WHEN** 系统为一次已选 `cms-island` 的普通消息构造 guardrail
- **THEN** guardrail SHALL 明确禁止修改其他 sibling block
- **AND** guardrail SHALL 明确禁止在当前选中目标旁边追加新的 `cms-catalog` 或 `cms-content`
- **AND** guardrail SHALL 明确要求在结构不兼容时先澄清，而不是擅自把当前区域改造成新的通用列表或卡片块

### Requirement: Supported CMS target writes MUST fail closed on stale or conflicting targets
系统 SHALL 对所有显式消费 `targetSelection` 的 page-builder 正式写入路径，在目标是 `cms-island` 时执行 source-scoped、fail-closed 的目标解析，而不得在目标失效、命中不唯一或 identity 冲突时猜测回退到其他 block。

#### Scenario: `sourceId` 唯一命中时按该 source target 写入
- **WHEN** 某个正式 page-builder 写入路径收到 `kind: cms-island` 且包含稳定 `sourceId` 的 `targetSelection`
- **THEN** 系统 SHALL 优先使用该 `sourceId` 定位唯一的源 CMS 标签
- **AND** 系统 SHALL 仅允许围绕该 source target 执行本次写入

#### Scenario: 旧页面缺少 `sourceId` 时允许 selector 兼容回退
- **WHEN** 某个正式 page-builder 写入路径收到 `kind: cms-island` 的 `targetSelection`，但该目标来自仍未补齐 `sourceId` 的旧页面
- **THEN** 系统 SHALL 允许按源 CMS 标签 selector 进行兼容解析
- **AND** 系统 SHALL 继续保留 `editBoundary: source-atomic`
- **AND** 系统 SHALL NOT 因缺少 `sourceId` 而将该目标退化为普通 block 写入

#### Scenario: 目标 identity 冲突或命中不唯一时阻断写入
- **WHEN** 某个正式 page-builder 写入路径解析 `cms-island` 目标时，发现 `sourceId` 与 selector 失配、目标不存在、或任一定位结果不唯一
- **THEN** 系统 SHALL 阻断本次写入
- **AND** 系统 SHALL NOT 猜测回退到 parent block、相邻 CMS 标签或其他结构相似的目标

### Requirement: CMS slot template writes MUST reject dangerous tags
系统 SHALL 将 `cms-catalog` / `cms-content` slot 内的 `<script>` 与 `<style>` 视为阻断性危险标签，在工具入口和正式写入链路中都必须拒绝这类内容。

#### Scenario: 正式 CMS apply 工具拒绝危险标签模板
- **WHEN** `apply_cms_binding` 收到的 `templateBody`、`emptyTemplate` 或 `errorTemplate` 包含 `<script>` 或 `<style>`
- **THEN** 工具 SHALL 直接拒绝该输入
- **AND** 工具 SHALL NOT 继续生成外层 `cms-*` 标签或落盘 HTML

#### Scenario: 统一 mutation pipeline 阻断危险标签写入
- **WHEN** 某次 page-builder HTML mutation 的 CMS validation 结果包含 `DANGEROUS_TAG` error
- **THEN** 系统 SHALL 将该次 mutation 视为失败
- **AND** 系统 SHALL NOT 将包含危险标签的 HTML 写回作者态文件
- **AND** 系统 SHALL NOT 将该次失败 mutation 视为 manifest 或 preview state 已成功刷新
