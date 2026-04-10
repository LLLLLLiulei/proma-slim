## MODIFIED Requirements

### Requirement: 工作区持久化 MCP 配置必须以稳定的 SDK 参数生效
系统 SHALL 在会话运行前读取当前工作区已持久化且启用中的 MCP 配置，并在满足运行时策略时合并宿主创建的 SDK 进程内 MCP server，一并转换为 Claude Agent SDK 可执行的 `mcpServers` 参数。

#### Scenario: Stdio MCP 映射到 SDK 时补齐启动环境与超时
- **WHEN** 某个工作区的启用中 MCP 条目使用 `stdio` 传输，且系统为 Claude Agent SDK 构建 `mcpServers`
- **THEN** 系统 SHALL 传递该条目的 `command`、`args`，合并稳定可用的 `PATH` 到 `env`
- **AND** 系统 SHALL 将工作区配置中的超时映射为 `startup_timeout_sec`

#### Scenario: HTTP 与 SSE MCP 映射到 SDK 时保持工作区配置
- **WHEN** 某个工作区的启用中 MCP 条目使用 `http` 或 `sse` 传输
- **THEN** 系统 SHALL 将该条目的 `url` 与可选 `headers` 传递给 Claude Agent SDK
- **AND** 系统 SHALL 保持该条目按工作区配置生效

#### Scenario: 所有工作区 MCP 条目默认按非必需服务传递
- **WHEN** 系统将工作区 MCP 条目映射为 Claude Agent SDK 的 `mcpServers`
- **THEN** 系统 SHALL 将这些条目标记为非必需服务
- **AND** 系统 SHALL 避免单个 MCP 启动失败直接阻断整个会话启动

#### Scenario: Page-builder 查询可合并宿主创建的 runtime SDK MCP server
- **WHEN** 某个带有 `page-builder` 模板标记的会话开始执行 Agent 查询，且宿主运行时按当前策略创建了额外的 SDK MCP server
- **THEN** 系统 SHALL 在该次 query 的 `mcpServers` 中合并这些 runtime server 与工作区持久化 MCP 条目
- **AND** 系统 SHALL NOT 将这些 runtime server 回写到工作区持久化 MCP 配置

#### Scenario: 无匹配运行时策略的查询继续仅使用持久化 MCP
- **WHEN** 某个会话开始执行 Agent 查询，但当前运行时没有为其启用额外的 SDK MCP server
- **THEN** 系统 SHALL 继续仅使用该会话所属工作区持久化配置中启用的 MCP 条目构建 `mcpServers`

## ADDED Requirements

### Requirement: 附加 runtime SDK MCP server 的查询必须支持流式用户消息输入
系统 SHALL 在某次 query 附加宿主创建的 runtime SDK MCP server 时，使用 `AsyncIterable<SDKUserMessage>` 形式向 Claude Agent SDK 传递用户消息，而不是继续依赖单个裸字符串 prompt。

#### Scenario: Runtime SDK MCP 查询切换到流式用户消息输入
- **WHEN** 某次 Agent 查询附加了宿主创建的 runtime SDK MCP server
- **THEN** 系统 SHALL 将最终用户消息以 streamed `SDKUserMessage` 的形式传给 Claude Agent SDK

#### Scenario: 现有组合消息语义在流式输入下保持一致
- **WHEN** 系统将带有动态上下文、隐藏上下文或 `composedUserMessage` 的最终消息切换为 streamed `SDKUserMessage`
- **THEN** 系统 SHALL 保持该最终组合消息的语义内容不变
- **AND** 系统 SHALL 将其作为单条用户消息发送给 SDK

### Requirement: 运行时工具白名单必须显式包含宿主附加的 SDK MCP tools
系统 SHALL 在当前 query 附加宿主创建的 runtime SDK MCP tools 时，将这些工具名显式并入当前 query 的工具 allowlist，而不是扩大其他查询的全局工具面。

#### Scenario: CMS runtime tools 进入当前 query 的 allowlist
- **WHEN** 某次交互式权限模式下的 query 附加了 runtime `cms` SDK MCP server
- **THEN** 系统 SHALL 将该 server 暴露的 `mcp__cms__*` 工具名加入当前 query 的 `allowedTools`

#### Scenario: 未附加 runtime tools 的查询保持原有 allowlist 行为
- **WHEN** 某次 query 没有附加宿主创建的 runtime SDK MCP tools
- **THEN** 系统 SHALL 保持该查询原有的 `allowedTools` 装配行为不变
