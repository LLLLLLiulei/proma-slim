## RENAMED Requirements

- FROM: `### Requirement: CMS 自动应用专用 skill 必须消费统一的结构化输入`
- TO: `### Requirement: CMS 自动应用专用 skill 必须消费统一的目标选择输入`
- FROM: `### Requirement: 第一阶段默认应用策略必须收敛为 replace-current 的局部区块修改`
- TO: `### Requirement: 第一阶段默认应用策略必须收敛为 replace-current 的局部目标修改`

## MODIFIED Requirements

### Requirement: CMS 自动应用专用 skill 必须消费统一的目标选择输入
系统 SHALL 为 `cms-binding-apply` 这类 CMS 自动应用专用 skill 提供统一的结构化输入，而不是仅依赖自由文本提示来表达 CMS 选择结果与目标上下文；该输入 MUST 以 `targetSelection` 作为规范化目标入口，并 SHALL 在需要时携带 `targetBlock` 作为 parent block 兼容上下文。

#### Scenario: CMS 选择确认后向 skill 传入结构化选择结果
- **WHEN** 用户在 `page-builder` 中确认一次 CMS 栏目选择或固定内容条目选择
- **THEN** 系统 SHALL 向专用 skill 传入一个结构化 `selection` 对象
- **AND** 该 `selection` SHALL 复用最新的 `PageBuilderCmsSelectionResult` 协议
- **AND** 该输入 SHALL 保留 `selectionKind`、`sourceType`、`selectionMode`、`catalogIds`、`contentIds` 与 `snapshot` 等稳定字段

#### Scenario: skill 输入必须携带目标选择与执行护栏
- **WHEN** 系统准备调用 CMS 自动应用专用 skill
- **THEN** 系统 SHALL 在 skill 输入中携带 `targetSelection`
- **AND** 系统 SHALL 在需要时携带 `targetBlock.selector` 作为 parent block 上下文
- **AND** 系统 SHALL 携带 `entryPoint` 以标识该次调用来自 CMS 选择器确认
- **AND** 系统 SHALL 携带 `applyIntent` 以标识第一阶段默认应用意图
- **AND** 系统 SHALL 携带 `workspacePolicy` 以表达“仅允许围绕当前目标修改、禁止整页自由重写”的运行边界

#### Scenario: CMS island 输入显式声明 source-atomic 边界
- **WHEN** 当前输入中的 `targetSelection.kind` 为 `cms-island`
- **THEN** 系统 SHALL 在该目标信息中保留源 CMS 标签选择器、所属 `parentBlockSelector` 与组件类型
- **AND** 系统 SHALL 明确告知该目标对应预览中的 CMS 渲染结果，但源码中必须整体更新该源 CMS 标签
- **AND** 系统 SHALL NOT 仅把某个渲染子节点的普通 DOM selector 交给 skill 进行决策

### Requirement: CMS 自动应用专用 skill 在 `ready` 后必须通过正式 apply tool 执行写入
系统 SHALL 将 `cms-binding-apply` 的 `ready` 路径收敛为调用正式的 `apply_cms_binding` 工具，而 MUST NOT 让 skill 直接编辑 workspace 文件或绕过宿主管理的 HTML mutation pipeline；当目标是 `cms-island` 时，该正式写入 MUST 围绕该源 CMS 标签整体执行。

#### Scenario: `ready` 结果触发正式 apply 工具
- **WHEN** `cms-binding-apply` 对某次输入返回 `ready`
- **THEN** 宿主或同轮 Agent 执行 MUST 调用 `mcp__cms__apply_cms_binding`
- **AND** 系统 SHALL 将当前 `targetSelection` 作为正式写入的目标入口
- **AND** 系统 SHALL NOT 让 skill 直接改写 `workspace-files/index.html` 或其他工作区文件

#### Scenario: 非 `ready` 结果不得触发写入
- **WHEN** `cms-binding-apply` 返回 `needs-clarification` 或 `incompatible`
- **THEN** 系统 SHALL NOT 调用 `mcp__cms__apply_cms_binding`
- **AND** 系统 SHALL NOT 将该结果视为任何直接文件写入指令

### Requirement: 第一阶段默认应用策略必须收敛为 replace-current 的局部目标修改
系统 SHALL 将 CMS 自动应用专用 skill 的第一阶段默认应用策略固定为 `replace-current`，并 SHALL 将修改范围限制在当前 `targetSelection` 内，而不得扩展为整页自由重写或跨目标联动改写；当当前目标是 `cms-island` 时，修改边界 MUST 收敛为该源 CMS 标签本身。

#### Scenario: ready 结果声明 replace-current 与 selection-scoped 边界
- **WHEN** 专用 skill 对某次 CMS 选择返回 `ready`
- **THEN** 系统 SHALL 将该结果的默认应用策略标记为 `replace-current`
- **AND** 系统 SHALL 将修改边界限定为当前 `targetSelection`
- **AND** 当 `targetSelection.kind` 为 `cms-island` 时，系统 SHALL 不把同一 parent block 中的静态兄弟节点纳入本次写入范围

#### Scenario: 需要整页重排或其他策略时不进入 ready
- **WHEN** 专用 skill 判断当前选择结果只有通过整页结构重排、跨目标协调、`append` 或 `merge` 等其他策略才可能落地
- **THEN** 系统 SHALL NOT 返回 `ready`
- **AND** 系统 SHALL 返回 `incompatible` 或 `needs-clarification`

