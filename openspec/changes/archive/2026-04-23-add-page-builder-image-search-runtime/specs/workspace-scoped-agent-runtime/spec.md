## ADDED Requirements

### Requirement: Page-builder 图片搜索 runtime tools 必须按 query 级附加
系统 SHALL 仅在满足 `page-builder` 运行时策略时，将宿主创建的 runtime `image_search` SDK MCP server 合并进当前 query 的 `mcpServers`，并 SHALL NOT 将该 runtime server 回写到工作区持久化 MCP 配置。

#### Scenario: Page-builder 查询可合并图片搜索 runtime SDK MCP server
- **WHEN** 某个带有 `page-builder` 模板标记的会话开始执行 Agent 查询，且宿主运行时按当前策略启用了图片搜索能力
- **THEN** 系统 SHALL 在该次 query 的 `mcpServers` 中合并 runtime `image_search` SDK MCP server
- **AND** 系统 SHALL 保持该 runtime server 仅对当前 query 生效

#### Scenario: 图片搜索 runtime server 不回写到工作区持久化 MCP 配置
- **WHEN** 系统为某次 `page-builder` query 附加 runtime `image_search` SDK MCP server
- **THEN** 系统 SHALL NOT 将该 runtime server 写回工作区的持久化 MCP 配置文件

#### Scenario: 无图片搜索运行时策略的查询保持原有 MCP 装配
- **WHEN** 某个 query 当前未启用图片搜索 runtime SDK MCP server
- **THEN** 系统 SHALL 继续按原有规则装配 `mcpServers`
- **AND** 系统 SHALL NOT 平白注入 `image_search` runtime server

### Requirement: 图片搜索 runtime tools 必须进入当前 query 的 allowlist
系统 SHALL 在某次 query 附加 runtime `image_search` SDK MCP server 时，将对应 `mcp__image_search__*` 工具名显式并入该次 query 的 `allowedTools`，而不是扩大无关查询的工具面。

#### Scenario: 交互式 page-builder 查询显式放行图片搜索 runtime tools
- **WHEN** 某次交互式权限模式下的 `page-builder` query 附加了 runtime `image_search` SDK MCP server
- **THEN** 系统 SHALL 将 `mcp__image_search__search_images` 与 `mcp__image_search__download_images` 加入该次 query 的 `allowedTools`

#### Scenario: 未附加图片搜索 runtime tools 的查询保持原有 allowlist 行为
- **WHEN** 某次 query 没有附加 runtime `image_search` SDK MCP server
- **THEN** 系统 SHALL 保持该查询原有的 `allowedTools` 装配行为不变
