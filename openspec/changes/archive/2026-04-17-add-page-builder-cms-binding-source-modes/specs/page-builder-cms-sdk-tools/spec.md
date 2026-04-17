## ADDED Requirements

### Requirement: 宿主管理的 CMS 读取链路必须支持受控的 fixed-ids 查询
系统 SHALL 在宿主管理的 CMS 读取链路中支持固定栏目 ID 和固定内容 ID 的受控查询能力，以供 preview、static export 与共享 runtime 复用；固定栏目 `ids` MAY 通过 batch API、并发单条读取或等价宿主实现完成；固定内容 `ids` MUST 绑定到单一 `catalogId`，并 MAY 通过该栏目内容列表的分页读取后本地过滤保序实现；系统 MUST NOT 退化为整棵栏目树或整站内容列表加载后再本地过滤。

#### Scenario: 固定栏目 ids 返回有序栏目摘要集合
- **WHEN** 宿主管理的 CMS 读取链路收到某个站点下的有序栏目 `ids`
- **THEN** 系统 SHALL 只查询这些 `ids` 对应的栏目摘要
- **AND** 返回结果 SHALL 保持输入 `ids` 的顺序

#### Scenario: 固定内容 ids 在单一栏目上下文内返回有序内容摘要集合
- **WHEN** 宿主管理的 CMS 读取链路收到某个站点下、同一 `catalogId` 内的有序内容 `ids`
- **THEN** 系统 SHALL 只在该 `catalogId` 的内容范围内解析这些 `ids`
- **AND** 返回结果 SHALL 保持输入 `ids` 的顺序

#### Scenario: fixed-ids 查询不得退化为全量加载
- **WHEN** 宿主管理的 CMS 读取链路执行固定栏目或固定内容 `ids` 查询
- **THEN** 系统 SHALL NOT 先加载整棵栏目树或整站内容列表再本地过滤
- **AND** 系统 SHALL NOT 将 fixed-ids 读取语义退化为全量扫描

#### Scenario: fixed-ids 查询部分失效时默认丢弃无效项
- **WHEN** 某次固定 `ids` 查询中只有部分栏目或内容仍然有效
- **THEN** 系统 SHALL 保留有效项并保持其原始顺序
- **AND** 系统 SHALL 默认丢弃失效项
- **AND** 当所有 `ids` 都失效时，系统 SHALL 返回空结果而不是结构化读取失败
