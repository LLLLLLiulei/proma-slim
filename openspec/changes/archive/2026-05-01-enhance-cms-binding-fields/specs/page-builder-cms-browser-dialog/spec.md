## ADDED Requirements

### Requirement: CMS 浏览读取链路必须返回作者态可用的栏目链接和封面字段
系统 SHALL 通过宿主管理的 CMS 读取链路向 Builder CMS 浏览弹框提供作者态可用的归一化栏目字段；当 `/api/catalogsTree` 仅提供树结构字段时，系统 MUST 使用 `/api/catalogs` 的栏目 metadata 补齐 `logoFile`、`listLink`、`link`、`url`、`path` 与 `siteID` 等显示与跳转所需字段，并将其归一化到现有 `PageBuilderCmsCatalog` 字段中。

#### Scenario: 栏目树响应缺少显示字段时使用栏目 metadata 补齐
- **WHEN** 当前站点的 `/api/catalogsTree` 响应包含 `ID`、`parentID`、`siteID`、`name` 与 `children`，但不包含 `logoFile`、`listLink`、`link` 或 `path`
- **THEN** 系统 SHALL 继续保留该响应提供的栏目层级结构
- **AND** 系统 SHALL 从同站点 `/api/catalogs` metadata 中按栏目 id 合并封面与链接字段
- **AND** CMS 浏览弹框消费到的归一化栏目 SHALL 在上游提供数据时包含可用于作者态的 `logoUrl` 与 `path`

#### Scenario: 固定栏目读取直接使用精确 metadata 字段
- **WHEN** CMS 浏览或运行时请求固定栏目 `ids`
- **THEN** 系统 SHALL 使用精确栏目 metadata 响应填充对应栏目
- **AND** 系统 SHALL 保持输入 `ids` 顺序
- **AND** 系统 SHALL 在上游提供数据时返回同样语义的 `logoUrl` 与 `path`

### Requirement: CMS 浏览读取链路必须按 slim API 字段语义归一化内容链接和封面
系统 SHALL 将 `/api/catalogs/{id}/contents` 返回的内容摘要字段归一化为现有 `PageBuilderCmsContentSummary` 字段，其中封面图 MUST 优先来自上游 `logoFile`，跳转链接 MUST 优先来自上游 `link` 或 `url`，而不得要求前端或模型直接消费上游原始字段名。

#### Scenario: 内容摘要包含 logoFile 和 link 时归一化为现有字段
- **WHEN** 内容接口返回包含 `catalogID`、`title`、`logoFile`、`link`、`url`、`summary` 或时间字段的内容项
- **THEN** 系统 SHALL 将 `catalogID` 归一化为 `catalogId`
- **AND** 系统 SHALL 将 `logoFile` 归一化为 `listLogoUrl`
- **AND** 系统 SHALL 将 `link` 或 `url` 归一化为 `publishUrl`
- **AND** 系统 SHALL NOT 要求 CMS 浏览弹框或后续 handoff 直接读取 `item.logoFile`、`item.link` 或 `item.url`

### Requirement: CMS 浏览读取链路必须用站点 URL 解析相对封面图地址
系统 SHALL 对栏目和内容封面图执行统一 URL 解析：绝对 `http(s)` 地址 MUST 原样保留；相对 `logoFile` 地址 MUST 优先使用对应站点的 `url` 作为基准解析；当站点 `url` 缺失或不可用时，系统 MAY 使用既有 CMS `baseUrl` 解析行为作为兜底。CMS `baseUrl` 是宿主调用 slim API 的接口基址，站点 `url` 是 CMS 单个站点的访问地址，两者 MUST NOT 被视为同一个概念。

#### Scenario: 相对栏目 logoFile 使用栏目所属站点 URL 解析
- **WHEN** 栏目 metadata 返回 `siteID` 与相对 `logoFile`
- **AND** `/api/sites` 返回该 `siteID` 对应的有效 `url`
- **THEN** 系统 SHALL 将该 `logoFile` 解析为基于站点 `url` 的绝对 `logoUrl`
- **AND** 系统 SHALL NOT 默认把该路径解析到 CMS `/manager` API base 下

#### Scenario: 栏目详情 logoFile 使用同一站点 URL 解析规则
- **WHEN** CMS 浏览弹框读取栏目详情，且栏目 metadata 返回相对 `logoFile`
- **AND** 本次栏目详情请求携带 `siteId` 或 metadata 包含 `siteID`
- **AND** `/api/sites` 返回对应站点的有效 `url`
- **THEN** 系统 SHALL 将详情中的 `logoUrl` 解析为基于站点 `url` 的绝对地址
- **AND** 该解析语义 SHALL 与栏目列表和 fixed-id 栏目读取保持一致

#### Scenario: 相对内容 logoFile 使用请求站点上下文解析
- **WHEN** 内容接口返回相对 `logoFile` 且内容项本身没有 `siteID`
- **AND** 本次内容请求携带 `siteId`
- **THEN** 系统 SHALL 使用该请求 `siteId` 对应站点的 `url` 解析 `listLogoUrl`
- **AND** 系统 SHALL 保持内容项的 `catalogId` 来自上游 `catalogID`
