## Why

Page Builder 当前只能通过对话（Agent）或预览内联编辑间接修改 `workspace-files/`，缺少对工作区已有文件内容的直接代码级查看与编辑能力。用户无法手动查看和微调 `index.html` 及其附属 css/js/json/md 等文本文件，精细调整与快速修复效率受限。本次新增右侧「代码」Tab，但能力边界收敛为**只允许浏览和修改已有文件内容**，不提供新建、删除、重命名文件或文件夹能力。

## What Changes

- 右侧栏顶部新增「聊天 / 代码」双 Tab 切换；聊天 Tab 保留现有 `AgentView` 全部功能不变，不改主应用 `AgentView` 本身。
- 代码 Tab 采用轻量 VSCode 风格：左侧 Explorer 递归列出 `workspace-files/` 下已有文件，右侧 Monaco 编辑器支持多文件 Tab、状态栏和保存快捷键。
- **只允许打开和保存已有文本文件内容**；禁止新建文件、文件夹、删除、重命名。
- 图片文件以预览形式展示，其他二进制文件给出“二进制不可编辑”提示。
- 后端新增「工作区文件」API，挂载到 `/api/workspaces/:workspaceId/files`，仅提供 `list` / `read` / `save`：`GET /files`、`GET /files/*`、`PUT /files/*`。
- 写操作只允许保存已有文件内容，必须通过编辑锁校验与路径穿越防护；只读 list/read 不要求编辑锁。
- 保存所有文本文件时直接写入用户提交的原始内容，不做文本内容校验、不返回 validator 诊断、不改写 HTML；HTML 保存后仅刷新 CMS rendering manifest 作为派生索引，保证预览/导出尽量同步。
- Agent 运行时代码 Tab 可只读打开文件内容，但 Monaco 只读、保存按钮禁用、保存快捷键不触发保存。
- 文件读取返回内容版本；保存时携带 baseVersion，若文件已被 Agent 或外部流程修改则返回冲突，避免旧 draft 覆盖新内容。
- 保存后复用现有预览状态 `revision` 轮询自动刷新左侧预览，**不新建 SSE 文件事件通道**。
- 编辑器状态在聊天 / 代码 Tab 间切换时保留；有未保存改动时拦截关闭页面和关闭文件 Tab。

## Capabilities

### New Capabilities

- `page-builder-code-editor`: Page Builder 右侧栏代码 Tab 能力——文件树 + 多 Tab + Monaco，对当前工作区 `workspace-files/` 下已有文本文件提供浏览 / 编辑 / 保存，受编辑锁、Agent 运行时只读和文件版本冲突保护约束，保存后驱动预览刷新；并定义支撑该能力的工作区文件读取与保存 API 契约。

### Modified Capabilities

无 requirement 级变更。代码编辑器复用现有 `page-builder-edit-lock`（保存需锁、Agent 活跃即锁定）、`page-builder-live-preview`（`revision` 变化自动刷新）、`page-builder-cms-authoring-contract`（canonical contract 不变）的既有 requirement，不改变其行为契约。

## Impact

- **前端 `apps/page-builder/src/renderer/`**：新增 `components/builder/BuilderRightPanel.tsx`、`BuilderCodeTab.tsx`、`CodeExplorer.tsx`、`CodeEditorTabs.tsx`、`CodeEditor.tsx`、`atoms/builder-code-atoms.ts`、`lib/workspace-files-api.ts`、`lib/code-editor-shortcuts.ts`；修改 `pages/BuilderPage.tsx`（右侧栏改用 `BuilderRightPanel`、Agent 只读联动、保存刷新预览）、`package.json`（新增 Monaco 依赖）。
- **后端 `apps/app/src/main/`**：新增 `http/routes/workspace-files.ts`、`lib/workspace-files-service.ts`（list / read / save，save 仅保存已有文件）；修改 `http/routes/workspaces.ts`（挂载新路由）。
- **依赖**：新增 `@monaco-editor/react`、`monaco-editor`（page-builder workspace）。
- **构建体积**：Monaco 本地打包会增加 bundle 体积；当前通过 Vite `?worker` 本地打包 worker，后续可继续按需裁剪/懒加载优化。
- **不改**：主应用 `AgentView`、现有编辑锁服务、预览轮询机制、CMS rendering 包边界。
