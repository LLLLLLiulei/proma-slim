## ADDED Requirements

### Requirement: manifest 与 validator 必须识别 site-id 为受支持的 CMS 属性
系统 SHALL 在 page-builder CMS rendering 的模板扫描、manifest 与 validator 中将 `site-id` 识别为 `cms-catalog` / `cms-content` 的受支持作者态属性，而不是将其视为未知 props。

#### Scenario: 带显式 site-id 的 CMS 标签不被标记为未知属性
- **WHEN** 作者 HTML 中的 `cms-catalog` 或 `cms-content` 带有显式 `site-id`
- **THEN** validator SHALL NOT 为该属性输出 `UNKNOWN_PROP` warning
- **AND** manifest props SHALL 归一化保留该属性对应的 `siteId`

#### Scenario: 不同站点的多个 islands 在 manifest 中保留各自 siteId
- **WHEN** 同一页面包含多个带不同 `site-id` 的顶层 `cms-*` islands
- **THEN** manifest SHALL 为每个 island 记录其各自的归一化 `siteId`
- **AND** 系统 SHALL 允许后续 preview、SSR 和 apply 依据这些站点上下文独立工作

### Requirement: 缺少 site-id 的旧标签必须保持非阻断兼容
系统 SHALL 将缺少显式 `site-id` 的旧 `cms-catalog` / `cms-content` 标签视为可兼容的 legacy 写法，并 SHALL 允许其继续通过默认站点 `1` 运行，而不得因此把页面判定为无效。

#### Scenario: 旧标签缺少 site-id 时不输出阻断性错误
- **WHEN** 作者 HTML 中的 `cms-catalog` 或 `cms-content` 缺少 `site-id`
- **THEN** validator SHALL NOT 因缺少该属性而输出 `error` 级 diagnostic
- **AND** 系统 SHALL 继续允许 preview、apply 与 static export 以默认站点 `1` 运行
