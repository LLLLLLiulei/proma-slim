## 1. 运行时配置与解析

- [x] 1.1 定义 `PageBuilderToolbarItemKey`、支持的 key 集合和隐藏项解析 helper，确保空值、重复项和未知 key 处理符合 spec。
- [x] 1.2 扩展渲染端运行时配置类型，提供统一读取 `hiddenToolbarItems` 的方法，组件不得直接解析原始环境变量字符串。
- [x] 1.3 扩展 Page Builder 生产静态网关，将 `AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS` 规范化后注入 `window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__`。
- [x] 1.4 如本地 Vite 开发环境需要读取该配置，使用同一解析逻辑在启动期注入前端可读配置，保持与生产解析结果一致。
- [x] 1.5 补充运行时配置解析和静态网关注入测试，覆盖默认全展示、逗号分隔、空项、重复项、未知 key 和 HTML 注入安全处理。

## 2. 预览区顶部菜单栏调整

- [x] 2.1 扩展 `PreviewPane` props，使其接收工具栏隐藏配置以及 `另存模板` 的点击处理、禁用状态和提示文案。
- [x] 2.2 将 `选择`、`导出`、`刷新`、`另存模板`、`新窗口打开` 渲染为图标加中文文字按钮，并按隐藏配置逐项移除。
- [x] 2.3 保留 `PC / Mobile` 设备切换组，并实现 `pcPreview`、`mobilePreview` 部分或全部隐藏时的默认模式与回退逻辑。
- [x] 2.4 将 `另存模板` 入口从右侧标题栏迁移到预览工具栏，复用现有 `SaveTemplateDialog`、编辑锁和禁用条件。
- [x] 2.5 补充预览工具栏组件测试，覆盖默认按钮展示、图标加文字、隐藏指定按钮、设备切换回退和另存模板入口触发。

## 3. 右侧栏顶部菜单栏调整

- [x] 3.1 调整 `ProjectTitleBar` 或拆分出右侧栏顶部菜单栏组件，使左侧渲染 `对话 / 代码` Tab，右侧渲染项目名称与编辑入口。
- [x] 3.2 从右侧栏顶部菜单栏移除 `另存模板` 入口，避免与预览工具栏重复展示。
- [x] 3.3 实现 `chatTab`、`codeTab`、`projectName` 的隐藏渲染规则，项目名称隐藏时同步隐藏编辑按钮和编辑输入入口。
- [x] 3.4 实现右侧 active tab 回退：只剩 code 时回退 code，只剩 chat 时回退 chat，两个 Tab 都隐藏时不渲染 Tab 组且内容回退 chat。
- [x] 3.5 当 `chatTab`、`codeTab`、`projectName` 均隐藏时，不渲染空白右侧顶部菜单栏。
- [x] 3.6 补充右侧栏测试，覆盖 Tab 位置、项目名称位置、隐藏项目名称、Tab 隐藏回退、双 Tab 隐藏回退和空标题栏不渲染。

## 4. 页面集成与行为保持

- [x] 4.1 在 `BuilderPage` 中读取统一隐藏配置，并向 `PreviewPane` 与右侧栏顶部组件传递必要 props。
- [x] 4.2 确认隐藏 UI 不改变导出、刷新、新窗口打开、区块选择、另存模板和代码 Tab 的原有 handler 与业务语义。
- [x] 4.3 确认聊天区与代码区仍保持始终挂载或等价的状态保留机制，Tab 位置变化不得重置已打开文件或未保存改动。
- [x] 4.4 检查响应式布局，确保预览工具栏在窄屏下可换行或收敛，不遮挡预览内容和右侧栏内容。

## 5. 验证

- [x] 5.1 运行与本次变更相关的单元测试：运行时配置、生产静态网关、`PreviewPane`、右侧栏顶部菜单栏和 `BuilderPage` 集成测试。
- [x] 5.2 运行 `bun run typecheck`，确保类型与严格 TypeScript 配置通过。
- [x] 5.3 手动检查默认配置下 Builder 页面：预览工具栏完整展示，右侧栏左侧为 `对话 / 代码`，右侧为项目名称。
- [x] 5.4 手动检查配置 `AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS=export,saveTemplate,projectName` 后对应 UI 隐藏且页面仍可正常渲染。
- [x] 5.5 运行 `openspec validate refine-page-builder-workbench-toolbar-layout --strict`。
