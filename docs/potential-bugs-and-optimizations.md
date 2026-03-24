# Proma 潜在 Bug 与优化清单

更新时间：2026-03-17

## 文档目的

本文档记录基于当前仓库实现所做的静态审计结论，重点覆盖：

- 会话执行链路
- SSE 与前端流式状态
- session/workspace 持久化
- AskUser / 权限交互
- 性能与可维护性薄弱点

本清单面向后续修复和测试补强，不代表所有问题都已经在真实用户环境中触发，但文中高优先级问题均有明确代码依据，其中部分已做本地复现。

## 验证基线

- `bun run typecheck`：通过
- `bun test`：通过，当前为 98 个测试全部通过
- 已做局部本地复现：
  - 可以创建指向不存在工作区的 session
  - 删除后重建同名 workspace 会继承旧配置

## 高优先级问题

### 1. 切换视图或卸载 `AgentView` 会直接终止正在运行的 Agent

核心位置：

- `apps/app/src/renderer/hooks/useAgentSSE.ts`
- `apps/app/src/renderer/components/app-shell/MainContentPanel.tsx`

现象：

- `useAgentSSE()` 在 cleanup 中会对当前保存的所有 controller 执行 `abort()`
- `MainContentPanel` 在切换到设置页、没有可渲染会话、或活动页变化时会卸载当前 `AgentView`
- 结果是用户一旦切到设置页或切走当前会话，正在运行的流式任务会被中断

风险：

- 当前实现与“后台继续执行”的用户心智不一致
- 一旦未来支持多标签、多窗口或断线重连，这个问题会放大

建议：

- 将 SSE 生命周期从 `AgentView` 组件生命周期中解耦
- 把 session 级流控放到全局层，而不是跟随页面 mount/unmount
- 明确区分“页面不再展示”与“任务需要停止”

### 2. 任意一个 SSE 连接断开都会关闭整个 session 的所有连接，并进一步停止 Agent

核心位置：

- `apps/app/src/main/sse-manager.ts`
- `apps/app/src/main/http-router.ts`

现象：

- `SSEManager.createResponse()` 的 `cancel()` 直接调用 `closeSession(sessionId)`
- `closeSession()` 会关闭该 session 下所有连接
- `/api/sessions/:id/send` 在创建 SSE response 时，把连接关闭回调绑定成 `stopAgent(sessionId)`

结果：

- 单个连接取消、页面刷新、组件卸载，都可能把整个 session 的所有订阅一起关掉
- 如果当前 Agent 正在运行，还会被直接终止

风险：

- 无法安全支持多订阅者
- 页面刷新或视图切换会误伤任务

建议：

- 把“关闭当前连接”和“关闭整个 session”拆开
- 只有明确用户点击停止时才触发 `stopAgent`
- SSE manager 应按 connection 粒度清理，而不是按 session 粒度一刀切

### 3. Agent Teams / auto-resume 相关逻辑仍是 stub，但 watchdog 已按真实实现参与决策

核心位置：

- `apps/app/src/main/lib/agent-orchestrator.ts`

现象：

- `findTeamLeadInboxPath()` 固定返回 `null`
- `pollInboxWithRetry()` 固定返回空数组
- `areAllWorkersIdle()` 固定返回 `true`
- 但 watchdog 会每 5 秒根据这些结果判断是否中断事件循环并触发 auto-resume

风险：

- 只要触发 `Task` / teammate 流程，就可能被错误判定为“全部 idle”
- resume prompt 目前拿不到真实 inbox 内容，只能落到空路径或 summary fallback
- 这条链路目前不具备稳定性保证

建议：

- 在真实 mailbox / worker 状态检测完成前，暂时关闭这条 watchdog 逻辑
- 或至少在设置层显式标记为 disabled / experimental
- 为 Teams 链路补最小可运行端到端测试

### 4. 可以创建指向不存在 workspace 的 session，运行时却会悄悄回退到默认工作区

核心位置：

- `apps/app/src/main/http-router.ts`
- `apps/app/src/main/lib/agent-session-manager.ts`
- `apps/app/src/main/lib/agent-orchestrator.ts`

现象：

- `POST /api/sessions` 未校验 `workspaceId` 是否真实存在
- `createAgentSession()` 会直接把这个值写入索引
- 运行时 `resolveWorkspaceRuntimeContext()` 找不到工作区时，会 fallback 到默认工作区

结果：

- session 元数据上的 `workspaceId` 与真实运行时 `cwd`、skills、MCP 范围可能不一致
- 侧边栏归属、真实上下文、后续迁移行为可能出现偏差

本地复现：

- 用临时 `PROMA_CONFIG_DIR` 直接调用 `createAgentSession('Orphan', undefined, 'missing-workspace')`
- 会成功创建并持久化 `workspaceId: "missing-workspace"`

建议：

- 在 HTTP 层拒绝无效 `workspaceId`
- 在 session manager 再做一次守底校验
- 对历史脏数据加迁移或修复脚本

### 5. 同一 session 的重复发送保护不是原子操作，理论上可出现双发并行

核心位置：

- `apps/app/src/main/http-router.ts`
- `apps/app/src/main/lib/agent-orchestrator.ts`
- `apps/app/src/renderer/hooks/useAgentSSE.ts`

现象：

- 路由层先检查 `isAgentSessionActive(sessionId)`
- 真正把 session 标记为 active 是在 `sendMessage()` 内部稍后执行
- 前端 `sendMessage()` 也没有对同一 `sessionId` 做本地并发保护

风险：

- 两个非常接近的请求理论上都可能通过检查并启动执行
- 导致同一 session 出现重复 user message、重复流式结果或 controller 被覆盖

建议：

- 在后端引入更早的原子锁定
- 前端在发起请求前也应对同一 `sessionId` 做幂等保护
- 补充并发发送测试

## 中优先级问题

### 6. 删除 workspace 只删索引，不删目录；同名重建会继承旧配置

核心位置：

- `apps/app/src/main/lib/workspace-service.ts`

现象：

- `deleteAgentWorkspace()` 只删除索引项
- workspace 目录、`config.json`、`mcp.json`、skills、workspace-files 都保留
- 由于 slug 仍可被同名 workspace 复用，重建后会继续使用旧目录

本地复现：

- 创建名为 `Demo` 的 workspace
- 附加目录后删除该 workspace
- 重新创建同名 `Demo`
- 新 workspace 仍能读到旧的 `attachedDirectories`

风险：

- 用户以为创建了“新工作区”，实际却在复用旧运行环境
- 容易造成权限面、技能集、MCP 集合污染

建议：

- 删除 workspace 时至少提供两种语义：
  - 仅移除索引
  - 连同目录一起彻底删除
- 若保留目录，则应禁止 slug 直接复用或显式提示用户

### 7. 删除正在运行的 session 存在竞态，可能留下“僵尸写入”

核心位置：

- `apps/app/src/main/http-router.ts`
- `apps/app/src/main/lib/agent-orchestrator.ts`
- `apps/app/src/main/lib/agent-session-manager.ts`

现象：

- 删除 session 时先 `stopAgent()`，再 `deleteAgentSession()`
- orchestrator 在 catch / abort 分支里仍可能继续调用 `persistAssistantMessage()`
- `appendAgentMessage()` 不校验 session 是否仍存在

风险：

- 已删除 session 的 JSONL 可能被重新创建并写回部分内容
- 形成索引已无、消息文件却残留的脏状态

建议：

- 为 session 增加“已删除”状态或 tombstone
- `appendAgentMessage()` 和 `persistAssistantMessage()` 在写前校验 session 元数据是否仍存在
- 为“删除运行中 session”补回归测试

### 8. `AskUser` 默认选中第一个选项，并允许多题未答完时直接提交

核心位置：

- `apps/app/src/renderer/components/agent/AskUserBanner.tsx`

现象：

- 新请求进入时，会默认把第一题的第一个选项设为已选中
- `hasValidAnswers` 只要求“至少有一题有值”
- 多题场景下即使还有题没答，也能提交 payload

风险：

- “推荐项”被隐式变成“默认答案”
- AskUser 的收集结果可能不完整，和工具原始意图不一致

建议：

- 默认不预选任何选项
- 对单选、多选、自定义回答统一做显式提交校验
- 如 SDK 语义要求所有题都答，则 UI 必须强制完整填写

### 9. 重新打开一个仍在等待权限或 AskUser 的会话时，消息区可能长时间空白

核心位置：

- `apps/app/src/renderer/components/agent/message-catchup.ts`
- `apps/app/src/renderer/components/agent/AgentView.tsx`

现象：

- `loadSessionMessagesWithCatchup()` 如果看到最后一条消息是 `user`，会继续轮询
- `AgentView` 在拿到最终结果前不会先展示已存在历史

风险：

- 等待权限审批、AskUser、长任务中断恢复时，重新进入页面会像“历史丢失”
- 体验上很像白屏或加载失败

建议：

- 先立即渲染已有历史，再在后台做 catchup
- 把“最后一条是 user”与“系统仍在等待交互”区分开

### 10. `permissionModeOverride` 已贯穿 API 入参，但在 orchestrator 内未生效

核心位置：

- `apps/app/src/main/http-router.ts`
- `apps/app/src/main/lib/agent-orchestrator.ts`

现象：

- send API 会接收并透传 `permissionModeOverride`
- orchestrator 读取权限模式时仍只看全局 settings

风险：

- 调用方以为自己指定了 `auto` / `smart` / `supervised`
- 实际执行仍按全局配置走，造成行为偏差

建议：

- 明确优先级：
  - request override
  - session setting
  - global setting
- 补充该字段的单测

### 11. 前端 `stopSession()` 即使 stop 请求失败，也会先把 UI 标成已停止

核心位置：

- `apps/app/src/renderer/hooks/useAgentSSE.ts`

现象：

- `stopSession()` 在 `finally` 中无条件调用 `finalizeStream()`
- 如果 `api.stopSession()` 失败，前端仍会解除输入锁定并刷新消息

风险：

- UI 显示“已停止”，但后端可能还在继续跑
- 用户可能再次发送消息，造成状态错乱

建议：

- 只有在 stop 接口成功返回后才 finalize
- 失败时保留 running 状态，并给出更明确的错误提示

### 12. 侧边栏当前工作区与主面板实际展示的 session 可能不一致

核心位置：

- `apps/app/src/renderer/components/app-shell/LeftSidebar.tsx`
- `apps/app/src/renderer/components/app-shell/MainContentPanel.tsx`

现象：

- 左侧切换 workspace 只影响 sidebar 中可见 session 列表
- 主内容区继续渲染当前活动 tab

风险：

- 用户看到左侧是 workspace B，主对话实际仍属于 workspace A
- 对工作区心智模型有破坏性

建议：

- 明确产品语义：
  - 切 workspace 时是否应自动切到该 workspace 的某个 tab
  - 或者在主面板明显展示当前 session 所属 workspace
- 若允许跨 workspace tab 共存，UI 需要更强提示

### 13. JSONL 只要有一行损坏，整个会话历史就会返回空数组

核心位置：

- `apps/app/src/main/lib/agent-session-manager.ts`

现象：

- `getAgentSessionMessages()` 当前是整文件读取、逐行 `JSON.parse`
- 任意一行解析失败就直接进入 catch，并返回 `[]`

风险：

- 一次中断写入或手工编辑错误会让整段历史“看起来消失”
- 同时影响上下文回填和前端展示

建议：

- 改成逐行容错解析
- 至少跳过坏行并保留其前后的有效消息
- 对损坏文件增加告警或自动修复机制

## 可优化项

### 14. `searchWorkspaceFiles()` 每次都同步全量递归扫描目录树

核心位置：

- `apps/app/src/main/lib/workspace-service.ts`

问题：

- 递归是同步 IO
- `limit` 在全量收集后才应用
- attached directories 一大就会阻塞主线程

建议：

- 尽早截断
- 建立搜索缓存或索引
- 将扫描放到后台线程 / 独立进程

### 15. session / workspace manager 大量使用同步文件 IO，主线程阻塞风险持续存在

核心位置：

- `apps/app/src/main/lib/agent-session-manager.ts`
- `apps/app/src/main/lib/workspace-service.ts`

问题：

- 读索引、写索引、追加消息、枚举目录都是同步操作
- 当前量小时还可接受，但增长后会影响 API 响应和流式体验

建议：

- 将热点路径改为异步
- 引入最小串行写队列，避免并发写覆盖

### 16. 前端对单个流式事件会触发多次 atom 更新，更新粒度偏细

核心位置：

- `apps/app/src/renderer/hooks/useAgentSSE.ts`
- `apps/app/src/renderer/atoms/agent-atoms.ts`

问题：

- 一个 frame 可能分别更新 streaming state、permission map、ask-user map、error map
- 高频 `text_delta` 下会放大渲染次数和状态拷贝成本

建议：

- 合并为一次 batched 更新
- 或集中 reducer 化，减少 Map 拷贝次数

### 17. `AgentView` 的本地消息缓存和状态获取策略仍有重复开销

核心位置：

- `apps/app/src/renderer/components/agent/AgentView.tsx`

问题：

- `messagesBySession` 为本地 state，无淘汰策略
- 每次 mount 都会重新拉 `/api/status`
- workspace context 和消息列表也存在重复获取

建议：

- 将稳定数据上移到全局缓存层
- 对 status / workspace context 做缓存和失效管理
- 为消息缓存增加回收策略

## 当前测试缺口

当前测试主路径覆盖尚可，但以下边界仍明显缺失：

- 多 SSE 订阅者场景
- 单个 SSE 取消不应杀死整个 session 的行为
- 非法 `workspaceId` 的创建 / 运行时校验
- workspace 删除后重建同名 slug 的行为
- 删除运行中 session 的竞态
- AskUser 多题场景的完整提交约束
- stop 失败后的前端状态保持
- JSONL 损坏后的容错读取
- 重复发送的并发保护

## 建议修复顺序

建议按以下顺序推进：

1. 修复流式生命周期 ownership
   - `AgentView` unmount 不应直接中断任务
   - SSE 按 connection 粒度清理
2. 修复 workspace 数据一致性
   - 校验 `workspaceId`
   - 明确 workspace 删除语义
   - 阻止同名重建继承旧配置
3. 修复交互类一致性问题
   - AskUser 提交约束
   - catchup 先渲染后追平
   - stop 失败不应伪装成已停止
4. 补测试
   - 先补高优先级边界回归
5. 再处理性能优化
   - 文件搜索
   - 同步 IO
   - 前端 state batching
