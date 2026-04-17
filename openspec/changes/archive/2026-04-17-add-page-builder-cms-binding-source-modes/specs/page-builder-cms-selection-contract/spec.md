## MODIFIED Requirements

### Requirement: CMS 选择器确认结果必须使用统一的结构化协议
系统 SHALL 将 CMS 选择器的确认结果返回为统一的结构化协议，而不是继续暴露原始的 `tab + catalogs[] + contents[]` UI 结果；该协议 MUST 以 `targetSelection` 作为规范化目标入口，并 MUST 保留稳定的 `editBoundary` 字段，以便后续 handoff 与写入链路直接消费；该协议 MUST 使用面向执行的数据来源模式，而不是继续让下游根据当前页签、勾选状态或快照内容反推业务语义；该协议 MAY 继续保留 `targetBlock` 作为 parent block 兼容上下文。

#### Scenario: 确认结果返回统一协议外壳
- **WHEN** 用户在 CMS 选择器中点击确认选择
- **THEN** 系统 SHALL 返回带有 `version`、`siteId`、`targetSelection`、`selectionKind`、`sourceType` 和 `selectionMode` 的结果对象
- **AND** `version` SHALL 升级为新的 contract 版本，以反映新的来源模式
- **AND** 系统 SHALL 使下游消费者无需根据空数组、当前页签或其他 UI 状态推断业务语义

#### Scenario: 确认结果显式保留当前站点上下文
- **WHEN** 用户在某个站点上下文中确认栏目或内容选择
- **THEN** 系统 SHALL 在确认结果顶层返回对应的 `siteId`
- **AND** 后续 handoff、skill 输入与 apply tool SHALL 能直接复用该站点上下文

#### Scenario: CMS island 结果继续暴露 parent block 兼容上下文
- **WHEN** 系统为某个 `cms-island` 目标生成 CMS 选择确认结果
- **THEN** 结果 SHALL 保留 `targetSelection.kind: cms-island`
- **AND** 结果 SHALL 保留 `targetSelection.editBoundary: source-atomic`
- **AND** 结果 SHALL 保留 `targetSelection.selector` 作为源 CMS 标签选择器
- **AND** 结果 MAY 同时返回 `targetBlock.selector`，其值 SHALL 等于该目标的 `parentBlockSelector`

#### Scenario: 确认结果根据 sourceType 保留精确 durable payload 与 snapshot
- **WHEN** 系统生成 CMS 选择确认结果
- **THEN** `catalogs-by-parent` 结果 SHALL 返回 `parentCatalogId` 与 `snapshot.parentCatalog`
- **AND** `catalogs-by-ids` 结果 SHALL 返回按选择顺序排列的 `catalogIds` 与 `snapshot.catalogs`
- **AND** `contents-by-catalog` 结果 SHALL 返回 `catalogId` 与 `snapshot.catalog`
- **AND** `contents-by-ids` 结果 SHALL 返回按选择顺序排列的 `contentIds`
- **AND** `contents-by-ids` 结果 SHALL 同时返回单一的 `catalogId`
- **AND** 系统 SHALL 将栏目或内容对象快照放在 `snapshot` 字段中，而不是要求下游重新查询才能恢复用户刚确认的来源上下文

### Requirement: 栏目选择结果必须区分“父栏目下子栏目集合”与“固定栏目集合”
系统 SHALL 将栏目页签中的确认结果编码为两类不同的栏目来源模式，而不是继续仅根据已选栏目数量输出 single / multiple 固定栏目语义；当用户只是定位到当前栏目而未勾选固定栏目时，系统 MUST 将其解释为“当前栏目下的直接子栏目集合”；当用户勾选一个或多个固定栏目时，系统 MUST 将其解释为固定栏目集合。

#### Scenario: 未勾选固定栏目而确认当前栏目时返回父栏目来源
- **WHEN** 用户位于栏目页签，当前已选中某个栏目，且没有勾选任何固定栏目
- **THEN** 系统 SHALL 返回 `selectionKind: catalogs`
- **AND** 系统 SHALL 返回 `sourceType: catalogs-by-parent`
- **AND** 系统 SHALL 返回 `selectionMode: children-of-parent`
- **AND** 系统 SHALL 返回该栏目的 `parentCatalogId`
- **AND** 系统 SHALL 返回对应的 `snapshot.parentCatalog`

#### Scenario: 勾选一个或多个栏目时返回固定栏目集合来源
- **WHEN** 用户位于栏目页签，并勾选了一个或多个栏目
- **THEN** 系统 SHALL 返回 `selectionKind: catalogs`
- **AND** 系统 SHALL 返回 `sourceType: catalogs-by-ids`
- **AND** 系统 SHALL 返回 `selectionMode: fixed-items`
- **AND** 系统 SHALL 返回按用户勾选顺序排列的 `catalogIds`
- **AND** 系统 SHALL 返回对应的 `snapshot.catalogs`

### Requirement: 内容选择结果必须区分“按当前栏目取内容”与“固定内容集合”
系统 SHALL 将内容页签中的确认结果同时支持“按当前栏目动态取内容”和“固定内容条目集合”两类来源语义，而不得继续将内容结果限制为固定内容条目集合这一种模式。

#### Scenario: 未勾选固定内容而确认当前栏目时返回按栏目取内容来源
- **WHEN** 用户位于内容页签，当前已选中某个栏目，且没有勾选任何固定内容条目
- **THEN** 系统 SHALL 返回 `selectionKind: contents`
- **AND** 系统 SHALL 返回 `sourceType: contents-by-catalog`
- **AND** 系统 SHALL 返回 `selectionMode: by-catalog`
- **AND** 系统 SHALL 返回该栏目的 `catalogId`
- **AND** 系统 SHALL 返回对应的 `snapshot.catalog`

#### Scenario: 勾选一个或多个固定内容条目时返回 fixed-ids 来源
- **WHEN** 用户位于内容页签，并勾选了一个或多个固定内容条目
- **THEN** 系统 SHALL 返回 `selectionKind: contents`
- **AND** 系统 SHALL 返回 `sourceType: contents-by-ids`
- **AND** 系统 SHALL 返回 `selectionMode: fixed-items`
- **AND** 系统 SHALL 要求这些固定内容条目全部来自当前同一个栏目
- **AND** 系统 SHALL 返回该固定集合所属的单一 `catalogId`
- **AND** 系统 SHALL 返回按用户勾选顺序排列的 `contentIds`
- **AND** 系统 SHALL 返回对应的 `snapshot.contents`
