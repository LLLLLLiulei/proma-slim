## ADDED Requirements

### Requirement: CMS 静态导出必须按每个 island 的显式或默认站点执行预取与 SSR
系统 SHALL 在 page-builder 静态导出中按每个顶层 `cms-*` island 的显式 `site-id` 或兼容默认值 `1` 执行预取与 SSR，而不是继续依赖宿主静态 `siteID` 配置来决定导出站点。

#### Scenario: 带显式 site-id 的 islands 在导出时按各自站点预取
- **WHEN** 某个导出页面包含多个带显式 `site-id` 的顶层 `cms-*` islands
- **THEN** 系统 SHALL 按每个 island 各自的 `siteId` 预取 CMS 数据并执行 SSR
- **AND** 等价查询的导出期缓存 SHALL 包含该 `siteId` 维度，避免不同站点之间串缓存

#### Scenario: 旧 islands 缺少 site-id 时以站点 1 兼容导出
- **WHEN** 某个导出页面中的 `cms-catalog` 或 `cms-content` 缺少显式 `site-id`
- **THEN** 导出期 runtime client SHALL 以 `siteId = 1` 执行该次预取和 SSR
- **AND** 系统 SHALL 不读取宿主静态 `siteID` 配置作为该次导出的站点上下文
