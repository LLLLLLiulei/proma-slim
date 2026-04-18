## ADDED Requirements

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
