## ADDED Requirements

### Requirement: `apply_cms_binding` 必须生成带显式 site-id 的 CMS 标签
系统 SHALL 让 `mcp__cms__apply_cms_binding` 在生成 `cms-catalog` 与 `cms-content` 时写出显式 `site-id` 属性，从而使新写入的作者态 HTML 不再依赖宿主静态 `siteID` 配置。

#### Scenario: `catalog-nav` 写入显式 `site-id`
- **WHEN** 调用方请求生成 `catalog-nav` 绑定
- **THEN** 系统 SHALL 生成带显式 `site-id` 的 `cms-catalog` 标记
- **AND** 系统 SHALL 继续同时生成当前受支持的 `level`、`parent-id`、`content-type`、`search-keyword` 与 `take` 等属性

#### Scenario: `content-list` 写入显式 `site-id`
- **WHEN** 调用方请求生成 `content-list` 绑定
- **THEN** 系统 SHALL 生成带显式 `site-id` 的 `cms-content` 标记
- **AND** 系统 SHALL 继续同时生成当前受支持的 `catalog-id`、`keyword`、`page-index` 与 `page-size` 等属性

#### Scenario: 缺少显式站点时拒绝生成新的 CMS 标记
- **WHEN** `apply_cms_binding` 的输入缺少显式 `source.siteId`
- **THEN** 系统 SHALL 拒绝该次正式写入
- **AND** 系统 SHALL 返回可操作的输入错误
- **AND** 系统 SHALL NOT 假设 `site-id="1"` 来生成新的 `cms-catalog` 或 `cms-content`
