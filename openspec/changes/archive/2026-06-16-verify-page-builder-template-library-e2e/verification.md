# PageBuilder 模板库 E2E 验证记录

## 前置审计

- 日期：2026-06-15
- Change：`verify-page-builder-template-library-e2e`
- 结论：Change 6 与任务拆分文档一致，定位为归档前验证收口；不新增业务能力，不引入 Playwright test runner 或新的 E2E 框架依赖。

## 覆盖矩阵

| 范围 | 已有/计划验证 | 主要文件 |
| --- | --- | --- |
| 模板 registry 列表/详情/预览/删除 | Bun 路由测试覆盖合法模板、非法 manifest、no thumbnail、preview no-store、路径安全、删除 | `apps/app/src/main/http/routes/page-builder.test.ts` |
| standalone 另存模板 | Bun app 路由测试覆盖编辑锁、非法输入、缺失入口、CMS 标记、远程 runtime、关键资源失败 | `apps/app/src/main/http/app.test.ts` |
| CMS integrated 另存模板 | Bun CMS 集成路由测试覆盖有效 access session、静态快照、敏感信息不落盘 | `apps/app/src/main/http/routes/cms-integration.test.ts` |
| 模板实例化 | Bun 路由/服务测试覆盖 projectName、workspace/session、previewState、CMS metadata 不继承、失败回滚 | `apps/app/src/main/http/routes/page-builder.test.ts`, `apps/app/src/main/lib/page-builder-template-service.test.ts` |
| CMS production/dev bypass 边界 | Bun 路由与前端页面测试覆盖 production 阻断和 dev bypass 放行 | `apps/app/src/main/http/routes/page-builder.test.ts`, `apps/app/src/main/http/routes/cms-integration.test.ts`, `apps/page-builder/src/renderer/pages/HomePage.test.tsx` |
| 首页模板库 UI | Bun 组件/页面测试覆盖 Tabs、卡片预览、使用模板、删除模板、错误状态、历史记录不回退 | `apps/page-builder/src/renderer/components/home/*.test.tsx`, `apps/page-builder/src/renderer/pages/HomePage.test.tsx` |
| Builder 另存模板 UI | Bun 页面/组件测试覆盖入口、名称表单、编辑锁、Agent streaming、CMS 固化提示、错误反馈 | `apps/page-builder/src/renderer/pages/BuilderPage.test.tsx`, `apps/page-builder/src/renderer/components/builder/*.test.tsx` |
| 完整 standalone 浏览器闭环 | Playwright MCP 实测记录 | 本文件后续章节 |

## 已知验证策略

- 可重复边界由 Bun 测试覆盖。
- 真实浏览器链路由 Playwright MCP 验证。
- 仅修复阻断闭环或既有规格回归的问题；不扩展模板库一期范围。

## 后端与路由回归验证

- 命令：`bun test apps/app/src/main/http/routes/page-builder.test.ts apps/app/src/main/http/app.test.ts apps/app/src/main/http/routes/cms-integration.test.ts apps/app/src/main/lib/page-builder-template-service.test.ts --timeout 60000`
- 结果：通过，103 pass / 0 fail / 899 expect。
- 覆盖：模板 registry、standalone 另存模板、CMS integrated 静态快照另存、模板实例化、CMS production/dev bypass 边界、编辑锁、base path、无内置模板、无缩略图字段。

## 前端页面与组件回归验证

- 命令：`bun test apps/page-builder/src/renderer/pages/HomePage.test.tsx apps/page-builder/src/renderer/components/home/PageBuilderHomeResourceTabs.test.tsx apps/page-builder/src/renderer/components/home/PageBuilderTemplateLibrarySection.test.tsx apps/page-builder/src/renderer/components/home/PageBuilderTemplateCard.test.tsx apps/page-builder/src/renderer/components/home/PageBuilderHistorySection.test.tsx apps/page-builder/src/renderer/components/home/PageBuilderHistoryCard.test.tsx apps/page-builder/src/renderer/components/builder/SaveTemplateDialog.test.tsx apps/page-builder/src/renderer/components/builder/ProjectTitleBar.test.tsx apps/page-builder/src/renderer/pages/BuilderPage.test.tsx apps/page-builder/src/renderer/styles/page-builder.css.test.ts --timeout 60000`
- 结果：通过，123 pass / 0 fail / 603 expect。
- 覆盖：HomePage standalone/CMS/dev bypass 资源区、资源 Tabs 双面板常驻挂载、模板库 loading/empty/error/retry、iframe 卡片预览、新窗口预览、删除确认和失败反馈、使用模板前项目名称输入、preview state cache、Builder 另存模板名称表单、编辑锁、Agent streaming 阻止提交、CMS 固化提示、历史记录卡片预览/编辑/删除/锁态语义和模板/历史卡片 hover 样式。
- 修正：同步 `BuilderPage.test.tsx` 中另存模板断言，使其匹配已确认的“只填写模板名称”表单行为；未恢复描述或标签字段。

## Playwright MCP 真实浏览器验证

- 访问地址：`http://localhost:5174/`
- 验证方式：Playwright MCP 手工浏览器流程。
- 来源项目准备：从首页已有模板 `模板1` 点击“使用模板”，输入项目名称 `E2E来源项目-202606151800`，进入 Builder：`/builder/07857e60-cf78-4cc6-80e3-eec593d629bd/7a71edd1-437f-4bdd-9ead-f832c6ed7daa`。
- 另存模板：在 Builder 顶部点击“另存模板”，弹框只要求填写“模板名称”；输入 `E2E验证模板-202606151800` 后保存成功，弹框关闭。
- 首页模板库：返回首页后默认展示“模板库”，目标模板 `E2E验证模板-202606151800` 出现在列表首项，卡片内 iframe 预览可见。
- 新窗口预览：点击目标模板“预览”，新标签页打开 `http://localhost:5174/api/page-builder/templates/tpl_saved_20260615180142_9c8cd96b/preview/`，页面标题为 `智航咨询 | AI 转型战略伙伴`，静态页面内容可访问。
- 使用模板：点击目标模板“使用模板”，弹框要求输入项目名称；输入 `E2E使用模板项目-202606151800` 后进入 Builder：`/builder/d6eb2d28-e546-4582-9091-1289dd436cdc/dd5f7163-91c7-4219-9a48-a2ac14b44110`。
- Builder 验证：新 Builder 预览区直接展示模板页面，右侧聊天区为空态 `在下方输入框开始使用 Agent`，未触发 Agent 首轮消息。
- 删除模板与历史保留：返回首页删除 `E2E验证模板-202606151800` 并确认后，模板库不再显示该模板；切换到历史记录后，`E2E使用模板项目-202606151800` 仍保留在历史项目列表中。
- 已知非阻断噪音：模板库/历史记录卡片 iframe 使用 sandbox 后，iframe 内字体资源以 `origin: null` 加载，浏览器对部分字体文件输出 CORS console error；页面内容和验证链路仍可见可用，本 change 仅记录该现象，不作为阻断项处理。

## 归档前验证

- 模板库相关测试集合：`bun test apps/app/src/main/http/routes/page-builder.test.ts apps/app/src/main/http/app.test.ts apps/app/src/main/http/routes/cms-integration.test.ts apps/app/src/main/lib/page-builder-template-service.test.ts apps/page-builder/src/renderer/pages/HomePage.test.tsx apps/page-builder/src/renderer/components/home/PageBuilderHomeResourceTabs.test.tsx apps/page-builder/src/renderer/components/home/PageBuilderTemplateLibrarySection.test.tsx apps/page-builder/src/renderer/components/home/PageBuilderTemplateCard.test.tsx apps/page-builder/src/renderer/components/home/PageBuilderHistorySection.test.tsx apps/page-builder/src/renderer/components/home/PageBuilderHistoryCard.test.tsx apps/page-builder/src/renderer/components/builder/SaveTemplateDialog.test.tsx apps/page-builder/src/renderer/components/builder/ProjectTitleBar.test.tsx apps/page-builder/src/renderer/pages/BuilderPage.test.tsx apps/page-builder/src/renderer/styles/page-builder.css.test.ts --timeout 60000`，结果通过，226 pass / 0 fail / 1502 expect。
- Typecheck：`bun run --cwd apps/page-builder typecheck` 通过；`bun run --cwd apps/app typecheck` 通过。
- Diff 检查：`git diff --check` 通过。
- OpenSpec strict validate：`verify-page-builder-template-library-e2e`、`add-page-builder-template-registry`、`save-page-builder-project-as-template`、`add-page-builder-save-template-ui`、`instantiate-page-builder-template-project`、`add-page-builder-home-template-library` 均通过。
- 文档一致性：已对照任务拆分文档、需求设计文档和 active changes，确认 CMS 生产模式阻断全局 standalone 模板库 API、dev standalone bypass 放行、CMS integrated Builder 可另存静态快照模板、第一期无内置模板、无缩略图、不引入 Playwright test runner 的描述一致。
- 文档修正：同步 `docs/page-builder-template-library-requirements-and-design-2026-06-07.md` 中已滞后的描述，包括资源 Tabs 双面板保持挂载、使用模板时 `projectName` 必填、模板卡片使用 iframe 实时预览且不展示描述/标签/“我的模板”来源标识。
- 归档准备：前 5 个模板库 changes 当前任务均已完成；本 change 不执行归档命令，后续归档应由 `openspec archive` 或对应 archive skill 完成主规格更新。
