## Why

当前 Proma Web 已将 Claude Agent 的执行目录固定为服务启动目录，旧版本中可用的工作区作用域运行时被整体裁掉，导致 `workspaceId`、`workspaceSlug` 和输入组件中的工作区参数位失去实际意义。恢复工作区作用域能力可以重新隔离不同项目的 Agent 上下文、Skills、MCP 与文件目录，同时与旧版用户对“默认工作区 / 多工作区”的使用心智重新对齐。

## What Changes

- 恢复 Agent 工作区元数据与目录模型，包括默认工作区、工作区索引、工作区根目录及 session 级 cwd 目录。
- 恢复会话与工作区的绑定关系，使 Agent 实际运行的 `cwd` 由会话所属工作区决定，而不是统一使用 `process.cwd()`。
- 恢复工作区作用域的能力面，包括 workspace Skills、MCP 配置、workspace-files 目录和工作区级附加目录。
- 通过 Bun HTTP API 暴露工作区 CRUD、能力读取和工作区相关会话操作，替代旧 Electron IPC 形态。
- 在当前 Web UI 中补回最小工作区选择流程，使用户可以查看、切换并创建工作区，且新会话默认继承当前工作区。
- 保持当前 Claude Code 单模式 Web 应用形态，不恢复 Chat 模式、Electron 外壳或旧版整套复杂文件浏览器与分屏壳层。

## Capabilities

### New Capabilities
- `workspace-scoped-agent-runtime`: 定义工作区实体、默认工作区、session 级 cwd、工作区迁移与 resume 失效规则。
- `workspace-capability-surface`: 定义工作区作用域的 Skills、MCP、workspace-files、附加目录及输入引用上下文。

### Modified Capabilities
- `session-management`: 会话需要持久化工作区归属，并支持工作区迁移与历史兼容。
- `ui-layout`: 侧边栏和会话创建流程需要暴露当前工作区上下文与最小工作区选择能力。
- `web-server`: 后端需要提供工作区 CRUD 与能力查询 API，并接受工作区绑定的会话操作。

## Impact

- Affected code:
  - `apps/electron/src/main/http-router.ts`
  - `apps/electron/src/main/lib/agent-orchestrator.ts`
  - `apps/electron/src/main/lib/agent-session-manager.ts`
  - `apps/electron/src/main/lib/config-paths.ts`
  - new `apps/electron/src/main/lib/workspace-service.ts`
  - `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`
  - `apps/electron/src/renderer/components/agent/AgentView.tsx`
  - `apps/electron/src/renderer/components/ai-elements/rich-text-input.tsx`
  - `apps/electron/src/renderer/atoms/agent-atoms.ts`
  - `packages/shared/src/types/agent.ts`
- APIs:
  - new workspace-related REST endpoints under `/api/workspaces`
  - session creation / send flow regains workspace-aware semantics
- Systems:
  - local filesystem layout under `~/.proma/agent-workspaces/`
  - Claude Agent SDK plugin discovery and cwd resolution
  - workspace-scoped Skills / MCP / file reference context
