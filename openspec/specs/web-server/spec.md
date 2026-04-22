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

### Requirement: 路由重构期间必须保持既有 HTTP API 契约
系统 SHALL 在重构后端 HTTP 路由实现时保持现有 REST 路径、方法和 SSE 交互契约稳定，避免要求 renderer 侧改写既有调用入口。

#### Scenario: 既有 REST 端点保持可用
- **WHEN** 前端继续调用现有的 `/api/status`、`/api/settings`、`/api/user-profile`、`/api/sessions` 和 `/api/workspaces` 相关端点
- **THEN** 系统 SHALL 继续以既有 HTTP 方法和响应语义处理这些请求，而不要求前端修改请求路径或协议

#### Scenario: SSE 发送端点保持兼容
- **WHEN** 前端继续向 `POST /api/sessions/:id/send` 发送消息
- **THEN** 系统 SHALL 继续返回可被现有 SSE 读取逻辑消费的流式响应，并保持 `event: <type>\ndata: <json>\n\n` 事件格式

#### Scenario: API 未命中仍返回 JSON 错误
- **WHEN** 请求命中未知的 `/api/*` 路径
- **THEN** 系统 SHALL 返回 JSON 错误响应，而不是返回前端静态资源或 HTML 回退文档

### Requirement: HTTP 服务必须通过模块化应用层组织路由
系统 SHALL 通过一个共享的 HTTP 应用层来组合 REST 路由、中间件和静态资源处理边界，而不是继续依赖单文件内联分发器。

#### Scenario: 路由按资源域拆分
- **WHEN** 系统初始化 HTTP 服务
- **THEN** 会话、工作区、状态和用户资料等处理逻辑 SHALL 以独立路由组形式挂载到共享应用入口，而不是全部堆叠在单个条件分支文件中

#### Scenario: 共享中间件处理资源预加载和错误映射
- **WHEN** 某个 HTTP 端点依赖会话或工作区资源存在，或在处理期间抛出可预期的 HTTP 错误
- **THEN** 系统 SHALL 通过共享应用层中间件完成资源预加载或错误响应映射，而不是在每个端点内重复编写相同分支

#### Scenario: 静态资源回退与 API 路由边界分离
- **WHEN** 生产模式下收到非 `/api/*` 请求
- **THEN** 系统 SHALL 通过共享应用层中的静态资源处理逻辑返回命中的构建产物或 SPA 回退文档，而不是与 API 路由分发逻辑耦合在同一分支实现中

### Requirement: `/api/*` 请求必须输出统一的访问日志
系统 SHALL 为 `/api/*` 请求输出统一的结构化 access log，并 SHALL 在请求开始、完成和异常时记录可关联的请求上下文、响应状态和耗时，而不是仅在个别路由中零散打印日志；但系统 MAY 为明确标记的高频轮询接口关闭常规 access log，以避免日志被轮询流量刷爆。

#### Scenario: API 请求完成时输出访问日志
- **WHEN** 任意 `/api/*` 请求被后端成功处理并返回响应
- **THEN** 系统 SHALL 记录该请求的结构化访问日志
- **AND** 该日志 SHALL 至少包含唯一请求标识、HTTP 方法、请求路径、响应状态和耗时

#### Scenario: API 请求异常时输出带同一请求标识的错误日志
- **WHEN** 某个 `/api/*` 请求在路由处理过程中抛出 HTTP 错误或未处理异常
- **THEN** 系统 SHALL 记录该请求的错误日志
- **AND** 该错误日志 SHALL 与该请求的访问上下文共享同一请求标识

#### Scenario: 高频 API 子路径日志与主访问日志分流但不得脱离统一 schema
- **WHEN** 某类高频 `/api/*` 子路径被实现为降噪日志策略
- **THEN** 系统 SHALL 将这些请求日志分流到独立的 category、transport 或滚动文件
- **AND** 系统 SHALL 继续使用与其他 access log 一致的结构化字段
- **AND** 系统 SHALL NOT 仅通过降低日志级别来实现分流

#### Scenario: 明确豁免的高频轮询接口可以不写常规 access log
- **WHEN** 某个高频轮询型 `/api/*` 接口被显式标记为 access log 豁免路径
- **THEN** 系统 MAY 不为该接口写入常规 access log
- **AND** 该豁免 SHALL 仅适用于明确列出的高频轮询路径，而不是整类 API 的默认行为

### Requirement: SSE 连接生命周期必须输出可关联的传输日志
系统 SHALL 为 SSE 连接建立、事件发送失败、取消和关闭等关键生命周期输出结构化 transport log，使诊断链路能够区分“业务仍在执行”和“流式传输已经断开”。

#### Scenario: SSE 连接建立时记录连接日志
- **WHEN** `POST /api/sessions/:id/send` 返回新的 SSE 响应并建立连接
- **THEN** 系统 SHALL 为该连接生成独立的连接标识
- **AND** 系统 SHALL 记录连接建立日志以及与该连接相关的会话上下文

#### Scenario: SSE 推送失败时记录传输失败日志
- **WHEN** 后端向某个 SSE 连接发送事件时发生 enqueue 失败或连接已失效
- **THEN** 系统 SHALL 记录该次传输失败日志
- **AND** 该日志 SHALL 标识失败事件类型和对应连接上下文

#### Scenario: SSE 连接关闭时记录终态日志
- **WHEN** 某个 SSE 连接因正常完成、客户端取消或后端主动关闭而结束
- **THEN** 系统 SHALL 记录该连接的关闭日志
- **AND** 该日志 SHALL 能区分连接关闭的生命周期阶段
