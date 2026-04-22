## 1. 日志基础设施

- [x] 1.1 为后端引入统一的诊断 logger 封装，并接入主文本日志落盘与完整 payload sidecar writer
- [x] 1.2 在 `AppSettings` 与 `settings-service` 中新增诊断日志配置、retention 配置及默认值，并将默认日志级别设为记录所有支持级别
- [x] 1.3 新增通用 trace context / full-payload 写入工具，统一生成和传递 `requestId`、`turnId`、`sseConnectionId`
- [x] 1.4 实现 `10 MB` 上限的主文本日志自动滚动与 retention 清理，并补齐 sidecar 分片写入能力

## 2. HTTP access log

- [x] 2.1 在 `apps/app/src/main/http/app.ts` 增加 `/api/*` 统一 access log middleware，记录请求开始、完成、异常和耗时
- [x] 2.2 让会话和工作区相关路由在请求上下文中补充 `sessionId`、`workspaceId` 等资源字段
- [x] 2.3 为高频 preview / 静态类 API 子路径补充独立日志分流方案，同时保持统一 schema

## 3. Agent send turn tracing

- [x] 3.1 在 `POST /api/sessions/:id/send` 路径创建 `turnId`，并通过 `sessions.ts`、`agent-stream.ts` 传递 trace context
- [x] 3.2 为 `createSendResponse` 和 send callbacks 增加 accepted、busy rejected、error、complete 等阶段日志
- [x] 3.3 在 `agent-orchestrator.ts` 中为消息持久化、prompt 组装、SDK query、retry、typed_error、catch_error 和 turn 完成补充结构化链路日志
- [x] 3.4 将上游 stderr、模型/SDK 错误全文与友好错误收口结果统一写入 turn trace

## 4. SSE 与诊断 payload 落盘

- [x] 4.1 在 `sse-manager.ts` 中为连接建立、取消、发送失败和关闭增加 `sseConnectionId` 级生命周期日志
- [x] 4.2 实现结构化请求载荷、final prompt、system prompt 和 stderr 的默认完整 sidecar 文件落盘，并在超 `10 MB` 时自动分片
- [x] 4.3 让原始消息、组合消息、prompt 和结构化请求载荷默认完整记录；对上传接口只记录文件元数据而不落二进制内容

## 5. 测试与验证

- [x] 5.1 为日志配置默认值、trace context 工具、主文本日志滚动器和完整 payload sidecar writer 补充测试
- [x] 5.2 更新 HTTP 相关测试，覆盖 access log middleware 与 send 路径的 `turnId`/`requestId` 传播
- [x] 5.3 更新 Agent orchestrator / SSE 相关测试，覆盖默认全级别输出、retention 清理、retry、错误收口、连接关闭和 prompt/结构化请求载荷采集日志
- [x] 5.4 运行受影响的 app 测试与必要校验命令，确认 change 进入可实施状态
