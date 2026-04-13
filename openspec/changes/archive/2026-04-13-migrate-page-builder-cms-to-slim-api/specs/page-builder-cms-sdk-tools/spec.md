## MODIFIED Requirements

### Requirement: CMS 请求上下文必须由宿主管理
系统 SHALL 在宿主侧管理 CMS `baseUrl`、`siteID`、`username`、`password` 与 token 刷新上下文，并且 MUST NOT 要求模型在 tool 输入中提供 Bearer token、密码或其他原始鉴权材料。

#### Scenario: Tool 输入不暴露原始鉴权字段
- **WHEN** 模型调用 `mcp__cms__list_catalogs` 或 `mcp__cms__list_contents`
- **THEN** tool 输入 SHALL 只包含业务查询字段，如栏目过滤、关键词、分页和栏目 ID
- **AND** 输入 SHALL NOT 包含 `username`、`password`、Bearer token、Cookie 或原始请求头

#### Scenario: 鉴权失败时返回脱敏错误
- **WHEN** 宿主使用当前 CMS 配置发起请求，但上游返回鉴权失败、权限不足或其他认证错误
- **THEN** 系统 SHALL 向模型返回可操作的工具错误
- **AND** 系统 SHALL NOT 在错误内容中泄露密码、token、Cookie 值或完整请求头

### Requirement: CMS tool 结果必须提供稳定的归一化内容形状
系统 SHALL 将 CMS 的栏目列表与内容列表响应转换为稳定的归一化结果，使后续 Agent 能基于统一字段理解栏目和内容摘要，而不是直接依赖上游异构 JSON 或无法稳定提供的素材形状字段。

#### Scenario: 栏目列表返回归一化树结构
- **WHEN** 模型调用 `mcp__cms__list_catalogs`
- **THEN** 系统 SHALL 返回包含栏目 `id`、`name`、`parentId`、`path`、`contentType`、`contentTypeName`、`hasChild`、`total` 与 `children` 的归一化树结构

#### Scenario: 内容列表返回分页摘要与基础内容项
- **WHEN** 模型调用 `mcp__cms__list_contents`
- **THEN** 系统 SHALL 返回分页信息与归一化内容项列表
- **AND** 每个内容项 SHALL 至少包含 `id`、`catalogId`、`title`、`summary` 与 `publishUrl`
- **AND** 当上游提供 `logoFile` 或 `addTime`/`publishDate` 时，系统 SHALL 在归一化结果中返回 `listLogoUrl` 与 `addedAt`

#### Scenario: 不再返回宿主推导的素材形状与计数
- **WHEN** 宿主通过 slim API 读取内容列表
- **THEN** 系统 SHALL NOT 在归一化结果中返回基于旧 `extendJSON` 或素材计数字段推导的 `shape`、`assetCounts` 或 `assetHints`
