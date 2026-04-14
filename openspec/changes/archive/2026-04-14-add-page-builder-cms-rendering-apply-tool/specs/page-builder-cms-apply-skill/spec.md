## ADDED Requirements

### Requirement: CMS 自动应用专用 skill 在 `ready` 后必须通过正式 apply tool 执行写入
系统 SHALL 将 `cms-binding-apply` 的 `ready` 路径收敛为调用正式的 `apply_cms_binding` 工具，而 MUST NOT 让 skill 直接编辑 workspace 文件或绕过宿主管理的 HTML mutation pipeline。

#### Scenario: `ready` 结果触发正式 apply 工具
- **WHEN** `cms-binding-apply` 对某次输入返回 `ready`
- **THEN** 宿主或同轮 Agent 执行 MUST 调用 `mcp__cms__apply_cms_binding`
- **AND** 系统 SHALL NOT 让 skill 直接改写 `workspace-files/index.html` 或其他工作区文件

#### Scenario: 非 `ready` 结果不得触发写入
- **WHEN** `cms-binding-apply` 返回 `needs-clarification` 或 `incompatible`
- **THEN** 系统 SHALL NOT 调用 `mcp__cms__apply_cms_binding`
- **AND** 系统 SHALL NOT 将该结果视为任何直接文件写入指令

## MODIFIED Requirements

### Requirement: CMS 自动应用专用 skill 必须返回可判定的结构化决策结果
系统 SHALL 使 CMS 自动应用专用 skill 返回可机器判定的结构化结果，并 SHALL 将结果收敛为 `ready`、`needs-clarification` 与 `incompatible` 三类，而不是只返回不可控的自由文本结论。对于 `ready`，该结果 MUST 表示当前输入已经具备调用正式 `apply_cms_binding` 工具的最小必要信息，而不是继续让 skill 自行承担文件写入。

#### Scenario: skill 可以直接应用时返回 ready
- **WHEN** 专用 skill 识别到当前 CMS 选择结果与目标区块在当前已实现运行时能力范围内且信息充分
- **THEN** 系统 SHALL 返回 `ready` 决策结果
- **AND** 该结果 SHALL 包含归一化后的应用决策字段
- **AND** 该结果 SHALL 至少指明目标区块语义、建议渲染模式、默认应用策略以及可交给正式 `apply_cms_binding` 的执行意图

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

### Requirement: 第一阶段仅允许 nav 与 content-list 两类区块语义进入可应用路径
系统 SHALL 将 CMS 自动应用专用 skill 的第一阶段区块语义判断范围限制为 `nav` 与 `content-list` 两类，并 MUST NOT 将固定内容条目或其他超出当前 runtime 可执行能力的输入直接形成 `ready` 结论。

#### Scenario: 栏目选择映射到 nav 区块时进入 ready
- **WHEN** 当前 CMS 选择结果为栏目选择，且目标区块被识别为 `nav` 语义
- **THEN** 专用 skill SHALL 允许该次决策进入 `ready`
- **AND** 系统 SHALL 在结果中标记目标区块语义为 `nav`

#### Scenario: 固定内容条目映射到 content-list 区块时返回 incompatible
- **WHEN** 当前 CMS 选择结果为固定内容条目集合，且目标区块被识别为 `content-list` 语义
- **THEN** 专用 skill SHALL NOT 返回 `ready`
- **AND** 系统 SHALL 返回 `incompatible`
- **AND** 系统 SHALL 将原因标记为当前 runtime 尚不支持固定内容 ID 绑定

#### Scenario: 不受支持的区块语义不进入可应用路径
- **WHEN** 目标区块被识别为轮播、复杂混排、表单、纯装饰区块或其他第一阶段未支持的语义
- **THEN** 专用 skill SHALL NOT 返回 `ready`
- **AND** 系统 SHALL 返回 `incompatible`，或在极少数可恢复场景下先返回 `needs-clarification`
