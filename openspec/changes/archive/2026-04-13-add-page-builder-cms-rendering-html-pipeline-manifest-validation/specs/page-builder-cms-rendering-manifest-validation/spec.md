## ADDED Requirements

### Requirement: Page-builder 作者态 HTML 写入必须通过统一的 CMS rendering mutation pipeline 完成
系统 SHALL 对 page-builder 作者态 `workspace-files/index.html` 的受支持写入操作使用统一的 HTML mutation pipeline，并在成功写回后基于最新 HTML 重新计算 preview state，而不是让每个写入入口各自维护独立的写后处理逻辑。

#### Scenario: 支持的 HTML 写入操作返回基于最新 HTML 计算的 preview state
- **WHEN** page-builder 的内联文字编辑、区块删除或图片替换成功修改了 `workspace-files/index.html`
- **THEN** 系统 SHALL 通过统一的 HTML mutation pipeline 完成该次写回
- **AND** 系统 SHALL 在返回结果前基于最新的 HTML 重新计算 preview state
- **AND** 当最新 HTML 新增或删除了顶层 `cms-*` 时，返回的 preview state SHALL 同步反映新的 `hasCmsRendering` 与 `requiresSameOrigin`

#### Scenario: HTML mutation 失败时不产生部分成功的派生产物状态
- **WHEN** 某次 page-builder HTML mutation 在目标定位、HTML 变换或写回阶段失败
- **THEN** 系统 SHALL 拒绝本次 mutation
- **AND** 系统 SHALL NOT 将本次失败视为 manifest 已刷新或 preview state 已成功更新

### Requirement: 系统必须从作者 HTML 派生 CMS rendering manifest
系统 SHALL 从 page-builder 作者 HTML 中扫描 top-level `cms-catalog` 与 `cms-content` islands，并将其派生为 `workspace-files/.proma/cms-rendering-manifest.json`，用于 block 级识别、诊断和后续导出定位，而不是把 manifest 当作独立维护的真相来源。

#### Scenario: 包含 top-level CMS islands 的页面生成 block 级 manifest entries
- **WHEN** 某个 page-builder 工作区的 `workspace-files/index.html` 包含一个或多个 top-level `cms-catalog` 或 `cms-content`
- **THEN** 系统 SHALL 生成或更新 `workspace-files/.proma/cms-rendering-manifest.json`
- **AND** manifest 中每个 island entry SHALL 至少包含 `blockId`、`component`、`props`、`selectorSnapshot`、`htmlPath` 和 `islandIndex`

#### Scenario: manifest 只索引 top-level CMS islands
- **WHEN** 作者 HTML 在某个 `cms-*` 节点内部又出现另一个 `cms-*`
- **THEN** manifest SHALL 仅将最外层 `cms-*` 记录为可渲染 island entry
- **AND** 系统 SHALL NOT 将内层嵌套 `cms-*` 作为第二个独立 manifest entry

#### Scenario: 不含 CMS islands 的页面生成空 manifest
- **WHEN** 某个 page-builder 工作区的作者 HTML 不包含任何 top-level `cms-catalog` 或 `cms-content`
- **THEN** 系统 SHALL 将 `workspace-files/.proma/cms-rendering-manifest.json` 更新为当前 HTML 对应的最新派生结果
- **AND** 该 manifest SHALL 包含空的 `entries`

### Requirement: 系统必须对 CMS rendering 作者 HTML 输出结构化校验结果
系统 SHALL 对 page-builder 作者 HTML 中的 CMS rendering 写法执行结构化校验，并输出可供后续工具与诊断链路消费的 diagnostics，而不是仅依赖 prompt 约束或人工约定。

#### Scenario: 非法 CMS 结构被标记为 error diagnostics
- **WHEN** 作者 HTML 中出现嵌套 `cms-*`、`cms-content` 缺少 `catalog-id`、缺少 `v-slot:default` 或 island 内包含危险标签
- **THEN** 系统 SHALL 为这些问题输出 `error` 级 diagnostics
- **AND** 每条 diagnostic SHALL 至少包含问题代码、可读消息和对应的组件或定位上下文

#### Scenario: 常见但可恢复的模板问题被标记为 warning 或 info diagnostics
- **WHEN** 作者 HTML 中出现 `#default` 等 slot 简写、未知 props、可选 URL 字段缺少 `v-if` 保护、空 default slot 或缺少 empty/error slot
- **THEN** 系统 SHALL 为这些问题输出 `warning` 或 `info` 级 diagnostics
- **AND** diagnostics SHALL 能区分问题严重度，而不是将所有问题统一视为阻断错误
