## Context

当前后端已经在多个位置输出零散日志：

- HTTP send 入口在 `apps/app/src/main/http/agent-stream.ts`
- SSE 生命周期在 `apps/app/src/main/sse-manager.ts`
- Agent 执行链路和 prompt 组装在 `apps/app/src/main/lib/agent-orchestrator.ts`

这些日志大多直接使用 `console.info/warn/error`，存在以下问题：

- 字段结构不统一，无法稳定按一次请求或一次 turn 串联完整链路。
- `/api/*` 请求没有统一 access log，中间件层也没有统一的请求上下文。
- `sessionId` 是当前最常见的关联字段，但同一会话中的多次发送无法仅靠 `sessionId` 区分。
- prompt、结构化请求载荷和上游错误信息的采集策略没有统一约束，要么缺失，要么只能靠临时加日志。
- 现有 `getLogsDir()` 已经提供了日志目录能力，但尚未形成正式的结构化诊断日志能力。

这次 change 是一个典型的跨模块改动：会同时触及 Hono HTTP app、会话路由、Agent send 流程、SSE 管理、设置模型和日志落盘方式，因此需要先把技术决策写清楚。

## Goals / Non-Goals

**Goals:**
- 为 `/api/*` 提供统一的结构化 access log。
- 为 `POST /api/sessions/:id/send` 提供 turn 级诊断链路日志，覆盖请求接收、prompt 组装、SDK 调用、异常和完成收口。
- 为 SSE 连接和事件发送补充可关联的传输日志，便于判断“后端仍在执行”还是“前端状态残留”。
- 让高频 preview / 静态接口日志在默认全量记录前提下与主访问日志分流，避免主 access log 被淹没。
- 为后端诊断日志提供统一字段规范、配置模型、默认全级别输出以及默认完整 payload 的落盘策略。
- 让上游模型、SDK 和网络错误在保留友好错误摘要的同时，被稳定记录到后端诊断日志中。
- 为主日志和 sidecar 建立自动归档与保留清理机制，确保单个日志文件不超过 `10 MB`，且归档文件不会无限增长。

**Non-Goals:**
- 不在本次 change 中增加前端“查看日志”面板或日志导出 UI。
- 不在本次 change 中为 renderer 侧每个组件增加全面的本地日志持久化。
- 不把所有 SSE frame 或 preview 静态资源请求默认提升到高噪声日志级别。
- 不改变现有对话消息持久化格式，也不把日志内容混入会话 JSONL。

## Decisions

### Decision: 后端统一使用内部诊断 logger 封装，而不是继续扩散 `console.*`

主进程引入一层统一 logger 封装，并使用内部文本日志写入器生成保留稳定字段的结构化文本日志。所有 access log、turn trace、SSE transport log 和异常日志都通过该封装输出，而不再在新增逻辑中直接书写 `console.*`。日志在磁盘上的形态以可读文本块呈现，而不是 JSONL；但每条日志仍保留 `level`、`component`、`category` 以及各类关联字段，便于人工查看和按字段检索。

主文本日志默认采用单行摘要输出：一条事件对应一行，优先保留时间戳、级别、组件、类别、中文说明和关键关联字段。复杂的大文本、完整 prompt、stderr 和结构化请求载荷继续通过 turn sidecar 保留全文，不把主日志重新拉回多行大块文本。

选择内部文本 logger 的原因：

- 用户明确要求日志以文本形式保存，便于直接打开查看。
- 结构化字段仍可保留在日志正文中，不需要为了可检索性强制使用 JSONL。
- 主日志滚动、turn sidecar 命名和保留清理都可以直接按当前目录布局与文件名约定实现，不需要额外适配第三方 transport 约束。
- 对当前单机诊断场景来说，引入新的日志框架收益有限，内部实现更容易保证格式稳定。

替代方案：

- 继续沿用 `console.*`：实现最轻，但字段无法统一，也难以稳定落盘和管理大体积 payload。
- 使用 `pino` / `winston`：结构化能力完整，但默认输出形态与“纯文本可读日志”目标不一致，还会增加额外依赖与格式适配成本。

### Decision: 区分 `requestId`、`turnId` 和 `sseConnectionId`

日志上下文采用三层关联 ID：

- `requestId`: 每个 `/api/*` HTTP 请求唯一一个，用于 access log 和 route error log。
- `turnId`: 每次 `POST /api/sessions/:id/send` 业务发送唯一一个，用于串联请求接收、body 解析、prompt 组装、SDK 查询、重试、错误和完成阶段。
- `sseConnectionId`: 每个 SSE Response 连接唯一一个，用于区分同一 `sessionId` 下的不同连接、刷新、断开和重连。

其中：

- 所有 access log 至少携带 `requestId`。
- send 相关日志同时携带 `requestId + turnId + sessionId`。
- SSE 相关日志携带 `sseConnectionId`，并在可用时补充 `turnId + sessionId`。

选择这一方案，而不是只依赖 `sessionId` 或只使用单一 `requestId` 的原因：

- `sessionId` 无法区分同一会话里的多次发送。
- send 请求返回的是 SSE 长连接，单独一个 `requestId` 不能表达之后的业务 turn 和连接生命周期。
- “访问日志”和“对话 turn 诊断”是两个不同的观测维度，必须能一对多关联。

替代方案：

- 只用 `sessionId`：无法排查同一会话连续多次请求。
- 只用 `requestId`：对 SSE 长连接和 turn 生命周期表达不足。

### Decision: 在 HTTP app 层增加统一 access log middleware

`apps/app/src/main/http/app.ts` 将新增全局中间件，为所有 `/api/*` 请求建立请求上下文并记录：

- 请求开始
- 路由完成
- 路由异常
- 响应状态和耗时

标准 access log 字段至少包括：

- `ts`
- `level`
- `component`
- `category: "access"`
- `requestId`
- `method`
- `path`
- `status`
- `durationMs`
- `contentType`
- `sessionId`
- `workspaceId`
- `turnId`

其中 `sessionId / workspaceId / turnId` 允许在后续中间件或路由内逐步补齐。

同时，高频 preview 静态资源和类似的大量重复请求不再仅靠降低 level 做“降噪”，而是需要与主 access log 分流，例如写入独立 category 或独立滚动文件；这样在默认全级别记录前提下，主访问日志仍保持可读。

选择全局 middleware，而不是在每个 route 手工加日志的原因：

- 入口统一，最容易保证覆盖率和字段一致性。
- 处理异常和耗时统计更自然，不会依赖每个路由都记得收口。
- 后续新增 API 时可自动纳入 access log。

替代方案：

- 按 route 分散记录：容易漏记，且字段不一致。

### Decision: turn trace 放在 `sessions/send -> agent-stream -> agent-orchestrator` 主链路，而不是只在入口打一次日志

`turnId` 从 `POST /api/sessions/:id/send` 进入时创建，并沿着以下链路传递：

- `sessions.ts` 请求体解析和附件处理
- `agent-stream.ts` send 接受/拒绝与回调收口
- `agent-orchestrator.ts` 用户消息持久化、动态上下文组装、prompt 组装、query options、SDK 调用、stderr、typed_error、catch_error、重试、完成

turn trace 默认记录完整的核心链路原始 payload 和阶段日志，而不是只记录摘要。推荐阶段包括：

- `request_received`
- `request_body_parsed`
- `send_rejected_busy`
- `user_message_persisted`
- `dynamic_context_built`
- `prompt_built`
- `sdk_query_started`
- `sdk_session_resolved`
- `first_event_received`
- `retry_scheduled`
- `typed_error`
- `catch_error`
- `assistant_message_persisted`
- `turn_completed`

选择“阶段日志 + 关联 ID”的方案，而不是单次入口日志的原因：

- 用户要排查的是“后端处理和响应的整理流程和链路”，只记录入口没有诊断价值。
- 真正的复杂性在 `agent-orchestrator`，包括 prompt 组装、重试、compact recovery 和错误映射。

替代方案：

- 只在 `/send` 入口记录日志：不能定位耗时和失败究竟停在何处。
- 默认记录所有 AgentEvent：噪声过高，不适合作为常态诊断日志。

### Decision: 核心链路原始 payload 默认完整记录，但请求载荷采用“完整可诊断表示”而不是原始二进制 body

诊断日志配置不再把“是否记录完整原始 payload”作为独立开关。对核心请求链路，系统默认完整记录：

- `userMessage`
- `composedUserMessage`
- `currentTurnMessages`
- `normalizedRequestPayload`
- `finalPrompt`
- `systemPrompt`
- `stderr`
- 关键上游错误信息

这里的 `normalizedRequestPayload` 指“对请求语义完整可诊断的结构化表示”，而不是一字不差保留原始 HTTP body 字节流。对于 `multipart/form-data`、文件上传或其他二进制请求，系统记录：

- 结构化字段
- 解析后的 payload JSON
- 上传文件元数据，例如文件名、大小、MIME type、本地保存路径或附件 ID

系统不直接把上传二进制内容写进诊断日志或 sidecar。

其中 `currentTurnMessages` 只记录本次 turn 新增写入的 user / assistant / status 消息切片，而不重复整个会话历史。完整历史会继续留在会话消息存储中，最终送模上下文则由 `finalPrompt` / `systemPrompt` sidecar 保留。

日志级别继续保留，但默认配置必须记录所有支持的级别。这意味着默认 logger level 设为 `trace`，从而保留 `trace/debug/info/warn/error/fatal` 全部级别。级别字段主要用于日志分类和后续筛选，而不是默认过滤任何 send turn 的核心原始链路日志。

选择这一方案，而不是把完整 payload 变成可选采集开关的原因：

- 当前需求就是为了排查真实长耗时和链路问题，若默认仍是摘要模式，排障价值会明显不足。
- 用户已明确接受完整日志记录，不再需要为敏感信息控制保留默认约束。
- 对上传接口来说，完整可诊断语义比原始二进制 body 更有价值，也更符合 `10 MB` 约束。

替代方案：

- 仅记录摘要：日志量较小，但不满足当前排障目标。
- 默认只记录 `info` 及以上：会丢失高频但对排障有价值的 `debug/trace` 细节。
- 原样记录原始二进制 body：日志量巨大，且对排障收益极低。

### Decision: 所有持久化日志文件都必须遵守 `10 MB` 上限并自动滚动或分片

所有持久化诊断文件都遵守 `10 MB` 上限。这里的 `10 MB` 明确指 `10 * 1024 * 1024` 字节。

文件大小控制策略分两类：

- 主文本日志：使用内部 rolling text writer 维护稳定的活跃文件名；活跃文件写满时先归档当前文件，再立即创建新的活跃文件继续写入。后端重启时若发现上一次进程遗留的活跃文件，也会先执行同样的归档动作。该行为同时适用于 `backend` 和 `access-preview` 两类主日志。
- 大 payload sidecar：若单个 request body、prompt 或 stderr 全文超过 `10 MB`，则按顺序拆分为多个 part 文件，保证不截断原文且每个 part 不超过上限。

在自动滚动之外，系统还需要 retention 清理策略。当前实现主要基于以下上限组合：

- 主日志滚动文件最大保留数量
- turn sidecar 目录最大保留数量
- 日志最大保留时长

当滚动后的主日志文件或旧 turn sidecar 目录超出保留策略时，系统优先删除最旧的历史项；当前正在写入的最新日志文件与受保护的当前 turn sidecar 不参与清理。

建议落盘结构：

- `~/.proma/logs/backend/backend.current.log`
- `~/.proma/logs/backend/backend.20260422-153045-123.log`
- `~/.proma/logs/access-preview/access-preview.current.log`
- `~/.proma/logs/access-preview/access-preview.20260422-153045-123.log`
- `~/.proma/logs/turns/<turnId>/request-payload.part-001.txt`
- `~/.proma/logs/turns/<turnId>/final-prompt.part-001.txt`
- `~/.proma/logs/turns/<turnId>/system-prompt.part-001.txt`
- `~/.proma/logs/turns/<turnId>/stderr.part-001.log`

选择“自动滚动 + sidecar 分片”，而不是简单截断的原因：

- 用户明确要求完整日志，不能靠截断满足文件大小限制。
- 主日志和 sidecar 的文件形态不同，必须分别处理滚动与分片。
- 只对主日志做 rotation 不够，因为完整 prompt/stderr sidecar 同样可能超过上限。
- 若没有 retention 清理，历史日志最终仍会无限增长并耗尽磁盘。

替代方案：

- 超过上限后截断文件：实现简单，但违反完整日志目标。
- 只限制主日志文件大小：无法保证 sidecar 也满足单文件上限。
- 只做滚动不做清理：仍会留下长期磁盘膨胀风险。

### Decision: 主日志与 sidecar 统一复用内部文本写入接口，但保留不同 writer 责任边界

实现优先级如下：

- 结构化日志编码、level 管理、child logger：统一通过内部 `DiagnosticLogger` 接口暴露
- 主日志文件输出与 `10 MB` 自动滚动：使用专用 `RollingTextLogWriter`
- turn 级 request body / prompt / stderr 全文 sidecar 与超大内容分片：使用专用 sidecar writer

这样划分的原因：

- 主日志本身是连续文本日志流，适合用专用滚动 writer 处理顺序编号与大小上限。
- turn sidecar 不是通用日志流，而是按一次请求产出的命名文件集合，且需要和 `turnId`、字段类型、分片编号严格绑定，因此需要独立 writer。
- 高频 access log 分流只需要复用同一套文本编码与独立输出文件，不需要再引入第二套日志框架。

替代方案：

- 为主日志和 sidecar 分别再引入不同第三方框架：能力分散，格式也更难统一。
- 把 sidecar 也强行映射成通用日志流：会让 turn 级文件命名、分片和检索关系变复杂。

### Decision: 完整 prompt 与 system prompt 默认通过 sidecar 文件保留全文

主文本日志仍不直接塞入超大文本字段，但完整的 final prompt、system prompt、结构化请求载荷等大 payload 默认写入与 turn 关联的 sidecar 文件：

- 主日志保留 `turnId`、字段类型、长度和 sidecar 相对路径。
- sidecar 文件保留未截断的完整原文。

选择 sidecar 文件，而不是把全部原始 payload 混入主日志的原因：

- 大体积文本直接写入主文本日志会显著降低可读性和检索效率。
- sidecar 仍然能满足“完整日志”要求，同时更利于按 turn 定位与查看。

替代方案：

- 主日志直接写全部全文：实现更直接，但主日志会快速膨胀。
- 完全不支持全文落盘：排查 prompt 组装和上游异常时信息不足。

## Risks / Trade-offs

- [日志量显著增加] → 通过 access/turn/sse 分类、自动滚动、sidecar 分流与分片控制单文件体积。
- [只做自动归档但没有 retention 会导致磁盘无限膨胀] → 将 retention 清理作为正式需求纳入同一套日志生命周期管理。
- [跨层传递 `turnId` / `requestId` 会增加函数签名复杂度] → 通过统一 trace context 对象传递，避免散落多个裸参数。
- [新增日志文件落盘逻辑会增加测试面] → 将内部 logger 封装、滚动文本写入器和 full-payload sidecar writer 做成独立可测模块，并补路由和 orchestrator 侧测试。

## Migration Plan

1. 在主进程引入统一诊断 logger 封装和设置默认值，建立“默认记录所有级别”的诊断日志配置模型，并定义 retention 默认值。
2. 在 HTTP app 层增加 access log middleware，并让会话/工作区等路由能够补充上下文字段。
3. 为高频 preview / 静态接口日志增加独立滚动文件分流，避免主 access log 被高频路径淹没。
4. 在 `/api/sessions/:id/send` 路径创建 `turnId`，并沿 `sessions -> agent-stream -> agent-orchestrator -> sse-manager` 传递 trace context。
5. 为主日志接入滚动文本写入器，实现 `10 MB` 自动滚动与 retention 清理；为结构化请求载荷、prompt、system prompt、stderr 和上游错误补充分片式完整 sidecar 落盘逻辑。
6. 更新测试，覆盖 access log、turn trace、默认全级别输出、自动滚动、retention 清理、高频日志分流和 sidecar 分片行为。

回滚策略：

- 若新日志链路引入异常，可先停用新增 logger 封装并保留原有业务逻辑，access log 与 turn trace 作为可独立回滚的诊断层处理。
- 若 sidecar 落盘出现问题，可先保留主日志与标准错误日志链路，再单独回退 sidecar writer，不影响核心对话流程。

## Open Questions

- 本次不阻塞实现的前提下，暂不要求把 `requestId` 或 `turnId` 回传到前端响应头；后续若需要在 UI 中展示排障编号，再单独扩展。
