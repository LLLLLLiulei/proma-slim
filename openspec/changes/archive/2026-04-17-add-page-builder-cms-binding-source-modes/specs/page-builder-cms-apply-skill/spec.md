## MODIFIED Requirements

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
