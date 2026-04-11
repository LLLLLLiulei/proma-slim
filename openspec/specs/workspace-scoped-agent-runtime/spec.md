## Purpose
定义 Agent 工作区级运行时约束，包括默认工作区与会话执行目录解析、工作区迁移后的 SDK 上下文重绑、工作区专用权限策略，以及持久化与运行时附加 MCP server 的装配边界。
## Requirements
### Requirement: Agent 工作区必须作为持久化实体存在
系统 SHALL 将 Agent 工作区作为独立持久化实体管理，并在首次启动或缺失时自动提供默认工作区；工作区元数据 MUST 支持保存可选的模板/类型标记，以便运行时解析工作区级行为，但不影响已有普通工作区的兼容性。

#### Scenario: 首次启动创建默认工作区
- **WHEN** 应用启动且尚未存在任何 Agent 工作区索引或默认工作区记录
- **THEN** 系统 SHALL 创建一个可持久化的默认工作区，并为其建立稳定的工作区目录与标识

#### Scenario: 工作区 CRUD 持久化
- **WHEN** 用户创建、重命名或删除工作区
- **THEN** 系统 SHALL 更新工作区索引元数据，并保持工作区 slug 与根目录的稳定映射关系

#### Scenario: 新建 page-builder 工作区持久化模板标记
- **WHEN** 用户通过 `page-builder` 入口创建工作区，且创建参数显式指定 `template: 'page-builder'`
- **THEN** 系统 SHALL 在工作区索引中持久化该工作区的 `page-builder` 模板标记，供后续运行时直接识别

#### Scenario: 普通工作区不写入 page-builder 模板标记
- **WHEN** 用户通过普通入口创建工作区，且未指定 `page-builder` 模板
- **THEN** 系统 SHALL 将其作为普通工作区持久化，而不写入 `page-builder` 模板标记

#### Scenario: 删除仍有会话归属的工作区被拒绝
- **WHEN** 用户删除某个仍有 Agent 会话绑定的工作区
- **THEN** 系统 SHALL 拒绝该删除请求，避免留下指向已删除工作区的会话归属

### Requirement: Workspace session runtime MUST distinguish scratch-mode and repo-mode subagent usage
系统 SHALL 在工作区 session 级运行时中向 Agent 明确当前目录的 subagent 使用边界：Proma 管理的 scratch session 目录默认用于研究、搜索、总结和规划类子代理，而 `worktree` isolation 仅适用于真实 git 仓库中的代码修改场景。

#### Scenario: Scratch workspace session exposes non-worktree default
- **WHEN** 某个 Agent 会话运行在 `~/.proma/agent-workspaces/{slug}/{sessionId}` 这类 Proma 管理的 session 目录中
- **THEN** 系统 SHALL 在运行时上下文中明确该目录默认是 scratch mode，并提示纯研究型 subagent 不应默认请求 `worktree` isolation

#### Scenario: Repo-mode remains an explicit boundary
- **WHEN** 当前任务涉及真实代码仓库中的修改，且运行目录或用户附加目录中存在真实 git repo
- **THEN** 系统 SHALL 将 `worktree` isolation 视为仅在该 repo-mode 前提下才可考虑的能力，而不是 scratch workspace 的默认行为

#### Scenario: Unsupported scratch worktree request is downgraded
- **WHEN** 主模型在 scratch workspace session 中仍然发出 `Agent(... isolation: "worktree")` 这类不受支持的调用
- **THEN** 系统 SHALL 在运行时移除该 `worktree` isolation，并将该调用降级为普通 subagent 执行，而不是直接把底层 worktree 错误暴露给用户

### Requirement: 会话执行目录必须由所属工作区解析
系统 SHALL 根据会话所属工作区解析 Agent 实际运行的 session 级工作目录，而不是统一使用服务器启动目录。

#### Scenario: 工作区会话使用 session 级 cwd
- **WHEN** 用户在某个工作区下创建或继续一个 Agent 会话并发送消息
- **THEN** 系统 SHALL 使用该工作区下的 session 级目录作为 Agent SDK 的 `cwd`

#### Scenario: 旧会话兼容默认工作区
- **WHEN** 系统加载历史会话且该会话缺少 `workspaceId`
- **THEN** 系统 SHALL 将其归属到默认工作区，并为后续执行解析出对应的工作区目录

### Requirement: 工作区迁移必须使 SDK 上下文重新绑定
系统 SHALL 在会话迁移到其他工作区时迁移其工作目录归属，并使旧工作区绑定的 SDK resume 上下文失效。

#### Scenario: 迁移会话到其他工作区
- **WHEN** 用户将某个会话迁移到另一个工作区
- **THEN** 系统 SHALL 更新该会话的 `workspaceId`，并将其 session 级工作目录切换到目标工作区

#### Scenario: 迁移后清理旧 resume 标识
- **WHEN** 某个会话的工作区归属发生变化
- **THEN** 系统 SHALL 清空该会话原有的 `sdkSessionId`，避免继续复用绑定旧 cwd 的 SDK 上下文

### Requirement: 工作区级权限策略必须由持久化工作区元数据解析
系统 SHALL 在会话运行前根据其所属工作区的持久化元数据解析工作区级权限策略；带有 `page-builder` 模板标记的工作区 MUST 使用保留 `AskUserQuestion`、自动放行其他工具请求的专用策略，其他工作区继续遵循全局权限模式。

#### Scenario: Page-builder 会话使用工作区专用权限策略
- **WHEN** 某个会话所属工作区带有 `page-builder` 模板标记
- **THEN** 系统 SHALL 以该标记为准解析会话的有效权限行为，而不是仅依赖全局 `agentPermissionMode`

#### Scenario: 历史或普通工作区继续使用原有全局权限模式
- **WHEN** 某个会话所属工作区没有 `page-builder` 模板标记
- **THEN** 系统 SHALL 继续使用原有全局权限模式解析该会话的权限行为，不要求为历史工作区补写新标记

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
