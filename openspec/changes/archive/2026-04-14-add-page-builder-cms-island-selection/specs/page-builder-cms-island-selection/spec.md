## ADDED Requirements

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
