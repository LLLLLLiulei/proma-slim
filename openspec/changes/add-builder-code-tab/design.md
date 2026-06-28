## Context

Page Builder 构建页右侧栏目前直接渲染主应用共享组件 `AgentView`，对 `workspace-files/` 的修改主要通过 Agent 对话生成或预览内联编辑完成。用户需要一种低成本方式直接查看和微调已有文件内容，但最新需求明确要求避免把右侧栏扩展成完整 IDE：只能修改已有文件内容，不能新建、删除、重命名文件或文件夹；Agent 运行时只能只读查看，不能保存。

现有预览刷新基于 `revision` 轮询；编辑互斥由 page-builder 编辑锁控制；CMS rendering manifest 是 `workspace-files/.proma/` 下的派生元数据。代码 Tab 应复用这些机制，不新增文件事件服务，也不扩大文件系统操作面。

## Goals / Non-Goals

**Goals:**

- 右侧栏顶部「聊天 / 代码」双 Tab；代码 Tab 提供文件树 + 多 Tab + Monaco 编辑器。
- 支持浏览 `workspace-files/` 下已有文件，编辑并保存已有文本文件内容。
- 保存时直接写入用户提交的原始文本内容，不做 validator 校验，不静默改写 HTML。
- HTML 保存后刷新 CMS rendering manifest 作为派生索引，但不阻塞于 CMS validator，也不返回 validator 诊断。
- 复用现有编辑锁、预览 `revision` 轮询，不引入新运行时服务或 SSE 通道。
- Agent 运行时代码 Tab 可打开文件查看，但必须只读且禁止保存。
- 保存时使用文件内容版本检测外部修改，避免覆盖 Agent 或其他流程刚写入的内容。
- 状态栏支持切换 Monaco 编辑器浅色 / 深色主题，偏好保存在浏览器本地。
- 不改主应用 `AgentView`。

**Non-Goals:**

- 不做新建文件、新建文件夹、删除、重命名。
- 不做终端、扩展生态、命令面板、完整 IDE。
- 不编辑二进制文件（图片预览、其他二进制给不可编辑提示）。
- 不新建 SSE 文件事件通道。
- 不集成 LSP / ESLint / Prettier。
- 不改 CMS authoring contract 内容。

## Decisions

### Decision 1：编辑器内核选 Monaco，本地打包 worker

Monaco 即 VSCode 编辑器内核，原生提供语法高亮、多光标、查找、迷你地图等能力，最贴近“代码编辑”诉求。生产为 Docker 离线环境，不能依赖 CDN loader，因此通过 `@monaco-editor/react` + `monaco-editor` + Vite `?worker` 本地打包。

### Decision 2：双 Tab 容器在 page-builder 侧包一层，不改 `AgentView`

新增 `BuilderRightPanel` 作为右侧栏容器，聊天 Tab 内仍渲染原 `AgentView`（零改动），代码 Tab 渲染 `BuilderCodeTab`。Tab 按钮放在 `ProjectTitleBar`。聊天 / 代码内容用 `hidden` 切换而不是卸载，保留编辑器打开文件和未保存状态。

### Decision 3：后端新增独立 `workspace-files` 路由，但只暴露 list/read/save

代码编辑是“已有文件整文件读取与保存”，独立路由更清晰：

- `GET /api/workspaces/:workspaceId/files`：列出 `workspace-files/` 文件树。
- `GET /api/workspaces/:workspaceId/files/*`：读取已有文件原始内容。
- `PUT /api/workspaces/:workspaceId/files/*`：保存已有文件内容。

不提供 `POST` / `DELETE` / rename 接口。不能只隐藏前端入口，否则后端能力仍可被调用，违背“禁止新建/删除/重命名”的需求边界。

### Decision 4：保存直接写入原始内容，不做文本内容校验

保存所有文本文件时直接写入客户端提交的 `content`。HTML 不再走 sanitizer，也不调用 CMS validator，因此不会出现“用户保存的 HTML 被后端静默改写”或“保存后返回校验 warning”的行为。

HTML 保存后仍扫描并写入 CMS rendering manifest。这是派生索引刷新，不属于文本内容校验；它不改写 HTML 源文件，目的是让 CMS 预览/静态导出尽量与最新 HTML 同步。

### Decision 5：Agent 运行时只读复用编辑锁语义，前端再做显式短路

现有 `page-builder-edit-lock` 已规定 Agent 活跃时项目锁定。代码 Tab 据此驱动：Agent 活跃或编辑锁不可用时，Monaco `readOnly`、保存按钮 disabled、保存快捷键不触发保存。保存请求仍必须携带有效编辑锁，后端作为最终保护。

### Decision 6：保存使用文件内容版本避免覆盖外部更新

读取文件时返回内容 hash 版本；保存时客户端携带读取时的 `baseVersion`。后端保存前重新计算当前文件版本，若不匹配则返回 409 冲突，提示用户重新打开后再保存。这避免用户在 Agent 修改文件后，用旧 draft 覆盖 Agent 结果。

### Decision 7：预览刷新复用 `revision` 轮询

保存成功后返回最新 `previewState`，前端调用 `writeNextPreviewState()` 立即驱动左侧预览刷新；后续仍由既有轮询兜底。不新建 SSE 文件事件通道。

### Decision 8：路径安全和派生目录保护在服务层统一处理

`list` / `read` / `save` 均限制在 `workspace-files/` 下。路径解析拒绝空路径、`.`、任何 `..` segment、`.proma` 派生目录，并防止最终 resolved path 越出根目录。路由层对 URL 路径段做 decode，支持空格/中文文件名。

### Decision 9：主题切换只作用于 Monaco 编辑区

代码 Tab 底部状态栏提供浅色 / 深色主题切换开关。该偏好仅传给 Monaco `theme`，不切换文件树、文件 Tab、聊天区或 Page Builder 全局主题；Agent 运行时只读状态也不禁用主题切换，因为主题切换不写文件、不需要编辑锁。偏好保存到浏览器 `localStorage`，默认浅色，非法或缺失值回退浅色。

## Risks / Trade-offs

- **[手动编辑可能写出无效 HTML/CMS 标签]** → 最新需求明确要求直接保存且不校验；系统不阻止，后续可通过 Agent 或用户再次修改修复。
- **[HTML 不 sanitizer 可能保留 runtime-only 属性]** → 这是“直接保存原文”的必然结果；代码 Tab 不应静默改写用户输入。
- **[CMS manifest 可能只代表最近保存的 HTML 文件]** → 当前 Page Builder 主要以 `index.html` 为入口；多 HTML 文件 CMS manifest 聚合不在本次范围。
- **[用户与 Agent 并发写同一文件]** → 编辑锁使 Agent 运行时只读；文件版本冲突检测防止旧内容覆盖新内容。
- **[Monaco bundle 体积增加]** → 当前可接受；后续可继续做动态加载和语言裁剪。
- **[深色编辑区与浅色外层 UI 存在视觉对比]** → 本次需求明确只切换 Monaco 编辑器主题，不联动 Page Builder 外层 UI。
- **[大文件卡顿]** → 后端 `>10MB` 拒绝加载，`>5MB` 前端提示大文件。

## Migration Plan

纯新增/收敛功能，无数据迁移，不改变现有 `workspace-files/` 结构。回滚：`BuilderPage` 右侧栏改回直接渲染 `AgentView`；移除 `workspace-files` 路由挂载；卸载 Monaco 依赖。

## Open Questions

- 移动端是否需要完整代码编辑能力？当前主要面向桌面布局，移动端文件选择体验可后续单独优化。
