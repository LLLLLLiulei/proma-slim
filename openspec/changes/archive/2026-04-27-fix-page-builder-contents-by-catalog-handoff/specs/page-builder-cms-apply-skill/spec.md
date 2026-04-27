## ADDED Requirements

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
