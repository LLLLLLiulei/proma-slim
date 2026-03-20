# Proma Current Code Logic Overview

更新时间：2026-03-17

## 文档范围

本文档基于当前仓库实现，对 Proma 的架构设计、核心实现原理和端到端工作流程做系统梳理。

这里描述的是当前代码实际运行形态，不是历史版本，也不是旧的 Electron IPC 桌面架构。当前项目的真实主干是：

- 浏览器前端：React + Vite + Jotai
- 本地后端：Bun HTTP Server
- 实时通信：REST + SSE
- Agent 运行时：`@anthropic-ai/claude-agent-sdk`
- 本地持久化：`~/.proma/` 文件系统

## 1. 核心结论

当前 Proma 本质上是一个本地优先的 Claude Code Web 客户端。

它的几个最重要的架构判断如下：

- 仓库是 Bun workspace 单仓，但真正可运行应用集中在 `apps/electron`
- `apps/electron` 这个名字是历史遗留；当前实现并不是典型 Electron IPC 应用，而是一个浏览器访问的本地 Web 应用
- 后端通过 Bun 提供 REST 和 SSE，前端不直接碰主进程内部逻辑
- Agent 主链路采用 `HTTP Router -> Agent Service -> Agent Orchestrator -> Claude Agent Adapter -> Claude Agent SDK` 分层
- 会话、工作区、设置、技能目录、MCP 配置和会话工作目录都直接落在 `~/.proma/`
- 工作区不只是 UI 分组，而是实际影响 Agent `cwd`、附加目录和 MCP/Skill 可见范围的运行时实体
- 前端采用“持久化消息 + 流式瞬时态”双通道渲染，避免流式竞态导致的消息混乱

## 2. 仓库结构

项目顶层工作区定义在 `package.json`，核心目录如下：

- `apps/electron`
  - 当前唯一的可运行应用
  - `src/main` 是 Bun HTTP 服务和 Agent 运行链路
  - `src/renderer` 是 React 前端
  - `default-skills/` 是内置默认 skills 模板来源
- `packages/shared`
  - 共享类型、事件协议、运行时类型、权限规则、能力差异比较工具
- `packages/ui`
  - 共享 UI 能力，当前主要包括代码块、Mermaid 和平滑流式渲染 hook
- `openspec/specs`
  - 当前产品规格文档
- `docs`
  - 说明性文档

当前顶层脚本见根目录 `package.json`：

- `bun run dev`
- `bun run build`
- `bun run start`
- `bun run typecheck`
- `bun test`

这些顶层脚本最终都转发到 `@proma/electron` 这个 workspace。

## 3. 总体架构图

```text
Browser UI
React + Jotai + Vite
    |
    | REST / SSE
    v
Bun HTTP Server
http-server.ts + http-router.ts
    |
    +--> settings / user-profile / sessions / workspaces API
    |
    +--> Agent Service Facade
            |
            v
      Agent Orchestrator
            |
            +--> Session persistence
            +--> Workspace runtime resolution
            +--> Prompt assembly
            +--> Permission / AskUser interaction
            +--> Retry / Stop / Resume / Friendly error mapping
            |
            v
      Claude Agent Adapter
            |
            v
   @anthropic-ai/claude-agent-sdk
            |
            v
      Claude Code runtime

Local persistence
~/.proma/
  agent-sessions.json
  agent-sessions/*.jsonl
  agent-workspaces.json
  agent-workspaces/<slug>/
  settings.json
  user-profile.json
  sdk-config/
```

## 4. 启动与运行流程

### 4.1 顶层运行模式

开发模式：

1. 从仓库根目录执行 `bun run dev`
2. 顶层脚本转发到 `apps/electron/package.json`
3. `concurrently` 同时启动：
4. `vite dev`
5. `bun --watch src/main/index.ts`
6. 开发态下 Vite 默认跑在 `5173`
7. `/api` 由 Vite 代理到 Bun 后端

生产模式：

1. 执行 `bun run build`
2. 只构建 renderer，输出到 `apps/electron/dist`
3. 执行 `bun run start`
4. Bun 服务同时提供：
5. `/api/*` REST 和 SSE
6. `dist` 静态资源

这意味着当前生产形态不是前后端分离部署，而是 Bun 单进程同时托管 API 和前端静态包。

### 4.2 后端启动流程

主入口在 `apps/electron/src/main/index.ts`。

启动时按如下顺序执行：

1. 调用 `initializeRuntime()`
2. 同步内置 `default-skills` 到用户目录
3. 创建 HTTP server
4. 注册 `SIGINT` / `SIGTERM` 清理逻辑
5. 退出时中止全部活跃 Agent 会话

运行时初始化在 `apps/electron/src/main/lib/runtime-init.ts`，其职责是：

- 加载 shell 环境
- 检测 Node
- 检测 Bun
- 检测 Git
- Windows 下检测 Git Bash / WSL

这层是运行前置条件探测，不负责业务。

## 5. 后端架构设计

### 5.1 HTTP 层

核心文件：

- `apps/electron/src/main/http-server.ts`
- `apps/electron/src/main/http-router.ts`
- `apps/electron/src/main/sse-manager.ts`

设计特点：

- 不依赖 Express/Hono 一类框架，直接使用 Bun 的 `serve`
- `http-router.ts` 手写路由分发、请求体解析和错误返回
- SSE 由单独的 `SSEManager` 管理，每个 session 维护自己的连接集合

HTTP 层主要承担：

- `/api/status`
- `/api/settings`
- `/api/user-profile`
- `/api/sessions`
- `/api/workspaces`
- `/api/sessions/:id/send`
- `/api/sessions/:id/stop`
- `/api/sessions/:id/messages`
- `/api/sessions/:id/move-workspace`
- `/api/sessions/:id/permission-respond`
- `/api/sessions/:id/ask-user-respond`
- `/api/workspaces/:id/capabilities`
- `/api/workspaces/:id/directory-context`
- `/api/workspaces/:id/file-search`

### 5.2 Agent 服务分层

Agent 主链路相关文件：

- `apps/electron/src/main/lib/agent-service.ts`
- `apps/electron/src/main/lib/agent-orchestrator.ts`
- `apps/electron/src/main/lib/agent-event-bus.ts`
- `apps/electron/src/main/lib/adapters/claude-agent-adapter.ts`

分层职责如下：

- `http-router`
  - 负责协议边界、输入校验、创建 SSE 响应
- `agent-service`
  - 负责实例化 orchestrator、adapter、event bus，并将 event bus 事件桥接到 SSE
- `AgentOrchestrator`
  - 负责核心业务状态机
- `ClaudeAgentAdapter`
  - 负责把 Claude SDK 的原始消息翻译成 Proma 的统一 `AgentEvent`

这种分层的价值在于：

- HTTP 层不需要理解 SDK 细节
- SDK 升级时主要影响 adapter
- 产品规则变更主要影响 orchestrator

## 6. Agent 执行主链路

### 6.1 发送消息的端到端链路

用户发送一条消息时，完整链路如下：

```text
AgentView.handleSend
  -> api.sendMessage(sessionId, payload)
  -> POST /api/sessions/:id/send
  -> http-router 创建 SSE Response
  -> runAgent(...)
  -> AgentOrchestrator.sendMessage(...)
  -> ClaudeAgentAdapter.query(...)
  -> claude-agent-sdk.query(...)
  -> SDK 原始消息流
  -> adapter 翻译为 AgentEvent
  -> orchestrator 消费并补充业务语义
  -> eventBus.emit
  -> sseManager.emitAgentEvent
  -> 浏览器 SSE reader
  -> Jotai store 更新流式状态
  -> AgentMessages 增量渲染
```

### 6.2 Orchestrator 的核心职责

`apps/electron/src/main/lib/agent-orchestrator.ts` 是当前最核心的业务编排器。

它负责：

- 同一 session 的并发发送保护
- 从环境变量读取 `ANTHROPIC_API_KEY` 和可选 `ANTHROPIC_BASE_URL`
- 清理并重建 SDK 所需环境变量
- 注入代理配置
- 基于 session 和 workspace 解析 Agent 运行目录
- 构建 prompt 和动态上下文
- 写入用户消息和助手消息
- 管理 `sdkSessionId` 并决定是否 resume
- 处理自动重试
- 处理中止
- 处理 Agent Teams 相关等待和 auto-resume
- 统一处理友好错误映射
- 生成会话标题

当前它既是系统最强的主干，也是最重的模块。

### 6.3 SDK 适配层

`apps/electron/src/main/lib/adapters/claude-agent-adapter.ts` 的职责是：

- 动态导入 `@anthropic-ai/claude-agent-sdk`
- 构造 SDK options
- 管理 `AbortController`
- 维护 session 对应的中止控制器
- 将 SDK 的原始消息翻译为统一 `AgentEvent`

Proma 自己的事件协议定义在 `packages/shared/src/types/agent.ts`。

当前主要事件包括：

- `text_delta`
- `text_complete`
- `tool_start`
- `tool_result`
- `task_started`
- `task_progress`
- `task_notification`
- `complete`
- `error`
- `typed_error`
- `permission_request`
- `ask_user_request`
- `retrying`
- `retry_attempt`
- `retry_cleared`
- `retry_failed`
- `model_resolved`
- `waiting_resume`
- `resume_start`

这使前端只面向 Proma 的稳定事件模型，而不直接依赖 Claude SDK 原始消息格式。

## 7. 本地优先持久化模型

### 7.1 总体原则

当前项目不依赖数据库，所有配置和业务数据都落在 `~/.proma/` 下。

路径定义集中在 `apps/electron/src/main/lib/config-paths.ts`。

### 7.2 关键目录结构

```text
~/.proma/
  settings.json
  user-profile.json
  proxy-settings.json
  sdk-config/
  default-skills/
  agent-sessions.json
  agent-sessions/
    <sessionId>.jsonl
  agent-workspaces.json
  agent-workspaces/
    default/
      config.json
      mcp.json
      skills/
      skills-inactive/
      workspace-files/
      <sessionId>/
    <workspace-slug>/
      ...
```

### 7.3 会话存储模型

会话相关逻辑集中在 `apps/electron/src/main/lib/agent-session-manager.ts`。

设计是“两层结构”：

- `agent-sessions.json`
  - 保存轻量 session 元信息
- `agent-sessions/<id>.jsonl`
  - 逐行追加消息历史

这样做的原因：

- 会话列表加载快
- 新消息写入成本低
- 出问题时可直接查看 JSONL
- 不需要数据库和 migration

### 7.4 工作区模型

工作区逻辑集中在 `apps/electron/src/main/lib/workspace-service.ts`。

工作区不只是 UI 组织单元，而是运行时实体。它实际决定：

- session 归属
- session 的工作目录
- workspace files 目录
- attached directories
- skills 目录
- MCP 配置
- Agent 插件目录

关键规则：

- 默认工作区始终存在
- 每个工作区有稳定 slug
- 新工作区会自动拷贝默认 skills
- 会话迁移工作区时，会迁移对应目录并清空 `sdkSessionId`
- 迁移后后续调用会按新工作区重新解析上下文

## 8. 工作区与 Agent 运行时绑定

这是当前项目区别于“纯聊天页面”的关键设计。

在 `AgentOrchestrator.sendMessage()` 中，会通过 `resolveWorkspaceRuntimeContext()` 解析：

- 当前 workspace
- agent `cwd`
- plugin path
- `additionalDirectories`
- `mcpServers`

实际运行逻辑是：

1. 先根据 session 找到所属 workspace
2. 生成该 session 在该 workspace 下的工作目录
3. 把 workspace attached directories 合并进 `additionalDirectories`
4. 把 `workspace-files/` 自动加入可访问目录
5. 从该 workspace 的 `mcp.json` 构造启用中的 MCP server 集合
6. 如果本次发送有额外 `customMcpServers`，再按请求级覆盖

因此，工作区切换并不是表面展示，而是会影响 Agent 实际可访问的文件系统和工具配置。

这套设计与 `openspec/specs/workspace-scoped-agent-runtime/spec.md` 对应。

## 9. 前端架构设计

### 9.1 入口与外层结构

前端入口：

- `apps/electron/src/renderer/main.tsx`
- `apps/electron/src/renderer/App.tsx`

最外层布局：

- `apps/electron/src/renderer/components/app-shell/AppShell.tsx`

结构是典型双栏：

```text
App
  -> AppShell
      -> LeftSidebar
      -> MainContentPanel
```

### 9.2 主内容区结构

主内容区在 `apps/electron/src/renderer/components/app-shell/MainContentPanel.tsx`。

其职责是：

- 渲染顶部会话 tab strip
- 在 settings 和 conversations 视图间切换
- 根据当前 active tab 决定渲染哪个 session
- 处理 tab reconciliation，避免已删除 session 的脏 tab 残留

### 9.3 侧边栏结构

左侧栏在 `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`。

其职责是：

- 初始化加载 sessions 和 workspaces
- 维护当前 workspace 选择
- 只展示当前 workspace 下的 session 列表
- 创建、重命名、删除 session
- 创建、重命名、删除 workspace
- 管理 pinned session 展示
- 打开和聚焦 tab
- 切换到 settings 视图

工作区列表的 UI 子块在 `WorkspaceSidebarSection.tsx`。

## 10. 前端状态模型

状态管理使用 Jotai。

核心原子定义在：

- `apps/electron/src/renderer/atoms/agent-atoms.ts`
- `apps/electron/src/renderer/atoms/session-tabs.ts`
- `apps/electron/src/renderer/atoms/active-view.ts`
- `apps/electron/src/renderer/atoms/theme.ts`

### 10.1 持久对象态

代表后端权威数据：

- `agentSessionsAtom`
- `agentWorkspacesAtom`
- `currentAgentSessionIdAtom`
- `currentAgentWorkspaceIdAtom`

### 10.2 UI 扩展态

- `sessionTabsAtom`
- `activeSessionTabIdAtom`
- `activeViewAtom`
- `themeModeAtom`

### 10.3 流式瞬时态

代表会话执行中的实时状态：

- `agentStreamingStatesAtom`
- `agentStreamErrorsAtom`
- `allPendingPermissionRequestsAtom`
- `allPendingAskUserRequestsAtom`
- `workspaceDirectoryContextMapAtom`
- `agentMessageRefreshAtom`

这种拆分的好处是：

- 持久消息和流式消息不会混为一体
- 多个会话可同时保持各自流式状态
- 会话切换时不容易互相污染

## 11. 会话页签与工作区列表的交互逻辑

会话 tab 逻辑在 `apps/electron/src/renderer/atoms/session-tabs.ts`。

关键规则：

- 打开相同 session 不会重复建 tab
- 关闭 active tab 时自动聚焦相邻 tab
- 刷新后尝试恢复历史 tab 集合
- 如果 session 已删除，`reconcileSessionTabs()` 会自动清理脏 tab

当前产品的实际心智模型是：

- 工作区是一级上下文
- session 属于某个 workspace
- tab 是“已打开视图”，不是持久化实体

左侧列表只展示当前 workspace 下的 session，但顶部 tab 可以保留已打开 session 视图。

## 12. SSE 与流式渲染原理

### 12.1 SSE 消费

核心在 `apps/electron/src/renderer/hooks/useAgentSSE.ts`。

这层负责：

- 发起流式 `fetch`
- 读取 `ReadableStream`
- 解析 SSE frame
- 将事件应用到 Jotai store
- 处理中止和错误
- 在流结束后触发消息刷新

### 12.2 前端事件应用

`applyStreamFrame()` 会把后端事件按类型写入不同 atom：

- 流式文本和工具活动写入 `agentStreamingStatesAtom`
- 权限请求写入 `allPendingPermissionRequestsAtom`
- AskUser 请求写入 `allPendingAskUserRequestsAtom`
- 错误写入 `agentStreamErrorsAtom`

`applyAgentEvent()` 负责把单个 `AgentEvent` 作用到某个 session 的 `AgentStreamState`。

### 12.3 双通道渲染模型

前端不是只靠 SSE 直接渲染最终消息，而是同时维护两套来源：

- 持久化历史消息
- 流式瞬时态

工作方式是：

1. 用户发送消息时，本地先插入 optimistic user message
2. assistant 输出先显示为 transient streaming content
3. 流结束后触发重新请求持久化历史
4. 用已落盘的权威消息替换该 session 的历史数组

这套机制用于避免：

- 流中切会话导致状态串线
- 持久化与流结束之间的时间窗口出现重复或缺失
- transient 内容和最终消息双重回显

### 12.4 历史追平机制

`apps/electron/src/renderer/components/agent/message-catchup.ts` 提供 `loadSessionMessagesWithCatchup()`。

它会在必要时对历史消息做短轮询：

- 如果最后一条仍是 user message
- 说明 assistant 可能还没完全落盘
- 会延迟后再拉一轮

这是一种针对后端“已结束但未完全写盘”窗口的兜底机制。

## 13. 消息渲染层

### 13.1 Agent 视图

主视图在 `apps/electron/src/renderer/components/agent/AgentView.tsx`。

它负责：

- 加载当前 session 历史消息
- 加载 workspace directory context
- 读取当前 streaming state
- 调用 `sendMessage()` / `stopSession()`
- 渲染 header、messages、permission banner、ask-user banner、输入框

### 13.2 消息列表

消息列表在 `apps/electron/src/renderer/components/agent/AgentMessages.tsx`。

它负责：

- 组合持久化消息和 transient assistant 状态
- 渲染 tool activities
- 显示 retrying 状态
- 使用 `useSmoothStream()` 平滑输出文本
- 通过 `Conversation` 容器控制滚动

### 13.3 Markdown 和内容渲染

消息原语在 `apps/electron/src/renderer/components/ai-elements/message.tsx`。

当前能力包括：

- `react-markdown`
- `remark-gfm`
- `remark-math`
- `rehype-katex`
- 代码块走 `CodeBlock`
- `language-mermaid` 走 `MermaidBlock`
- 用户消息长文本折叠
- mention 文本特殊样式
- 附件块解析

## 14. 平滑流式输出原理

`packages/ui/src/hooks/useSmoothStream.ts` 是当前阅读体验的重要组成部分。

它解决的问题是：

- 后端 chunk 到达节奏不均匀
- 直接渲染会造成大段跳字

实现方式：

1. 将新增文本与上次文本比较
2. 把 delta 切分为字符队列
3. 通过 `requestAnimationFrame` 渐进排空
4. 流结束后继续平滑排空剩余字符

设计细节：

- 使用 `Intl.Segmenter` 处理多语言字符切分
- 队列越长，每帧排出的字符越多
- 若新一轮流开始但内容重置，会立刻清空旧轮次的 transient 状态

这部分直接对应 `openspec/specs/agent-conversation/spec.md` 中关于平滑流式输出的要求。

## 15. 权限审批与 AskUser 交互

后端相关服务：

- `apps/electron/src/main/lib/agent-permission-service.ts`
- `apps/electron/src/main/lib/agent-ask-user-service.ts`

### 15.1 权限审批流程

1. SDK 尝试调用某个工具
2. orchestrator 提供 `canUseTool` 回调
3. 如果工具只读、安全或已白名单，则直接允许
4. 如果需要人工确认，后端发出 `permission_request`
5. 前端展示审批 UI
6. 用户提交 `/permission-respond`
7. 后端 resolve 对应 pending Promise

### 15.2 AskUser 流程

1. SDK 触发 `AskUserQuestion`
2. 后端把问题列表包装成 `ask_user_request`
3. 前端渲染交互式问题卡片
4. 用户回答后回传 `/ask-user-respond`
5. 后端把 `answers` 注回工具输入，再继续执行

这两套机制本质上都是“后端阻塞等待 -> 前端交互 -> HTTP 回调 -> Promise resolve”的模式。

## 16. 设置、主题与用户资料

相关文件：

- 前端 API 封装：`apps/electron/src/renderer/lib/api.ts`
- 主题状态：`apps/electron/src/renderer/atoms/theme.ts`
- 设置面板：`apps/electron/src/renderer/components/settings/SettingsPanel.tsx`
- 后端设置服务：`apps/electron/src/main/lib/settings-service.ts`
- 用户资料服务：`apps/electron/src/main/lib/user-profile-service.ts`

设计原则与主业务一致：

- 前端只通过 API 读写
- 后端直接读写本地 JSON
- 不引入数据库

## 17. 共享包职责

### 17.1 `packages/shared`

当前主要负责：

- Agent 类型和事件协议
- 工作区、会话、消息、运行时状态类型
- 权限规则常量
- `diffCapabilities()` 之类的共享工具

这个包是前后端共享契约层。

### 17.2 `packages/ui`

当前主要负责：

- 代码块渲染
- Mermaid 渲染
- 平滑流式文本 hook

这个包是共享 UI 能力层，不承载业务状态。

## 18. 测试体系

当前测试分布比较完整，覆盖了主链路里的关键状态点。

主要测试类型包括：

- HTTP router 测试
- orchestrator 错误和 workspace 迁移测试
- adapter SDK 透传与错误翻译测试
- session / workspace service 测试
- renderer tab 与 sidebar 行为测试
- `useAgentSSE` 测试
- `AgentView` / `AgentMessages` 测试
- `useSmoothStream` 测试
- shared 工具测试

这说明当前项目的质量策略不是单纯依赖人工回归，而是用单测守住竞态和状态一致性。

## 19. OpenSpec 与实现的关系

当前 `openspec list --json` 为空，说明没有进行中的变更。

当前主规格包括：

- `openspec/specs/agent-conversation/spec.md`
- `openspec/specs/session-management/spec.md`
- `openspec/specs/ui-layout/spec.md`
- `openspec/specs/web-server/spec.md`
- `openspec/specs/workspace-scoped-agent-runtime/spec.md`
- `openspec/specs/workspace-capability-surface/spec.md`
- `openspec/specs/permission-interaction/spec.md`
- `openspec/specs/tool-activity-display/spec.md`
- 以及若干代码清理与运行表面收口相关规格

规格与当前实现的对应关系：

- `agent-conversation`
  - 流式对话、Markdown、错误友好提示、环境变量 API Key 模式
- `session-management`
  - session CRUD、页签、标题、工作区迁移
- `ui-layout`
  - 双栏布局、工作区区块、顶部 tab strip、主题行为
- `web-server`
  - Bun HTTP 服务、REST API、SSE
- `workspace-scoped-agent-runtime`
  - workspace 作为运行时实体、session cwd 解析、迁移后重绑定
- `workspace-capability-surface`
  - skills、MCP、attached directories 对 Agent 可见性
- `permission-interaction`
  - 权限审批和 AskUser
- `tool-activity-display`
  - 工具调用和后台任务状态展示

## 20. 端到端工作流程

### 20.1 用户视角

1. 启动服务
2. 前端先请求 `/api/status`
3. 左侧栏并行加载 sessions 和 workspaces
4. 若无工作区，后端自动确保默认工作区存在
5. 用户在某个 workspace 下创建 session
6. session 被持久化，同时创建该 session 的工作目录
7. 用户打开 session，顶部 tab strip 聚焦该视图
8. `AgentView` 读取消息历史和 workspace context
9. 用户输入消息并提交
10. 前端先插入 optimistic user message
11. 后端调用 SDK，并通过 SSE 推送流式事件
12. 前端实时展示 assistant 文本、工具活动、权限请求或 AskUser
13. 流结束后，后端把最终消息写入 JSONL
14. 前端重新拉历史消息，追平持久化状态
15. 用户可继续多轮对话，或把 session 迁移到另一个 workspace
16. 迁移后后续运行目录、可访问目录和 MCP/Skill 范围随 workspace 重新绑定

### 20.2 开发者视角

1. 使用 Bun workspace 管理依赖
2. 开发期同时运行 Vite 与 Bun backend
3. renderer 只通过 `/api` 与后端通信
4. 主进程状态集中在 service/orchestrator 层
5. 规格通过 OpenSpec 管理
6. 核心竞态通过单测和浏览器回归测试验证

## 21. 当前架构的优点

- 分层清晰：前端、HTTP、编排层、SDK 适配层边界明确
- 本地优先：无数据库依赖，部署和调试成本低
- 可测试：关键竞态点已经有对应单测
- 可观测：所有核心数据都能在 `~/.proma/` 直接查看
- 可扩展：workspace、skills、MCP、additionalDirectories 已有明确落点
- SDK 隔离较好：Claude SDK 细节主要集中在 adapter

## 22. 当前架构的主要约束

- `http-router.ts` 已经偏大，协议层和分发逻辑耦合较重
- `agent-orchestrator.ts` 职责过多，是当前最容易继续膨胀的模块
- 持久化是文件级约定，不具备数据库事务能力
- 大量瞬时态保存在进程内，进程重启不会恢复
- `apps/electron` 的命名与真实运行形态不完全一致，增加新接手者理解成本
- `packages/shared` 仍保留部分大于当前最小产品边界的历史表面

## 23. 总结

当前 Proma 已经从更复杂、更偏桌面应用的一体化产品，收敛为一个结构相对清晰的本地 Web Agent 应用。

当前最关键的两条主线是：

- workspace-scoped runtime
- session-scoped streaming state

绝大多数实现，无论是后端编排、前端状态设计，还是 OpenSpec 规格，都围绕这两条主线组织。

如果后续要继续深入理解或演进这个系统，最值得优先拆解的两个主题是：

1. `http-router -> agent-service -> agent-orchestrator -> adapter` 的会话执行时序
2. `session/workspace persistence + frontend transient state` 的一致性模型
