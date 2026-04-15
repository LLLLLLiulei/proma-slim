## ADDED Requirements

### Requirement: CMS rendering core 必须支持显式 siteId query 与作者态 site-id props
系统 SHALL 让 `packages/page-builder-cms-rendering` 的共享 query contract、`cms-catalog` / `cms-content` 组件 props、query helper 和模板扫描基础设施支持显式 `siteId` / `site-id`，使作者态标签可以自描述其所属站点。

#### Scenario: `cms-catalog` 与 `cms-content` 支持显式站点 props
- **WHEN** 作者 HTML 中的 `cms-catalog` 或 `cms-content` 带有 `site-id`
- **THEN** 系统 SHALL 将其归一化为组件 props / runtime query 中的 `siteId`
- **AND** 组件 SHALL 基于该 `siteId` 发起对应的 catalog 或 content 查询

#### Scenario: 模板扫描与 manifest props 归一化保留 siteId
- **WHEN** 共享模板扫描工具识别到带 `site-id` 的顶层 `cms-*` island
- **THEN** 扫描结果与 manifest props SHALL 归一化保留 `siteId`
- **AND** 后续 preview 与 static export SHALL 能复用该显式站点上下文

### Requirement: 缺失 site-id 的旧 CMS 标签必须兼容回退到站点 1
系统 SHALL 对缺少显式 `site-id` 的旧 `cms-catalog` / `cms-content` 标签提供兼容行为，并统一以 `siteId = 1` 作为 runtime query 的默认站点，而不是继续读取宿主静态 `siteID` 配置。

#### Scenario: 旧 `cms-catalog` 标签在缺少 site-id 时回退到站点 1
- **WHEN** 某个作者态 `cms-catalog` 标签缺少显式 `site-id`
- **THEN** 共享 runtime query helper SHALL 以 `siteId = 1` 发起该次栏目查询
- **AND** 系统 SHALL 不将该缺省站点解释为宿主静态 `siteID`

#### Scenario: 旧 `cms-content` 标签在缺少 site-id 时回退到站点 1
- **WHEN** 某个作者态 `cms-content` 标签缺少显式 `site-id`
- **THEN** 共享 runtime query helper SHALL 以 `siteId = 1` 发起该次内容查询
- **AND** 系统 SHALL 保留其余 `catalogId`、`pageIndex`、`pageSize` 等现有语义不变
