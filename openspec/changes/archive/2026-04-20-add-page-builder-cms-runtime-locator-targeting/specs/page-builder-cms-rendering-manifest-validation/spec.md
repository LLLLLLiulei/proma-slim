## MODIFIED Requirements

### Requirement: 系统必须从作者 HTML 派生 CMS rendering manifest
系统 SHALL 从 page-builder 作者 HTML 中扫描 top-level `cms-catalog` 与 `cms-content` islands，并将其派生为 `workspace-files/.proma/cms-rendering-manifest.json`，用于 CMS source 级识别、诊断和后续导出定位，而不是把 manifest 当作独立维护的真相来源；manifest props MUST 保留新的 fixed-ids 来源信息。

#### Scenario: 包含 top-level CMS islands 的页面生成 locator 级 manifest entries
- **WHEN** 某个 page-builder 工作区的 `workspace-files/index.html` 包含一个或多个 top-level `cms-catalog` 或 `cms-content`
- **THEN** 系统 SHALL 生成或更新 `workspace-files/.proma/cms-rendering-manifest.json`
- **AND** manifest 中每个 island entry SHALL 至少包含 `component`、`props`、`sourceSelectorSnapshot`、`parentBlockSelectorSnapshot`、`htmlPath` 和 `islandIndex`
- **AND** 当当前父级普通 block 已有兼容用 `blockId` 时，manifest entry MAY 额外保留该 `blockId` 作为兼容摘要，而不是作为 CMS source identity

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

### Requirement: CMS rendering manifest 和 validator 必须保留并校验稳定 source identity
系统 SHALL 在 CMS rendering manifest 和结构化校验结果中保留顶层 CMS island 的稳定 runtime locator identity，并 MUST 对 locator 无法导出、导出不唯一或上下文冲突执行阻断性校验，而不得继续把作者态 `sourceId` 视为正式 identity。

#### Scenario: manifest entry 保留显式 locator snapshot
- **WHEN** 某个顶层 `cms-catalog` 或 `cms-content` 可以从作者态源码中导出稳定的 `sourceSelectorSnapshot` 与 `parentBlockSelectorSnapshot`
- **THEN** 该 island 的 manifest entry SHALL 保留这些 locator snapshot
- **AND** 后续 preview、selection、handoff 与 apply 链路 SHALL 能复用该 locator 语义

#### Scenario: 顶层 CMS island 无法导出唯一 locator 时被标记为 error
- **WHEN** 作者态 HTML 中某个顶层 `cms-*` island 无法导出唯一的 `sourceSelectorSnapshot`、无法导出 `parentBlockSelectorSnapshot`，或其 locator 上下文发生冲突
- **THEN** validator SHALL 输出 `error` 级 diagnostic
- **AND** 系统 SHALL NOT 将这组无法稳定定位的 source target 视为合法的 CMS locator 集合

## ADDED Requirements

### Requirement: 作者态 HTML 不得持久化 runtime-only CMS locator 元数据
系统 SHALL 将 `data-proma-cms-source-id` 和 `data-proma-cms-island-*` 视为 runtime-only 的内部定位字段；它们 MAY 出现在 preview 运行时 DOM 中，但 MUST NOT 作为 page-builder 作者态 HTML 的正式 contract 被持久化。

#### Scenario: 作者态 HTML 残留 runtime-only locator attrs 时输出诊断
- **WHEN** `workspace-files/index.html` 中的 `cms-catalog` 或 `cms-content` 仍显式带有 `data-proma-cms-source-id` 或任意 `data-proma-cms-island-*`
- **THEN** validator SHALL 为这些字段输出结构化 diagnostic
- **AND** 该 diagnostic SHALL 明确指出这些字段属于 runtime-only 元数据，而不是合法作者态属性

#### Scenario: 支持的 mutation pipeline 自动剥离 runtime-only locator attrs
- **WHEN** 某次受支持的 page-builder 作者态 HTML mutation 写回包含 `data-proma-cms-source-id` 或 `data-proma-cms-island-*` 的 `cms-*` 标签
- **THEN** 系统 SHALL 在最终落盘前剥离这些 runtime-only locator attrs
- **AND** 系统 SHALL NOT 将这些内部定位字段继续保存在作者态 HTML 中
