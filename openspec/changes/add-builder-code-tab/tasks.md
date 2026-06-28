## 1. 后端：工作区文件 API

- [x] 1.1 新增 `apps/app/src/main/lib/workspace-files-service.ts`，实现 `list` / `read` / `save`，仅允许保存已有文件内容
- [x] 1.2 路径解析含安全防护：拒绝空路径、`.`、任何 `..` segment、`.proma` 派生目录访问，并防止 resolved path 越出 `workspace-files/`
- [x] 1.3 `read` 返回原始文件内容、大小、大文件 warning 与内容版本；不注入预览脚本或运行时转换
- [x] 1.4 `save` 直接写入用户提交的原始文本内容；不执行 sanitizer、不调用 CMS validator、不返回 validator 诊断
- [x] 1.5 HTML 保存后刷新 CMS rendering manifest 作为派生索引；非 HTML 文件直接写盘且不更新 manifest
- [x] 1.6 保存请求支持 `baseVersion` 冲突检测，防止旧 draft 覆盖 Agent 或外部流程的新内容
- [x] 1.7 新增 `apps/app/src/main/http/routes/workspace-files.ts`，挂载到 `/api/workspaces/:workspaceId/files`：`GET /files`、`GET /files/*`、`PUT /files/*`
- [x] 1.8 后端不暴露新建、删除、重命名文件或文件夹 API
- [x] 1.9 写操作（save）接入 `assertPageBuilderEditLockForWorkspace`（`x-proma-page-builder-edit-lock` header）；只读操作（list / read）不要求锁
- [x] 1.10 路由经 `registerWorkspaceFilesRoutes` 注册到 `workspaceRoutes`，复用 `workspaceMiddleware` 与 CMS Builder Access 保护
- [x] 1.11 后端单测：list 返回树、read 返回原始内容和版本、save HTML 原文直写并更新 manifest、非 HTML 直接写、baseVersion 冲突、路径穿越与 `.proma` 拒绝、保存不存在文件不创建

## 2. 前端：Tab 容器与基础设施

- [x] 2.1 `apps/page-builder` 新增依赖 `@monaco-editor/react`、`monaco-editor`；Vite 用原生 `?worker` 导入配置 Monaco worker
- [x] 2.2 新增 `atoms/builder-code-atoms.ts`：右侧栏 active Tab + 按工作区隔离的文件树 / 已打开文件 / active 文件 / 脏状态 / 文件版本会话
- [x] 2.3 新增 `lib/workspace-files-api.ts`：封装 list / read / save，写请求注入编辑锁 header 与 baseVersion；不暴露 create/delete
- [x] 2.4 新增 `lib/code-editor-shortcuts.ts`：保存快捷键只在代码 Tab 激活、编辑器聚焦、非只读时生效
- [x] 2.5 新增 `components/builder/BuilderRightPanel.tsx`（双 Tab 容器，hidden 切换保留状态），聊天 Tab 渲染原 `AgentView`（零改动）
- [x] 2.6 修改 `pages/BuilderPage.tsx`：右侧栏改用 `<BuilderRightPanel>`，`chatContent` 透传原 AgentView 全部 props，`codeTab` 渲染 `BuilderCodeTab`

## 3. 前端：代码 Tab UI

- [x] 3.1 新增 `CodeExplorer.tsx`：自建文件树（扁平 entries → 递归树，目录优先排序），只提供浏览和打开已有文件，不提供新建/删除/重命名入口
- [x] 3.2 新增 `CodeEditorTabs.tsx`：多文件 Tab，可切换 / 关闭，脏标记圆点
- [x] 3.3 新增 `CodeEditor.tsx`：封装 Monaco（`@monaco-editor/react` + 本地 `monaco-editor` + `?worker`），按扩展名推断语言，`readOnly` 受控，`Cmd/Ctrl+S` 保存受激活/聚焦/只读状态限制
- [x] 3.4 新增 `BuilderCodeTab.tsx`：组装 Explorer + EditorTabs + Editor + 状态栏 + 保存按钮
- [x] 3.5 二进制处理：图片走 preview URL 预览，其他二进制（后端 422）显示“二进制不可编辑”提示
- [x] 3.6 大文件保护：后端 `>10MB` 拒绝（413）、`>5MB` 警告

## 4. 联动与约束

- [x] 4.1 Agent 运行时只读：`readOnly={isAgentStreaming || !editingEnabled}` 驱动 Monaco + 顶栏横幅 + 保存按钮禁用 + 保存快捷键禁用
- [x] 4.2 保存必须持有有效编辑锁；保存 409 时通知 BuilderPage 走现有编辑锁失效处理
- [x] 4.3 保存成功后刷新预览：`onSaved(previewState)` → BuilderPage `writeNextPreviewState`，复用现有 `revision` 轮询，不新建 SSE
- [x] 4.4 未保存改动保护：`beforeunload` 拦截 + 关闭 Tab 确认；切 Tab 保留编辑器状态（hidden 不卸载）
- [x] 4.5 Monaco 主题固定浅色（`vs`）；应用 dark mode 对齐留作后续增强

## 5. 验证

- [x] 5.1 后端单测：`workspace-files-service` 覆盖 list/read/save/path/version/conflict/不存在文件不创建
- [x] 5.2 前端单测：`workspace-files-api` 覆盖 list/read/save URL、method、body、编辑锁 header、baseVersion、非 2xx 抛 ApiError、客户端不暴露 create/delete
- [x] 5.3 前端单测：`code-editor-shortcuts` 覆盖保存快捷键只在代码 Tab 激活、编辑器聚焦、非只读时生效
- [x] 5.4 `bun run typecheck`（app + page-builder）
- [ ] 5.5 端到端验证（手动）：切代码 Tab → 文件树 → 编辑 index.html 保存 → 预览刷新；Agent 运行时只读打开且不能保存；图片预览与二进制提示；外部修改后旧 draft 保存冲突
- [x] 5.6 生产构建：`bun run --filter='@ai-page-builder/page-builder' build`，确认 Monaco worker 资源正确打包

## 附注

- 最新需求明确禁止新建、删除、重命名文件或文件夹，因此后端 API 和前端 API 均不暴露这些能力。
- 保存语义改为“直接保存用户提交原文”，因此 HTML 不再 sanitizer、不调用 CMS validator、不返回 validator 诊断；CMS manifest 仅作为保存后的派生索引刷新。
- Monaco 本地打包仍会增加 bundle 体积，后续可按需裁剪语言或改用动态加载优化。
