# Tasks: 简化为最小 Claude Code 对话界面

## 前置准备

### Task 0.1: 创建开发分支
- [x] 从 `main` 分支创建新分支 `feature/proma-web`
- [x] 切换到新分支进行所有开发工作
- [ ] 每个 Phase 完成后提交一次，确保应用可运行

> **环境说明**: 默认非交互 shell 未直接暴露 `ANTHROPIC_API_KEY`。最终手测通过加载全局 `ANTHROPIC_AUTH_TOKEN` 与 `ANTHROPIC_BASE_URL`，并在运行时映射为 `ANTHROPIC_API_KEY` 完成。

> **实施原则**: 在当前工程基础上进行删减和简化，最大化复用现有代码。不引入新的功能模块，不做大规模架构调整。优先删除不需要的代码，再对保留部分做最小改动使其能独立运行。

---

## Phase 1 — 删除非核心模块

### Task 1.1: 删除飞书集成
- [x] 删除 `main/lib/feishu-bridge.ts`、`feishu-config.ts`、`feishu-message.ts`、`feishu-presence.ts`
- [x] 删除 `renderer/atoms/feishu-atoms.ts`、`notifications.ts`
- [x] 删除 `renderer/components/settings/FeishuSettings.tsx`
- [x] 删除 `renderer/` 中 FeishuInitializer 相关代码
- [x] 清理所有 feishu 相关 IPC 通道注册和 import
- [x] 运行 typecheck 确认无编译错误

### Task 1.2: 删除教程/记忆/系统提示词
- [x] 删除 `main/lib/tutorial-service.ts`、`memory-service.ts`、`system-prompt-manager.ts`
- [x] 删除 `renderer/components/tutorial/`
- [x] 删除 `renderer/components/onboarding/`
- [x] 删除 `renderer/atoms/system-prompt-atoms.ts`
- [x] 删除 `renderer/components/settings/` 中 MemorySettings、PromptSettings
- [x] 清理相关 IPC 通道注册和 import
- [x] 运行 typecheck

### Task 1.3: 删除 Chat 模式
- [x] 删除 `renderer/components/chat/` 整个目录
- [x] 删除 `renderer/atoms/chat-atoms.ts`、`chat-tool-atoms.ts`
- [x] 删除 `main/lib/chat-service.ts`、`conversation-manager.ts`
- [x] 删除 `main/lib/chat-tool-*` 所有 Chat 工具文件
- [x] 删除 `renderer/hooks/` 中 ChatListenersInitializer 相关
- [x] 删除 `renderer/atoms/app-mode.ts`（固定为 Agent 模式）
- [x] 清理所有 CHAT_IPC_CHANNELS 注册和 import
- [x] 运行 typecheck

### Task 1.4: 删除 packages/core
- [x] 删除 `packages/core/` 整个目录（Provider 适配器 + Shiki）
- [x] 从根 `package.json` 移除 `@proma/core` workspace 引用
- [x] 清理其他包中对 `@proma/core` 的 import
- [x] 运行 typecheck

### Task 1.5: 删除渠道管理
- [x] 删除 `main/lib/channel-manager.ts`
- [x] 删除 `renderer/components/settings/ChannelSettings.tsx`、`ChannelForm.tsx`
- [x] 清理 agent-service 中对 channel 的依赖（API Key 改为直接读环境变量）
- [x] 清理相关 IPC 通道注册
- [x] 运行 typecheck

### Task 1.6: 删除 Agent 高级功能
- [x] 删除 `main/lib/agent-workspace-manager.ts`、`agent-team-reader.ts`
- [x] 删除 `main/lib/workspace-watcher.ts`
- [x] 删除 `renderer/components/agent/` 中：WorkspaceSelector、BackgroundTasksPanel、ActiveTasksBar、MoveSessionDialog、MentionList、mention-*
- [x] 删除 `renderer/components/file-browser/` 整个目录
- [x] 删除 `renderer/components/settings/AgentSettings.tsx`、`McpServerForm.tsx`
- [x] 删除 `renderer/hooks/useBackgroundTasks.ts`
- [x] 精简 `renderer/atoms/agent-atoms.ts`（去掉 Team/Workspace 相关 atoms）
- [x] 精简 `renderer/hooks/useGlobalAgentListeners.ts`（去掉 Team/后台任务事件处理）
- [x] 运行 typecheck

### Task 1.7: 删除旧 tabs 模块/分屏 + 其他
- [x] 删除 `renderer/components/tabs/` 整个目录
- [x] 删除 `renderer/atoms/tab-atoms.ts`
- [x] 删除 `main/lib/updater/` 自动更新
- [x] 删除 `renderer/atoms/updater.ts`
- [x] 删除 `main/lib/attachment-service.ts`、`document-parser.ts`
- [x] 删除 `main/lib/github-release-service.ts`
- [x] 删除 `renderer/components/settings/` 中 AboutSettings 的更新相关逻辑
- [x] 运行 typecheck

---

## Phase 2 — 去掉 Electron，改造为 HTTP 服务

### Task 2.1: 去掉 Electron 依赖
- [x] 删除 `apps/electron/src/preload/` 整个目录
- [x] 删除 Electron 主进程入口中的 BrowserWindow 创建、app 生命周期管理
- [x] 删除 `electron-builder.yml` 和打包脚本
- [x] 从 `package.json` 移除 `electron`、`electronmon`、`electron-builder` 等依赖
- [x] 删除 esbuild 主进程/preload 构建脚本
- [x] 运行 typecheck

### Task 2.2: 新增 Bun HTTP 服务入口
- [x] 在 `apps/electron/src/main/` 中创建 `http-server.ts`（`Bun.serve()` 入口）
- [x] 创建 `http-router.ts`（REST API 路由，调用现有服务层）
- [x] REST 端点（复用现有 session-manager）：
  - `GET /api/sessions` → `agent-session-manager.listSessions()`
  - `POST /api/sessions` → `agent-session-manager.createSession()`
  - `DELETE /api/sessions/:id` → `agent-session-manager.deleteSession()`
  - `PATCH /api/sessions/:id` → `agent-session-manager.updateTitle()`
  - `GET /api/sessions/:id/messages` → `agent-session-manager.getMessages()`
  - `GET /api/status` → 检测 API Key + CLI 可用性
- [x] 生产模式：serve Vite 构建的 `dist/` 静态文件

### Task 2.3: 新增 SSE 流式推送
- [x] 创建 `sse-manager.ts`（替代 `webContents.send`）
- [x] SSE 端点：
  - `POST /api/sessions/:id/send` → 调用现有 agent-service，返回 SSE 流
  - `POST /api/sessions/:id/stop` → 调用现有 stopAgent
- [x] 改造 `agent-event-bus.ts`：事件推送从 IPC 改为 SSE
- [x] 并发保护：同一会话不允许同时发送（返回 409）

### Task 2.4: 改造权限/AskUser 为 REST 响应
- [x] 改造 `agent-permission-service.ts`：推送方式从 IPC 改为 SSE
- [x] 改造 `agent-ask-user-service.ts`：同上
- [x] 新增 REST 端点：
  - `POST /api/sessions/:id/permission-respond` → resolve 权限 Promise
  - `POST /api/sessions/:id/ask-user-respond` → resolve AskUser Promise
- [x] 保留超时处理（5 分钟自动拒绝）

### Task 2.5: 简化 SDK 调用链
- [x] 简化 `claude-agent-adapter.ts`：去掉 Channel/Workspace/MCP 参数
- [x] API Key 直接从 `process.env.ANTHROPIC_API_KEY` 读取
- [x] cwd 固定为 `process.cwd()`
- [x] 不传递 model 参数，使用 SDK 默认模型
- [x] 去掉 agent-orchestrator 中的 Team/Workspace 逻辑（或绕过 orchestrator 直接调用 adapter）

### Task 2.6: 会话标题自动生成
- [x] 复用现有标题生成逻辑（或简化为截取用户首条消息前 50 字符）
- [x] 通过 SSE 推送 title_updated 事件通知前端

---

## Phase 3 — 前端改造

### Task 3.1: 替换 IPC 为 fetch/SSE
- [x] 创建 `src/lib/api.ts`：REST API 封装（替代 `window.electronAPI.*`）
- [x] 创建 `src/hooks/useAgentSSE.ts`：
  - 发送消息时通过 `fetch` + `ReadableStream` 建立 POST SSE 连接
  - 解析 SSE 事件 → 调用现有 `applyAgentEvent()` 更新 atoms
  - 处理 permission_request / ask_user_request 事件
  - 处理 title_updated 事件
  - 连接断开提示
  - 停止生成
- [x] 启动时调用 `GET /api/status` 检测服务状态
- [x] 改造 `AgentView.tsx`：`window.electronAPI.sendAgentMessage` → `api.sendMessage` + SSE

### Task 3.2: 简化布局为双面板
- [x] 改造 `AppShell.tsx`：去掉 NavigatorPanel、ModeSwitcher，简化为 LeftSidebar + MainContent
- [x] 改造 `LeftSidebar.tsx`：去掉模式切换，只保留会话列表 + 设置入口
- [x] 将 `MainContentPanel.tsx` 中的旧多标签页实现精简为轻量会话页签条，并保留多个会话页签切换
- [x] 添加空状态组件（无会话时的欢迎提示）
- [x] 侧边栏会话列表添加流式指示器

### Task 3.3: 简化设置面板
- [x] 只保留 AppearanceSettings（主题切换）和 GeneralSettings（用户档案）
- [x] 去掉 ChannelSettings、AgentSettings、McpServerForm 等已删除的设置页

### Task 3.4: 精简 Agent 组件
- [x] 简化 `AgentHeader.tsx`：去掉渠道/模型选择、文件浏览器切换
- [x] 保留 `AgentMessages.tsx`：消息列表 + 工具活动展示
- [x] 保留 `ToolActivityItem.tsx`：工具调用展示（折叠/展开）
- [x] 保留 `PermissionBanner.tsx`：改为调用 REST API 响应
- [x] 保留 `AskUserBanner.tsx`：改为调用 REST API 响应
- [x] 保留 `ChatInput`（或复用现有 rich-text-input）：输入框 + 发送/停止按钮
- [x] 流式输出时禁用输入框（并发保护）

### Task 3.5: 清理渲染进程初始化
- [x] 改造 `main.tsx`：去掉 AgentSettingsInitializer、ChatListenersInitializer、ChatToolInitializer、FeishuInitializer、UpdaterInitializer
- [x] 改造 `useGlobalAgentListeners`：从 IPC 监听改为由 SSE hook 驱动
- [x] 保留 ThemeInitializer（改为从 localStorage 读取，不走 IPC）

---

## Phase 4 — 打磨

### Task 4.1: 主题系统
- [x] 保留现有 ShadcnUI CSS 变量主题
- [x] 主题持久化从 IPC（settings-service）改为 localStorage
- [x] 保留系统主题跟随（`prefers-color-scheme` 监听）

### Task 4.2: 错误处理
- [x] SSE 连接断开提示（展示"连接已断开"，保留已有内容）
- [x] SDK 启动失败提示（Claude Code CLI 未安装 → 展示安装指引）
- [x] API Key 未配置提示（`GET /api/status` 检测 → 前端阻止发送）
- [x] 网络错误友好提示（fetch 失败 → toast 通知）
- [x] 会话并发保护（前端禁用 + 后端 409）

### Task 4.3: 构建 + 开发体验
- [x] Vite 开发代理配置（`/api` → Bun 后端端口）
- [x] 启动脚本：`bun run dev`（同时启动 Vite + Bun 后端）
- [x] 构建脚本：`bun run build`（Vite 构建前端 → dist/）
- [x] 生产启动：`bun run start`（Bun 服务 serve dist/ + API）
- [x] 更新 README（安装 + 环境变量 + 启动命令）

### Task 4.4: 清理残留
- [x] 删除所有未使用的 import 和死代码
- [x] 删除空目录
- [x] 最终 typecheck + 手动测试完整对话流程
