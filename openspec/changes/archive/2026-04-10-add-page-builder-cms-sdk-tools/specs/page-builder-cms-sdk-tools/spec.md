## ADDED Requirements

### Requirement: Page-builder 会话必须暴露宿主创建的 CMS SDK tools
系统 SHALL 在满足 CMS 集成启用条件时，为 `page-builder` 会话的 Agent 查询附加一个宿主创建的 runtime SDK MCP server `cms`，并仅暴露只读 CMS data tools，而不是要求用户配置外部 MCP 进程或修改工作区 `mcp.json`。

#### Scenario: Page-builder 查询附加只读 CMS tools
- **WHEN** 某个带有 `page-builder` 模板标记的会话开始执行 Agent 查询，且宿主 CMS 配置可用
- **THEN** 系统 SHALL 为该查询附加 runtime `cms` SDK MCP server
- **AND** 系统 SHALL 允许该查询调用 `mcp__cms__list_catalogs` 与 `mcp__cms__list_contents`

#### Scenario: 普通工作区默认不附加 CMS tools
- **WHEN** 某个不带 `page-builder` 模板标记的会话开始执行 Agent 查询
- **THEN** 系统 SHALL 不为其默认附加 runtime `cms` SDK MCP server

#### Scenario: CMS tools 首版保持只读
- **WHEN** 系统为某个查询附加 runtime `cms` SDK MCP server
- **THEN** 该 server SHALL 仅暴露读取栏目和读取内容列表的只读工具
- **AND** 系统 SHALL NOT 在本次变更中暴露写入、发布或删除类 CMS 操作

### Requirement: CMS 请求上下文必须由宿主管理
系统 SHALL 在宿主侧管理 CMS base URL、Cookie 与固定请求头，并且 MUST NOT 要求模型在 tool 输入中提供 `ZUSID`、`CurrentSite` 或其他原始鉴权材料。

#### Scenario: Tool 输入不暴露原始鉴权字段
- **WHEN** 模型调用 `mcp__cms__list_catalogs` 或 `mcp__cms__list_contents`
- **THEN** tool 输入 SHALL 只包含业务查询字段，如栏目过滤、关键词、分页和栏目 ID
- **AND** 输入 SHALL NOT 包含 `ZUSID`、`CurrentSite` 或原始请求头

#### Scenario: 鉴权失败时返回脱敏错误
- **WHEN** 宿主使用当前 CMS 配置发起请求，但上游返回登录失效、权限不足或其他鉴权错误
- **THEN** 系统 SHALL 向模型返回可操作的工具错误
- **AND** 系统 SHALL NOT 在错误内容中泄露 Cookie 值或完整请求头

### Requirement: CMS tool 结果必须提供稳定的归一化内容形状
系统 SHALL 将 CMS 的栏目列表与内容列表响应转换为稳定的归一化结果，使后续 Agent 能基于统一字段理解内容结构，而不是直接依赖上游异构 JSON。

#### Scenario: 栏目列表返回归一化树结构
- **WHEN** 模型调用 `mcp__cms__list_catalogs`
- **THEN** 系统 SHALL 返回包含栏目 `id`、`name`、`parentId`、`path`、`contentType`、`contentTypeName`、`hasChild`、`total` 与 `children` 的归一化树结构

#### Scenario: 内容列表返回分页摘要与素材计数
- **WHEN** 模型调用 `mcp__cms__list_contents`
- **THEN** 系统 SHALL 返回分页信息与归一化内容项列表
- **AND** 每个内容项 SHALL 至少包含 `id`、`catalogId`、`title`、`summary`、`publishUrl`、`assetCounts` 与 `shape`

#### Scenario: 异构素材字段被解析为稳定形状提示
- **WHEN** 某条内容记录的 `extendJSON`、`imagesTotal`、`videosTotal` 或 `filesTotal` 表明其附带图片、视频或文件素材
- **THEN** 系统 SHALL 在归一化结果中提供可稳定使用的素材提示信息
- **AND** 系统 SHALL 将这类内容标记为对应的内容形状，如 `gallery`、`video`、`file` 或 `mixed`
