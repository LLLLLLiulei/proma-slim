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

### Requirement: PageBuilder Web 必须支持 public base path 下的 SPA、静态资源和 API 代理
系统 SHALL 让 PageBuilder Web 在配置 public base path 时既能作为 Nginx strip-prefix 后的根相对 upstream 运行，也能兼容直接访问未剥离前缀的 `/pagebuilder/*` 请求。

#### Scenario: Nginx 剥离前缀后 Web upstream 保持根路径行为
- **WHEN** 生产反向代理把浏览器请求 `/pagebuilder/api/status` 剥离为 upstream 请求 `/api/status`
- **THEN** PageBuilder Web SHALL 按现有 `/api/*` 代理规则将请求转发到 PageBuilder Server 的 `/api/status`
- **AND** PageBuilder Server SHALL NOT 需要识别 `/pagebuilder/api/status`

#### Scenario: 直连 base path API 请求只剥离一次
- **WHEN** PageBuilder Web 直接收到 `/pagebuilder/api/status` 且 public base path 为 `/pagebuilder`
- **THEN** PageBuilder Web SHALL 将其剥离为 `/api/status` 后代理到 PageBuilder Server
- **AND** 系统 SHALL NOT 将 `/pagebuilder/pagebuilder/api/status` 错误剥离为 `/api/status`

#### Scenario: 直连 base path builder 路由返回 SPA shell
- **WHEN** PageBuilder Web 直接收到 `/pagebuilder/builder/<workspaceId>/<sessionId>` 且 public base path 为 `/pagebuilder`
- **THEN** PageBuilder Web SHALL 返回 PageBuilder SPA shell
- **AND** 前端路由 SHALL 能基于浏览器地址中的 public base path 解析 builder 参数

#### Scenario: 直连 base path 静态资源从 dist 返回
- **WHEN** PageBuilder Web 直接收到 `/pagebuilder/assets/<file>` 且 public base path 为 `/pagebuilder`
- **THEN** PageBuilder Web SHALL 从构建产物的 `assets` 目录返回对应静态资源
- **AND** 缺失的带扩展名资源 SHALL 返回 404 而不是 SPA fallback
#### Scenario: 生产 HTML 响应注入运行时 base path 配置
- **WHEN** PageBuilder Web 在生产模式下返回 `index.html` 或 SPA fallback，且 public base path 为 `/pagebuilder`
- **THEN** 响应 HTML SHALL 包含指向 `/pagebuilder/` 的 base href 和包含 `/pagebuilder` 的 runtime config
- **AND** 静态资源响应 SHALL NOT 被注入 HTML runtime config
- **AND** 切换运行时 base path 后响应 HTML SHALL NOT 残留旧 base path

### Requirement: HTTP 服务必须提供 CMS integration 路由组
系统 SHALL 在 Bun HTTP 应用中注册 `/api/integrations/cms` 路由组，用于承载 CMS 集成模式状态和 CMS server-to-server 创建项目接口。

#### Scenario: 注册 CMS integration status 路由
- **WHEN** 客户端请求 `GET /api/integrations/cms/status`
- **THEN** HTTP 服务 SHALL 将请求路由到 CMS integration status 处理逻辑
- **AND** 未启用 CMS 集成模式时也 SHALL 返回 JSON 状态而不是 404

#### Scenario: 注册 CMS 创建项目路由
- **WHEN** CMS 请求 `POST /api/integrations/cms/projects`
- **THEN** HTTP 服务 SHALL 将请求路由到 CMS integration 创建项目处理逻辑
- **AND** 该路由 SHALL 使用 CMS integration 结构化错误响应

### Requirement: CMS integration 路由错误响应不得破坏既有 API 错误契约
系统 SHALL 仅对 CMS integration 路由返回 `{ code, error }` 结构化错误，其他既有 API 路由 SHALL 保持当前错误响应语义。

#### Scenario: CMS integration 业务错误返回 code 和 error
- **WHEN** `/api/integrations/cms/*` 路由抛出可预期 CMS integration 业务错误
- **THEN** HTTP 服务 SHALL 返回包含 `code` 和 `error` 的 JSON 响应

#### Scenario: 非 CMS integration API 保持原错误结构
- **WHEN** 现有非 CMS integration API 返回可预期 HTTP 错误
- **THEN** HTTP 服务 SHALL 继续保持既有错误响应结构
- **AND** 本 change SHALL NOT 要求所有 API 全局迁移到 `{ code, error }`

### Requirement: HTTP 服务必须承载 CMS handoff 与 builder context 路由
系统 SHALL 在现有 `/api/integrations/cms` 路由组中承载 CMS handoff 创建、handoff 消费和 builder context API，并 SHALL 保持 CMS integration 结构化错误响应。

#### Scenario: 注册 CMS 创建 handoff 路由
- **WHEN** CMS 请求 `POST /api/integrations/cms/projects/:projectId/handoffs`
- **THEN** HTTP 服务 SHALL 将请求路由到 CMS handoff 创建处理逻辑
- **AND** 该路由 SHALL 使用 `{ code, error }` 结构化错误响应

#### Scenario: 注册 CMS handoff open 路由
- **WHEN** 浏览器请求 `GET /api/integrations/cms/handoffs/:handoffId/open`
- **THEN** HTTP 服务 SHALL 将请求路由到 CMS handoff 消费处理逻辑
- **AND** 成功响应 SHALL 能设置 `Set-Cookie` 和 `Location` 头

#### Scenario: 注册 CMS builder context 路由
- **WHEN** 浏览器请求 `GET /api/integrations/cms/builder-context`
- **THEN** HTTP 服务 SHALL 将请求路由到 CMS builder context 处理逻辑
- **AND** 该路由 SHALL 使用 `{ code, error }` 结构化错误响应

### Requirement: PageBuilder Web 代理 API 时必须传递浏览器侧 forwarded 信息
系统 SHALL 让 PageBuilder Web 在代理 `/api/*` 请求到 PageBuilder Server 时传递可信的 forwarded host 与 proto 信息，供后端判断浏览器侧协议和生成 cookie 属性。

#### Scenario: 代理请求补充 forwarded host
- **WHEN** PageBuilder Web 代理浏览器 `/api/*` 请求到 PageBuilder Server
- **THEN** 上游请求 SHALL 包含浏览器请求对应的 `X-Forwarded-Host`

#### Scenario: 代理请求补充 forwarded proto
- **WHEN** PageBuilder Web 代理浏览器 `/api/*` 请求到 PageBuilder Server
- **THEN** 上游请求 SHALL 包含浏览器请求对应的 `X-Forwarded-Proto`

#### Scenario: base path 剥离后 forwarded 信息仍保留
- **WHEN** PageBuilder Web 直接收到带 public base path 的 `/pagebuilder/api/integrations/cms/handoffs/:id/open` 请求并剥离前缀代理到 server
- **THEN** 上游请求路径 SHALL 为 `/api/integrations/cms/handoffs/:id/open`
- **AND** 上游请求 SHALL 保留 forwarded host 与 proto 信息

### Requirement: PageBuilder Web 返回 builder shell 时必须允许同源 iframe 嵌入
系统 SHALL 在 PageBuilder Web 返回 builder SPA shell 的最终 HTML 响应上设置同源 iframe 兼容响应头。

#### Scenario: builder shell 包含 frame-ancestors CSP
- **WHEN** PageBuilder Web 返回 `/builder/:workspaceId/:sessionId` 或带 public base path 的 builder SPA shell
- **THEN** 响应头 SHALL 包含 `Content-Security-Policy: frame-ancestors 'self'`

#### Scenario: builder shell 不设置 DENY
- **WHEN** PageBuilder Web 返回 builder SPA shell
- **THEN** 响应头 SHALL NOT 包含会阻止同源 iframe 的 `X-Frame-Options: DENY`

#### Scenario: 静态资源响应不注入 builder shell CSP
- **WHEN** PageBuilder Web 返回 `/assets/*` 静态资源
- **THEN** 系统 SHALL NOT 把该响应当作 builder SPA shell 注入 runtime config 或 builder shell 专用 HTML 头
