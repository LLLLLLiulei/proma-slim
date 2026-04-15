## Purpose

定义 `page-builder` 中 CMS 自动应用专用 skill 的输入输出 contract、澄清规则与 Phase 1A 护栏，使确认 CMS 选择后的自动决策具备稳定边界。

## Requirements

### Requirement: CMS 自动应用专用 skill 必须消费统一的目标选择输入
系统 SHALL 为 `cms-binding-apply` 这类 CMS 自动应用专用 skill 提供统一的结构化输入，而不是仅依赖自由文本提示来表达 CMS 选择结果与目标上下文；该输入 MUST 以 `targetSelection` 作为规范化目标入口，并 SHALL 在需要时携带 `targetBlock` 作为 parent block 兼容上下文。

#### Scenario: CMS 选择确认后向 skill 传入结构化选择结果
- **WHEN** 用户在 `page-builder` 中确认一次 CMS 栏目选择或固定内容条目选择
- **THEN** 系统 SHALL 向专用 skill 传入一个结构化 `selection` 对象
- **AND** 该 `selection` SHALL 复用最新的 `PageBuilderCmsSelectionResult` 协议
- **AND** 该输入 SHALL 保留显式 `selection.siteId`
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
系统 SHALL 仅允许 CMS 自动应用专用 skill 在低置信度但可恢复的场景下触发短澄清，并 MUST NOT 让 `AskUserQuestion` 重新承担 CMS 主选择或开放式长对话职责。

#### Scenario: 单个关键歧义通过短澄清补齐
- **WHEN** 专用 skill 识别到当前应用路径只缺少 1 个关键用户决策即可继续
- **THEN** 系统 SHALL 允许该 skill 通过结构化澄清问题请求宿主触发 `AskUserQuestion`
- **AND** 该澄清 SHALL 只针对当前应用决策所需的最小信息

#### Scenario: 主选择与重选 CMS 数据不使用 AskUserQuestion
- **WHEN** 用户已经在 CMS 选择器中完成栏目或内容条目选择
- **THEN** 系统 SHALL NOT 使用 `AskUserQuestion` 重新让用户浏览、勾选或重选 CMS 栏目与内容
- **AND** 系统 SHALL NOT 用开放式长问题替代结构化澄清

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
系统 SHALL 将新建 `cms-catalog` / `cms-content` 标签限定为“CMS 选择确认 -> 自动 handoff -> `cms-binding-apply` -> `apply_cms_binding`”这条受控链路的结果；普通页面生成或普通迭代流程 MUST NOT 凭空发明新的 CMS 标签。

#### Scenario: 普通生成流程不得自行新建 cms-* 标签
- **WHEN** Agent 处于普通页面生成、普通页面改版或其他非 CMS 选择插入流程
- **THEN** 系统 SHALL NOT 让其自行新建 `cms-catalog` 或 `cms-content`
- **AND** 若需要新建 CMS 标签，系统 SHALL 要求先回到 CMS 选择插入流程获取正式选择结果

#### Scenario: 普通迭代流程可调整已有 CMS 标签的 slot 与样式
- **WHEN** 页面中已经存在 `cms-catalog` 或 `cms-content`，且当前任务只是普通迭代或局部调整
- **THEN** 系统 MAY 调整这些已有 CMS 标签的 slot 模板、内部结构和样式
- **AND** 系统 SHALL NOT 在该流程中擅自改写其查询属性或新建额外 CMS 标签
