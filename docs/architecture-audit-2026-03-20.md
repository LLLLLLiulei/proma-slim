# Proma 项目架构审计报告

生成时间：2026-03-20

## 审计范围

- `apps/electron/src/main`
- `apps/electron/src/renderer`
- `packages/shared/src`
- `packages/ui/src`

## 审计方法

- 主线程结合多个并行 subagent 对后端接入层、Agent 编排层、前端状态与渲染链路做并行审查。
- 重点关注架构边界、状态一致性、会话生命周期、权限交互、性能热点和测试覆盖盲区。
- 额外执行了仓库基线验证：
  - `bun test`：98/98 通过
  - `bun run typecheck`：通过

## 一、当前架构设计与实现原理

### 1. Monorepo 结构

- 根仓库通过 Bun workspace 组织。
- `apps/electron` 是实际运行的应用，虽然目录名叫 `electron`，当前运行形态是 Bun HTTP 服务 + Vite/React 浏览器前端。
- `packages/shared` 提供跨层共享类型、事件协议、权限规则和公共工具。
- `packages/ui` 提供代码块、Mermaid、平滑流式文本渲染等 UI 基础能力。

### 2. 后端运行时分层

后端的主入口是 `apps/electron/src/main/index.ts`。启动顺序大致如下：

1. `initializeRuntime()` 完成运行时初始化。
2. `seedDefaultSkills()` 准备默认技能目录。
3. `createHttpServer()` 启动 Bun HTTP 服务。
4. 所有 API 请求进入 `http-router.ts`。

后端的关键分层如下：

- HTTP 接入层：
  - `http-server.ts`
  - `http-router.ts`
  - `sse-manager.ts`
- 领域服务层：
  - `agent-session-manager.ts`
  - `workspace-service.ts`
  - `settings-service.ts`
  - `user-profile-service.ts`
- Agent 编排层：
  - `agent-service.ts`
  - `agent-orchestrator.ts`
  - `adapters/claude-agent-adapter.ts`
  - `agent-permission-service.ts`
  - `agent-ask-user-service.ts`

后端的数据流是：

1. 前端调用 `/api/sessions/:id/send`。
2. `http-router.ts` 创建 SSE 响应，并调用 `runAgent()`。
3. `runAgent()` 转给 `AgentOrchestrator.sendMessage()`。
4. `AgentOrchestrator` 负责：
   - 校验运行环境和 API Key
   - 解析工作区上下文
   - 组装 SDK query 参数
   - 接入权限审批与 AskUser 交互
   - 将 SDK 流式事件转成统一的 `AgentEvent`
   - 通过事件总线广播给 SSE 层
   - 将用户消息、助手消息、状态消息落盘
5. `ClaudeAgentAdapter` 把 Anthropic SDK 的原始消息翻译为统一事件模型。
6. `SSEManager` 把事件封装为 `text/event-stream` 推给前端。

### 3. 数据持久化模型

项目采用本地文件存储，不依赖数据库：

- 会话索引：`~/.proma/agent-sessions.json`
- 会话消息：`~/.proma/agent-sessions/{sessionId}.jsonl`
- 工作区结构：`~/.proma/agent-workspaces/...`

这个设计足够简单，开发门槛低，但它把一致性问题暴露给了应用层。只要发生“停止/删除/迁移/并发写入”交叉，就必须自己保证索引、JSONL 和工作区目录始终同步。

### 4. 前端状态与渲染链路

前端主入口是 `apps/electron/src/renderer/App.tsx`。整体分层如下：

- 顶层容器：
  - `App.tsx`
  - `components/app-shell/*`
- 会话页：
  - `components/agent/AgentView.tsx`
  - `components/agent/AgentMessages.tsx`
  - `components/agent/PermissionBanner.tsx`
  - `components/agent/AskUserBanner.tsx`
- 状态管理：
  - `atoms/agent-atoms.ts`
  - `atoms/session-tabs.ts`
  - `atoms/active-view.ts`
- 网络与流式消费：
  - `lib/api.ts`
  - `hooks/useAgentSSE.ts`

前端数据流是：

1. `LeftSidebar` 初始化拉取会话和工作区列表。
2. `MainContentPanel` 根据当前 tab/session 渲染 `AgentView`。
3. `AgentView` 负责：
   - 拉取历史消息
   - 管理输入框 draft
   - 调用 `useAgentSSE().sendMessage()`
   - 组合会话、工作区、上下文目录信息
4. `useAgentSSE.ts` 直接消费后端返回的 SSE 流。
5. `applyStreamFrame()` 把每个事件写入 Jotai 原子状态。
6. `AgentMessages.tsx` 把“已持久化消息”与“当前流式临时内容”拼装成最终 UI。
7. `useSmoothStream()` 对流式文本做打字机式平滑渲染。

### 5. 共享契约层

`packages/shared` 的核心作用是定义跨层协议：

- `AgentSendInput`
- `AgentEvent`
- `PermissionRequest`
- `AskUserRequest`
- 各类 workspace/session/user-profile 类型

这层的质量直接决定前后端是否“说同一种语言”。只要 shared contract 已声明、路由已透传、编排层却不消费，就会出现“类型看上去支持、运行时实际上失效”的假能力。

## 二、核心问题清单

以下问题按优先级排序。排序标准是：数据正确性和会话控制优先于可用性，再优先于纯性能问题。

### P1-1 SSE 连接的“单连接取消”会被当成“整个 session 结束”，并连带中止所有观察者

- 证据：
  - `apps/electron/src/main/sse-manager.ts:18-35`
  - `apps/electron/src/main/sse-manager.ts:65-114`
  - `apps/electron/src/main/http-router.ts:349-353`
- 问题说明：
  - `SSEManager.createResponse()` 为每个 session 保存一个连接集合。
  - 但连接的 `cancel()` 直接调用 `closeSession(sessionId)`，不是只关闭当前连接。
  - `closeSession()` 会遍历并关闭该 session 下的全部连接。
  - 每个连接又都绑定了 `onClose`，而 `http-router.ts` 里传入的 `onClose` 是“如果 session 还活跃就 `stopAgent(sessionId)`”。
- 可能导致的问题：
  - 任何一个客户端断开，都可能把同一 session 的其他客户端一起踢下线。
  - 多窗口、刷新、切页、网络抖动时，可能误中止正在运行的 Agent。
  - 这类问题很难从单窗口 happy path 测试中暴露出来，但真实用户一旦开多个标签页或中途断线就会踩中。
- 修复建议：
  - 把“关闭当前连接”和“关闭整个 session”分开。
  - `cancel()` 只能移除当前 `SessionConnection`，不能直接 `closeSession(sessionId)`。
  - 只有显式完成、显式 stop、或服务端确认 session 终止时，才关闭整个 session。
  - `onClose` 也不应绑定在每条 SSE 连接上，而应绑定到 session 生命周期管理器上。

### P1-2 前端 SSE 生命周期绑定在 `AgentView` 上，视图卸载会把进行中的流错误地标记为断线

- 证据：
  - `apps/electron/src/renderer/hooks/useGlobalAgentListeners.ts:1-4`
  - `apps/electron/src/renderer/components/agent/AgentView.tsx:86`
  - `apps/electron/src/renderer/hooks/useAgentSSE.ts:230-237`
  - `apps/electron/src/renderer/hooks/useAgentSSE.ts:315-323`
  - `apps/electron/src/renderer/components/app-shell/MainContentPanel.tsx:164-169`
- 问题说明：
  - `useGlobalAgentListeners()` 只是 `useAgentSSE()` 的一层薄包装。
  - 但它并没有挂在真正的“全局层”，而是挂在 `AgentView` 内。
  - `AgentView` 卸载时，`useAgentSSE()` cleanup 会把 `controllersRef` 里的所有 controller `abort()`。
  - abort 后又会走 `catch`/`finalizeStream()`，把会话记为“连接已断开”。
- 可能导致的问题：
  - 切到设置页、没有可渲染 session、或未来主面板做条件卸载时，前端会误把仍在后台运行的 session 判成断线。
  - 后端实际仍在执行，但前端失去实时状态，只剩一堆误导性的错误信息。
- 修复建议：
  - 把 SSE/controller registry 提升到 `AppShell` 或更高层，做成真正的 session-level 全局服务。
  - 视图组件只消费状态，不负责持有连接生命周期。
  - 只有用户显式 stop 或应用退出时，才主动 abort。

### P1-3 删除活跃会话时存在停止/持久化竞态，可能在删除后重新生成孤儿消息文件

- 证据：
  - `apps/electron/src/main/http-router.ts:263-268`
  - `apps/electron/src/main/lib/agent-orchestrator.ts:564-580`
  - `apps/electron/src/main/lib/agent-orchestrator.ts:1262-1304`
  - `apps/electron/src/main/lib/agent-orchestrator.ts:1361-1364`
  - `apps/electron/src/main/lib/agent-session-manager.ts:166-175`
  - `apps/electron/src/main/lib/agent-session-manager.ts:209-238`
- 问题说明：
  - 删除会话时，路由先 `stopAgent(sessionId)`，然后立刻 `deleteAgentSession(sessionId)`。
  - 但 `stopAgent()` 只是把 session 从 `activeSessions` 移除并请求 adapter `abort()`，并不等待编排层完全退出。
  - `AgentOrchestrator.sendMessage()` 的后续 catch/finally 逻辑依然可能执行，并调用 `appendAgentMessage()` 持久化部分输出或错误消息。
  - `appendFileSync()` 会在消息文件已被删除的情况下重新创建文件。
- 可能导致的问题：
  - 被删除的会话在索引里已经不存在，但磁盘上又冒出新的 JSONL 文件，形成孤儿数据。
  - 用户看到“会话删掉了”，实际后台仍可能追加部分内容。
  - 这会污染本地存储，也会让后续排障非常困难。
- 修复建议：
  - 把“停止活跃会话”和“删除持久化资源”拆成两阶段。
  - 删除前必须等待编排层完全退出，或者为 session 标记 tombstone，阻止任何后续写入。
  - `appendAgentMessage()` 和 `persistAssistantMessage()` 也应校验会话是否仍存在。

### P1-4 SSE 没有持续心跳，但服务端配置了 `idleTimeout`，长静默阶段存在被动断流风险

- 证据：
  - `apps/electron/src/main/http-server.ts:25-33`
  - `apps/electron/src/main/sse-manager.ts:18-31`
  - `apps/electron/src/main/sse-manager.ts:74-89`
- 问题说明：
  - SSE 建连后当前只发送一次 `: connected` 注释。
  - 后续完全依赖业务事件驱动，没有定时心跳。
  - 服务端同时设置了 `idleTimeout: 255`。
- 可能导致的问题：
  - Agent 在等待权限、等待 AskUser、长时间无 token 输出时，连接可能被 Bun 或中间链路静默回收。
  - 在当前关闭语义下，这种被动断流还会进一步放大为“session 被中止”。
- 修复建议：
  - 为 SSE 增加周期性心跳注释或 `ping` 事件。
  - 心跳定时器需跟随连接清理。
  - 视情况对 SSE 路由放宽或关闭 `idleTimeout`。

### P2-1 手动停止时前端先断本地流、后发 stop 请求，容易遗留过期的权限/AskUser UI 状态

- 证据：
  - `apps/electron/src/renderer/hooks/useAgentSSE.ts:240-250`
  - `apps/electron/src/main/lib/agent-orchestrator.ts:1348-1351`
  - `apps/electron/src/main/lib/agent-permission-service.ts:227-245`
  - `apps/electron/src/main/lib/agent-ask-user-service.ts:105-120`
- 问题说明：
  - `stopSession()` 先 `abort()` 当前 reader，再调用 `api.stopSession()`。
  - 后端在 finally 里会清理 pending permission / AskUser，并通过 resolved 事件通知前端。
  - 但前端 reader 已先断掉，这些清理事件可能根本收不到。
- 可能导致的问题：
  - 权限横幅或 AskUser 横幅停留在 UI 上，状态已经过期却没被移除。
  - stop 接口如果失败，前端仍会 `finalizeStream()`，把 UI 标成停止，但后端可能还在执行。
- 修复建议：
  - 停止流程应该优先向后端发送 stop，并等待确认，再结束本地 reader。
  - 或者在本地 stop 时显式清理当前 session 的 `allPendingPermissionRequestsAtom`、`allPendingAskUserRequestsAtom`、`agentStreamingStatesAtom`。
  - 给 stop 流程补一条端到端集成测试。

### P2-2 `file-search` 端点会同步递归扫描目录，而且信任客户端传入的任意 `dir` 参数

- 证据：
  - `apps/electron/src/main/http-router.ts:240-245`
  - `apps/electron/src/main/lib/workspace-service.ts:414-502`
- 问题说明：
  - `searchWorkspaceFiles()` 在请求线程里用 `readdirSync()` 递归扫描工作区和 `extraDirectories`。
  - `limit` 只作用在最终结果裁剪，不会提前停止扫描。
  - `extraDirectories` 直接来自 query string，没有限制在工作区已附加目录内。
- 可能导致的问题：
  - 大仓库、深目录或多个附加目录下，请求会长时间阻塞 Bun 事件循环。
  - 任何能调用该 API 的客户端，都可以要求后端枚举任意存在的本地目录，边界不再是“当前工作区”。
- 修复建议：
  - 改成异步、可中断的搜索实现，优先使用 `rg --files` 或缓存索引。
  - 给搜索过程增加硬性上限，例如最大目录数、最大文件数、最大耗时。
  - `extraDirectories` 必须校验为工作区附加目录或显式允许列表，而不是直接信任客户端输入。

### P2-3 前后端都声明并透传了 `permissionModeOverride`，但编排层完全没有使用

- 证据：
  - `packages/shared/src/types/agent.ts:457-477`
  - `apps/electron/src/main/http-router.ts:337-346`
  - `apps/electron/src/main/lib/agent-orchestrator.ts:590-598`
  - `apps/electron/src/main/lib/agent-orchestrator.ts:812-849`
- 问题说明：
  - `AgentSendInput` 已声明 `permissionModeOverride?: PromaPermissionMode`。
  - 路由层也会把 `body.permissionModeOverride` 放进 `input`。
  - 但 `AgentOrchestrator.sendMessage()` 解构时根本没有取这个字段，后续仍只使用 `getSettings().agentPermissionMode`。
- 可能导致的问题：
  - API 合同和运行时行为不一致。
  - 调用方会误以为可以“按请求覆盖权限模式”，但实际上无效。
  - 这类 silent failure 最危险，因为不会报错，只会在权限边界上产生错误预期。
- 修复建议：
  - 如果功能需要保留，就在 orchestrator 中优先应用 `permissionModeOverride`。
  - 如果不打算支持，就应从 shared type 和路由透传逻辑中删除该字段，避免制造假能力。

### P2-4 创建会话时不校验 `workspaceId` 是否存在，会生成逻辑上悬空的 session 元数据

- 证据：
  - `apps/electron/src/main/http-router.ts:183-186`
  - `apps/electron/src/main/lib/agent-session-manager.ts:111-140`
  - `apps/electron/src/main/lib/agent-orchestrator.ts:125-154`
- 问题说明：
  - `POST /api/sessions` 直接把 `workspaceId` 传给 `createAgentSession()`。
  - `createAgentSession()` 会把这个 id 原样写进元数据，但并不验证工作区是否存在。
  - 真正执行消息时，`resolveWorkspaceRuntimeContext()` 又会回退到默认工作区。
- 可能导致的问题：
  - 元数据层显示该 session 属于不存在的工作区，运行时却又在默认工作区执行。
  - UI 侧根据 `session.workspaceId` 做过滤和上下文展示时，会出现 session 消失、上下文为空、工作区归属错误等异常。
- 修复建议：
  - 创建会话时必须校验 `workspaceId`，不存在就返回 404/400。
  - 不要让元数据层和运行时层分别自行 fallback，这会制造双重语义。

### P2-5 Jotai 以整张 `Map` 作为订阅粒度，单 session 的 token 更新会拖着侧栏和其他视图一起重渲染

- 证据：
  - `apps/electron/src/renderer/atoms/agent-atoms.ts:212-219`
  - `apps/electron/src/renderer/components/agent/AgentView.tsx:75-90`
  - `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx:363-380`
- 问题说明：
  - 多个关键状态都存成 `Map<sessionId, ...>`。
  - 组件通过 `useAtomValue(mapAtom).get(sessionId)` 读取，会订阅整张 `Map`。
  - 任意 session 的 `text_delta`、`tool_progress`、`error` 更新都会触发引用变化。
- 可能导致的问题：
  - 当前消息流式输出时，不相关 session 的 UI 也参与重渲染。
  - 长对话下侧栏分组、排序、统计等计算会被频繁重复执行。
- 修复建议：
  - 用 `atomFamily` 或 `selectAtom` 把订阅粒度降到单 session / 单 workspace。
  - 对 session row 等纯展示组件做 `memo`。
  - 避免在 selector 中每次新建 `Set`/`Map` 对象。

### P2-6 发送失败时乐观更新没有完整回滚，用户输入和标题可能永久偏离服务端真实状态

- 证据：
  - `apps/electron/src/renderer/components/agent/AgentView.tsx:183-230`
- 问题说明：
  - 发送前会先：
    - 本地追加一条 optimistic user message
    - 清空输入框
    - 对默认标题会话直接把标题改成首句
  - 失败后只重新拉取消息，没有恢复 draft，也没有恢复标题。
- 可能导致的问题：
  - 如果请求在建连前失败，用户输入会直接丢失。
  - 会话标题可能停留在一个服务端从未确认过的假标题上。
- 修复建议：
  - 给发送动作建立快照：draft、messages、title。
  - 失败时显式回滚。
  - 或者把标题更新完全延后到服务端 `title_updated`/持久化完成之后。

### P2-7 流结束后的同步依赖“全量重拉历史消息”，再叠加本地无限缓存，长会话成本会线性放大

- 证据：
  - `apps/electron/src/renderer/hooks/useAgentSSE.ts:199-223`
  - `apps/electron/src/renderer/components/agent/AgentView.tsx:72-90`
  - `apps/electron/src/renderer/components/agent/AgentView.tsx:143-159`
  - `apps/electron/src/renderer/components/agent/message-catchup.ts:17-37`
- 问题说明：
  - `finalizeStream()` 每次都会递增 `agentMessageRefreshAtom`。
  - `AgentView` 监听这个值并重新调用 `getSessionMessages(sessionId)` 拉完整历史。
  - `messagesBySession` 又会把不同 session 的完整消息数组一直存在本地 `Map` 中。
- 可能导致的问题：
  - 每次完成、断线、报错都要重新读取整段会话历史。
  - 长会话越多，内存占用和解析成本越高。
  - `message-catchup` 的轮询也没有 `AbortSignal`，切换视图时仍可能在后台继续跑。
- 修复建议：
  - 改成增量同步，而不是完成后全量覆盖。
  - 为 catch-up 轮询加取消信号。
  - `messagesBySession` 采用 LRU 或“仅保留打开 tab”策略。

### P2-8 长会话 UI 没有窗口化，滚动缩略图还在每次滚动时扫描全部消息节点

- 证据：
  - `apps/electron/src/renderer/components/agent/AgentMessages.tsx:596-649`
  - 前端 subagent 额外定位：
    - `apps/electron/src/renderer/components/ai-elements/scroll-minimap.tsx:40`
    - `apps/electron/src/renderer/components/ai-elements/scroll-minimap.tsx:49`
    - `apps/electron/src/renderer/components/ai-elements/scroll-minimap.tsx:105`
- 问题说明：
  - 消息区按 `messages.map(...)` 全量渲染。
  - minimap 的可见性统计依赖滚动时对 DOM 做 O(n) 扫描。
- 可能导致的问题：
  - 对话越长，滚动和流式更新越卡。
  - 富文本、代码块、工具活动越多，问题越明显。
- 修复建议：
  - 对消息列表和 minimap 都做虚拟化或分段渲染。
  - 使用 `IntersectionObserver` 替代滚动时全量扫描。

### P2-9 `POST /send` 在返回 SSE 之前同步等待标题生成，首包和流启动被无谓阻塞

- 证据：
  - `apps/electron/src/main/http-router.ts:134-149`
  - `apps/electron/src/main/http-router.ts:320-365`
- 问题说明：
  - 发送接口在创建 SSE 响应前，会先 `await persistGeneratedSessionTitle(sessionId, body.userMessage)`。
  - 而标题生成内部会触发一次额外的 Agent 标题生成流程。
- 可能导致的问题：
  - 用户点击发送后，首个 SSE 字节和真正的流式执行都会被标题生成拖慢。
  - 如果标题生成慢或挂起，主请求会表现为“卡住很久才开始流式响应”。
- 修复建议：
  - 把标题生成移出主链路，改为后台异步执行。
  - 或至少给标题生成加超时和降级策略，保证主流尽快建立。

### P2-10 SSE 广播没有背压控制，慢客户端会造成队列积压和额外内存压力

- 证据：
  - `apps/electron/src/main/sse-manager.ts:74-89`
- 问题说明：
  - `emit()` 对每个连接都直接 `controller.enqueue(frame)`。
  - 当前没有检查 `desiredSize`，也没有对持续落后的消费者做摘除或降级。
- 可能导致的问题：
  - 在 token 高频输出、网络慢、前端卡顿时，单连接内部队列会不断堆积。
  - 慢消费者会放大内存占用，并拖累整体推送路径。
- 修复建议：
  - 在 enqueue 前检查可写余量。
  - 对持续落后的连接主动断开或降级。
  - 如果需要严格背压语义，改为显式 queue/writer 模式。

### P2-11 后端可用状态被 `App` 与 `AgentView` 各自一次性拉取，UI 可能长期自相矛盾

- 证据：
  - `apps/electron/src/renderer/App.tsx:16-42`
  - `apps/electron/src/renderer/components/agent/AgentView.tsx:74-141`
- 问题说明：
  - 顶部 banner 和消息页输入禁用态不是同一个状态源。
  - 两者都只在挂载时请求一次 `/api/status`。
- 可能导致的问题：
  - 顶部显示“服务未就绪”，输入框却能发消息。
  - 或顶部已恢复正常，输入区仍维持禁用态。
  - 状态恢复后不会自动自愈，只能刷新页面。
- 修复建议：
  - 把 status 提升为共享 atom/query。
  - 统一驱动 banner、禁用态和重试提示。
  - 增加轻量轮询或发送前 revalidate。

### P2-12 侧栏当前工作区与主面板当前 session/tab 没有同步，跨工作区切换会长期指向不同上下文

- 证据：
  - `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx:300-318`
  - `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx:363-380`
  - `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx:545-563`
  - `apps/electron/src/renderer/components/app-shell/MainContentPanel.tsx:150-162`
- 问题说明：
  - `currentWorkspaceId` 决定侧栏显示哪一组 session。
  - 但切 tab、关闭 tab、恢复活动 tab 时，只同步了 `currentSessionId`，没有同步当前工作区。
  - `activateSession()` 打开 session 也没有把它所属工作区同步到过滤状态。
- 可能导致的问题：
  - 主面板显示 A 工作区的会话，侧栏却还过滤在 B 工作区。
  - 用户看到“当前会话不在侧栏里”，交互语义混乱。
- 修复建议：
  - 如果当前工作区代表主面板上下文，就在 tab/session 激活时同步到该 session 的 `workspaceId`。
  - 如果它只是侧栏过滤器，就要在命名和 UI 上明确表达这一点。

### P3-1 会话级“总是允许”白名单声明了清理接口，但在编排完成路径上从未调用

- 证据：
  - `apps/electron/src/main/lib/agent-permission-service.ts:241-245`
  - `apps/electron/src/main/lib/agent-orchestrator.ts:1348-1351`
- 问题说明：
  - `AgentPermissionService` 提供了 `clearSessionWhitelist(sessionId)`。
  - 但 orchestrator finally 里只清 pending，不清 whitelist。
- 可能导致的问题：
  - 已删除或不再使用的 session 仍占用内存中的白名单记录。
  - 长时间运行后，这部分状态会持续堆积。
- 修复建议：
  - 明确白名单的生命周期。
  - 如果设计上只应在单个 session 存活期内有效，就在会话结束或删除时清掉。

## 三、优先修复建议

建议按以下顺序处理，而不是平均铺开：

### 第一批：先处理会话正确性

1. 修复 `SSEManager` 的连接关闭语义，禁止单个连接取消影响整个 session。
2. 把前端 SSE 生命周期从 `AgentView` 中抽离。
3. 给“停止会话”和“删除会话”补完整的状态机，避免删除后重新写入。

### 第二批：收敛状态一致性

1. 统一前端 status 状态源。
2. 修复 `permissionModeOverride` 假能力。
3. 创建 session 时校验 `workspaceId`。
4. 手动 stop 时补本地 pending 状态清理和服务端确认流程。

### 第三批：解决性能热点

1. 降低 Jotai 状态订阅粒度。
2. 替换 `file-search` 的同步递归扫描。
3. 把消息列表和 minimap 做窗口化或分段渲染。
4. 把“全量重拉历史”改成增量同步。

## 四、测试与回归保护建议

当前测试能覆盖不少 helper 和局部行为，但对以下关键问题仍然缺少保护：

- `AgentView` 卸载时，进行中的 session 不应被误判为断线。
- 手动 stop 后，权限请求和 AskUser 横幅必须被正确清理。
- 删除活跃会话后，不应再生成新的 JSONL 或状态消息。
- `permissionModeOverride` 要么真正生效，要么彻底从接口移除。
- 工作区切换、session tab 切换、删除 fallback 后，侧栏与主面板必须保持一致。
- 超长消息历史下，消息区和 minimap 不应出现明显退化。

建议新增的测试类型：

- 后端集成测试：
  - 多连接 SSE 场景
  - stop/delete 与 agent abort 的竞态
  - file-search 的边界与性能保护
- 前端集成测试：
  - `AgentView` 卸载/重挂载生命周期
  - optimistic send 失败回滚
  - workspace filter 与 tab/session 联动
- 端到端测试：
  - 长会话、权限审批、手动 stop、切设置页再返回

## 五、结论

这个项目的总体架构是清晰的：

- 后端分层明确，Agent 编排与 SDK 适配隔离得比较干净。
- 前端也已经形成“状态层 -> SSE 消费层 -> 视图层”的基础骨架。
- `packages/shared` 作为协议层的方向是对的。

但当前最主要的问题不是“缺功能”，而是“生命周期边界还不够硬”：

- SSE 连接边界和 session 生命周期边界混在一起。
- 前端视图生命周期和后台任务生命周期没有彻底解耦。
- 文件持久化模型在 stop/delete 等竞态下缺少防护。
- 一些 shared contract 已经声明，但运行时没有落实。

如果先把这些边界收紧，再做性能优化和体验打磨，这个项目的稳定性会明显提升。
