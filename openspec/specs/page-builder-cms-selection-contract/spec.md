## Purpose
定义 `page-builder` 中 CMS 选择器如何在区块上下文下生成统一的结构化选择结果，供后续绑定模型直接消费。

## Requirements

### Requirement: CMS 选择会话必须绑定到明确的目标区块
系统 SHALL 在打开 CMS 选择器时为当前会话附带明确的目标区块上下文，并 SHALL 将该上下文用于生成确认后的选择结果。

#### Scenario: 已选区块打开选择器时携带 selector
- **WHEN** Builder 页已存在当前选中的预览区块，且用户通过区块工具条或其他受支持入口打开 CMS 选择器
- **THEN** 系统 SHALL 为本次 CMS 选择会话记录该区块的 `targetBlock.selector`
- **AND** 系统 SHALL 不要求下游消费者再从外层工作流补拼目标区块信息

#### Scenario: 确认选择时返回同一目标区块
- **WHEN** 用户在携带 `targetBlock.selector` 的 CMS 选择会话中确认栏目或内容选择
- **THEN** 系统 SHALL 在确认结果中返回同一个 `targetBlock.selector`
- **AND** 系统 SHALL 使该结果可以直接作为后续绑定候选输入

### Requirement: CMS 选择器确认结果必须使用统一的结构化协议
系统 SHALL 将 CMS 选择器的确认结果返回为统一的结构化协议，而不是继续暴露原始的 `tab + catalogs[] + contents[]` UI 结果。

#### Scenario: 确认结果返回统一协议外壳
- **WHEN** 用户在 CMS 选择器中点击确认选择
- **THEN** 系统 SHALL 返回带有 `version`、`targetBlock`、`selectionKind`、`sourceType` 和 `selectionMode` 的结果对象
- **AND** 系统 SHALL 使下游消费者无需根据空数组、当前页签或其他 UI 状态推断业务语义

#### Scenario: 确认结果区分 durable payload 与 snapshot
- **WHEN** 系统生成 CMS 选择确认结果
- **THEN** 系统 SHALL 将 `catalogIds`、`contentIds` 等稳定标识作为 durable payload 返回
- **AND** 系统 SHALL 将栏目或内容对象快照放在独立的 `snapshot` 字段中

### Requirement: 栏目选择结果必须表达单栏目与多栏目固定语义
系统 SHALL 将栏目页签中的确认结果编码为固定栏目选择语义，并 SHALL 根据已选栏目数量区分单栏目与多栏目两种模式。

#### Scenario: 确认单个栏目时返回 single 模式
- **WHEN** 用户在栏目页签中仅确认 1 个栏目
- **THEN** 系统 SHALL 返回 `selectionKind: catalogs`
- **AND** 系统 SHALL 返回 `sourceType: catalogs`
- **AND** 系统 SHALL 返回 `selectionMode: single`
- **AND** 系统 SHALL 返回该栏目的 `catalogIds` 与对应 `snapshot.catalogs`

#### Scenario: 确认多个栏目时返回 multiple 模式
- **WHEN** 用户在栏目页签中确认多个栏目
- **THEN** 系统 SHALL 返回 `selectionKind: catalogs`
- **AND** 系统 SHALL 返回 `sourceType: catalogs`
- **AND** 系统 SHALL 返回 `selectionMode: multiple`
- **AND** 系统 SHALL 返回所有已选栏目的 `catalogIds` 与对应 `snapshot.catalogs`

### Requirement: 内容选择结果必须仅表达固定内容条目集合
系统 SHALL 将内容页签中的确认结果编码为固定内容条目集合，而不得在本能力中表达动态查询或“最新 N 条”语义。

#### Scenario: 确认固定内容条目时返回 fixed-items 模式
- **WHEN** 用户在内容页签中确认一个或多个已勾选内容条目
- **THEN** 系统 SHALL 返回 `selectionKind: contents`
- **AND** 系统 SHALL 返回 `sourceType: contents-fixed`
- **AND** 系统 SHALL 返回 `selectionMode: fixed-items`
- **AND** 系统 SHALL 返回所有已选内容的 `contentIds`
- **AND** 系统 SHALL 返回由已选内容去重得到的 `catalogIds`
- **AND** 系统 SHALL 返回对应的 `snapshot.contents`

#### Scenario: 第一版内容结果不表达动态查询
- **WHEN** 用户通过 CMS 选择器确认内容选择
- **THEN** 系统 SHALL 不在结果中返回 `latest-by-catalog`、`querySpec` 或 `limit` 等动态查询语义
- **AND** 系统 SHALL 仅支持固定内容条目集合这一种内容来源模式
