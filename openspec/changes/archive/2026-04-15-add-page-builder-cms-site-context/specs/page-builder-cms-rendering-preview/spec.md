## ADDED Requirements

### Requirement: CMS rendering preview 必须按每个 island 的显式或默认站点取数
系统 SHALL 在浏览器 preview runtime 中按每个顶层 `cms-*` island 自身的 `site-id` 或兼容默认值 `1` 发起 CMS 数据请求，而不是继续让整页预览依赖宿主静态 `siteID` 配置。

#### Scenario: 带显式 site-id 的 island 通过对应站点代理取数
- **WHEN** 某个预览页面中的 `cms-catalog` 或 `cms-content` island 显式带有 `site-id`
- **THEN** 浏览器端 runtime SHALL 在对应的 `/api/page-builder/cms/*` 请求中携带该 `siteId`
- **AND** 该次取数 SHALL 仅代表当前 island 的显式站点上下文

#### Scenario: 旧 island 缺少 site-id 时以站点 1 兼容运行
- **WHEN** 某个预览页面中的 `cms-*` island 缺少显式 `site-id`
- **THEN** 浏览器端 runtime SHALL 以 `siteId = 1` 发起该次 CMS 请求
- **AND** 系统 SHALL NOT 从宿主静态 `siteID` 配置推断该次请求所属站点

#### Scenario: 同页多个不同站点 islands 各自独立取数
- **WHEN** 同一个预览页面包含多个带不同 `site-id` 的顶层 `cms-*` islands
- **THEN** 系统 SHALL 为每个 island 按其各自站点独立发起请求
- **AND** 不同站点的 islands SHALL NOT 共享错误的运行时查询结果
