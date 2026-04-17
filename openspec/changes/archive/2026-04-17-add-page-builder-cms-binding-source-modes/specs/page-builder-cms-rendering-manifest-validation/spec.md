## MODIFIED Requirements

### Requirement: 系统必须从作者 HTML 派生 CMS rendering manifest
系统 SHALL 从 page-builder 作者 HTML 中扫描 top-level `cms-catalog` 与 `cms-content` islands，并将其派生为 `workspace-files/.proma/cms-rendering-manifest.json`，用于 block 级识别、诊断和后续导出定位，而不是把 manifest 当作独立维护的真相来源；manifest props MUST 保留新的 fixed-ids 来源信息。

#### Scenario: 包含 top-level CMS islands 的页面生成 block 级 manifest entries
- **WHEN** 某个 page-builder 工作区的 `workspace-files/index.html` 包含一个或多个 top-level `cms-catalog` 或 `cms-content`
- **THEN** 系统 SHALL 生成或更新 `workspace-files/.proma/cms-rendering-manifest.json`
- **AND** manifest 中每个 island entry SHALL 至少包含 `blockId`、`component`、`props`、`selectorSnapshot`、`htmlPath` 和 `islandIndex`

#### Scenario: manifest props 保留归一化后的 siteId 与 ordered ids
- **WHEN** 某个 top-level CMS island 在作者态源码中显式写出 `site-id` 或 `ids`
- **THEN** manifest entry 的 `props` SHALL 保留归一化后的 `siteId`
- **AND** 当该标签存在 `ids` 时，manifest entry 的 `props` SHALL 同时保留对应的有序 `ids`
- **AND** 后续 preview、apply 与 static export SHALL 可直接复用这些来源上下文

#### Scenario: manifest 只索引 top-level CMS islands
- **WHEN** 作者 HTML 在某个 `cms-*` 节点内部又出现另一个 `cms-*`
- **THEN** manifest SHALL 仅将最外层 `cms-*` 记录为可渲染 island entry
- **AND** 系统 SHALL NOT 将内层嵌套 `cms-*` 作为第二个独立 manifest entry

#### Scenario: 不含 CMS islands 的页面生成空 manifest
- **WHEN** 某个 page-builder 工作区的作者 HTML 不包含任何 top-level `cms-catalog` 或 `cms-content`
- **THEN** 系统 SHALL 将 `workspace-files/.proma/cms-rendering-manifest.json` 更新为当前 HTML 对应的最新派生结果
- **AND** 该 manifest SHALL 包含空的 `entries`

### Requirement: 系统必须对 CMS rendering 作者 HTML 输出结构化校验结果
系统 SHALL 对 page-builder 作者 HTML 中的 CMS rendering 写法执行结构化校验，并输出可供后续工具与诊断链路消费的 diagnostics，而不是仅依赖 prompt 约束或人工约定；validator MUST 识别 fixed-ids 来源模式与查询式来源模式之间的合法与非法组合。

#### Scenario: 非法 CMS 结构被标记为 error diagnostics
- **WHEN** 作者 HTML 中出现嵌套 `cms-*`、`cms-content` 缺少 `catalog-id`、`cms-content` 在 `ids` 模式下混用分页查询字段、`cms-*` 混用 `ids` 与冲突查询 props、缺少 `v-slot:default` 或 island 内包含危险标签
- **THEN** 系统 SHALL 为这些问题输出 `error` 级 diagnostics
- **AND** 每条 diagnostic SHALL 至少包含问题代码、可读消息和对应的组件或定位上下文

#### Scenario: 常见但可恢复的模板问题被标记为 warning 或 info diagnostics
- **WHEN** 作者 HTML 中出现 `#default` 等 slot 简写、未知 props、可选 URL 字段缺少 `v-if` 保护、空 default slot 或缺少 empty/error slot
- **THEN** 系统 SHALL 为这些问题输出 `warning` 或 `info` 级 diagnostics
- **AND** diagnostics SHALL 能区分问题严重度，而不是将所有问题统一视为阻断错误

#### Scenario: site-id 与 ids 作为受支持属性且旧标签缺省站点仍然有效
- **WHEN** 作者 HTML 中的 `cms-catalog` 或 `cms-content` 显式写出 `site-id` 或 `ids`
- **THEN** validator SHALL 将这些属性视为受支持属性
- **AND** 系统 SHALL NOT 将 `site-id` 或 `ids` 标记为 unknown prop
- **AND** 当旧标签缺少 `site-id` 时，validator SHALL 继续允许其通过，并由运行时按 `siteId = 1` 兼容执行
