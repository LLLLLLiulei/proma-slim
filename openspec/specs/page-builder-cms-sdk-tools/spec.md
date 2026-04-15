# page-builder-cms-sdk-tools Specification

## Purpose
定义 `page-builder` 会话可用的宿主创建 CMS SDK tools，包括 runtime MCP server 挂载条件、只读工具面、宿主管理的鉴权上下文，以及归一化栏目与内容摘要结果。
## Requirements
### Requirement: Page-builder 会话必须暴露宿主创建的 CMS SDK tools
系统 SHALL 在满足 CMS 集成启用条件时，为 `page-builder` 会话的 Agent 查询附加一个宿主创建的 runtime SDK MCP server `cms`，并在保留宿主管理边界的前提下暴露只读 CMS data tools 与受控 `apply_cms_binding` 工具，而不是要求用户配置外部 MCP 进程或修改工作区 `mcp.json`。

#### Scenario: Page-builder 查询附加查询与 apply tools
- **WHEN** 某个带有 `page-builder` 模板标记的会话开始执行 Agent 查询，且宿主 CMS 配置可用
- **THEN** 系统 SHALL 为该查询附加 runtime `cms` SDK MCP server
- **AND** 系统 SHALL 允许该查询调用 `mcp__cms__list_catalogs`、`mcp__cms__list_contents` 与 `mcp__cms__apply_cms_binding`

#### Scenario: 普通工作区默认不附加 CMS tools
- **WHEN** 某个不带 `page-builder` 模板标记的会话开始执行 Agent 查询
- **THEN** 系统 SHALL 不为其默认附加 runtime `cms` SDK MCP server

#### Scenario: CMS tools 维持宿主管理的受控边界
- **WHEN** 系统为某个查询附加 runtime `cms` SDK MCP server
- **THEN** 该 server SHALL 仅暴露读取栏目、读取内容列表和 block-scoped `apply_cms_binding` 三类工具
- **AND** 系统 SHALL NOT 通过该 server 暴露发布、删除、任意文件写入或任意工作区改写能力

### Requirement: CMS 请求上下文必须由宿主管理
系统 SHALL 在宿主侧管理 CMS `baseUrl`、`username`、`password`、token 刷新上下文以及 `apply_cms_binding` 所需的工作区与 mutation pipeline 上下文；业务站点上下文 MUST 作为显式 `siteId` 参数进入 CMS 读写工具或宿主管理的内部读取路由，而 MUST NOT 再由宿主静态 `siteID` 配置隐式决定。

#### Scenario: Tool 输入不暴露原始鉴权字段或宿主内部路径
- **WHEN** 模型调用 `mcp__cms__list_catalogs`、`mcp__cms__list_contents` 或 `mcp__cms__apply_cms_binding`
- **THEN** tool 输入 SHALL 只包含业务查询字段、显式 `siteId`（若有）或 block-scoped apply 字段
- **AND** 输入 SHALL NOT 包含 `username`、`password`、Bearer token、Cookie、原始请求头、绝对工作区路径或 manifest 文件路径

#### Scenario: 鉴权失败时返回脱敏错误
- **WHEN** 宿主使用当前 CMS 配置发起请求，但上游返回鉴权失败、权限不足或其他认证错误
- **THEN** 系统 SHALL 向模型返回可操作的工具错误
- **AND** 系统 SHALL NOT 在错误内容中泄露密码、token、Cookie 值或完整请求头

### Requirement: CMS 读写工具必须区分“读取兼容回退”与“正式写入强约束”
系统 SHALL 让 page-builder CMS 读工具与正式写入工具都接受显式 `siteId` 业务参数，以表达当前业务站点；其中读取链路在兼容旧页面时 MAY 按 `siteId = 1` 回退，但正式 `apply_cms_binding` 写入链路 MUST 要求显式站点，且不得继续从宿主静态 `siteID` 配置继承运行时站点。

#### Scenario: 读工具按显式站点返回栏目与内容
- **WHEN** 模型或宿主内部调用 CMS 栏目 / 内容读取链路，并显式传入 `siteId`
- **THEN** 系统 SHALL 基于该 `siteId` 请求上游 CMS 数据
- **AND** 系统 SHALL NOT 从宿主配置中覆盖或改写该业务站点

#### Scenario: 缺少显式站点时统一回退到站点 1
- **WHEN** CMS 栏目 / 内容读取链路缺少显式 `siteId`
- **THEN** 系统 SHALL 以 `siteId = 1` 作为兼容回退值继续执行
- **AND** 系统 SHALL NOT 读取宿主静态 `siteID` 配置作为该次请求的站点

#### Scenario: 正式 CMS 写入缺少 siteId 时拒绝执行
- **WHEN** `apply_cms_binding` 或其上游 skill 输入缺少显式 `siteId`
- **THEN** 系统 SHALL 拒绝本次正式 CMS 写入
- **AND** 系统 SHALL NOT 擅自写出 `site-id="1"` 或其他猜测值

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
