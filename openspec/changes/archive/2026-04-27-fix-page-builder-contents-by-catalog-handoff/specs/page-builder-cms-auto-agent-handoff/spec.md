## ADDED Requirements

### Requirement: `contents-by-catalog` confirmed handoff 必须解析权威来源上下文
系统 SHALL 在 `contents-by-catalog` 的 confirmed CMS handoff 进入 agent 决策前，基于 `selection.siteId` 与 `selection.catalogId` 重新解析权威栏目 metadata 与最小内容探针，而不得直接把 CMS 浏览树节点 `snapshot.catalog` 当作正式绑定事实来源。

#### Scenario: confirmed handoff 在发送前刷新权威栏目与内容探针
- **WHEN** 用户确认的 CMS 选择结果满足 `selectionKind: contents` 且 `sourceType: contents-by-catalog`
- **THEN** 系统 SHALL 在注册 handoff record 与发送自动 handoff 之前，基于该 `siteId + catalogId` 刷新一次权威栏目 metadata
- **AND** 系统 SHALL 额外执行一次最小内容探针，以获得该目录当前的最小 contents 可用性上下文
- **AND** 系统 SHALL NOT 仅依据原始 `selection.snapshot.catalog.total`、`path` 或其他树节点元数据决定后续绑定语义

#### Scenario: handoff payload 同时保留原始 selection 与权威来源上下文
- **WHEN** `contents-by-catalog` 的权威刷新成功
- **THEN** 系统 SHALL 继续保留用户原始确认结果中的 `selection`
- **AND** 系统 SHALL 在 `PageBuilderCmsApplySkillInput` 中额外提供独立的 authoritative source context
- **AND** 该 authoritative source context SHALL 至少覆盖权威栏目 metadata 与最小内容探针结果
- **AND** 系统 SHALL 让后续 `cms-binding-apply` 决策可以访问该 authoritative source context

### Requirement: `contents-by-catalog` authoritative refresh 失败时必须阻断 confirmed handoff
系统 SHALL 在 `contents-by-catalog` 的 authoritative refresh 无法成功完成时阻断本次 confirmed handoff，而不得回退去信任 CMS 浏览树节点快照作为正式绑定事实。

#### Scenario: 权威栏目 metadata 刷新失败时阻断 handoff
- **WHEN** `contents-by-catalog` confirmed handoff 在刷新权威栏目 metadata 时失败
- **THEN** 系统 SHALL 阻断本次自动 handoff
- **AND** 系统 SHALL NOT 注册仅依赖树节点 `snapshot.catalog` 的 handoff record
- **AND** 系统 SHALL NOT 回退使用 `selection.snapshot.catalog` 继续发送决策请求

#### Scenario: 最小内容探针失败时阻断 handoff
- **WHEN** `contents-by-catalog` confirmed handoff 在刷新最小内容探针时失败
- **THEN** 系统 SHALL 阻断本次自动 handoff
- **AND** 系统 SHALL 保留现有自动 handoff 失败时的用户现场与错误反馈能力
- **AND** 系统 SHALL NOT 把该失败静默降级为继续使用树节点快照
