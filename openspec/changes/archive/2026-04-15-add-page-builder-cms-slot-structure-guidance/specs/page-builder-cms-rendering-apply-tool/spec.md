## ADDED Requirements

### Requirement: `apply_cms_binding` 的模板字段必须被定义为完整动态区域结构的承载位置
系统 SHALL 将 `mcp__cms__apply_cms_binding` 的 `templateBody`、`emptyTemplate` 与 `errorTemplate` 定义为完整动态区域结构的承载位置，而不是仅承载零散条目级节点；其文案、示例与调用约束 SHALL 默认鼓励 `cms-catalog` / `cms-content` 成为该动态区域的源码根节点。

#### Scenario: `catalog-nav` 示例将主要集合容器写入 `templateBody`
- **WHEN** 系统为 `catalog-nav` 绑定提供 `apply_cms_binding` 的推荐示例或调用指导
- **THEN** 示例 SHALL 将 `ul`、`nav` 或同类主要集合容器写入 `templateBody`
- **AND** 示例 SHALL NOT 只把 `li` 或其他条目级节点作为 `templateBody` 的主要结构

#### Scenario: `content-list` 示例将主要列表容器写入 `templateBody`
- **WHEN** 系统为 `content-list` 绑定提供 `apply_cms_binding` 的推荐示例或调用指导
- **THEN** 示例 SHALL 将 `section`、`article`、`div.grid` 或同类主要列表容器写入 `templateBody`
- **AND** 示例 SHALL NOT 将主要列表容器长期留在生成后的 `cms-content` 外部

#### Scenario: fallback 模板按完整 fallback 区域而非碎片条目组织
- **WHEN** 调用方向 `apply_cms_binding` 传入 `emptyTemplate` 或 `errorTemplate`
- **THEN** 系统 SHALL 将这些模板字段视为完整 fallback 区域结构的承载位置
- **AND** 推荐示例 SHALL 优先展示完整的 fallback 容器，而不是仅展示孤立条目级碎片
