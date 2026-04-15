## ADDED Requirements

### Requirement: CMS rendering validator 必须为明显的“主要动态容器外置”反模式输出 warning
系统 SHALL 对 page-builder 作者态 HTML 中明显的“主要动态容器在 CMS 组件外、slot 内只剩条目级节点”的反模式输出 warning diagnostics，以引导作者把相关 HTML 尽量组织到 CMS slot 中；该诊断 MUST 保持非阻断，不得因此把页面判定为无效。

#### Scenario: `ul` 外置而 `cms-catalog` slot 仅渲染 `li` 时输出 warning
- **WHEN** 作者 HTML 出现 `ul` 或同类主要集合容器包裹 `cms-catalog`，且 `cms-catalog` 的 slot 主要只渲染 `li` 等条目级节点
- **THEN** 系统 SHALL 输出一条 `warning` 级 diagnostic
- **AND** 该 diagnostic SHALL 使用稳定的问题代码来表达“主要动态容器应尽量收敛到 CMS slot 中”

#### Scenario: 内容列表主要容器外置而 slot 仅渲染条目时输出 warning
- **WHEN** 作者 HTML 出现 `section`、`div.grid` 或同类主要内容列表容器包裹 `cms-content`，且 `cms-content` 的 slot 主要只渲染 `article`、card item 或同类条目级节点
- **THEN** 系统 SHALL 输出一条 `warning` 级 diagnostic
- **AND** 该 diagnostic SHALL 不阻断 preview、apply 或 static export

#### Scenario: 主要动态容器位于 slot 内时不输出该 warning
- **WHEN** `cms-catalog` / `cms-content` 自身作为动态区域源码根节点，且主要集合容器已经写在其 slot 模板中
- **THEN** 系统 SHALL NOT 为该结构输出“主要动态容器外置”这条 warning diagnostic
