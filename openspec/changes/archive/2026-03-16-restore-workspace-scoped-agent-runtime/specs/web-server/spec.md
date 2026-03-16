## ADDED Requirements

### Requirement: 后端必须提供工作区 REST API
系统 SHALL 通过 Bun HTTP 服务暴露工作区 CRUD API，而不是依赖旧 Electron IPC。

#### Scenario: 工作区 CRUD 请求
- **WHEN** 前端发起工作区列表、创建、更新或删除请求
- **THEN** 系统 SHALL 提供对应的 REST 端点完成工作区元数据操作

#### Scenario: 删除非空工作区返回明确错误
- **WHEN** 前端请求删除仍有会话归属的工作区
- **THEN** 后端 SHALL 以失败响应拒绝该请求，并返回可直接展示给用户的错误消息

#### Scenario: 创建会话时绑定工作区
- **WHEN** 前端创建新会话时提供 `workspaceId`
- **THEN** 后端 SHALL 将该工作区归属写入会话元数据，并以此驱动后续运行时解析

### Requirement: 后端必须提供工作区能力查询面
系统 SHALL 提供工作区能力和目录查询 API，以支撑当前 Web UI 的能力展示与输入引用。

#### Scenario: 查询工作区能力摘要
- **WHEN** 前端请求某个工作区的能力摘要
- **THEN** 后端 SHALL 返回该工作区的 Skills 与 MCP 概要

#### Scenario: 查询工作区文件目录或附加目录
- **WHEN** 前端需要当前工作区的文件目录或附加目录上下文
- **THEN** 后端 SHALL 返回与该工作区绑定的目录信息，而不是返回全局固定路径
