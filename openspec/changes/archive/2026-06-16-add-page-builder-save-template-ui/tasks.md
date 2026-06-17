## 1. API Client

- [x] 1.1 在 `apps/app/src/renderer/lib/api.test.ts` 补充 `savePageBuilderWorkspaceAsTemplate` 测试，覆盖 POST 路径、请求体、返回值和编辑锁 header 透传。
- [x] 1.2 在 `apps/app/src/renderer/lib/api.ts` 引入 shared 另存模板请求/响应类型，并新增 `savePageBuilderWorkspaceAsTemplate(workspaceId, payload, options)`。

## 2. SaveTemplateDialog 表单

- [x] 2.1 新增 `SaveTemplateDialog` 组件测试，覆盖仅填写名称、名称必填、提交中禁用和 CMS 固化提示。
- [x] 2.2 实现 `apps/page-builder/src/renderer/components/builder/SaveTemplateDialog.tsx`，使用普通 Dialog 表单承载另存模板交互。

## 3. ProjectTitleBar 操作区

- [x] 3.1 扩展 `ProjectTitleBar` 测试，覆盖“另存模板”入口渲染、disabled 时不触发、点击时调用回调，并确认项目名编辑行为不回退。
- [x] 3.2 扩展 `ProjectTitleBar` props 和布局，新增紧凑 action 区承载“另存模板”入口，同时保持标题文本 truncate 和编辑按钮可用。

## 4. BuilderPage 集成

- [x] 4.1 扩展 `BuilderPage.test.tsx` 测试工具，模拟 `savePageBuilderWorkspaceAsTemplate` 和另存模板 UI 交互。
- [x] 4.2 补充 standalone Builder 成功另存测试，确认提交携带当前编辑锁、成功关闭弹窗并显示“首页模板库查看”提示。
- [x] 4.3 补充 CMS 集成 Builder 测试，确认通过 CMS Builder Context 加载时展示 CMS 数据固化提示，dev standalone CMS 模式不误提示。
- [x] 4.4 补充失败路径测试，覆盖后端普通错误展示、编辑锁拒绝触发现有失效处理、Agent 写入中或编辑锁缺失时不发送请求。
- [x] 4.5 在 `BuilderPage.tsx` 增加 `builderSourceMode`、另存模板弹窗状态、提交状态和错误状态，并接入 API client。
- [x] 4.6 将“另存模板”入口接入 `ProjectTitleBar`，按 `editingEnabled` 和 `isAgentStreaming` 控制可用性，并渲染 `SaveTemplateDialog`。

## 5. 验证

- [x] 5.1 运行相关前端单测：`bun test apps/app/src/renderer/lib/api.test.ts apps/page-builder/src/renderer/components/builder/SaveTemplateDialog.test.tsx apps/page-builder/src/renderer/components/builder/ProjectTitleBar.test.tsx apps/page-builder/src/renderer/pages/BuilderPage.test.tsx --timeout 30000`。
- [x] 5.2 运行类型检查：`bun run --cwd packages/shared typecheck` 和 `bun run --cwd apps/app typecheck`。
- [x] 5.3 运行 `openspec status --change add-page-builder-save-template-ui`，确认 tasks 可被 apply 阶段追踪。
