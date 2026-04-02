## ADDED Requirements

### Requirement: CMS 自动应用专用 skill 必须消费统一的结构化输入
系统 SHALL 为 `cms-binding-apply` 这类 CMS 自动应用专用 skill 提供统一的结构化输入，而不是仅依赖自由文本提示来表达 CMS 选择结果与目标区块上下文。

#### Scenario: CMS 选择确认后向 skill 传入结构化选择结果
- **WHEN** 用户在 `page-builder` 中确认一次 CMS 栏目选择或固定内容条目选择
- **THEN** 系统 SHALL 向专用 skill 传入一个结构化 `selection` 对象
- **AND** 该 `selection` SHALL 复用 `PageBuilderCmsSelectionResult` 协议
- **AND** 该输入 SHALL 保留 `selectionKind`、`sourceType`、`selectionMode`、`catalogIds`、`contentIds` 与 `snapshot` 等稳定字段

#### Scenario: skill 输入必须携带目标区块与执行护栏
- **WHEN** 系统准备调用 CMS 自动应用专用 skill
- **THEN** 系统 SHALL 在 skill 输入中携带 `targetBlock.selector`
- **AND** 系统 SHALL 携带 `entryPoint` 以标识该次调用来自 CMS 选择器确认
- **AND** 系统 SHALL 携带 `applyIntent` 以标识第一阶段默认应用意图
- **AND** 系统 SHALL 携带 `workspacePolicy` 以表达“仅允许局部区块修改、禁止整页自由重写”的运行边界

### Requirement: CMS 自动应用专用 skill 必须返回可判定的结构化决策结果
系统 SHALL 使 CMS 自动应用专用 skill 返回可机器判定的结构化结果，并 SHALL 将结果收敛为 `ready`、`needs-clarification` 与 `incompatible` 三类，而不是只返回不可控的自由文本结论。

#### Scenario: skill 可以直接应用时返回 ready
- **WHEN** 专用 skill 识别到当前 CMS 选择结果与目标区块在第一阶段支持范围内且信息充分
- **THEN** 系统 SHALL 返回 `ready` 决策结果
- **AND** 该结果 SHALL 包含归一化后的应用决策字段
- **AND** 该结果 SHALL 至少指明目标区块语义、建议渲染模式与默认应用策略

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

### Requirement: AskUserQuestion 在 CMS 自动应用流程中必须仅用于短澄清
系统 SHALL 仅允许 CMS 自动应用专用 skill 在低置信度但可恢复的场景下触发短澄清，并 MUST NOT 让 `AskUserQuestion` 重新承担 CMS 主选择或开放式长对话职责。

#### Scenario: 单个关键歧义通过短澄清补齐
- **WHEN** 专用 skill 识别到当前应用路径只缺少 1 个关键用户决策即可继续
- **THEN** 系统 SHALL 允许该 skill 通过结构化澄清问题请求宿主触发 `AskUserQuestion`
- **AND** 该澄清 SHALL 只针对当前应用决策所需的最小信息

#### Scenario: 主选择与重选 CMS 数据不使用 AskUserQuestion
- **WHEN** 用户已经在 CMS 选择器中完成栏目或内容条目选择
- **THEN** 系统 SHALL NOT 使用 `AskUserQuestion` 重新让用户浏览、勾选或重选 CMS 栏目与内容
- **AND** 系统 SHALL NOT 用开放式长问题替代结构化澄清

### Requirement: 第一阶段默认应用策略必须收敛为 replace-current 的局部区块修改
系统 SHALL 将 CMS 自动应用专用 skill 的第一阶段默认应用策略固定为 `replace-current`，并 SHALL 将修改范围限制在当前目标区块内，而不得扩展为整页自由重写或跨区块联动改写。

#### Scenario: ready 结果声明 replace-current 与 block-scoped 边界
- **WHEN** 专用 skill 对某次 CMS 选择返回 `ready`
- **THEN** 系统 SHALL 将该结果的默认应用策略标记为 `replace-current`
- **AND** 系统 SHALL 将修改边界限定为 `targetBlock.selector` 所标识的当前区块
- **AND** 系统 SHALL 不将同一次应用任务扩展为其他区块的自动联动修改

#### Scenario: 需要整页重排或其他策略时不进入 ready
- **WHEN** 专用 skill 判断当前选择结果只有通过整页结构重排、跨区块协调、`append` 或 `merge` 等其他策略才可能落地
- **THEN** 系统 SHALL NOT 返回 `ready`
- **AND** 系统 SHALL 返回 `incompatible` 或 `needs-clarification`

### Requirement: 第一阶段仅允许 nav 与 content-list 两类区块语义进入可应用路径
系统 SHALL 将 CMS 自动应用专用 skill 的第一阶段可应用区块语义限制为 `nav` 与 `content-list` 两类，并 MUST NOT 对其他区块语义直接形成可应用结论。

#### Scenario: 栏目选择映射到 nav 区块时进入 ready
- **WHEN** 当前 CMS 选择结果为栏目选择，且目标区块被识别为 `nav` 语义
- **THEN** 专用 skill SHALL 允许该次决策进入 `ready`
- **AND** 系统 SHALL 在结果中标记目标区块语义为 `nav`

#### Scenario: 固定内容条目映射到 content-list 区块时进入 ready
- **WHEN** 当前 CMS 选择结果为固定内容条目集合，且目标区块被识别为 `content-list` 语义
- **THEN** 专用 skill SHALL 允许该次决策进入 `ready`
- **AND** 系统 SHALL 在结果中标记目标区块语义为 `content-list`

#### Scenario: 不受支持的区块语义不进入可应用路径
- **WHEN** 目标区块被识别为轮播、复杂混排、表单、纯装饰区块或其他第一阶段未支持的语义
- **THEN** 专用 skill SHALL NOT 返回 `ready`
- **AND** 系统 SHALL 返回 `incompatible`，或在极少数可恢复场景下先返回 `needs-clarification`
