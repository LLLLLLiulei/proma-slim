## ADDED Requirements

### Requirement: CMS authoring contract 必须支持按组件发布和消费人类可读 guidance
系统 SHALL 让 canonical CMS authoring contract 不仅能派生机器可读 digest，也能支持按 `cms-catalog` 与 `cms-content` 分别发布和消费的人类可读 guidance；这些 guidance MUST 保持 component-specific，使 prompt/doc 消费者能够只读取当前组件相关的 props、source modes、slot scope、字段语义和推荐写法，而不必同时加载另一个组件的无关 authoring 噪音。

#### Scenario: `cms-catalog` guidance 只暴露栏目组件相关 surface
- **WHEN** 系统基于 canonical contract 发布或消费 `cms-catalog` 的人类可读 guidance
- **THEN** 该 guidance SHALL 只包含 `cms-catalog` 当前受支持的 props、source modes、slot scope 和 `item` 字段语义
- **AND** 系统 SHALL NOT 将 `publishUrl`、`listLogoUrl` 或其他 `cms-content` 专属字段混入该 guidance

#### Scenario: `cms-content` guidance 只暴露内容组件相关 surface
- **WHEN** 系统基于 canonical contract 发布或消费 `cms-content` 的人类可读 guidance
- **THEN** 该 guidance SHALL 只包含 `cms-content` 当前受支持的 props、source modes、slot scope 和 `item` 字段语义
- **AND** 系统 SHALL NOT 将 `path`、`children` 或其他 `cms-catalog` 专属字段混入该 guidance

#### Scenario: 共享 authoring 边界独立于组件 guidance 保持单一说明
- **WHEN** prompt/doc 消费者还需要了解两个组件共享的 slot inner content、HTML-first、Vue boundary 或 forbidden structures
- **THEN** 系统 SHALL 允许这些共享规则以独立于组件 guidance 的方式被发布和消费
- **AND** 系统 SHALL 保持组件 guidance 只聚焦于当前组件特有的 contract surface
