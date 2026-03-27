## ADDED Requirements

### Requirement: 工作区持久化 MCP 配置必须以稳定的 SDK 参数生效
系统 SHALL 在会话运行前仅读取当前工作区已持久化且启用中的 MCP 配置，并将其转换为 Claude Agent SDK 可执行的 `mcpServers` 参数。

#### Scenario: Stdio MCP 映射到 SDK 时补齐启动环境与超时
- **WHEN** 某个工作区的启用中 MCP 条目使用 `stdio` 传输，且系统为 Claude Agent SDK 构建 `mcpServers`
- **THEN** 系统 SHALL 传递该条目的 `command`、`args`，合并稳定可用的 `PATH` 到 `env`，并将工作区配置中的超时映射为 `startup_timeout_sec`

#### Scenario: HTTP 与 SSE MCP 映射到 SDK 时保持工作区配置
- **WHEN** 某个工作区的启用中 MCP 条目使用 `http` 或 `sse` 传输
- **THEN** 系统 SHALL 将该条目的 `url` 与可选 `headers` 传递给 Claude Agent SDK，并保持该条目按工作区配置生效

#### Scenario: 所有工作区 MCP 条目默认按非必需服务传递
- **WHEN** 系统将工作区 MCP 条目映射为 Claude Agent SDK 的 `mcpServers`
- **THEN** 系统 SHALL 将这些条目标记为非必需服务，避免单个 MCP 启动失败直接阻断整个会话启动

#### Scenario: 运行时不得注入未持久化的额外 MCP
- **WHEN** 某个会话开始执行 Agent 查询
- **THEN** 系统 SHALL 仅使用该会话所属工作区持久化配置中启用的 MCP 条目构建 `mcpServers`，而不得额外注入运行时临时 MCP、会话级动态 MCP 或与工作区配置无关的内置 MCP
