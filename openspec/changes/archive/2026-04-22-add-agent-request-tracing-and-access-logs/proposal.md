## Why

当前 pagebuilder 与 Agent 对话在部分场景下会出现“处理很久但前端信息不足”的问题，而后端现有日志分散在 HTTP 路由、SSE 管理和 Agent 编排等多个位置，缺少统一的请求关联字段、访问日志和 turn 级链路日志，导致很难判断问题究竟出在请求入口、prompt 组装、模型调用、SSE 传输还是错误收口阶段。现在需要补齐结构化诊断能力，才能稳定排查长耗时、假忙、上游报错和接口异常等问题。

## What Changes

- 为 `/api/*` 请求增加统一的后端 access log，记录请求入口、响应状态、耗时和关键资源上下文，并将高频接口日志分流到独立日志流或文件。
- 为 `POST /api/sessions/:id/send` 增加 turn 级请求链路日志，覆盖请求接收、消息解析、prompt 组装、SDK 调用、流式事件、重试、异常和完成收口等关键阶段。
- 为 SSE 连接与事件发送增加可关联的传输日志，使请求日志、turn 链路日志和 SSE 生命周期能够通过统一字段串联起来。
- 引入可配置的诊断日志设置，默认记录所有日志级别，并默认完整记录核心请求链路中的完整可诊断载荷。
- 将诊断日志持久化为可检索、便于人工查看的结构化文本日志文件，并为主日志和 sidecar 提供自动归档与保留清理能力，确保单个日志文件不超过 `10 MB` 且归档文件不会无限增长。

## Capabilities

### New Capabilities
- `diagnostic-logging`: 定义 Proma 后端的结构化诊断日志能力，包括日志配置、全级别默认输出、完整可诊断载荷落盘方式以及 `10 MB` 自动归档与保留清理约束。

### Modified Capabilities
- `agent-conversation`: 修改 Agent 对话链路要求，增加 send turn 的关联 ID、关键处理阶段日志和上游模型/SDK 失败诊断采集。
- `web-server`: 修改 HTTP 服务要求，增加 `/api/*` 访问日志与 SSE 连接生命周期日志。

## Impact

- Affected code:
  - `apps/app/src/main/http/app.ts`
  - `apps/app/src/main/http/routes/sessions.ts`
  - `apps/app/src/main/http/agent-stream.ts`
  - `apps/app/src/main/sse-manager.ts`
  - `apps/app/src/main/lib/agent-orchestrator.ts`
  - `apps/app/src/main/lib/diagnostic-logging.ts`
  - `apps/app/src/main/lib/diagnostic-sidecar-writer.ts`
  - `apps/app/src/main/lib/settings-service.ts`
  - `apps/app/src/types/settings.ts`
  - `bun.lock`
- Affected systems:
  - Bun HTTP app and route middleware
  - Agent request execution pipeline
  - SSE transport lifecycle
  - local diagnostic log storage under `~/.proma/logs/`
- Dependencies:
  - no new third-party logging dependency; use the app's internal diagnostic logger, rolling text log writer, and sidecar writer
- APIs / contracts:
  - `/api/*` request handling gains correlation-aware logging
  - `POST /api/sessions/:id/send` gains turn-scoped tracing
  - SSE logging gains connection-scoped lifecycle metadata
