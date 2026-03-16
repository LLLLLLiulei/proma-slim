# Proposal: 简化为最小 Claude Code 对话界面

## 概述

在当前 Proma Electron 工程基础上进行删减简化，去掉 Electron 桌面壳和不需要的功能模块，改造为纯 Web 应用（Bun 后端 + React 前端），通过 `@anthropic-ai/claude-agent-sdk` 与 Claude Code 通信。

## 动机

当前 Proma 功能庞大（Chat + Agent 双模式、Electron IPC、多 Provider、飞书集成等），但核心需求只是一个能在浏览器中使用的 Claude Code 对话界面。在现有代码上删减，保留 Agent 对话核心，去掉其余部分。

## 核心架构

```
变更前（Electron 桌面应用）:
  apps/electron/src/main/      ← Electron 主进程（IPC + 服务层）
  apps/electron/src/preload/   ← IPC 桥接
  apps/electron/src/renderer/  ← React UI（Chat + Agent 双模式）
  packages/core/               ← Provider 适配器
  packages/shared/             ← 共享类型
  packages/ui/                 ← 共享 UI 组件

变更后（纯 Web 应用）:
  apps/electron/src/main/      → 改造为 Bun HTTP 服务（去掉 Electron，加 REST + SSE）
  apps/electron/src/preload/   → 删除
  apps/electron/src/renderer/  → 保留 React UI（去掉 IPC，改 fetch/SSE）
  packages/core/               → 删除
  packages/shared/             → 精简（保留 Agent 类型）
  packages/ui/                 → 保留
```

```
┌─────────────────────────────────────────────────────────┐
│                      浏览器                              │
│                                                         │
│  ┌───────────┐  ┌────────────────────────────────────┐  │
│  │ 会话列表   │  │ 对话区域                           │  │
│  │ (侧边栏)  │  │                                    │  │
│  │           │  │  消息列表（文本 + 工具活动）         │  │
│  │ session 1 │  │  权限请求横幅 / AskUser 横幅        │  │
│  │ session 2 │  │                                    │  │
│  │           │  │  ┌──────────────────────────────┐  │  │
│  │ ┌───────┐ │  │  │ 输入框                       │  │  │
│  │ │ 设置 ⚙│ │  │  └──────────────────────────────┘  │  │
│  │ └───────┘ │  └────────────────────────────────────┘  │
│  └───────────┘                                          │
│                                                         │
│  现有 React + Vite + Tailwind + ShadcnUI + Jotai        │
└──────────────────────┬──────────────────────────────────┘
                       │ SSE (流式事件)
                       │ REST (会话管理)
┌──────────────────────┴──────────────────────────────────┐
│              改造后的 Bun 后端服务                        │
│                                                         │
│  现有 agent-service / agent-session-manager / 适配器     │
│  + 新增 HTTP Router + SSE Manager                       │
│  - 去掉 Electron IPC、Channel、Workspace、Team          │
│                                                         │
│    @anthropic-ai/claude-agent-sdk → Claude Code CLI     │
└─────────────────────────────────────────────────────────┘
```

## 目标

- 在现有工程上删减改造，不新建项目
- 去掉 Electron，改为纯 Web 应用
- 只保留 Agent SDK 流式对话（文本 + 工具活动展示）
- 保留权限请求（Permission）和 AskUser 交互
- 双面板布局：会话列表 + 对话区域
- API Key 使用本地已配置的环境变量（`ANTHROPIC_API_KEY`）
- 主题切换（light/dark）

## 非目标

- 不保留 Electron 桌面应用
- 不保留 Chat 模式（多 Provider 直接 API）
- 不保留渠道管理、工作区、MCP 配置
- 不保留 Team/多 Agent、后台任务、文件浏览器
- 不保留飞书、教程、记忆、系统提示词管理
- 不保留旧的多标签页模块和分屏能力
- 不提供前端模型切换（使用 SDK 默认模型）
- 不支持前端指定 cwd（固定为服务器启动目录）
- 不支持 SDK 会话恢复（resume）
- 不做多用户认证
- 不引入新功能模块

## 删除清单

**Electron 相关：**
- `apps/electron/src/preload/` — 整个 preload 目录
- Electron 主进程入口、BrowserWindow 创建、IPC 注册
- `electron-builder.yml`、Electron 打包脚本
- `electron`、`electronmon`、`electron-builder` 等依赖

**Chat 模式：**
- `renderer/components/chat/` — 整个 Chat 组件目录
- `renderer/atoms/chat-atoms.ts`、`chat-tool-atoms.ts`
- `main/lib/chat-service.ts`、`conversation-manager.ts`
- `main/lib/chat-tool-*` — Chat 工具系统
- `packages/core/` — 整个包（Provider 适配器 + Shiki）

**渠道系统：**
- `main/lib/channel-manager.ts`
- `renderer/components/settings/ChannelSettings.tsx`、`ChannelForm.tsx`

**Agent 高级功能：**
- `main/lib/agent-workspace-manager.ts`、`agent-team-reader.ts`
- `renderer/components/agent/` 中：WorkspaceSelector、BackgroundTasksPanel、ActiveTasksBar、MoveSessionDialog、MentionList
- `renderer/components/file-browser/`
- `renderer/components/settings/AgentSettings.tsx`、`McpServerForm.tsx`

**其他非核心模块：**
- `main/lib/feishu-*` — 飞书集成
- `main/lib/tutorial-service.ts`、`memory-service.ts`、`system-prompt-manager.ts`
- `main/lib/github-release-service.ts`、`workspace-watcher.ts`
- `main/lib/attachment-service.ts`、`document-parser.ts`
- `renderer/components/tutorial/`、`onboarding/`
- `renderer/atoms/` 中：`tab-atoms.ts`、`app-mode.ts`、`feishu-atoms.ts`、`system-prompt-atoms.ts`、`notifications.ts`
- `renderer/components/tabs/` — 旧的多标签页/分屏实现
- `renderer/components/settings/` 中：MemorySettings、PromptSettings、FeishuSettings
- `main/lib/updater/` — 自动更新

## 保留 + 改造清单

**主进程 → HTTP 服务（改造）：**
- `agent-service.ts` → 去掉 IPC，改为被 HTTP router 调用
- `claude-agent-adapter.ts` → 去掉 Channel/Workspace 耦合，简化 SDK 调用
- `agent-session-manager.ts` → 保留 JSONL 存储，复用 `~/.proma/agent-sessions/`
- `agent-permission-service.ts`、`agent-ask-user-service.ts` → 改为 Promise Hold + REST 响应
- `agent-event-bus.ts` → 改为 SSE 推送
- `config-paths.ts`、`settings-service.ts`、`runtime-init.ts` → 保留
- 新增：HTTP router（`Bun.serve`）、SSE manager

**渲染进程 → 前端（改造）：**
- `renderer/components/agent/` 核心组件 → 去掉 `window.electronAPI.*`，改为 fetch/SSE
- `renderer/components/app-shell/` → 简化为双面板（去掉 ModeSwitcher、NavigatorPanel，保留轻量会话页签条）
- `renderer/components/ai-elements/` → 保留消息渲染
- `renderer/components/settings/` → 只保留 GeneralSettings、AppearanceSettings、AboutSettings
- `renderer/components/ui/` → 保留 ShadcnUI
- `renderer/atoms/agent-atoms.ts` → 精简（去掉 Team/Workspace 相关）
- `renderer/atoms/theme.ts`、`user-profile.ts` → 保留
- `renderer/hooks/useGlobalAgentListeners.ts` → 改为 SSE 事件处理

**packages：**
- `packages/shared/` → 精简，保留 Agent 类型和工具匹配
- `packages/ui/` → 保留
- `packages/core/` → 删除

## 通信协议（替代 Electron IPC）

**REST API（会话管理）:**
```
GET    /api/sessions              → 会话列表
POST   /api/sessions              → 创建会话
DELETE /api/sessions/:id          → 删除会话
PATCH  /api/sessions/:id          → 更新标题
GET    /api/sessions/:id/messages → 获取历史消息
GET    /api/status                → 服务状态
```

**SSE（流式对话）:**
```
POST   /api/sessions/:id/send              → 发送消息（返回 SSE 流）
POST   /api/sessions/:id/stop              → 停止生成
POST   /api/sessions/:id/permission-respond → 权限响应
POST   /api/sessions/:id/ask-user-respond   → AskUser 响应
```

## 风险

- **Electron 耦合深度**: 渲染进程大量使用 `window.electronAPI.*`，需要逐一替换为 fetch/SSE
- **agent-orchestrator 耦合**: 58KB 编排器与 Channel/Workspace/Team 深度耦合，需要仔细剥离
- **packages/shared 交叉引用**: Chat 和 Agent 类型可能有交叉引用，删除 Chat 时需注意

## 实施策略

在现有工程上分阶段删减，每阶段确保可运行：

1. **Phase 0**: 新建 `feature/proma-web` 分支
2. **Phase 1**: 删除独立模块（飞书、教程、记忆、Chat 模式、packages/core）
3. **Phase 2**: 去掉 Electron，主进程改造为 Bun HTTP 服务 + SSE
4. **Phase 3**: 前端改造（IPC → fetch/SSE）+ 简化布局
5. **Phase 4**: 打磨（主题、错误处理、构建脚本）
