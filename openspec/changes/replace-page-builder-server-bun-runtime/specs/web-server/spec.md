## MODIFIED Requirements

### Requirement: Bun HTTP 服务
系统 SHALL 提供 Node/Hono HTTP 后端服务，作为前端与 Agent SDK 之间的桥梁，并 SHALL 保持现有 REST API、SSE、静态文件和 preview 路由契约稳定。

#### Scenario: 服务启动
- **WHEN** 执行后端生产启动命令
- **THEN** 系统 SHALL 通过 Node.js runtime 与 Hono Node server 在指定端口启动 HTTP 服务，提供 REST API 和 SSE 端点
- **AND** 系统 SHALL NOT 在生产启动路径中调用 `Bun.serve()`

#### Scenario: 静态文件服务
- **WHEN** 生产模式下访问非 API 路径
- **THEN** 系统 SHALL 返回 Vite 构建的前端静态文件或 SPA fallback
- **AND** 系统 SHALL NOT 在该文件响应路径中调用 `Bun.file()`

#### Scenario: 后端关闭接口保持兼容
- **WHEN** 进程收到关闭信号并调用 HTTP server 关闭逻辑
- **THEN** 系统 SHALL 先停止所有运行中的 Agent
- **AND** 系统 SHALL 能通过与现有调用方兼容的 `stop(force?)` 接口关闭 Node/Hono HTTP 服务

### Requirement: 后端必须提供工作区 REST API
系统 SHALL 通过后端 HTTP 服务暴露工作区 CRUD API，而不是依赖旧 Electron IPC 或特定 Bun runtime API。

#### Scenario: 工作区 CRUD 请求
- **WHEN** 前端发起工作区列表、创建、更新或删除请求
- **THEN** 系统 SHALL 提供对应的 REST 端点完成工作区元数据操作

#### Scenario: 删除非空工作区返回明确错误
- **WHEN** 前端请求删除仍有会话归属的工作区
- **THEN** 后端 SHALL 以失败响应拒绝该请求，并返回可直接展示给用户的错误消息

#### Scenario: 创建会话时绑定工作区
- **WHEN** 前端创建新会话时提供 `workspaceId`
- **THEN** 后端 SHALL 将该工作区归属写入会话元数据，并以此驱动后续运行时解析

### Requirement: CORS 支持
系统 SHALL 在开发模式下通过 Vite 代理解决跨域问题，生产模式下前后端同源无需 CORS。

#### Scenario: 开发模式代理
- **WHEN** 前端 Vite dev server 发起 `/api/*` 请求
- **THEN** Vite SHALL 将请求代理到后端服务端口，前端无感知跨域

#### Scenario: 生产模式同源
- **WHEN** 生产模式下前端通过同一后端 HTTP 服务访问 API
- **THEN** 系统 SHALL 无需 CORS 头，前后端同源同端口

## ADDED Requirements

### Requirement: 后端文件响应必须兼容 Node runtime
系统 SHALL 使用 Node.js 兼容的文件响应能力承载后端静态文件、workspace preview、template preview、静态导出下载和 CMS export 下载，而不得依赖 Bun runtime 文件 API。

#### Scenario: 普通静态资源以 Node 文件响应返回
- **WHEN** 生产模式下浏览器请求 Vite 构建产物中的普通静态资源
- **THEN** 系统 SHALL 使用 Node.js 兼容文件响应返回对应文件
- **AND** 响应 SHALL 包含适用于该资源类型的内容类型
- **AND** 系统 SHALL NOT 调用 `Bun.file()`

#### Scenario: workspace preview 静态资源以 Node 文件响应返回
- **WHEN** 浏览器请求 page-builder workspace preview 中的非 HTML 静态资源
- **THEN** 系统 SHALL 返回该 workspace 文件内容并保留既有 `cache-control` 语义
- **AND** 系统 SHALL NOT 调用 `Bun.file()`

#### Scenario: template preview 静态资源以 Node 文件响应返回
- **WHEN** 浏览器请求 page-builder template preview 中的非 HTML 静态资源
- **THEN** 系统 SHALL 返回该 template 文件内容并保留既有 `cache-control` 语义
- **AND** 系统 SHALL NOT 调用 `Bun.file()`

#### Scenario: 导出 zip 下载以 Node 文件响应返回
- **WHEN** 浏览器请求 workspace 静态导出包或 CMS export 包下载
- **THEN** 系统 SHALL 返回 zip 文件内容
- **AND** 响应 SHALL 保留 `content-type: application/zip` 与既有 `content-disposition` 文件名语义
- **AND** 系统 SHALL NOT 调用 `Bun.file()`

### Requirement: Preview 运行时资产必须支持构建期预生成
系统 SHALL 允许生产镜像在构建阶段预生成 page-builder preview bridge 与 CMS rendering preview bootstrap 资产，并 SHALL 让 Node runtime 在运行阶段只读取这些资产，而不是动态调用 Bun 构建 API。

#### Scenario: preview bridge 使用预生成资产
- **WHEN** Node runtime 版后端响应 `/api/page-builder/preview-bridge.js`
- **THEN** 系统 SHALL 从构建阶段生成的 preview bridge 资产读取脚本内容
- **AND** 系统 SHALL NOT 在该生产运行路径中调用 `Bun.build()`

#### Scenario: CMS rendering preview 使用预生成资产
- **WHEN** Node runtime 版后端响应 `/api/page-builder/cms-rendering-preview.js`
- **THEN** 系统 SHALL 从构建阶段生成的 CMS rendering preview bootstrap 资产读取脚本内容
- **AND** 系统 SHALL NOT 在该生产运行路径中调用 `Bun.build()`

#### Scenario: 本地开发仍可保留动态构建 fallback
- **WHEN** 本地 Bun 开发模式未配置预生成 preview 资产路径
- **THEN** 系统 MAY 继续使用现有动态构建方式生成 preview 运行时资产
- **AND** 该 fallback SHALL NOT 成为 Docker Node runtime 的必需条件

### Requirement: Agent SDK CLI 必须在 Node runtime server 中可发现
系统 SHALL 在 Node runtime 版 server 容器中保留 Agent SDK 查询所需的 Node executable、SDK CLI 文件和受支持环境变量，使现有会话发送链路不因 server runtime 迁移而失效。

#### Scenario: 状态接口报告 SDK CLI 可发现性
- **WHEN** Node runtime 版 server 容器启动后客户端请求 `/api/status`
- **THEN** 响应 SHALL 能报告当前 Agent SDK CLI 是否可发现
- **AND** 正确配置依赖时 `sdkCliAvailable` SHALL 为 true

#### Scenario: Agent 执行优先使用 Node runtime
- **WHEN** 后端在 Node runtime 容器中发起 Agent SDK 查询
- **THEN** 系统 SHALL 使用检测到的 Node executable 执行 Agent SDK CLI
- **AND** 系统 SHALL NOT 要求容器中存在 Bun executable 才能发起会话

#### Scenario: Agent SDK env 注入语义保持不变
- **WHEN** Docker compose 为 `server` 注入受支持的 `ANTHROPIC_*`、`CLAUDE_CODE_*` 或 `API_TIMEOUT_MS` 环境变量
- **THEN** 后端 SHALL 继续将这些变量用于 Agent SDK 运行环境解析
- **AND** runtime 从 Bun 改为 Node SHALL NOT 改变官方 Agent SDK env 的优先级语义
