## Purpose
定义 `page-builder` 预览中的 CMS rendering 结果如何作为独立的 `cms-island` 选择目标参与命中、隐藏上下文传递和下游 source-atomic 写入，确保预览命中的运行时 DOM 可以稳定映射回作者 HTML 中的源 CMS 标签边界。

## Requirements

### Requirement: CMS 渲染组件必须暴露稳定的 `cms-island` 选择目标
系统 SHALL 将每个顶层 `cms-catalog` / `cms-content` 定义为独立的 `cms-island` 选择目标，并 SHALL 使该目标把预览中的渲染结果稳定映射回源 HTML 中唯一的 CMS 标签边界，而不得把渲染子节点本身视为独立源码目标。

#### Scenario: 混合 block 中的 CMS 渲染结果映射回源 CMS 标签
- **WHEN** 某个 `data-proma-block-id` block 中同时包含静态兄弟节点和一个顶层 `cms-content` 或 `cms-catalog`
- **THEN** 系统 SHALL 为该 CMS 标签创建 `kind: cms-island` 的选择目标
- **AND** 该目标 SHALL 记录源 CMS 标签的唯一 `selector`
- **AND** 该目标 SHALL 记录所属 `parentBlockSelector`
- **AND** 系统 SHALL NOT 因为存在静态兄弟节点而把整个 parent block 自动视为同一个 CMS 选择目标

#### Scenario: 同一 CMS island 的多个渲染根节点共享同一目标
- **WHEN** 某个顶层 CMS 标签在预览中渲染出多个顶层根节点
- **THEN** 系统 SHALL 将这些根节点视为同一个 `cms-island` 选择目标的渲染结果
- **AND** 系统 SHALL NOT 将这些根节点拆分成多个独立的 CMS 选择目标

#### Scenario: 同一 block 内的多个顶层 CMS 标签分别形成独立目标
- **WHEN** 同一个 parent block 中存在多个顶层 `cms-catalog` / `cms-content`
- **THEN** 系统 SHALL 为每个顶层 CMS 标签创建独立的 `cms-island` 选择目标
- **AND** 系统 SHALL NOT 将多个 CMS 标签自动合并成一个复合选择目标

### Requirement: `cms-island` 目标必须声明 source-atomic 编辑边界
系统 SHALL 将 `cms-island` 目标标记为 `editBoundary: source-atomic`，并 SHALL 要求所有下游选择上下文、agent handoff 和正式写入路径围绕该源 CMS 标签整体工作，而不得把预览中渲染出的子节点当作独立静态源码节点增删改；同一 contract 下的普通静态 block 目标 SHALL 使用 `editBoundary: block`，以避免不同目标类型回退到不一致的边界表达。

#### Scenario: 向下游传递 source-atomic 边界
- **WHEN** 系统将一个 `cms-island` 目标传递给隐藏选择上下文、CMS handoff 或正式写入路径
- **THEN** 系统 SHALL 在该目标元数据中明确声明其 `component`
- **AND** 系统 SHALL 明确声明 `editBoundary: source-atomic`
- **AND** 系统 SHALL 明确声明该目标对应的是源 HTML 中的 CMS 标签边界
- **AND** 系统 SHALL 明确声明该目标的编辑边界为整体组件级别，而不是渲染子节点级别

#### Scenario: 普通 block 目标不得复用 CMS 的 source-atomic 边界
- **WHEN** 系统为某个普通静态区块序列化统一的 `targetSelection`
- **THEN** 系统 SHALL 传递 `kind: block`
- **AND** 系统 SHALL 传递 `editBoundary: block`
- **AND** 系统 SHALL NOT 将普通静态区块错误标记为 `source-atomic`

#### Scenario: 下游动作不得把渲染子节点当作独立源码节点
- **WHEN** 某个下游动作收到 `kind: cms-island` 的目标
- **THEN** 该动作 MUST 以目标的源 CMS 标签 `selector` 作为唯一写入入口
- **AND** 该动作 MUST NOT 直接对预览中渲染出的 `li`、`a`、`img`、`span`、`h3` 等子节点执行独立源码写入

### Requirement: `cms-island` 目标必须暴露稳定 source identity
系统 SHALL 为每个顶层 `cms-catalog` / `cms-content` 暴露稳定 source identity，并 SHALL 通过 preview 渲染根节点注解和 `targetSelection` 将该身份传递到下游，而不再只依赖 selector snapshot 作为唯一身份表达。

#### Scenario: 顶层 CMS 标签的稳定 identity 被镜像到渲染根节点
- **WHEN** 某个顶层 `cms-catalog` 或 `cms-content` 在作者态源码中存在稳定 `sourceId`
- **THEN** 系统 SHALL 在其 preview 渲染根节点上镜像该 `sourceId`
- **AND** 该 `cms-island` 的 `targetSelection` SHALL 保留同一个 `sourceId`

#### Scenario: 同一 CMS island 的多个渲染根节点共享同一 `sourceId`
- **WHEN** 某个顶层 CMS 标签在 preview 中渲染出多个顶层根节点
- **THEN** 系统 SHALL 为这些根节点写入同一个 `sourceId`
- **AND** 系统 SHALL 将它们解析为同一个 `cms-island` 目标

### Requirement: Preview bridge 在 CMS identity 不完整或冲突时必须 fail closed
系统 SHALL 在 preview bridge 解析 CMS 渲染结果为 `cms-island` 目标时，对 identity 元数据执行一致性检查；当该 identity 不完整或冲突时，系统 MUST 不得猜测合并为另一个 CMS 目标。

#### Scenario: 同一子树命中多个不同 CMS identity 时不猜测目标
- **WHEN** preview bridge 命中的某个渲染子树内存在多个不同的 CMS source identity
- **THEN** 系统 SHALL NOT 将该子树解析为单一的 `cms-island` 目标
- **AND** 系统 SHALL NOT 猜测将其中任意一个 identity 作为最终结果

#### Scenario: 关键 CMS identity 元数据缺失时不提升为 cms-island
- **WHEN** preview bridge 命中的渲染节点缺少构造 `cms-island` 所需的关键元数据
- **THEN** 系统 SHALL NOT 将该节点提升为 `cms-island` 目标
- **AND** 系统 SHALL NOT 使用不相关的 parent block 或相邻 CMS 标签来补猜该身份
