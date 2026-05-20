## Purpose
定义 `page-builder` 在用户关闭或重新打开构建页时，如何恢复仍在执行的 Agent 会话，避免把同一 active session 的恢复误判为普通编辑冲突。

## Requirements

### Requirement: Page-builder MUST support recovering an active Agent session after the page is reopened
系统 SHALL 在用户重新打开同一个 page-builder 项目时，允许恢复该 workspace 下仍在执行的同一 Agent 会话，而不是把该场景一律视为普通编辑冲突。

#### Scenario: Reopening the same active session restores the running state
- **WHEN** 用户关闭了某个 page-builder 页面后，又通过同一 workspaceId 和 sessionId 重新进入该项目，且该 session 仍处于 active 状态
- **THEN** 系统 SHALL 将该页面恢复为该 active Agent 会话的继续执行状态
- **AND** 系统 SHALL 继续展示该会话的消息历史与流式状态
- **AND** 系统 SHALL NOT 将该场景直接渲染为普通“构建中”失败页

#### Scenario: Recovered session keeps the original workspace context
- **WHEN** 系统恢复一个仍在执行的 page-builder Agent 会话
- **THEN** 系统 SHALL 继续使用该会话原有的 workspaceId
- **AND** 系统 SHALL 继续把后续消息、附件与工具活动归属于同一会话上下文

#### Scenario: Recovered session remains stop-able
- **WHEN** 用户在恢复后的 page-builder 页面中点击停止当前 Agent
- **THEN** 系统 SHALL 停止该 active Agent 会话
- **AND** 系统 SHALL 释放当前会话的恢复态

#### Scenario: Reopening a non-active session switches to the active session
- **WHEN** 用户打开某个 page-builder builder URL，但该 URL 中的 sessionId 不是当前 workspace 下正在执行的 active Agent session，且该 workspace 存在另一个 active Agent session
- **THEN** 系统 SHALL 自动切换到该 active Agent session 对应的 builder URL
- **AND** 系统 SHALL 恢复该 active Agent session 的执行态
- **AND** 系统 SHALL NOT 继续停留在无法代表后台任务的非 active session 页面

#### Scenario: Closing the builder page does not stop the active Agent
- **WHEN** 用户关闭 page-builder 页面，且该页面对应的 Agent session 仍处于 active 状态
- **THEN** 系统 SHALL NOT 因页面关闭自动停止该 Agent session
- **AND** 系统 SHALL 允许用户后续重新进入并恢复该 active session
