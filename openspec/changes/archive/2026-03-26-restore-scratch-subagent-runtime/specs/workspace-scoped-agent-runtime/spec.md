## ADDED Requirements

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
