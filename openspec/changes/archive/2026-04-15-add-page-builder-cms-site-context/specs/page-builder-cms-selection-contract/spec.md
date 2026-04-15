## ADDED Requirements

### Requirement: CMS 选择确认结果必须保留显式站点上下文
系统 SHALL 在 CMS 选择器的确认结果中保留显式 `siteId`，并 SHALL 使该站点上下文与 `targetSelection`、`selectionKind`、`catalogIds`、`contentIds` 一起成为可直接交给后续 handoff 与 apply 链路消费的 durable payload。

#### Scenario: 栏目选择结果返回当前选中站点
- **WHEN** 用户在某个已选站点的 CMS 浏览弹框中确认一个或多个栏目
- **THEN** 系统 SHALL 在确认结果中返回当前弹框所选的 `siteId`
- **AND** 系统 SHALL 保留该站点下对应的 `catalogIds` 与 `snapshot.catalogs`
- **AND** 系统 SHALL 不要求下游再从宿主配置反推本次选择所属站点

#### Scenario: 内容选择结果返回当前选中站点
- **WHEN** 用户在某个已选站点的 CMS 浏览弹框中确认一个或多个内容条目
- **THEN** 系统 SHALL 在确认结果中返回当前弹框所选的 `siteId`
- **AND** 系统 SHALL 保留该站点下对应的 `catalogIds`、`contentIds` 与 `snapshot.contents`
- **AND** 系统 SHALL 继续保留同一 `targetSelection` 供后续写入链路直接复用

#### Scenario: 新协议版本用来表达显式站点上下文
- **WHEN** 系统生成包含显式 `siteId` 的 CMS 选择确认结果
- **THEN** 系统 SHALL 升级 `PageBuilderCmsSelectionResult` 的 contract 版本
- **AND** 系统 SHALL 使下游能据此区分旧结果与包含显式站点上下文的新结果
