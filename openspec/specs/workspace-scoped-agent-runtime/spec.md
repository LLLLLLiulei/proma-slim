## Purpose
定义工作区实体、默认工作区、会话执行目录和工作区迁移后 SDK 上下文重绑的运行时行为。

## Requirements

### Requirement: Agent 工作区必须作为持久化实体存在
系统 SHALL 将 Agent 工作区作为独立持久化实体管理，并在首次启动或缺失时自动提供默认工作区。

#### Scenario: 首次启动创建默认工作区
- **WHEN** 应用启动且尚未存在任何 Agent 工作区索引或默认工作区记录
- **THEN** 系统 SHALL 创建一个可持久化的默认工作区，并为其建立稳定的工作区目录与标识

#### Scenario: 工作区 CRUD 持久化
- **WHEN** 用户创建、重命名或删除工作区
- **THEN** 系统 SHALL 更新工作区索引元数据，并保持工作区 slug 与根目录的稳定映射关系

#### Scenario: 删除仍有会话归属的工作区被拒绝
- **WHEN** 用户删除某个仍有 Agent 会话绑定的工作区
- **THEN** 系统 SHALL 拒绝该删除请求，避免留下指向已删除工作区的会话归属

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
