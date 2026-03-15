# Proma Current Code Logic Overview

编辑时间：2026-03-14

## 文档目的

本文档基于当前仓库代码，对 Proma 工程的整体结构、主要运行链路、关键模块职责，以及核心实现原理进行系统梳理。重点不是逐文件罗列，而是把系统如何启动、如何存储、如何通信、如何执行 Chat 和 Agent 任务串成完整链路。

## 1. 工程整体结构

当前仓库是一个 Bun workspace monorepo，主体由 Electron 应用和 3 个公共包组成：

- `apps/electron`
  - Electron 桌面应用本体
  - `src/main` 负责主进程、系统能力、数据服务、IPC、Chat/Agent 编排、飞书、更新等
  - `src/preload` 负责将安全的 API 暴露给渲染进程
  - `src/renderer` 负责 React 界面、Jotai 状态管理和交互逻辑
- `packages/shared`
  - 全工程统一的类型定义、IPC 通道常量、权限规则和一些共享工具
- `packages/core`
  - 与 Electron 解耦的纯逻辑核心，主要是多供应商模型适配、SSE 解析、标题生成、代码高亮
- `packages/ui`
  - 共享 UI 组件，聚焦消息渲染，如代码块、Mermaid 图和流式平滑显示

虽然根目录存在 `index.ts`，但它只是一个 Bun 占位文件，不参与主应用运行。真正的入口在 `apps/electron/src/main/index.ts` 和 `apps/electron/src/renderer/main.tsx`。

## 2. 启动流程总览

Proma 的启动链路可以概括为：

```text
Electron main -> runtime init -> menu/tray/window/ipc/watchers
-> preload expose electronAPI
-> renderer bootstrap
-> App startup checks
-> AppShell / tabs / chat / agent
```

### 2.1 主进程启动

`apps/electron/src/main/index.ts` 是 Electron 主进程入口。它的职责包括：

1. 清理本地 `ANTHROPIC_*` 环境变量，防止系统环境干扰应用自己的渠道配置。
2. 调用 `initializeRuntime()` 初始化运行环境。
3. 将内置的默认 Skills 同步到用户本地目录。
4. 注册应用菜单、系统托盘和 IPC。
5. 创建主窗口并加载 renderer。
6. 启动工作区监听、Chat 工具配置监听、自动更新和飞书 Bridge。
7. 在退出时清理 Agent、Chat 流、watcher、updater 和 tray。

### 2.2 运行时初始化

`apps/electron/src/main/lib/runtime-init.ts` 用来检测并缓存：

- Shell 环境
- Node.js
- Bun
- Git
- Windows 下的 Git Bash / WSL

这一步不是 UI 初始化，而是为了保证后续 Agent 执行、Shell 命令、Bun/Git 检测等能力有可用运行环境。

### 2.3 Preload 桥接

`apps/electron/src/preload/index.ts` 通过 `contextBridge.exposeInMainWorld('electronAPI', ...)` 暴露统一 API。渲染进程不能直接调用 Node/Electron，而是统一通过 `window.electronAPI` 与主进程交互。

这层的意义是：

- 限制渲染进程能力边界
- 保持安全的上下文隔离
- 让主进程对外能力拥有稳定、类型化的接口

### 2.4 Renderer 启动

`apps/electron/src/renderer/main.tsx` 是前端入口，主要做 4 件事：

1. 初始化主题和系统深浅色同步
2. 初始化 Agent 相关设置
3. 初始化通知和更新状态监听
4. 挂载全局 Chat / Agent 监听器

`apps/electron/src/renderer/App.tsx` 进一步完成：

- onboarding 状态判断
- 环境检测
- 首次欢迎对话创建
- 进入主界面 `AppShell`

## 3. 本地优先的数据存储模型

Proma 当前的核心设计之一是本地优先。它不依赖数据库，而是把所有配置和消息落在 `~/.proma/` 下，由 `apps/electron/src/main/lib/config-paths.ts` 统一管理路径。

### 3.1 核心目录和文件

常见的数据文件包括：

- `channels.json`
  - 渠道配置
- `settings.json`
  - 应用级设置
- `user-profile.json`
  - 用户资料
- `proxy-settings.json`
  - 代理配置
- `system-prompts.json`
  - Chat 系统提示词配置
- `memory.json`
  - MemOS 记忆配置
- `chat-tools.json`
  - Chat 工具状态、凭据、自定义工具
- `feishu.json`
  - 飞书配置
- `feishu-bindings.json`
  - 飞书聊天绑定

会话类数据分成索引和正文两层：

- Chat
  - `conversations.json`
  - `conversations/{id}.jsonl`
- Agent
  - `agent-sessions.json`
  - `agent-sessions/{id}.jsonl`

工作区数据在：

- `agent-workspaces/{slug}/mcp.json`
- `agent-workspaces/{slug}/skills/`
- `agent-workspaces/{slug}/skills-inactive/`
- `agent-workspaces/{slug}/workspace-files/`
- `agent-workspaces/{slug}/config.json`
- `agent-workspaces/{slug}/{sessionId}/`

### 3.2 为什么索引和消息正文分离

Chat 和 Agent 的消息都采用：

- 索引用 JSON 保存轻量元信息
- 消息正文用 JSONL 逐行追加

这样做的好处是：

- 对话列表加载快
- 新消息写入不需要读取和重写整个文件
- 比本地数据库更简单透明，便于迁移和调试

### 3.3 API Key 存储

渠道配置在 `apps/electron/src/main/lib/channel-manager.ts` 中读写。其 `apiKey` 使用 Electron `safeStorage` 加密：

- macOS 走 Keychain
- Windows 走 DPAPI
- Linux 走 Secret Service

如果平台不支持 `safeStorage`，才会退化为明文存储。

## 4. IPC 架构与进程边界

`apps/electron/src/main/ipc.ts` 是主进程的统一 API 网关。这里注册了运行时、渠道、Chat、Agent、设置、附件、工作区、记忆、系统提示词、飞书、更新等全部 IPC handler。

它的工作方式是：

1. 主进程的 service 负责真正业务逻辑。
2. `ipc.ts` 把 service 注册为 IPC handler。
3. `preload/index.ts` 把 handler 包装成 `electronAPI`。
4. 渲染层通过 `window.electronAPI.xxx()` 使用这些能力。

这里最关键的基础设施不是某个 service，而是 `packages/shared`：

- 所有 IPC 通道名称都在 shared 中定义
- 所有输入输出类型也在 shared 中定义

因此 `main / preload / renderer` 三端实际上共享同一套协议。

## 5. Renderer 层的视图与状态组织

Proma 的渲染层不是单页面单会话模型，而是：

- 左侧导航
- 多标签页
- 分屏布局
- 每个会话参数化渲染
- 全局流式状态管理

### 5.1 主界面结构

`apps/electron/src/renderer/components/app-shell/AppShell.tsx` 是主壳。

页面大致结构是：

- `LeftSidebar`
  - 模式切换
  - Chat / Agent 会话列表
  - 置顶区
  - 设置入口
- `MainArea`
  - `TabBar`
  - `SplitContainer`
  - 或设置页覆盖

### 5.2 多标签与分屏

`apps/electron/src/renderer/atoms/tab-atoms.ts` 负责：

- 打开标签
- 关闭标签
- 聚焦标签
- 重排标签
- 切换分屏模式

它支持：

- 单面板
- 横向双栏
- 纵向双栏
- 四宫格

标签页里承载的不是抽象页面，而是具体的 `Chat conversationId` 或 `Agent sessionId`。

### 5.3 状态管理模式

Jotai atoms 主要按领域拆分：

- `chat-atoms.ts`
- `agent-atoms.ts`
- `tab-atoms.ts`
- 主题、通知、设置、代理、飞书等领域 atom

其中最关键的设计是“按会话 ID 存储流式状态的 Map”：

- Chat 用 `Map<conversationId, ConversationStreamState>`
- Agent 用 `Map<sessionId, AgentStreamState>`

这使得同一时刻多个会话可以同时流式输出，而不会被单一全局状态覆盖。

### 5.4 全局事件监听 + 局部视图

Proma 使用了一种很稳定的模式：

- 全局监听器负责接收 IPC 事件并更新 atom
- 具体 `ChatView / AgentView` 再根据自己的 `conversationId / sessionId` 读对应状态

核心文件：

- `useGlobalChatListeners.ts`
- `useGlobalAgentListeners.ts`

这样带来的好处是：

- 切换标签不丢流式内容
- 分屏显示互不干扰
- 后台会话也能继续跑

## 6. Chat 模式实现逻辑

Chat 的完整链路如下：

```text
ChatView
-> electronAPI.sendMessage
-> main/ipc.ts
-> main/lib/chat-service.ts
-> @proma/core ProviderAdapter + SSE reader
-> IPC stream events
-> useGlobalChatListeners
-> ChatMessages / ChatView
```

### 6.1 前端发送消息

`apps/electron/src/renderer/components/chat/ChatView.tsx` 负责：

- 加载最近消息
- 管理附件待发送状态
- 发送消息
- 停止生成
- 删除消息
- 从某条消息起截断历史
- 首轮消息后自动注册待生成标题

这里有两个重要点：

- 前端会做乐观更新，先把用户消息插入本地 UI。
- 真实历史消息并不依赖前端传递，而是由主进程重新从磁盘读取。

### 6.2 主进程 Chat 编排

真正的 Chat 核心在 `apps/electron/src/main/lib/chat-service.ts`。

其主要工作包括：

1. 根据 `channelId` 找到渠道，并解密 API Key。
2. 从 `conversation-manager` 读取完整历史消息。
3. 先把用户消息追加到 JSONL。
4. 根据 `contextDividers` 和 `contextLength` 裁剪上下文。
5. 提取文档附件内容并拼到 prompt 中。
6. 读取图片附件，交给 provider 做多模态消息构造。
7. 从 Chat 工具注册表中取当前启用工具。
8. 调用 `@proma/core` 的 provider 适配器构建请求。
9. 通过统一的 SSE 读取器流式接收模型输出。
10. 如果出现工具调用，进入多轮 function calling continuation 循环。
11. 持久化最终 assistant 消息，并通知前端完成。

### 6.3 上下文裁剪机制

Chat 的上下文不是简单“最近 N 条消息”。它有 3 层过滤：

1. 过滤空 assistant 消息
2. 如果设置了 context divider，只保留最后一个 divider 之后的消息
3. 如果设置了 contextLength，则按轮数从后向前截断

这套逻辑在 `chat-service.ts` 的 `filterHistory()` 中。

### 6.4 附件处理机制

Chat 附件分两类：

- 图片
  - 走多模态输入
  - 由 Electron 层读取 base64，再注入 provider
- 文档
  - 走文本提取
  - 被转换成类似 `<file name="...">...</file>` 的结构化内容并注入上下文

文档提取能力来自：

- `attachment-service.ts`
- `document-parser.ts`

### 6.5 Chat 工具系统

Chat 的工具系统由以下模块组成：

- `chat-tool-registry.ts`
- `chat-tool-executor.ts`
- `chat-tools/*.ts`

当前内置能力包括：

- `memory`
  - MemOS 记忆搜索和写入
- `web-search`
  - Tavily 实时联网搜索
- `agent-mode-recommend`
  - 给 Chat 用户推荐切换到 Agent 模式
- 自定义 HTTP 工具
  - 用户配置 URL、headers、body 模板后，模型可通过 tool call 发起 HTTP 请求

### 6.6 前端流式接收

`useGlobalChatListeners.ts` 会处理：

- `STREAM_CHUNK`
- `STREAM_REASONING`
- `STREAM_COMPLETE`
- `STREAM_ERROR`
- `STREAM_TOOL_ACTIVITY`

并把它们写入 `chat-atoms.ts` 中的状态 Map。`ChatView` 再在消息重新加载完成后清理过渡中的流式气泡，避免闪烁。

## 7. Agent 模式实现逻辑

Agent 模式和 Chat 最大的差异在于：它不是用统一 provider 适配层做推理，而是直接围绕 Claude Agent SDK 编排。

链路如下：

```text
AgentView
-> electronAPI.sendAgentMessage
-> main/ipc.ts
-> main/lib/agent-service.ts
-> AgentOrchestrator
-> Claude Agent SDK
-> ClaudeAgentAdapter translate to AgentEvent
-> AgentEventBus / IPC
-> useGlobalAgentListeners
-> AgentView / SidePanel / Team UI
```

### 7.1 Agent 会话与工作区

Agent 的元数据与消息持久化由：

- `agent-session-manager.ts`
- `agent-workspace-manager.ts`

负责。

这里的模型是：

- 会话是逻辑对话单元
- 工作区是执行环境单元

一个会话可以属于一个工作区。工作区为该会话提供：

- cwd
- MCP 配置
- Skills
- workspace files
- 权限模式
- 附加目录

### 7.2 Agent 编排核心

`apps/electron/src/main/lib/agent-orchestrator.ts` 是 Agent 的大脑。它负责：

1. 会话级并发保护
2. 渠道解析和 API Key 解密
3. 注入 Agent SDK 所需环境变量
4. 决定 cwd 和工作区上下文
5. 决定是否 resume 旧的 SDK session
6. 构建动态上下文 prompt
7. 注入 MCP server、记忆工具、附加目录
8. 执行 Claude Agent SDK
9. 处理自动重试和错误恢复
10. 支持 Agent Teams 的 auto-resume
11. 持久化 user / assistant / status 消息
12. 完成后自动生成标题

### 7.3 Resume 与历史回填

Agent 会话元数据中会保存 `sdkSessionId`。如果它仍有效，则下次继续使用 SDK resume。

如果 `sdkSessionId` 已失效，则会回退到另一种机制：

- 从 Proma 自己持久化的历史消息里提取最近若干条
- 生成 `<conversation_history>` prompt
- 让新 SDK 会话带着历史上下文继续工作

这保证了即使 SDK session 不可用，Proma 仍然可以尽量维持上下文连续性。

### 7.4 动态上下文和静态提示词

`agent-prompt-builder.ts` 把 Agent 的 prompt 拆成两部分：

- 静态 system prompt append
- 动态 per-message context

静态部分包含：

- Proma Agent 角色定义
- Skill 调用规则
- 用户信息
- 工作区目录说明
- 权限模式说明
- 交互规范

动态部分包含：

- 当前时间
- 当前工作区 MCP / Skills 的实时状态
- 记忆工具使用说明
- 当前工作目录

这么做的目的是：

- 静态部分更利于 prompt caching
- 动态部分每次都能反映最新工作区状态

### 7.5 权限系统

Agent 权限由 `agent-permission-service.ts` 实现，支持：

- `auto`
- `smart`
- `supervised`

其核心逻辑是：

- `SAFE_TOOLS` 里的工具直接放行
- 安全 Bash 模式放行
- 危险命令和带重定向、管道、子 shell、`find -exec` 等结构需要人工确认
- 可以建立会话级白名单

权限请求会通过事件发给渲染层，等待用户批准或拒绝。

### 7.6 AskUserQuestion 交互

Agent 不是只能通过文本追问用户。`AskUserQuestion` 会被单独拦截到 `agent-ask-user-service.ts`：

- 解析问题列表
- 推送给前端显示成交互式问题 UI
- 等待用户选择答案
- 再通过 `updatedInput.answers` 回传给 SDK

这使得 Agent 可以进行更结构化的交互式澄清。

### 7.7 AgentEvent 翻译层

Claude Agent SDK 的原始输出不会直接给前端。中间会经过：

- `adapters/claude-agent-adapter.ts`
- `packages/shared/src/agent/tool-matching.ts`

它们的职责是把 SDK 的 assistant、user、stream_event、tool_progress、result 等消息翻译成 Proma 自己定义的 `AgentEvent`，例如：

- `text_delta`
- `tool_start`
- `tool_result`
- `task_started`
- `task_progress`
- `task_notification`
- `typed_error`
- `retrying`
- `waiting_resume`

前端只消费 `AgentEvent`，不需要关心 Claude SDK 的底层消息结构。

### 7.8 Agent Teams 与 auto-resume

Proma 对 Agent Teams 做了额外编排：

- 追踪所有 `Task` 或 `Agent` 子任务
- 使用 watchdog 检测所有 worker 已 idle 但主线程仍卡住的情况
- 在适当时机自动触发 resume
- 优先从 inbox 聚合 worker 输出，失败时退化为 task summary 拼接

这样可以减少多代理协作中主线程“等不到子任务结果”的问题。

### 7.9 前端 Agent 视图

`AgentView.tsx` 负责：

- 加载会话消息
- 显示流式文本
- 展示上下文使用量
- 展示权限请求、AskUser 请求
- 处理附件上传
- 附加目录
- 侧边 Team 活动面板
- 错误展示和停止执行

而真正的流式事件分发由 `useGlobalAgentListeners.ts` 统一处理。

## 8. Workspace / MCP / Skills 的实现方式

工作区是 Proma Agent 扩展性的核心承载单元。

### 8.1 工作区创建

`agent-workspace-manager.ts` 在创建工作区时会：

1. 生成 slug
2. 创建工作区目录
3. 生成 `.claude-plugin/plugin.json`
4. 复制默认 Skills

默认工作区会在首次使用时自动创建。

### 8.2 MCP 配置

每个工作区有独立的 `mcp.json`，格式顶层必须是：

```json
{
  "servers": {}
}
```

Proma 读取时会把启用的 MCP server 注入 Agent SDK。支持：

- `stdio`
- `http`
- `sse`

### 8.3 Skills 管理

Skill 的本质是 `skills/{slug}/SKILL.md` 目录结构。Proma 通过扫描 `SKILL.md` 的 frontmatter 获取：

- name
- description
- icon

启用和禁用不是改配置，而是直接在：

- `skills/`
- `skills-inactive/`

之间移动目录。

### 8.4 能力变化监听

`workspace-watcher.ts` 会递归监听：

- 工作区目录
- 附加目录

并根据文件变化类型推送：

- `CAPABILITIES_CHANGED`
- `WORKSPACE_FILES_CHANGED`

前端收到能力变化后会重新读取 `WorkspaceCapabilities`，并用 `capabilities-diff` 做变更提示。

## 9. 三个公共包的职责边界

### 9.1 @proma/shared

`packages/shared` 是跨进程的协议层，负责：

- 渠道、Chat、Agent、环境、飞书、代理等类型定义
- IPC 通道常量
- 权限规则
- 工具匹配辅助

这个包的作用不是“工具函数大杂烩”，而是统一语言，让主进程、预加载层和前端说同一种协议。

### 9.2 @proma/core

`packages/core` 是纯逻辑核心，主要包括：

- ProviderAdapter 抽象
- OpenAI / Anthropic / Google 适配器
- SSE 流式读取器
- URL 规范化工具
- 标题生成
- Shiki 代码高亮

这个包不直接碰：

- Electron
- 文件系统
- 代理配置文件
- 浏览器 DOM

它依赖上层注入 fetch、附件读取器等平台能力，因此比较容易测试，也更容易复用。

### 9.3 @proma/ui

`packages/ui` 当前刻意保持很小，主要提供：

- `CodeBlock`
- `MermaidBlock`
- `useSmoothStream`

它不是整个应用的通用组件库，而是消息渲染相关的公共组件库。

## 10. 设置、工具、记忆、飞书、代理与更新

### 10.1 设置页

`renderer/components/settings/SettingsPanel.tsx` 提供统一设置入口，当前主要包含：

- 通用设置
- 渠道设置
- 系统提示词
- 代理设置
- Agent 设置
- 工具设置
- 飞书设置
- 外观
- 关于
- 教程

### 10.2 记忆系统

记忆配置由 `memory-service.ts` 读写，真实接口调用在 `memos-client.ts`。

Proma 的记忆在当前实现中有两种用法：

- Chat 模式通过 Chat tools 调用
- Agent 模式通过内置 MCP 风格工具注入到 SDK

它们都共享同一套 `memory.json`。

### 10.3 Chat 工具配置

`chat-tool-config.ts` 维护：

- 工具启用状态
- 工具凭据
- 自定义工具定义

`chat-tools-watcher.ts` 监听 `chat-tools.json` 变化。当 Agent 或外部流程修改了工具配置时，前端会自动刷新工具列表。

### 10.4 飞书远程桥接

`feishu-bridge.ts` 是一个很重的集成模块，核心职责包括：

- 通过飞书长连接接收消息
- 过滤群聊中的非 @Bot 消息
- 管理 `chatId <-> sessionId` 绑定
- 下载图片和文件附件到 session 工作目录
- 调用 `runAgentHeadless()` 在本地执行 Agent
- 监听 `AgentEventBus`，把结果格式化回飞书卡片消息

这个模块实际上把 Proma 扩展成了“本地 Agent + 飞书远程终端”的形态。

### 10.5 在场检测

`feishu-presence.ts` 结合：

- 当前查看的 session
- 窗口焦点
- 系统空闲时间

来判断用户是否“正在看这个会话”。只有用户不在场时，才需要发送飞书通知。

### 10.6 代理配置

`proxy-settings-service.ts` 管理全局代理：

- 关闭
- 系统代理
- 手动代理

最终代理 URL 会同时影响：

- Chat 模式的 HTTP 请求
- Agent SDK 的环境变量

### 10.7 自动更新

`updater/auto-updater.ts` 使用 `electron-updater` 检测更新，但当前策略是：

- 自动检查
- 不自动下载
- 不自动安装

用户需要手动前往 GitHub Releases 获取新版本。

## 11. 当前工程的核心设计思想

基于以上代码，可以把当前工程的设计思路总结为以下几点：

### 11.1 主进程即本地后端

Proma 虽然是桌面应用，但结构上更接近“本地服务端 + 前端客户端”：

- 主进程负责真实业务和系统能力
- 渲染层负责 UI 和交互
- preload 负责安全桥接

### 11.2 本地优先

无数据库、透明配置文件、JSONL 消息存储、工作区目录直接可见，说明这个项目非常强调数据可迁移性和可控性。

### 11.3 Chat 和 Agent 双执行架构

系统内部并不是一套模型执行链，而是两套：

- Chat：多供应商统一 provider adapter 架构
- Agent：Claude Agent SDK 编排架构

这让它同时兼顾：

- 通用多模型对话
- 高能力自主执行

### 11.4 工作区是扩展能力核心

MCP、Skills、workspace-files、attached directories、permission mode 都是围绕工作区组织的。工作区不是简单分类标签，而是 Agent 的执行环境容器。

### 11.5 全局流式监听 + 参数化视图

前端通过全局事件监听和按 ID 索引状态的方式，天然支持：

- 多标签
- 分屏
- 后台流式执行
- 切换视图不丢状态

这比传统“当前页面单例状态”更适合 Agent 产品。

## 12. 最终结论

从当前代码看，Proma 已经不是单纯的聊天 UI，而是一套“本地 AI 工作台基础设施”。它当前具备如下技术特征：

- Electron 主进程承载完整本地业务后端
- Renderer 使用 React + Jotai 做参数化、多会话、多面板 UI
- 数据本地优先，落盘结构清晰
- Chat 和 Agent 两条主链路各自独立但共享配置体系
- 工作区承载 Skills、MCP、文件、权限和会话环境
- 具备飞书远程控制、记忆、代理、自动更新、环境检测等外围能力

如果后续继续演进，这套架构很适合继续向以下方向扩展：

- 更复杂的多 Agent 协作
- 更强的工作区自动化配置
- 更丰富的工具系统
- 更深的远程协同和通知能力
- 更主动的基于记忆与工作区能力的 Agent 行为

从工程设计角度看，目前最清晰、最值得肯定的部分是：

- 进程边界明确
- shared/core/ui 分层清晰
- 本地存储模型稳定
- Agent 工作区体系完整
- 全局事件流与前端会话状态模型匹配良好
