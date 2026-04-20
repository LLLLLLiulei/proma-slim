## Purpose

定义 `page-builder` 中 CMS 自动应用专用 skill 的输入输出 contract、澄清规则与 Phase 1A 护栏，使确认 CMS 选择后的自动决策具备稳定边界。

## Requirements

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

### Requirement: CMS 自动应用专用 skill 必须消费统一的目标选择输入
系统 SHALL 为 `cms-binding-apply` 这类 CMS 自动应用专用 skill 提供统一的结构化输入，而不是仅依赖自由文本提示来表达 CMS 选择结果与目标上下文；该输入 MUST 以 `targetSelection` 作为规范化目标入口，并 SHALL 在需要时携带 `targetBlock` 作为 parent block 兼容上下文；该输入 MUST 保留新的 CMS 来源模式及其 durable payload，而不得在 handoff 前把它们再压扁回旧的 single / multiple UI 语义。

#### Scenario: CMS 选择确认后向 skill 传入结构化选择结果
- **WHEN** 用户在 `page-builder` 中确认一次 CMS 父栏目来源、固定栏目集合、按栏目取内容来源或固定内容集合
- **THEN** 系统 SHALL 向专用 skill 传入一个结构化 `selection` 对象
- **AND** 该 `selection` SHALL 复用最新的 `PageBuilderCmsSelectionResult` 协议
- **AND** 该输入 SHALL 保留显式 `selection.siteId`
- **AND** 该输入 SHALL 保留 `selectionKind`、`sourceType`、`selectionMode`、`parentCatalogId`、`catalogId`、`catalogIds`、`contentIds` 与 `snapshot` 中与当前来源模式对应的稳定字段
- **AND** 当 `sourceType = contents-by-ids` 时，系统 SHALL 使用单一 `catalogId + contentIds` 作为 durable payload，而不是 `catalogIds[]`

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

### Requirement: CMS 自动应用专用 skill 必须把 siteId 视为正式写入的硬前置条件
系统 SHALL 将 `selection.siteId` 视为新建或重绑 `cms-catalog` / `cms-content` 的硬前置条件；当该字段缺失时，skill MUST 返回阻断性结果，而不得继续形成 `ready`、猜测站点或退化为隐式默认站点写入。

#### Scenario: selection.siteId 缺失时返回 incompatible
- **WHEN** `cms-binding-apply` 收到的结构化输入中缺少 `selection.siteId`
- **THEN** 系统 SHALL 返回 `incompatible`
- **AND** 拒绝原因 SHALL 表达正式 CMS 写入缺少显式站点上下文
- **AND** 系统 SHALL NOT 继续调用 `mcp__cms__apply_cms_binding`

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

### Requirement: AskUserQuestion 在 CMS 自动应用流程中必须仅用于短澄清
系统 SHALL 仅允许 CMS 自动应用专用 skill 在低置信度但可恢复的场景下触发一次最小必要的短澄清，并 MUST NOT 让 `AskUserQuestion` 重新承担 CMS 主选择、开放式长对话或创意式页面设计职责。

#### Scenario: 单个关键歧义通过一次短澄清补齐
- **WHEN** 专用 skill 识别到当前应用路径只缺少 1 个关键用户决策即可继续
- **THEN** 系统 SHALL 允许该 skill 通过结构化澄清问题请求宿主触发 `AskUserQuestion`
- **AND** 该澄清 SHALL 只针对当前应用决策所需的最小信息
- **AND** 系统 SHALL NOT 在同一轮中再叠加其他无关问题

#### Scenario: 主选择与重选 CMS 数据不使用 AskUserQuestion
- **WHEN** 用户已经在 CMS 选择器中完成栏目或内容条目选择
- **THEN** 系统 SHALL NOT 使用 `AskUserQuestion` 重新让用户浏览、勾选或重选 CMS 栏目与内容
- **AND** 系统 SHALL NOT 用开放式长问题替代结构化澄清

#### Scenario: 选择已固定后不发起广泛创意问题
- **WHEN** 当前 CMS 选择结果、目标区块和 Phase 1A 边界已经固定
- **THEN** 系统 SHALL NOT 再通过 `AskUserQuestion` 发起广泛的风格探索、布局 brainstorming 或其他创意式大范围追问

### Requirement: 第一阶段默认应用策略必须收敛为 replace-current 的局部目标修改
系统 SHALL 将 CMS 自动应用专用 skill 的第一阶段默认应用策略固定为 `replace-current`，并 SHALL 将修改范围限制在当前 `targetSelection` 内，而不得扩展为整页自由重写或跨目标联动改写；当当前目标是 `cms-island` 时，修改边界 MUST 收敛为该源 CMS 标签本身。

#### Scenario: ready 结果声明 replace-current 与 selection-scoped 边界
- **WHEN** 专用 skill 对某次 CMS 选择返回 `ready`
- **THEN** 系统 SHALL 将该结果的默认应用策略标记为 `replace-current`
- **AND** 系统 SHALL 将修改边界限定为当前 `targetSelection`
- **AND** 当 `targetSelection.kind` 为 `cms-island` 时，系统 SHALL 不把同一 parent block 中的静态兄弟节点纳入本次写入范围

#### Scenario: 需要整页重排或其他策略时不进入 ready
- **WHEN** 专用 skill 判断当前选择结果只有通过整页结构重排、跨区块协调、`append` 或 `merge` 等其他策略才可能落地
- **THEN** 系统 SHALL NOT 返回 `ready`
- **AND** 系统 SHALL 返回 `incompatible` 或 `needs-clarification`

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

### Requirement: CMS 自动应用 skill 必须优先产出 slot 内承载完整动态区域的源码结构
系统 SHALL 在 `cms-binding-apply` 的主文案、引用示例与 `ready` 路径约束中，将 `cms-catalog` / `cms-content` 视为动态区域的源码根节点，并 SHALL 优先让 `templateBody`、`emptyTemplate` 与 `errorTemplate` 承载该区域的完整 HTML 结构，而不是只承载零散条目级子节点。

#### Scenario: 栏目导航 ready 路径默认让 `cms-catalog` 成为动态区域根节点
- **WHEN** `cms-binding-apply` 对某次栏目选择形成 `ready` 决策并准备继续调用 `mcp__cms__apply_cms_binding`
- **THEN** skill SHALL 默认推荐以 `cms-catalog` 作为该动态区域的源码根节点
- **AND** skill 提供的示例或推荐 payload SHALL 将 `ul`、`nav` 或同类主要集合容器写在 slot 模板中，而不是写在 `cms-catalog` 外部

#### Scenario: 内容列表 ready 路径默认让 `cms-content` 成为动态区域根节点
- **WHEN** `cms-binding-apply` 对某次内容列表绑定形成 `ready` 决策并准备继续调用 `mcp__cms__apply_cms_binding`
- **THEN** skill SHALL 默认推荐以 `cms-content` 作为该动态区域的源码根节点
- **AND** skill 提供的示例或推荐 payload SHALL 将 `section`、`article`、`div.grid` 或同类主要列表容器写在 slot 模板中，而不是仅在 slot 中保留条目级节点

#### Scenario: source-atomic CMS island 不默认保留“容器在外、条目在内”的反模式
- **WHEN** 当前目标为 `targetSelection.kind: cms-island`，且该动态区域存在“主要容器在外、slot 内只剩条目级节点”的可替代结构
- **THEN** skill SHALL 默认优先推荐把主要动态容器一起收敛进新的 CMS slot 模板
- **AND** skill SHALL NOT 把保留该反模式结构当作默认推荐结果

### Requirement: 只有 CMS 选择插入流程可以新建 cms-* 标签
系统 SHALL 将新建或重绑 `cms-catalog` / `cms-content` 标签限定为“CMS 选择确认 -> 自动 handoff -> `cms-binding-apply` -> `apply_cms_binding`”这条受控链路的结果；普通页面生成或普通迭代流程 MUST NOT 凭空发明新的 CMS 标签，而普通迭代在已有 CMS 区域内只 MAY 调整 slot 模板、内部结构和样式。

#### Scenario: 普通生成流程不得自行新建 cms-* 标签
- **WHEN** Agent 处于普通页面生成、普通页面改版或其他非 CMS 选择插入流程
- **THEN** 系统 SHALL NOT 让其自行新建 `cms-catalog` 或 `cms-content`
- **AND** 若需要新建 CMS 标签，系统 SHALL 要求先回到 CMS 选择插入流程获取正式选择结果

#### Scenario: 普通迭代流程可调整已有 CMS 标签的 slot 与样式
- **WHEN** 页面中已经存在 `cms-catalog` 或 `cms-content`，且当前任务只是普通迭代或局部调整
- **THEN** 系统 MAY 调整这些已有 CMS 标签的 slot 模板、内部结构和样式
- **AND** 系统 SHALL NOT 在该流程中擅自改写其查询属性
- **AND** 系统 SHALL NOT 在该流程中新增额外 CMS 标签或执行重绑

### Requirement: 第一阶段仅允许 nav、catalog-list 与 content-list 三类区块语义进入可应用路径
系统 SHALL 将 CMS 自动应用专用 skill 的第一阶段区块语义判断范围扩展为 `nav`、`catalog-list` 与 `content-list` 三类，并 MUST 根据当前目标区块语义与新的 CMS 来源模式共同决定可应用路径，而不得继续把“栏目选择 = nav”“固定内容 = incompatible”当作唯一规则；当系统无法稳定判断当前目标应呈现为哪一种区块语义时，skill MUST 返回一次短澄清，而不是自行猜测。

#### Scenario: 栏目来源映射到 nav 区块时进入 ready
- **WHEN** 当前 CMS 选择结果为 `catalogs-by-parent` 或 `catalogs-by-ids`，且目标区块被识别为 `nav`
- **THEN** 专用 skill SHALL 允许该次决策进入 `ready`
- **AND** 系统 SHALL 在结果中标记目标区块语义为 `nav`

#### Scenario: 栏目来源映射到 catalog-list 区块时进入 ready
- **WHEN** 当前 CMS 选择结果为 `catalogs-by-parent` 或 `catalogs-by-ids`，且目标区块被识别为 `catalog-list`
- **THEN** 专用 skill SHALL 允许该次决策进入 `ready`
- **AND** 系统 SHALL 在结果中标记目标区块语义为 `catalog-list`

#### Scenario: 内容来源映射到 content-list 区块时进入 ready
- **WHEN** 当前 CMS 选择结果为 `contents-by-catalog` 或 `contents-by-ids`，且目标区块被识别为 `content-list`
- **THEN** 专用 skill SHALL 允许该次决策进入 `ready`
- **AND** 系统 SHALL 在结果中标记目标区块语义为 `content-list`

#### Scenario: 栏目来源的目标区块意图不明确时返回短澄清
- **WHEN** 当前 CMS 选择结果为栏目来源，且系统无法稳定判断当前目标区块应呈现为 `nav` 还是 `catalog-list`
- **THEN** 专用 skill SHALL 返回 `needs-clarification`
- **AND** 该澄清 SHALL 只包含一个短问题及少量结构化选项
- **AND** 系统 SHALL NOT 直接猜测区块语义并进入 `ready`

#### Scenario: 不受支持的区块语义不进入可应用路径
- **WHEN** 目标区块被识别为轮播、复杂混排、表单、纯装饰区块或其他第一阶段未支持的语义
- **THEN** 专用 skill SHALL NOT 返回 `ready`
- **AND** 系统 SHALL 返回 `incompatible`，或在极少数可恢复场景下先返回 `needs-clarification`

### Requirement: CMS 自动应用专用 skill 必须在返回 `ready` 前按 canonical contract 校验候选 authoring
系统 SHALL 让 `cms-binding-apply` 在返回 `ready` 前，根据当前 canonical CMS authoring contract 校验候选 `cms-catalog` / `cms-content` 写法；当候选写法缺少必填 props、混用冲突来源字段、引用未支持字段、违反 slot 结构约束、或包含危险标签/嵌套结构时，skill MUST 返回阻断性结果，而不得继续进入 `ready`。

#### Scenario: 缺少必填 props 或混用来源字段时不进入 `ready`
- **WHEN** `cms-binding-apply` 识别到候选写法缺少 `site-id`、`catalog-id` 等必填 props，或同时混用 `ids` 与查询式来源字段
- **THEN** skill SHALL 返回 `incompatible`
- **AND** skill SHALL 明确指出缺失或冲突的 contract 条目
- **AND** 系统 SHALL NOT 继续形成可执行的正式 apply 决策

#### Scenario: 模板引用未支持字段或危险结构时不进入 `ready`
- **WHEN** `cms-binding-apply` 识别到候选 slot 模板引用了不在当前 contract 中的字段，或包含 `<script>`、`<style>`、嵌套 `cms-*`、外层 `template v-slot:*` 包装等禁止结构
- **THEN** skill SHALL 返回 `incompatible`
- **AND** skill SHALL NOT 继续调用正式 `apply_cms_binding`

#### Scenario: 只有 contract 校验通过时才能返回 `ready`
- **WHEN** `cms-binding-apply` 为某次 CMS 选择生成的写入方案满足当前组件、来源模式和模板结构的 contract 约束
- **THEN** skill SHALL 返回 `ready`
- **AND** `ready` 结果 SHALL 只包含可交给正式 apply 工具执行的、已通过 contract 校验的写入方案

### Requirement: CMS 自动应用专用 skill 的示例与推荐字段必须严格对齐当前 contract
系统 SHALL 让 `cms-binding-apply` 的主文案、内置示例与推荐片段严格使用当前 contract 中存在的字段，而不得继续使用过时 alias、历史字段或模型猜测字段。

#### Scenario: 栏目型推荐片段使用 `path` 而非过时链接 alias
- **WHEN** `cms-binding-apply` 为 `cms-catalog` 推荐导航或栏目列表模板
- **THEN** skill SHALL 使用当前 contract 中的栏目字段，例如 `item.path`
- **AND** skill SHALL NOT 推荐 `item.link`、`item.url` 或其他未实现字段

#### Scenario: 内容型推荐片段使用 `publishUrl` 和 `listLogoUrl`
- **WHEN** `cms-binding-apply` 为 `cms-content` 推荐内容列表模板
- **THEN** skill SHALL 使用当前 contract 中的内容字段，例如 `item.publishUrl` 与 `item.listLogoUrl`
- **AND** skill SHALL NOT 推荐历史遗留或未实现的字段别名

### Requirement: CMS 自动应用专用 skill 在缺少稳定 authoring 依据时必须短澄清而不是猜测
系统 SHALL 在 `cms-binding-apply` 无法根据当前 target snapshot、组件级 contract 与用户选择结果稳定决定 authoring 方案时，返回一次最小必要的短澄清，而不是自行猜测 props、字段或区块组织方式。

#### Scenario: 当前目标结构与推荐 CMS 组织方式不兼容时发起短澄清
- **WHEN** `cms-binding-apply` 发现当前目标结构无法在保持现有宿主壳子和 contract 约束的前提下稳定完成绑定
- **THEN** skill SHALL 返回 `needs-clarification`
- **AND** 该澄清 SHALL 仅请求当前 authoring 决策所需的最小补充信息
- **AND** skill SHALL NOT 擅自猜测一个新的通用列表或卡片结构

### Requirement: CMS 自动应用专用 skill 必须只 author CMS source tag 与 slot templates
系统 SHALL 让 `cms-binding-apply` 在 `ready` apply 路径中只 author 当前选中目标对应的 `cms-catalog` / `cms-content` source tag 及其 `templateBody`、`emptyTemplate`、`errorTemplate` 等 slot inner content；系统 MUST NOT 让该 skill 额外 author Vue runtime、bootstrap、page-wide mount 或 `cms-*` 外部的 Vue authoring。

#### Scenario: `ready` apply 路径只产出 `cms-*` source tag 与 slot inner content
- **WHEN** `cms-binding-apply` 针对某次已确认 CMS selection 进入 `ready` 路径并继续调用正式 apply tool
- **THEN** 系统 SHALL 将该次 authoring 限定为当前目标的 `cms-catalog` 或 `cms-content` source tag 及其 slot inner templates
- **AND** 系统 SHALL NOT 让该 skill 额外生成作者态 Vue importmap、Vue runtime `<script>`、Vue bootstrap 脚本或全页级 Vue root 容器

#### Scenario: 受控 apply 不把 surrounding shell 改造成 Vue authoring
- **WHEN** `cms-binding-apply` 为当前选中 block 或 `cms-island` 生成或重写 CMS authoring
- **THEN** 系统 MAY 保留与当前目标兼容的普通 HTML shell、类名与布局骨架
- **AND** 系统 SHALL 只在当前 CMS source tag 的 slot templates 中使用符合 contract 的 Vue template 语法
- **AND** 系统 SHALL NOT 在 `cms-*` 外部的 surrounding shell、sibling block 或 sibling CMS 区域新增 `v-*`、`@*`、`:` 绑定或 `{{ ... }}` 这类 Vue authoring

#### Scenario: 受控 apply 不依赖作者自管 Vue runtime 才能成立
- **WHEN** `cms-binding-apply` 评估某次确认后的 CMS apply 是否可以继续
- **THEN** 系统 SHALL 把“需要作者自行引入 Vue runtime、作者自行 `createApp` / `mount` 才能工作”的方案视为不符合当前受控 apply contract
- **AND** 系统 SHALL 返回 `incompatible` 或改走短澄清，而不是输出这类 page-wide Vue 方案
