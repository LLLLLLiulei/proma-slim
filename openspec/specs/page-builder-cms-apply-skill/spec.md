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

### Requirement: CMS 自动应用专用 skill 必须把 siteId 视为正式写入的硬前置条件
系统 SHALL 将 `selection.siteId` 视为新建或重绑 `cms-catalog` / `cms-content` 的硬前置条件；当该字段缺失时，skill MUST 返回阻断性结果，而不得继续形成 `ready`、猜测站点或退化为隐式默认站点写入。

#### Scenario: selection.siteId 缺失时返回 incompatible
- **WHEN** `cms-binding-apply` 收到的结构化输入中缺少 `selection.siteId`
- **THEN** 系统 SHALL 返回 `incompatible`
- **AND** 拒绝原因 SHALL 表达正式 CMS 写入缺少显式站点上下文
- **AND** 系统 SHALL NOT 继续调用 `mcp__cms__apply_cms_binding`

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

### Requirement: CMS 自动应用专用 skill references 必须按决策入口、共享边界与组件说明分层组织
系统 SHALL 将 `cms-binding-apply` 的 references 组织为清晰分层的结构，而不是继续依赖单一混合大文件；其中 decision contract 与最小 payload/result 示例 MUST 作为轻量入口保留，`cms-catalog` 与 `cms-content` 的 authoring guidance MUST 分别保留在组件专项说明中，两个组件共享的 HTML-first / slot / Vue boundary / anti-pattern 规则 MUST 保留在单独的共享 rules 文档中。

#### Scenario: 轻量入口文件只保留 decision contract 与最小示例
- **WHEN** 系统为 `cms-binding-apply` 提供 payload shape、`ready`、`needs-clarification`、`incompatible` 或 malformed payload 这类 decision 示例
- **THEN** 系统 SHALL 将这些内容保留在轻量入口 reference 中
- **AND** 该入口 reference SHALL NOT 再承担完整的 `cms-catalog` / `cms-content` authoring 教程

#### Scenario: 组件专项说明与共享规则分别承载不同知识面
- **WHEN** 系统为 `cms-binding-apply` 提供 `cms-catalog` / `cms-content` 的 authoring guidance
- **THEN** 系统 SHALL 将组件特有的适用场景、source modes、props、字段语义和常见写法保留在对应组件说明中
- **AND** 系统 SHALL 将两个组件共享的 slot inner content、HTML-first、Vue boundary、anti-pattern 和 apply payload 边界保留在共享 rules 文档中

### Requirement: CMS 自动应用专用 skill 必须按当前 selection 与 component 路由读取对应 guidance
系统 SHALL 让 `cms-binding-apply` 在消费 references 时，先读取轻量 decision 入口，再根据当前 `selection.selectionKind` 或 `authoringContext.component` 路由到对应的组件专项说明；当需要确认共享 authoring 边界时，系统 SHALL 再读取共享 rules 文档，而不得默认要求模型先扫描全部混合示例。

#### Scenario: 栏目选择优先路由到 `cms-catalog` 说明
- **WHEN** `cms-binding-apply` 处理 `selection.selectionKind = catalogs` 的 confirmed CMS selection，或 `authoringContext.component = cms-catalog`
- **THEN** 系统 SHALL 明确把 `cms-catalog` 专项说明作为当前组件 guidance
- **AND** 系统 SHALL NOT 默认要求模型先阅读 `cms-content` 的字段和 recipe

#### Scenario: 内容选择优先路由到 `cms-content` 说明
- **WHEN** `cms-binding-apply` 处理 `selection.selectionKind = contents` 的 confirmed CMS selection，或 `authoringContext.component = cms-content`
- **THEN** 系统 SHALL 明确把 `cms-content` 专项说明作为当前组件 guidance
- **AND** 系统 SHALL NOT 默认要求模型先阅读 `cms-catalog` 的字段和 recipe

#### Scenario: 共享边界通过共享 rules 文档补充而不是在组件说明里重复展开
- **WHEN** `cms-binding-apply` 需要确认 slot inner content、HTML-first、禁止自管 Vue runtime、禁止 page-wide mount 或其他共享 anti-pattern
- **THEN** 系统 SHALL 将这些内容路由到共享 rules 文档
- **AND** 系统 SHALL NOT 要求每个组件说明都各自重复完整共享边界库

### Requirement: `cms-binding-apply` MUST remain isolated to confirmed CMS apply control
系统 SHALL 将 `cms-binding-apply` 继续限定为 confirmed CMS selection 之后的 apply controller，而不得把该 skill 重新扩展成 ordinary 既有 CMS 区域修改的默认认知入口；其主文案和 references MUST 继续服务于 Phase 1A decision/apply，而不是承担普通 CMS region literacy。

#### Scenario: ordinary 既有 CMS 区域修改不默认加载 `cms-binding-apply`
- **WHEN** 当前请求只是 ordinary flow 中对已有 `cms-catalog` / `cms-content` 区域的普通修改，且尚未拥有确认完成的 CMS selection handoff
- **THEN** 系统 SHALL NOT 把 `cms-binding-apply` 作为该次请求的默认 guidance controller
- **AND** 系统 SHALL 让 confirmed apply skill 继续只在确认后的 CMS apply 场景中出现

#### Scenario: `cms-binding-apply` 的文案继续只聚焦 confirmed apply 协议
- **WHEN** 系统维护 `cms-binding-apply` 的主文案和 references
- **THEN** 这些内容 SHALL 继续围绕输入前提、三态决策、same-turn `decide -> apply` 和 confirmed apply contract 组织
- **AND** 这些内容 SHALL NOT 吸收 ordinary 已有 CMS 区域修改所需的通用组件级 guidance

### Requirement: `cms-binding-apply` 在 `contents-by-catalog` 场景必须优先使用宿主提供的权威来源上下文
系统 SHALL 让 `cms-binding-apply` 在 `contents-by-catalog` 场景下优先依据宿主在 confirmed handoff 中提供的 authoritative source context 做决策，而不得继续把 CMS 浏览树节点 `selection.snapshot.catalog` 视为目录内容可用性的正式事实来源。

#### Scenario: 树节点快照与权威内容探针冲突时以权威上下文为准
- **WHEN** `contents-by-catalog` 的 `selection.snapshot.catalog` 与 authoritative source context 在 `total`、`path` 或其他来源状态上不一致
- **THEN** 系统 SHALL 要求 `cms-binding-apply` 以 authoritative source context 为准
- **AND** 系统 SHALL NOT 仅因为树节点 `selection.snapshot.catalog.total = 0` 就把当前目录判定为空目录
- **AND** 系统 SHALL NOT 仅因该树节点快照而返回 `reasonCode: malformed-payload`

### Requirement: `contents-by-catalog` 的空内容目录必须仍可作为合法 CMS binding 来源
系统 SHALL 将 `contents-by-catalog` 当前目录无内容视为运行时数据状态，而不是自动视为 binding 非法；在目录当前无内容但目标结构与 contract 仍兼容时，系统 MUST 允许 `cms-binding-apply` 继续进入可应用路径，以便后续通过 `emptyTemplate` 或等价空态结构表达该目录。

#### Scenario: 权威内容探针 total 为 0 时不自动拒绝绑定
- **WHEN** `contents-by-catalog` 的 authoritative source context 显示当前目录内容总数为 `0`
- **THEN** 系统 SHALL NOT 仅因该目录当前无内容而自动返回 `incompatible`
- **AND** 系统 SHALL NOT 仅因该目录当前无内容而自动返回 `reasonCode: malformed-payload`
- **AND** 当目标区块结构、authoring contract 与应用边界仍兼容时，系统 SHALL 允许该目录继续作为合法的 `cms-content` 绑定来源

#### Scenario: 只有真实结构或 contract 不兼容时才拒绝空目录绑定
- **WHEN** `contents-by-catalog` 当前目录无内容，且同时存在结构不兼容或 contract 缺失等真正阻断条件
- **THEN** 系统 SHALL 返回 `needs-clarification` 或 `incompatible`
- **AND** 系统 SHALL 在拒绝原因中表达真实阻断条件
- **AND** 系统 SHALL NOT 把“目录当前为空”当作唯一拒绝依据

### Requirement: `cms-binding-apply` 必须只按结构兼容性判断，不得按内容主题相似度拒绝绑定
系统 SHALL 让 `cms-binding-apply` 只基于目标结构、authoring contract、可用字段与运行时边界判断 `contents-by-catalog` 的可绑定性，而不得因为当前静态模块文案与选中 CMS 内容主题、行业或语气不一致，就返回 `needs-clarification` 或 `incompatible`。

#### Scenario: 内容主题不一致但结构兼容时仍允许继续绑定
- **WHEN** 当前目标区块的静态占位文案与选中 CMS 内容在主题、行业或 literal copy 上不一致
- **AND** 当前目标结构、authoring contract、可用字段与应用边界仍兼容
- **THEN** 系统 SHALL 继续允许该 binding 进入 `ready` 或其他必要的结构性判断路径
- **AND** 系统 SHALL NOT 仅因主题不一致而返回 `needs-clarification`
- **AND** 系统 SHALL NOT 仅因主题不一致而返回 `incompatible`

#### Scenario: 仅结构性歧义才允许进入 clarification
- **WHEN** 当前区块确实存在 `nav` / `catalog-list` / `content-list` 结构意图不清、contract 缺失或运行时边界冲突
- **THEN** 系统 MAY 返回 `needs-clarification`
- **AND** 澄清问题 SHALL 指向真实结构性歧义
- **AND** 系统 SHALL NOT 把“内容看起来不像当前模块”包装成结构性澄清问题

### Requirement: `cms-binding-apply` 必须使用增强后的 canonical CMS 字段编写链接和封面
系统 SHALL 让 `cms-binding-apply` 在 confirmed CMS apply 中只使用 canonical authoring contract 暴露的字段来编写栏目和内容链接/封面；当生成导航、列表或图文列表时，系统 MUST 使用增强后的 `item.path`、`item.logoUrl`、`item.publishUrl` 与 `item.listLogoUrl`，而不得猜测上游原始字段别名。

#### Scenario: 栏目导航使用 item.path 和声明式 anchor
- **WHEN** `cms-binding-apply` 为栏目选择生成导航或栏目列表模板
- **THEN** 生成模板 SHALL 使用 `item.path` 作为栏目链接 href
- **AND** 当模板展示栏目封面时 SHALL 使用 `item.logoUrl` 并为该可选字段提供守卫
- **AND** 生成模板 SHALL NOT 使用 `item.link`、`item.url`、`item.logoFile` 或点击事件作为默认实现

#### Scenario: 内容列表使用 item.publishUrl 和 item.listLogoUrl
- **WHEN** `cms-binding-apply` 为内容选择生成内容列表或图文列表模板
- **THEN** 生成模板 SHALL 使用 `item.publishUrl` 作为内容链接 href
- **AND** 当模板展示内容封面时 SHALL 使用 `item.listLogoUrl` 并为该可选字段提供守卫
- **AND** 生成模板 SHALL NOT 使用 `item.link`、`item.url`、`item.logoFile` 或点击事件作为默认实现

### Requirement: `cms-binding-apply` guidance 必须优先推荐新窗口安全链接属性
系统 SHALL 在 `cms-binding-apply` 的 component references 和共享 authoring rules 中推荐 CMS 外部目的地使用新窗口安全链接属性；该推荐 MUST 作为默认 guidance 输出，但 MUST NOT 变成阻断已有合法模板的强制 validator 规则。

#### Scenario: 生成可点击栏目或内容名称时推荐 target 和 rel
- **WHEN** `cms-binding-apply` 需要让栏目名称或内容标题可点击打开 CMS 目的地
- **THEN** guidance SHALL 推荐 `<a>` 标签使用 canonical href 字段
- **AND** guidance SHALL 推荐在适合新窗口打开时添加 `target="_blank"` 与 `rel="noopener noreferrer"`
- **AND** 系统 SHALL NOT 仅因为旧模板缺少这些属性就把模板判定为不合法
