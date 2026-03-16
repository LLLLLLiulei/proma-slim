## Purpose
定义 Bun 后端服务如何提供 REST API、SSE 推送与静态文件服务，作为前后端之间的统一入口。

## Requirements

### Requirement: Bun HTTP 服务
系统 SHALL 提供 Bun HTTP 后端服务，作为前端与 Agent SDK 之间的桥梁。

#### Scenario: 服务启动
- **WHEN** 执行后端启动命令
- **THEN** 系统 SHALL 通过 `Bun.serve()` 在指定端口启动 HTTP 服务，提供 REST API 和 SSE 端点

#### Scenario: 静态文件服务
- **WHEN** 生产模式下访问非 API 路径
- **THEN** 系统 SHALL 返回 Vite 构建的前端静态文件

### Requirement: REST API
系统 SHALL 提供 RESTful API 用于会话管理。

#### Scenario: 会话 CRUD
- **WHEN** 前端发起会话管理请求
- **THEN** 系统 SHALL 提供 GET/POST/DELETE/PATCH 端点处理会话的创建、列表、删除、更新

#### Scenario: 历史消息查询
- **WHEN** 前端请求 `GET /api/sessions/:id/messages`
- **THEN** 系统 SHALL 从 JSONL 文件读取并返回该会话的所有历史消息

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

### Requirement: SSE 流式推送
系统 SHALL 通过 Server-Sent Events 将 Agent SDK 的流式事件实时推送到前端。

#### Scenario: 发送消息并建立 SSE 流
- **WHEN** 前端 POST `/api/sessions/:id/send` 发送消息
- **THEN** 系统 SHALL 返回 SSE 响应流，将 SDK 产生的 AgentEvent 逐个推送到前端

#### Scenario: SSE 事件格式
- **WHEN** SDK 产生事件
- **THEN** 系统 SHALL 以 `event: <type>\ndata: <json>\n\n` 格式推送，type 对应 AgentEvent.type

#### Scenario: 连接中断处理
- **WHEN** SSE 连接意外断开
- **THEN** 系统 SHALL 中止对应的 SDK 查询，清理资源

#### Scenario: SSE 断开前端提示
- **WHEN** 前端检测到 SSE 连接断开（fetch 中断或 ReadableStream 关闭）
- **THEN** 前端 SHALL 展示"连接已断开"提示，保留已接收的内容，允许刷新恢复

### Requirement: CORS 支持
系统 SHALL 在开发模式下通过 Vite 代理解决跨域问题，生产模式下前后端同源无需 CORS。

#### Scenario: 开发模式代理
- **WHEN** 前端 Vite dev server 发起 `/api/*` 请求
- **THEN** Vite SHALL 将请求代理到 Bun 后端服务端口，前端无感知跨域

#### Scenario: 生产模式同源
- **WHEN** 生产模式下前端通过同一 Bun 服务访问 API
- **THEN** 系统 SHALL 无需 CORS 头，前后端同源同端口
