## MODIFIED Requirements

### Requirement: CMS 自动应用专用 skill 在 `ready` 后必须通过正式 apply tool 执行写入
系统 SHALL 将 `cms-binding-apply` 的 `ready` 路径收敛为同轮先调用 `mcp__cms__decide_cms_binding` 物化正式 decision，再在 ready decision 基础上调用正式的 `apply_cms_binding` 工具，而 MUST NOT 让 skill 在返回 `ready` 后停留在抽象说明、直接编辑 workspace 文件，或绕过宿主管理的 HTML mutation pipeline；当目标是 `cms-island` 时，该正式写入 MUST 围绕该源 CMS 标签整体执行。

#### Scenario: `ready` 结果在同轮先触发 decision tool 再触发正式 apply 工具
- **WHEN** `cms-binding-apply` 对某次输入返回 `ready`
- **THEN** 宿主或同轮 Agent 执行 MUST 先调用 `mcp__cms__decide_cms_binding`
- **AND** 只有当该 decision tool 返回可执行的 `decisionId` 时，系统 SHALL 继续调用 `mcp__cms__apply_cms_binding`
- **AND** 系统 SHALL NOT 让 skill 先停在抽象说明再等待额外普通文本指令
- **AND** 系统 SHALL NOT 让 skill 直接改写 `workspace-files/index.html` 或其他工作区文件

#### Scenario: 非 `ready` 结果或 decision 拒绝结果不得触发写入
- **WHEN** `cms-binding-apply` 返回 `needs-clarification` 或 `incompatible`，或 `mcp__cms__decide_cms_binding` 未返回可执行的 `decisionId`
- **THEN** 系统 SHALL NOT 调用 `mcp__cms__apply_cms_binding`
- **AND** 系统 SHALL NOT 将该结果视为任何直接文件写入指令

### Requirement: CMS 自动应用专用 skill 必须返回可判定的结构化决策结果
系统 SHALL 使 CMS 自动应用专用 skill 返回可机器判定的结构化结果，并 SHALL 将结果收敛为 `ready`、`needs-clarification` 与 `incompatible` 三类，而不是只返回不可控的自由文本结论。对于 `ready`，该结果 MUST 表示当前输入已经具备调用 `mcp__cms__decide_cms_binding` 物化正式 decision 的最小必要信息，而不是把 skill 自身的自由文本结论视为正式写入 authority。

#### Scenario: skill 可以进入 decision-backed apply 路径时返回 ready
- **WHEN** 专用 skill 识别到当前 CMS 选择结果与目标区块在当前已实现运行时能力范围内且信息充分
- **THEN** 系统 SHALL 返回 `ready` 决策结果
- **AND** 该结果 SHALL 包含归一化后的应用决策字段
- **AND** 该结果 SHALL 至少指明目标区块语义、建议渲染模式、默认应用策略以及足以交给 `mcp__cms__decide_cms_binding` 生成正式 decision 的执行意图

#### Scenario: skill 存在单个关键歧义时返回 needs-clarification
- **WHEN** 专用 skill 判断当前选择结果具备可恢复路径，但仍缺少单个或少量关键澄清信息
- **THEN** 系统 SHALL 返回 `needs-clarification` 决策结果
- **AND** 该结果 SHALL 包含结构化的澄清问题定义
- **AND** 系统 SHALL 使宿主能够据此触发后续澄清流程

#### Scenario: skill 超出第一阶段支持范围时返回 incompatible
- **WHEN** 专用 skill 判断当前选择结果与目标区块明显不兼容，或当前任务超出第一阶段支持边界
- **THEN** 系统 SHALL 返回 `incompatible` 决策结果
- **AND** 该结果 SHALL 包含稳定的拒绝原因
- **AND** 该结果 SHALL 包含可向用户展示的解释信息

### Requirement: CMS 自动应用专用 skill 必须对当前目标壳层做保守结构判断
系统 SHALL 让 `cms-binding-apply` 在形成 `ready` 路径前检查 `targetSnapshot.targetOuterHtml` 与当前目标语义，把现有壳层是否已经承担 major layout container 视为作者态事实；当当前壳层仍然兼容所选 CMS 数据时，skill MUST 偏向“保留壳层并在 slot 内只生成兼容动态区域”，而 MUST NOT 默认为 slot 再造一个竞争性的主 grid/list/nav 容器。

#### Scenario: Compatible block shell is preserved instead of duplicating the major container
- **WHEN** 当前 block target 的作者态壳层已经承担主 grid/list/nav 布局职责，且所选 CMS 数据在该壳层内仍可安全映射
- **THEN** skill 的 `ready` 路径 SHALL 保持对该壳层的兼容假设
- **AND** 系统 SHALL NOT 把“在 slot 中重新生成一层竞争性的主容器”当作默认 authoring 方案

#### Scenario: Unclear shell ownership falls back to clarification or incompatibility
- **WHEN** skill 无法保守判断当前目标壳层应保留、替换，或由 slot 承担完整动态区域
- **THEN** 系统 SHALL 返回 `needs-clarification` 或 `incompatible`
- **AND** 系统 SHALL NOT 仅凭猜测继续进入正式 apply
