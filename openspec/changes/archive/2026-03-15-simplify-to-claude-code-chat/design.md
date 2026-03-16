## Context

在当前 Proma Electron monorepo 工程基础上删减改造。去掉 Electron 桌面壳，将主进程服务改为 Bun HTTP 服务，渲染进程的 IPC 调用改为 fetch/SSE，最终得到一个纯 Web 应用。

核心约束：`@anthropic-ai/claude-agent-sdk` 是 Node.js 库，无法在浏览器运行，需要后端服务承载 SDK 调用。

## Goals / Non-Goals

**Goals:**
- 在现有代码上删减，最大化复用，不新建项目
- 浏览器可直接访问的 Claude Code 对话界面
- 完整的流式对话体验（文本 + 工具活动）
- 权限请求和 AskUser 的双向交互

**Non-Goals:**
- 不引入新功能模块
- 不做大规模架构调整
- 不做多用户/认证系统
- 不做数据库（保留文件存储）
- 不做 WebSocket（SSE 足够）

## Decisions

### Decision 1: SSE 替代 Electron IPC

**选择**: Server-Sent Events (SSE) + REST 替代 Electron IPC
**替代方案**: WebSocket

**理由**:
- Agent SDK 的通信模式是单向流式（服务端 → 客户端），SSE 天然匹配
- SSE 基于 HTTP，无需额外协议升级，实现更简单
- 权限/AskUser 的反向通信通过独立 REST 端点实现，频率低
- 现有 `agent-event-bus.ts` 的事件推送模式可以直接映射到 SSE

**Trade-off**: 权限请求需要 SSE + REST 配合，但整体改动量比 WebSocket 小。

### Decision 2: POST SSE 而非 GET EventSource

**选择**: `POST /api/sessions/:id/send` 返回 SSE 流（前端用 `fetch` + `ReadableStream` 消费）
**替代方案**: 先 POST 发送消息，再 GET EventSource 监听

**理由**:
- 浏览器原生 `EventSource` 只支持 GET，无法携带请求体
- POST SSE 可以在一个请求中完成"发送消息 + 接收流式响应"
- 前端用 `fetch` 的 `response.body.getReader()` 解析 SSE 文本流

**Trade-off**: 失去 `EventSource` 的自动重连，但对话场景下断连即意味着生成中断，重连意义不大。

### Decision 3: 权限请求的 Promise Hold 模式

**选择**: 复用现有 `agent-permission-service.ts` 的 Promise 排队机制，改为通过 SSE 推送 + REST 响应

```
SDK canUseTool() 触发
  → 复用现有 permission-service 创建 Promise
  → SSE 推送 permission_request 事件（替代 webContents.send）
  → await Promise（SDK 阻塞等待）
  → 前端 POST /permission-respond（替代 IPC respond）
  → resolve Promise → SDK 继续执行
```

**理由**: 现有权限服务的 Promise 排队逻辑可以直接复用，只需替换事件推送方式。

### Decision 4: 在现有工程上改造而非新建项目

**选择**: 在 monorepo 中直接删减改造
**替代方案**: 新建 proma-web/ 独立项目

**理由**:
- 现有代码经过验证，SDK 事件翻译和工具匹配逻辑复杂度高
- 直接改造避免大量复制粘贴，保留 git 历史
- 现有 Vite + Tailwind + ShadcnUI 配置可以直接复用
- 符合"不做大调整"的原则

### Decision 5: 复用现有存储路径

**选择**: 复用 `~/.proma/agent-sessions/` 存储会话数据
**替代方案**: 新建 `~/.proma-web/`

**理由**:
- 现有 `agent-session-manager.ts` 已经实现了完整的 JSONL 存储
- 直接复用避免重写存储逻辑
- 会话数据格式不变，无需迁移

### Decision 6: Bun HTTP 服务替代 Electron 主进程

**选择**: `Bun.serve()` 作为 HTTP 入口
**替代方案**: Node.js + Express

**理由**:
- 项目已使用 Bun 作为运行时
- `Bun.serve()` 内置 HTTP 服务，无需额外框架
- 现有主进程服务层代码可以直接被 HTTP handler 调用

```
开发模式:
  Vite dev server (port 5173) → proxy /api → Bun server (port 3000)

生产模式:
  Bun server (port 3000)
    ├── /api/*  → REST + SSE
    └── /*      → dist/ 静态文件
```

## Risks / Trade-offs

**[Electron 耦合深度]** → 渲染进程大量使用 `window.electronAPI.*`。
- Mitigation: 创建一个 api 适配层替代 electronAPI，逐步替换。

**[agent-orchestrator 耦合]** → 58KB 编排器与 Channel/Workspace/Team 深度耦合。
- Mitigation: 绕过 orchestrator，直接使用 `claude-agent-adapter.ts` 的 SDK 调用层。

**[删除连锁反应]** → 删除 Chat/Channel 模块时可能破坏 shared 类型的交叉引用。
- Mitigation: 每删一个模块就运行 typecheck，及时修复。

**[并发会话]** → 多个会话同时流式输出时的资源压力。
- Mitigation: 限制同时活跃的 SDK 查询数（默认 1）。

## Open Questions

（已全部决策，无遗留问题）

- **模型选择**: 不提供前端切换，使用 SDK 默认模型。
- **cwd 配置**: 固定为服务器启动目录（`process.cwd()`）。
- **会话恢复**: 不支持 SDK resume。

## Post-Archive Regression Notes

### 2026-03-16: Agent 对话时序问题回溯

归档后的回归排查确认，后续出现的两类对话异常并不属于单一的新回归，而是原方案中长期存在的时序缺口在 Web 版结构中继续暴露：

1. **第二轮发送开始时短暂回显上一轮 assistant 回复**
   - 底层触发条件来自 `packages/ui/src/hooks/useSmoothStream.ts` 在 `67038d1` 引入的有状态平滑渲染机制；该 hook 通过 effect 重置 `displayedContent`，会保留一帧旧值窗口。
   - 该问题在 `17c79e9` 将 `useSmoothStream` 接入 Agent UI 后首次具备可见性；当新一轮请求刚进入 `streaming=true` 但尚未收到新文本时，旧的 `smoothContent` 会被 transient assistant 容器再次渲染。
   - `84f7ded` 将判断逻辑抽成 `shouldRenderTransientAssistantMessage(...)`，但仍保留了“只要 `streaming` 就显示 transient assistant”的路径，因此属于保留旧问题，而不是新引入根因。

2. **刷新页面后最后一条 assistant 回复暂时缺失**
   - 从 `17c79e9` 的初版 Agent Web/Electron UI 开始，assistant 消息就采用“完成后一次性持久化到 JSONL”的策略，而视图在挂载/切换时只读取一次历史消息。
   - 因此只要刷新落在“UI 已接近完成，但主进程尚未完成持久化”的窗口，首轮历史读取就可能停在最后一条 `user` 消息。
   - `cb8771d`、`2f09ef6`、`84f7ded` 先后搬迁了监听与刷新路径，但没有改变这个基础假设；`e69115a`、`f7b9958`、`bede47e` 等提交则说明这一带的 complete/refresh 竞态在历史上持续存在并被反复修补。

3. **与后续本地 session/tab 持久化改动的关系**
   - 当前工作区中将 session/tab 改为 `atomWithStorage(...)` 的改动尚未进入提交历史。
   - 这批改动会放大“刷新后立即恢复到原会话”的复现概率，但不是上述两个问题的原始引入点。

### 结论

`simplify-to-claude-code-chat` 归档变更保留了既有 Agent 流式渲染与完成后持久化的时序假设，因此后续出现的重复回显和刷新缺消息，更适合定性为“历史遗留竞态在精简版实现中继续暴露”，而不是归档变更单独制造的新缺陷。
