## MODIFIED Requirements

### Requirement: CMS 渲染组件必须暴露稳定的 `cms-island` 选择目标
系统 SHALL 将每个顶层 `cms-catalog` / `cms-content` 定义为独立的 `cms-island` 选择目标，并 SHALL 使该目标把预览中的渲染结果稳定映射回源 HTML 中唯一的 CMS 标签边界，而不得把渲染子节点本身视为独立源码目标。

#### Scenario: 混合 block 中的 CMS 渲染结果映射回源 CMS 标签
- **WHEN** 某个普通 block 中同时包含静态兄弟节点和一个顶层 `cms-content` 或 `cms-catalog`
- **THEN** 系统 SHALL 为该 CMS 标签创建 `kind: cms-island` 的选择目标
- **AND** 该目标 SHALL 记录源 CMS 标签的唯一 `sourceSelector`
- **AND** 该目标 SHALL 记录所属 `parentBlockSelector`
- **AND** 该目标 SHALL 记录 `component` 与 `htmlPath`
- **AND** 系统 SHALL NOT 因为存在静态兄弟节点而把整个 parent block 自动视为同一个 CMS 选择目标

#### Scenario: 同一 CMS island 的多个渲染根节点共享同一目标
- **WHEN** 某个顶层 CMS 标签在预览中渲染出多个顶层根节点
- **THEN** 系统 SHALL 将这些根节点视为同一个 `cms-island` 选择目标的渲染结果
- **AND** 这些根节点 SHALL 共享同一组 `sourceSelector`、`parentBlockSelector`、`component` 与 `htmlPath`
- **AND** 系统 SHALL NOT 将这些根节点拆分成多个独立的 CMS 选择目标

#### Scenario: 同一 block 内的多个顶层 CMS 标签分别形成独立目标
- **WHEN** 同一个 parent block 中存在多个顶层 `cms-catalog` / `cms-content`
- **THEN** 系统 SHALL 为每个顶层 CMS 标签创建独立的 `cms-island` 选择目标
- **AND** 每个目标 SHALL 保留各自唯一的 `sourceSelector`
- **AND** 系统 SHALL NOT 将多个 CMS 标签自动合并成一个复合选择目标

### Requirement: `cms-island` 目标必须暴露稳定 source identity
系统 SHALL 为每个顶层 `cms-catalog` / `cms-content` 暴露稳定的 runtime locator identity，并 SHALL 通过 preview 渲染根节点注解和 `targetSelection` 将该 identity 传递到下游，而不再依赖作者态 `sourceId` 作为正式 identity。

#### Scenario: 顶层 CMS 标签的 runtime locator 被镜像到渲染根节点
- **WHEN** 某个顶层 `cms-catalog` 或 `cms-content` 在 preview 中完成首次挂载
- **THEN** 系统 SHALL 在其渲染根节点上镜像同一组 `sourceSelector`、`parentBlockSelector`、`component` 与 `htmlPath`
- **AND** 该 `cms-island` 的 `targetSelection` SHALL 保留同一个 runtime locator
- **AND** 系统 SHALL NOT 要求作者态源码中存在 `sourceId`

#### Scenario: 同一 CMS island 的多个渲染根节点共享同一 runtime locator
- **WHEN** 某个顶层 CMS 标签在 preview 中渲染出多个顶层根节点
- **THEN** 系统 SHALL 为这些根节点写入同一个 runtime locator
- **AND** 系统 SHALL 将它们解析为同一个 `cms-island` 目标

### Requirement: Preview bridge 在 CMS identity 不完整或冲突时必须 fail closed
系统 SHALL 在 preview bridge 解析 CMS 渲染结果为 `cms-island` 目标时，对 runtime locator 元数据执行一致性检查；当该 locator 不完整或冲突时，系统 MUST 不得猜测合并为另一个 CMS 目标。

#### Scenario: 同一子树命中多个不同 locator 时不猜测目标
- **WHEN** preview bridge 命中的某个渲染子树内存在多个不同的 CMS locator identity
- **THEN** 系统 SHALL NOT 将该子树解析为单一的 `cms-island` 目标
- **AND** 系统 SHALL NOT 猜测将其中任意一个 locator 作为最终结果

#### Scenario: 关键 locator 元数据缺失时不提升为 cms-island
- **WHEN** preview bridge 命中的渲染节点缺少构造 `cms-island` 所需的关键 locator 元数据
- **THEN** 系统 SHALL NOT 将该节点提升为 `cms-island` 目标
- **AND** 系统 SHALL NOT 使用不相关的 parent block 或相邻 CMS 标签来补猜该 identity
