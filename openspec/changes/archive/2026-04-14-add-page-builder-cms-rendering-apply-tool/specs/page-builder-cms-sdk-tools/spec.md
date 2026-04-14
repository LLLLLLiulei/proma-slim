## MODIFIED Requirements

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
系统 SHALL 在宿主侧管理 CMS `baseUrl`、`siteID`、`username`、`password`、token 刷新上下文以及 `apply_cms_binding` 所需的工作区与 mutation pipeline 上下文，并且 MUST NOT 要求模型在 tool 输入中提供 Bearer token、密码、原始鉴权材料、绝对工作区路径或其他宿主内部上下文。

#### Scenario: Tool 输入不暴露原始鉴权字段或宿主内部路径
- **WHEN** 模型调用 `mcp__cms__list_catalogs`、`mcp__cms__list_contents` 或 `mcp__cms__apply_cms_binding`
- **THEN** tool 输入 SHALL 只包含业务查询字段或 block-scoped apply 字段
- **AND** 输入 SHALL NOT 包含 `username`、`password`、Bearer token、Cookie、原始请求头、绝对工作区路径或 manifest 文件路径

#### Scenario: 鉴权失败时返回脱敏错误
- **WHEN** 宿主使用当前 CMS 配置发起栏目或内容查询，但上游返回鉴权失败、权限不足或其他认证错误
- **THEN** 系统 SHALL 向模型返回可操作的工具错误
- **AND** 系统 SHALL NOT 在错误内容中泄露密码、token、Cookie 值或完整请求头
