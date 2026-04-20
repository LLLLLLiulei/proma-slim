## ADDED Requirements

### Requirement: CMS 自动应用专用 skill 主文案必须按 Phase 1A 决策路径组织
系统 SHALL 让 `cms-binding-apply` 的主文案围绕 Phase 1A 的实际执行路径组织为“输入前提、三态决策、`ready` apply checklist、一次短澄清边界”，并 SHALL 将长示例、反例与下游集成说明下沉到 reference 文件，而不是在主 skill 中重复展开同一批护栏。

#### Scenario: 主 skill 只保留当前轮决策与执行所需的最小结构
- **WHEN** 系统为模型加载 `cms-binding-apply` 主文案
- **THEN** 该主文案 SHALL 明确输入检查、`ready / needs-clarification / incompatible`、same-turn apply 路径与短澄清边界
- **AND** 该主文案 SHALL NOT 继续承担长篇示例库或反例库

#### Scenario: 长示例与反例保留在 references 而不是主 skill
- **WHEN** 系统需要为 `cms-binding-apply` 提供 contract 示例、反模式或下游集成细节
- **THEN** 系统 SHALL 将这些内容保留在 reference 文件
- **AND** 系统 SHALL 让主 skill 仅保留能驱动当前轮决策与执行的最小必要规则

### Requirement: CMS 自动应用专用 skill 必须优先保留兼容的当前目标外壳并原位替换
系统 SHALL 让 `cms-binding-apply` 在构造 `ready` 路径时，优先复用当前 `targetSnapshot` 对应目标在源码中的现有外壳、类名与主要布局骨架，只在与所选 CMS 数据兼容时将其保留并原位替换；系统 SHALL NOT 把当前目标旁边追加新的 CMS 兄弟节点，也 SHALL NOT 在缺少稳定依据时擅自改造成新的通用列表或卡片壳子。

#### Scenario: 当前目标结构兼容时保留现有外壳并原位替换
- **WHEN** `cms-binding-apply` 识别到当前 `targetSnapshot` 的外壳、类名与主要布局结构可以承载所选 CMS 数据
- **THEN** 系统 SHALL 在 `ready` 路径中保留这些现有结构
- **AND** 系统 SHALL 将 CMS 写入限定为当前目标的原位替换
- **AND** 系统 SHALL NOT 在当前目标旁边追加新的 `cms-catalog` 或 `cms-content`

#### Scenario: 当前目标结构不兼容时短澄清而不是猜测通用结构
- **WHEN** `cms-binding-apply` 发现当前目标结构无法在保持现有外壳和 contract 约束的前提下稳定完成绑定
- **THEN** 系统 SHALL 返回 `needs-clarification` 或 `incompatible`
- **AND** 系统 SHALL NOT 擅自猜测一个新的通用列表、卡片网格或导航壳子

## MODIFIED Requirements

### Requirement: CMS 自动应用专用 skill 在 `ready` 后必须通过正式 apply tool 执行写入
系统 SHALL 将 `cms-binding-apply` 的 `ready` 路径收敛为同轮继续调用正式的 `apply_cms_binding` 工具，而 MUST NOT 让 skill 在返回 `ready` 后停留在抽象说明、直接编辑 workspace 文件，或绕过宿主管理的 HTML mutation pipeline；当目标是 `cms-island` 时，该正式写入 MUST 围绕该源 CMS 标签整体执行。

#### Scenario: `ready` 结果在同轮触发正式 apply 工具
- **WHEN** `cms-binding-apply` 对某次输入返回 `ready`
- **THEN** 宿主或同轮 Agent 执行 MUST 调用 `mcp__cms__apply_cms_binding`
- **AND** 系统 SHALL 将当前 `targetSelection` 作为正式写入的目标入口
- **AND** 系统 SHALL NOT 让 skill 先停在抽象说明再等待额外普通文本指令
- **AND** 系统 SHALL NOT 让 skill 直接改写 `workspace-files/index.html` 或其他工作区文件

#### Scenario: 非 `ready` 结果不得触发写入
- **WHEN** `cms-binding-apply` 返回 `needs-clarification` 或 `incompatible`
- **THEN** 系统 SHALL NOT 调用 `mcp__cms__apply_cms_binding`
- **AND** 系统 SHALL NOT 将该结果视为任何直接文件写入指令

### Requirement: AskUserQuestion 在 CMS 自动应用流程中必须仅用于短澄清
系统 SHALL 仅允许 CMS 自动应用专用 skill 在低置信度但可恢复的场景下触发一次最小必要的短澄清，并 MUST NOT 让 `AskUserQuestion` 重新承担 CMS 主选择、开放式长对话或创意式页面设计职责。

#### Scenario: 单个关键歧义通过一次短澄清补齐
- **WHEN** 专用 skill 识别到当前应用路径只缺少 1 个关键用户决策即可继续
- **THEN** 系统 SHALL 允许该 skill 通过一个结构化澄清问题请求宿主触发 `AskUserQuestion`
- **AND** 该澄清 SHALL 只针对当前应用决策所需的最小信息
- **AND** 系统 SHALL NOT 在同一轮中再叠加其他无关问题

#### Scenario: 主选择与重选 CMS 数据不使用 AskUserQuestion
- **WHEN** 用户已经在 CMS 选择器中完成栏目或内容条目选择
- **THEN** 系统 SHALL NOT 使用 `AskUserQuestion` 重新让用户浏览、勾选或重选 CMS 栏目与内容
- **AND** 系统 SHALL NOT 用开放式长问题替代结构化澄清

#### Scenario: 选择已固定后不发起广泛创意问题
- **WHEN** 当前 CMS 选择结果、目标区块和 Phase 1A 边界已经固定
- **THEN** 系统 SHALL NOT 再通过 `AskUserQuestion` 发起广泛的风格探索、布局 brainstorming 或其他创意式大范围追问

### Requirement: 只有 CMS 选择插入流程可以新建 cms-* 标签
系统 SHALL 将新建或重绑 `cms-catalog` / `cms-content` 标签限定为“CMS 选择确认 -> 自动 handoff -> `cms-binding-apply` -> `apply_cms_binding`”这条受控链路的结果；普通页面生成或普通迭代流程 MUST NOT 凭空发明新的 CMS 标签，而普通迭代在已有 CMS 区域内只 MAY 调整 slot 模板、内部结构和样式。

#### Scenario: 普通生成流程不得自行新建 cms-* 标签
- **WHEN** Agent 处于普通页面生成、普通页面改版或其他非 CMS 选择插入流程
- **THEN** 系统 SHALL NOT 让其自行新建 `cms-catalog` 或 `cms-content`
- **AND** 若需要新建 CMS 标签，系统 SHALL 要求先回到 CMS 选择插入流程获取正式选择结果

#### Scenario: 普通迭代流程只允许调整已有 CMS 区域的表现层
- **WHEN** 页面中已经存在 `cms-catalog` 或 `cms-content`，且当前任务只是普通迭代或局部调整
- **THEN** 系统 MAY 调整这些已有 CMS 标签的 slot 模板、内部结构和样式
- **AND** 系统 SHALL NOT 在该流程中擅自改写其查询属性
- **AND** 系统 SHALL NOT 在该流程中新增额外 CMS 标签或执行重绑
