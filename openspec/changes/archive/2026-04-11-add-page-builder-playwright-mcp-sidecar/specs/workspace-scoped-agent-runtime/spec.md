## MODIFIED Requirements

### Requirement: 工作区持久化 MCP 配置必须以稳定的 SDK 参数生效
系统 SHALL 在会话运行前读取当前工作区已持久化且启用中的 MCP 配置，并在满足 page-builder Docker 运行时策略时对默认 `playwright` 能力应用宿主提供的远程 MCP 覆盖，一并转换为 Claude Agent SDK 可执行的 `mcpServers` 参数。

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

#### Scenario: Docker page-builder 查询可将默认 playwright 解析为远程 MCP
- **WHEN** 某个带有 `page-builder` 模板标记的会话开始执行 Agent 查询，且宿主运行时已为当前部署声明 `AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL`
- **AND** 当前工作区未将默认 `playwright` 条目改写为用户自定义的非默认配置
- **THEN** 系统 SHALL 在该次 query 的 `mcpServers` 中将 `playwright` 解析为指向该远程端点的 MCP 条目
- **AND** 系统 SHALL NOT 将该覆盖结果回写到工作区持久化 MCP 配置

#### Scenario: 本地非 Docker page-builder 查询继续使用默认持久化 playwright
- **WHEN** 某个带有 `page-builder` 模板标记的会话开始执行 Agent 查询
- **AND** 当前运行时不是 Docker page-builder 部署
- **AND** 当前工作区未将默认 `playwright` 条目改写为用户自定义的非默认配置
- **THEN** 系统 SHALL 继续按该工作区持久化的默认 `playwright` 配置构建 `mcpServers`

#### Scenario: Docker page-builder 查询在未部署 sidecar 时抑制默认 playwright 注入
- **WHEN** 某个带有 `page-builder` 模板标记的会话开始执行 Agent 查询
- **AND** 当前运行时是 Docker page-builder 部署
- **AND** 宿主运行时未为当前部署声明 `AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL`
- **AND** 当前工作区未将默认 `playwright` 条目改写为用户自定义的非默认配置
- **THEN** 系统 SHALL NOT 在该次 query 的 `mcpServers` 中注入默认 `playwright`
- **AND** 系统 SHALL 避免退回到 Docker 容器内不可用的默认 `stdio playwright` 路径

#### Scenario: Page-builder 用户自定义的 playwright 配置不被 Docker 运行时覆盖
- **WHEN** 某个带有 `page-builder` 模板标记的工作区已经将 `playwright` 调整为用户自定义配置，且宿主运行时已为当前部署声明 `AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL`
- **THEN** 系统 SHALL 继续按该工作区持久化的 `playwright` 配置构建 `mcpServers`
- **AND** 系统 SHALL NOT 以 Docker 运行时端点替换该自定义配置

#### Scenario: 无匹配运行时策略的查询继续仅使用持久化 MCP
- **WHEN** 某个会话开始执行 Agent 查询，但当前运行时没有为其启用额外的 SDK MCP server
- **THEN** 系统 SHALL 继续仅使用该会话所属工作区持久化配置中启用的 MCP 条目构建 `mcpServers`

## ADDED Requirements

### Requirement: Page-builder runtime Playwright 必须获得内部可达的预览访问语义
系统 SHALL 在 page-builder 查询附加 Docker runtime `playwright` 能力时，为 Agent 提供可从部署内部网络访问当前工作区预览的地址语义，而不是仅保留浏览器侧的相对 preview path。

#### Scenario: Runtime Playwright 获得内部绝对预览地址
- **WHEN** 某个带有 `page-builder` 模板标记的工作区已经生成可用预览，且当前查询附加了 Docker runtime `playwright`
- **THEN** 系统 SHALL 向该次 Agent 运行时提供当前工作区预览的内部可达绝对访问地址
- **AND** 该地址 SHALL 基于部署提供的内部 preview origin 解析

#### Scenario: Runtime Playwright 的内部预览地址仅用于 Agent 运行时
- **WHEN** 系统为某次 page-builder Agent 查询解析内部绝对预览地址
- **THEN** 系统 SHALL 仅在该次 Agent 运行时上下文中暴露该地址
- **AND** 系统 SHALL NOT 将 compose 内网地址回写到浏览器侧使用的工作区持久化配置或公开预览接口

#### Scenario: 无预览时不伪造内部地址
- **WHEN** 某个 `page-builder` 工作区当前尚未生成可用预览，且当前查询附加了 Docker runtime `playwright`
- **THEN** 系统 SHALL NOT 向 Agent 提供虚构的内部预览地址
- **AND** 系统 SHALL 继续允许该次查询使用 `playwright` 处理非预览页浏览任务

#### Scenario: 内部预览 origin 非法时降级为无内部地址
- **WHEN** 某个 `page-builder` 工作区已经生成可用预览，且当前查询附加了 Docker runtime `playwright`
- **AND** 当前部署提供的内部 preview origin 无法解析为合法绝对地址
- **THEN** 系统 SHALL NOT 因此让该次 query 失败
- **AND** 系统 SHALL 省略内部预览地址注入，按“无内部地址”继续执行
