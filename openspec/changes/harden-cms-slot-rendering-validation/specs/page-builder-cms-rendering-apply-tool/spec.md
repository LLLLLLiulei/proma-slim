## ADDED Requirements

### Requirement: `apply_cms_binding` 必须在写入前阻断非法 slot 表达式模板
系统 SHALL 让 `mcp__cms__apply_cms_binding` 在执行 HTML mutation 前，对候选 `cms-catalog` / `cms-content` 作者态标签运行完整 CMS validation；当 validation 返回未声明 helper、Vue compiler 语法错误、未知字段/slot 变量、HTML 安全边界、CMS 结构边界或其他确定性阻断性 authoring 错误时，工具 MUST 失败并且 MUST NOT 写回页面。宿主能力和不可用对象/方法主要由 `cms-binding-apply` skill guidance 在生成阶段约束，不要求 apply tool 通过复杂 tokenizer 静态识别。

#### Scenario: 未声明 helper 导致 apply 失败且不落盘
- **WHEN** Agent 调用 `mcp__cms__apply_cms_binding`，并在 `templateBody`、`emptyTemplate` 或 `errorTemplate` 中传入 `{{ getDateDay(item.addedAt) }}` 或等价未声明 helper 调用
- **THEN** 工具 SHALL 返回失败
- **AND** 工具 SHALL NOT 修改 `workspace-files/index.html`
- **AND** 工具 SHALL NOT 返回 `applied: true`、刷新成功 manifest，或暗示本次 CMS 绑定已经完成

#### Scenario: 模板校验失败后 decision 可在上下文未变化时重试
- **WHEN** 某个 `decisionId` 对应的正式 apply 因未声明 helper 或 slot 结构预检失败而终止
- **THEN** 系统 SHALL 保持该 decision 在作者态 revision 和目标 identity 未变化时可用于修正模板后的重试
- **AND** 系统 SHALL NOT 将一次未落盘的模板错误当作成功消费 decision

#### Scenario: helper 错误返回紧凑修复指引
- **WHEN** `apply_cms_binding` 因 `UNKNOWN_SLOT_HELPER` 或等价 helper 诊断失败
- **THEN** 工具错误 SHALL 指出失败字段、helper 名称和下一步动作
- **AND** 工具错误 SHALL 指导 Agent 删除未声明 helper，改用 contract 字段、守卫或内联成员表达式后重试
- **AND** 工具错误 SHALL NOT 携带完整模板、大段 HTML、完整页面源码或冗长代码示例

### Requirement: `apply_cms_binding` 必须按目标壳层策略阻断重复列表外壳
系统 SHALL 让 `mcp__cms__apply_cms_binding` 在使用 preserved-shell 结构计划时校验 `templateBody` 与目标壳层边界；如果当前目标壳层已经是 `ul` 或 `ol`，且 `templateBody` 又生成同类完整列表根，工具 MUST 拒绝写入并返回可恢复的结构错误。

#### Scenario: preserved-shell 列表目标拒绝重复列表根
- **WHEN** `decisionId` 的 apply plan 表示保留外层 `ul` 或 `ol` 壳层
- **AND** 调用方传入的 `templateBody` 会在 slot 内生成同类 `ul` 或 `ol` 根节点
- **THEN** `apply_cms_binding` SHALL 拒绝本次写入
- **AND** 错误 SHALL 指出 `templateBody` 与 preserved-shell 列表壳层冲突
- **AND** 错误 SHALL 指导 Agent 收缩 slot 结构或重新走适合完整动态区域的 source-atomic 方案

#### Scenario: 非 preserved-shell 方案不因完整列表根失败
- **WHEN** `decisionId` 的 apply plan 表示 source-atomic 或 whole-component replacement
- **AND** 调用方传入的 `templateBody` 包含完整 `ul` 或 `ol` 动态区域
- **THEN** `apply_cms_binding` SHALL NOT 仅因该列表根拒绝写入
- **AND** 工具 SHALL 继续执行 canonical contract 和其他 preflight 校验

#### Scenario: 缺少 guardrails 但实际目标是列表壳层时拒绝重复列表根
- **WHEN** 调用方未传入 preserved-shell structure guardrails 或旧 decision 误判为 slot-owned region
- **AND** 实际写入目标 block 根节点是 `ul` 或 `ol`
- **AND** `templateBody`、`emptyTemplate` 或 `errorTemplate` 会在 slot 内生成同类完整列表根
- **THEN** `apply_cms_binding` SHALL 在写入前拒绝该模板
- **AND** 工具 SHALL NOT 修改 `workspace-files/index.html`
