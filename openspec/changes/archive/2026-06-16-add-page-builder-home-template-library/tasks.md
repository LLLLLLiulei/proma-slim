## 1. 契约与测试准备

- [x] 1.1 在 `apps/app/src/renderer/lib/api.test.ts` 补充模板库 API client 测试，覆盖列表、详情、使用、删除和 public base path 重写。
- [x] 1.2 在 `HomePage.test.tsx` 补充 standalone 首页资源 Tabs 测试，验证默认展示模板库、CMS 生产模式隐藏、dev bypass 展示。
- [x] 1.3 补充使用模板跳转测试，验证先输入项目名称、调用模板 use API、当前窗口进入 Builder、写入 preview state cache、不写 bootstrap payload。
- [x] 1.4 补充模板库组件或 hook 测试，覆盖 loading、empty、error、retry、预览新窗口打开、使用 pending 防重复提交。
- [x] 1.5 补充删除模板测试，覆盖二次确认、删除成功更新列表、删除失败不误移除卡片。
- [x] 1.6 回归历史记录 Tab 测试，确认切换到历史记录后现有预览、编辑、删除行为不回退。

## 2. API Client 与模板库状态

- [x] 2.1 在 `apps/app/src/renderer/lib/api.ts` 引入模板列表、详情、使用响应等 shared 类型。
- [x] 2.2 实现 `listPageBuilderTemplates()`，请求 `/api/page-builder/templates`。
- [x] 2.3 实现 `getPageBuilderTemplate(templateId)`，请求 `/api/page-builder/templates/:templateId`。
- [x] 2.4 实现 `usePageBuilderTemplate(templateId, { projectName })`，POST `/api/page-builder/templates/:templateId/use`。
- [x] 2.5 实现 `deletePageBuilderTemplate(templateId)`，DELETE `/api/page-builder/templates/:templateId`。
- [x] 2.6 新增 `usePageBuilderTemplates` hook，管理模板列表、加载、错误、刷新、使用模板 pending 和删除模板状态。

## 3. 首页模板库组件

- [x] 3.1 新增 `PageBuilderTemplateCard`，展示名称、iframe 预览区域、预览/使用/删除按钮，不展示描述和标签。
- [x] 3.2 新增 `PageBuilderTemplateLibrarySection`，接入 `usePageBuilderTemplates` 并渲染 loading、empty、error、retry 和模板网格。
- [x] 3.3 在模板库 section 中接入 `openUrlInNewWindow(template.previewUrl)`，确保模板卡片内展示 iframe 预览且预览按钮新窗口打开。
- [x] 3.4 在模板库 section 中接入删除确认 `AlertDialog`，成功后刷新或本地移除模板，失败展示明确反馈。
- [x] 3.5 新增 `PageBuilderHomeResourceTabs`，默认选中“模板库”，同时挂载模板库和历史记录两个 Tab 内容，并用 `hidden` 切换可见区域。

## 4. 使用模板跳转集成

- [x] 4.1 在模板库使用动作中先弹框输入项目名称，再调用 `api.usePageBuilderTemplate(template.id, { projectName })`，并在请求期间禁用使用入口防止重复创建。
- [x] 4.2 使用模板成功后调用 `clearBootstrapPayload(window.sessionStorage, session.id)`，确保不会继承或写入 bootstrap prompt。
- [x] 4.3 使用模板成功后调用 `writeWorkspacePreviewState(window.sessionStorage, workspace.id, previewState)`。
- [x] 4.4 使用 `buildBuilderPath(workspace.id, session.id, getPageBuilderPublicBasePath())` 在当前窗口跳转 Builder。
- [x] 4.5 使用模板失败时恢复按钮状态，展示错误反馈，不导航，不写 bootstrap payload 或 preview state cache。

## 5. HomePage 接入与历史记录回归

- [x] 5.1 修改 `HomePage` standalone 底部区域，将直接挂载 `PageBuilderHistorySection` 替换为 `PageBuilderHomeResourceTabs`。
- [x] 5.2 保持 `integrationGate` 逻辑：CMS 集成生产模式不挂载资源 Tabs，dev standalone bypass 按 standalone 渲染。
- [x] 5.3 保持首页 prompt 创建项目流程不变，继续写 bootstrap payload 并进入 Builder。
- [x] 5.4 保持 `PageBuilderHistorySection` 和 `usePageBuilderHistory` 现有业务逻辑不变，仅作为常驻 Tab 内容复用。

## 6. 验证与收尾

- [x] 6.1 运行 `bun test apps/app/src/renderer/lib/api.test.ts apps/page-builder/src/renderer/pages/HomePage.test.tsx --timeout 30000`。
- [x] 6.2 运行新增模板库组件/hook测试和现有 `PageBuilderHistorySection` 相关测试。
- [x] 6.3 运行 `bun run --cwd apps/app typecheck` 和 `bun run --cwd apps/page-builder typecheck`。
- [x] 6.4 运行 `openspec status --change add-page-builder-home-template-library`，确认 tasks 可跟踪并可进入 apply 阶段。
