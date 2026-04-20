## MODIFIED Requirements

### Requirement: CMS 选择会话必须绑定到明确的目标选择
系统 SHALL 在打开 CMS 选择器时为当前会话附带明确的目标选择上下文，并 SHALL 将该上下文用于生成确认后的选择结果；该上下文 MUST 统一使用 `targetSelection` 作为主入口，并携带稳定的 `editBoundary` 字段；当当前目标是 `cms-island` 时，该上下文 MUST 保留源 CMS 标签的 runtime locator，包括 `htmlPath`、`sourceSelector`、所属 `parentBlockSelector`、组件类型和 `editBoundary: source-atomic`，而不得将目标退化为单一的 block selector。

#### Scenario: 已选静态区块打开选择器时携带 block 目标
- **WHEN** Builder 页已存在当前选中的普通静态预览区块，且用户通过区块工具条或其他受支持入口打开 CMS 选择器
- **THEN** 系统 SHALL 为本次 CMS 选择会话记录该目标的 `targetSelection`
- **AND** 该 `targetSelection.kind` SHALL 为 `block`
- **AND** 该 `targetSelection.editBoundary` SHALL 为 `block`
- **AND** 系统 SHALL 继续提供该区块的 `targetBlock.selector` 作为 parent block 上下文

#### Scenario: 已选 CMS island 打开选择器时携带 source-atomic 目标
- **WHEN** Builder 页已存在当前选中的 `cms-island`，且用户通过区块工具条或其他受支持入口打开 CMS 选择器
- **THEN** 系统 SHALL 为本次 CMS 选择会话记录该目标的 `targetSelection`
- **AND** 该 `targetSelection.kind` SHALL 为 `cms-island`
- **AND** 该 `targetSelection.editBoundary` SHALL 为 `source-atomic`
- **AND** 该 `targetSelection` SHALL 保留 `htmlPath`、`sourceSelector`、所属 `parentBlockSelector` 与组件类型
- **AND** 系统 SHALL NOT 仅记录 parent block selector 而丢失该 CMS island 的源组件边界

#### Scenario: 确认选择时返回同一目标选择
- **WHEN** 用户在携带 `targetSelection` 的 CMS 选择会话中确认栏目或内容选择
- **THEN** 系统 SHALL 在确认结果中返回同一个 `targetSelection`
- **AND** 系统 SHALL 使该结果可以直接作为后续 agent handoff 与正式写入的目标输入

### Requirement: CMS 选择器确认结果必须使用统一的结构化协议
系统 SHALL 将 CMS 选择器的确认结果返回为统一的结构化协议，而不是继续暴露原始的 `tab + catalogs[] + contents[]` UI 结果；该协议 MUST 以 `targetSelection` 作为规范化目标入口，并 MUST 保留稳定的 `editBoundary` 字段，以便后续 handoff 与写入链路直接消费；该协议 MUST 使用面向执行的数据来源模式，而不是继续让下游根据当前页签、勾选状态或快照内容反推业务语义；该协议 MAY 继续保留 `targetBlock` 作为 parent block 兼容上下文。

#### Scenario: 确认结果返回统一协议外壳
- **WHEN** 用户在 CMS 选择器中点击确认选择
- **THEN** 系统 SHALL 返回带有 `version`、`siteId`、`targetSelection`、`selectionKind`、`sourceType` 和 `selectionMode` 的结果对象
- **AND** `version` SHALL 升级为反映 runtime locator target 结构的新 contract 版本
- **AND** 系统 SHALL 使下游消费者无需根据空数组、当前页签或其他 UI 状态推断业务语义

#### Scenario: 确认结果显式保留当前站点上下文
- **WHEN** 用户在某个站点上下文中确认栏目或内容选择
- **THEN** 系统 SHALL 在确认结果顶层返回对应的 `siteId`
- **AND** 后续 handoff、skill 输入与 apply tool SHALL 能直接复用该站点上下文

#### Scenario: CMS island 结果继续暴露 parent block 兼容上下文
- **WHEN** 系统为某个 `cms-island` 目标生成 CMS 选择确认结果
- **THEN** 结果 SHALL 保留 `targetSelection.kind: cms-island`
- **AND** 结果 SHALL 保留 `targetSelection.editBoundary: source-atomic`
- **AND** 结果 SHALL 保留 `targetSelection.sourceSelector` 作为源 CMS 标签选择器
- **AND** 结果 SHALL 保留 `targetSelection.parentBlockSelector` 与 `targetSelection.htmlPath`
- **AND** 结果 MAY 同时返回 `targetBlock.selector`，其值 SHALL 等于该目标的 `parentBlockSelector`

#### Scenario: 确认结果根据 sourceType 保留精确 durable payload 与 snapshot
- **WHEN** 系统生成 CMS 选择确认结果
- **THEN** `catalogs-by-parent` 结果 SHALL 返回 `parentCatalogId` 与 `snapshot.parentCatalog`
- **AND** `catalogs-by-ids` 结果 SHALL 返回按选择顺序排列的 `catalogIds` 与 `snapshot.catalogs`
- **AND** `contents-by-catalog` 结果 SHALL 返回 `catalogId` 与 `snapshot.catalog`
- **AND** `contents-by-ids` 结果 SHALL 返回按选择顺序排列的 `contentIds`
- **AND** `contents-by-ids` 结果 SHALL 同时返回单一的 `catalogId`
- **AND** 系统 SHALL 将栏目或内容对象快照放在 `snapshot` 字段中，而不是要求下游重新查询才能恢复用户刚确认的来源上下文

### Requirement: CMS 选择确认结果必须保留稳定的 CMS 目标 identity
系统 SHALL 在 CMS 选择器确认结果中的 `targetSelection` 里保留与 preview 选区一致的 CMS runtime locator，使后续自动 handoff 与正式写入路径可以围绕同一个 source target 工作。

#### Scenario: 已选 CMS island 的确认结果保留 runtime locator
- **WHEN** 用户在一个 `cms-island` 目标上下文中完成 CMS 选择确认
- **THEN** 系统 SHALL 在确认结果的 `targetSelection` 中保留 `htmlPath`、`sourceSelector`、`parentBlockSelector`、组件类型和 `editBoundary: source-atomic`
- **AND** 系统 SHALL NOT 要求该目标存在作者态 `sourceId`

#### Scenario: locator-first 结果不得伪造新的源码 identity
- **WHEN** 用户在一个来自旧页面或经结构改写后的 `cms-island` 目标上下文中完成 CMS 选择确认
- **THEN** 系统 SHALL 继续返回该目标当前可用的 runtime locator 字段
- **AND** 系统 SHALL NOT 伪造一个与源 CMS 标签无关的 `sourceId` 或其他作者态内部 id
