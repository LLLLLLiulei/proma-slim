## Purpose
定义工作区实体、默认工作区、会话执行目录和工作区迁移后 SDK 上下文重绑的运行时行为。

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
