## ADDED Requirements

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
