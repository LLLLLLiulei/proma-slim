## ADDED Requirements

### Requirement: CMS 自动应用 skill 必须优先产出 slot 内承载完整动态区域的源码结构
系统 SHALL 在 `cms-binding-apply` 的主文案、引用示例与 `ready` 路径约束中，将 `cms-catalog` / `cms-content` 视为动态区域的源码根节点，并 SHALL 优先让 `templateBody`、`emptyTemplate` 与 `errorTemplate` 承载该区域的完整 HTML 结构，而不是只承载零散条目级子节点。

#### Scenario: 栏目导航 ready 路径默认让 `cms-catalog` 成为动态区域根节点
- **WHEN** `cms-binding-apply` 对某次栏目选择形成 `ready` 决策并准备继续调用 `mcp__cms__apply_cms_binding`
- **THEN** skill SHALL 默认推荐以 `cms-catalog` 作为该动态区域的源码根节点
- **AND** skill 提供的示例或推荐 payload SHALL 将 `ul`、`nav` 或同类主要集合容器写在 slot 模板中，而不是写在 `cms-catalog` 外部

#### Scenario: 内容列表 ready 路径默认让 `cms-content` 成为动态区域根节点
- **WHEN** `cms-binding-apply` 对某次内容列表绑定形成 `ready` 决策并准备继续调用 `mcp__cms__apply_cms_binding`
- **THEN** skill SHALL 默认推荐以 `cms-content` 作为该动态区域的源码根节点
- **AND** skill 提供的示例或推荐 payload SHALL 将 `section`、`article`、`div.grid` 或同类主要列表容器写在 slot 模板中，而不是仅在 slot 中保留条目级节点

#### Scenario: source-atomic CMS island 不默认保留“容器在外、条目在内”的反模式
- **WHEN** 当前目标为 `targetSelection.kind: cms-island`，且该动态区域存在“主要容器在外、slot 内只剩条目级节点”的可替代结构
- **THEN** skill SHALL 默认优先推荐把主要动态容器一起收敛进新的 CMS slot 模板
- **AND** skill SHALL NOT 把保留该反模式结构当作默认推荐结果
