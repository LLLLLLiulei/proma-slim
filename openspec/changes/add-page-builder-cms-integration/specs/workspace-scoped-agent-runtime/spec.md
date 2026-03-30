## MODIFIED Requirements

### Requirement: 工作区持久化 MCP 配置必须以稳定的 SDK 参数生效
系统 SHALL 在会话运行前读取当前工作区已持久化且启用中的 MCP 配置，并将其转换为 Claude Agent SDK 可执行的 `mcpServers` 参数；对于需要 CMS 数据源能力的 `page-builder` 工作区会话，系统 SHALL 额外注入由宿主进程托管的只读 CMS 工具服务器，但 CMS 凭证 MUST 始终保留在服务端，不得直接暴露给 Agent 输入、工作区文件或静态预览页面。

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
- **THEN** 系统 SHALL 将这些条目标记为非必需服务，避免单个 MCP 启动失败直接阻断整个会话启动

#### Scenario: Page-builder 会话可以附加宿主托管的 CMS 工具服务器
- **WHEN** 某个会话所属工作区带有 `page-builder` 模板标记，且该会话需要使用 CMS 数据源相关能力
- **THEN** 系统 SHALL 允许在该会话的 Agent 运行时额外挂载由宿主进程托管的只读 CMS 工具服务器
- **AND** 该服务器 SHALL 为 page-builder 提供 CMS 选择与数据读取相关的受控工具能力

#### Scenario: 宿主托管的 CMS 凭证不得暴露给 Agent 或静态页面
- **WHEN** page-builder 会话使用宿主托管的 CMS 工具服务器访问内部 CMS
- **THEN** 系统 SHALL 不把 CMS 服务账号凭证写入 Agent prompt、会话消息、工作区文件或静态预览页面
- **AND** 前端与静态页面 SHALL 只通过 Proma 主进程提供的受控代理或导入结果访问相关资源

#### Scenario: 宿主托管的 CMS 工具服务器从本地运行时配置读取 Cookie
- **WHEN** page-builder 会话初始化宿主托管的 CMS 工具服务器
- **THEN** 系统 SHALL 从 `getConfigDir()/cms-settings.json` 或等价的宿主本地配置文件读取 `baseUrl`、`currentSite`、`zusid`
- **AND** 系统 SHALL 使用这些值构造对上游 CMS 的只读代理请求
- **AND** 系统 SHALL 不把这些实时值写回仓库模板、工作区模板或工作区文件

#### Scenario: 运行时不得注入与当前工作区无关的额外 MCP
- **WHEN** 某个会话开始执行 Agent 查询
- **THEN** 系统 SHALL 仅使用该会话所属工作区持久化配置中启用的 MCP 条目构建 `mcpServers`
- **AND** 对于需要 CMS 数据源能力的 `page-builder` 工作区会话，系统 SHALL 在此基础上额外挂载宿主进程托管的只读 CMS 工具服务器
- **AND** 系统 MUST NOT 注入与当前工作区无关的运行时临时 MCP、会话级动态 MCP 或其他产品级内置 MCP
