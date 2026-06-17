## Why

PageBuilder 模板库一期已经拆成 5 个独立 change 完成实现，但这些能力横跨模板 registry、当前项目另存、Builder UI、模板实例化和首页模板库 UI，仍需要一个独立收口 change 验证真实用户闭环和跨模块回归。现在做该验证可以在归档前集中发现规格冲突、边界遗漏或流程断点，避免把单点测试通过误判为模板库整体可交付。

## What Changes

- 增加模板库一期端到端验证能力，覆盖 standalone 主流程：当前项目另存模板 → 首页模板库出现 → 新窗口预览 → 使用模板创建项目 → Builder 直接展示模板预览 → 删除模板 → 历史项目仍保留。
- 补齐跨模块回归验证，覆盖 base path、CMS 集成生产模式、CMS dev standalone bypass、编辑锁、CMS 集成项目静态快照另存、无内置模板和无缩略图等边界。
- 使用现有 Bun 单元/路由/组件测试承载可重复验证，使用 Playwright MCP 或等效手工浏览器流程完成一次真实端到端验证记录。
- 如验证发现阻断模板库闭环的问题，本 change 可做最小修复；不得借机扩展模板市场、内置模板、缩略图、zip 导入、CMS 动态模板或共享权限等新业务能力。
- 不引入新的 Playwright test runner 或新的 E2E 测试基础设施。

## Capabilities

### New Capabilities

- `page-builder-template-library-e2e`: 定义 PageBuilder 模板库一期归档前必须完成的跨模块端到端验证、回归验证和文档/规格一致性要求。

### Modified Capabilities

- 无。该 change 不改变既有产品行为规格，只新增归档前验证收口要求。

## Impact

- 可能涉及现有测试文件：`apps/app/src/main/http/routes/page-builder.test.ts`、`apps/app/src/main/http/app.test.ts`、`apps/app/src/main/http/routes/cms-integration.test.ts`、`apps/page-builder/src/renderer/pages/HomePage.test.tsx`、`apps/page-builder/src/renderer/pages/BuilderPage.test.tsx`、模板库与历史记录相关组件测试。
- 可能涉及 OpenSpec 文档、任务拆分文档和归档前验证记录。
- 不新增运行时 API、数据库/文件格式迁移或生产依赖。
- 不新增 E2E 框架依赖；真实浏览器验证使用 Playwright MCP 或等效手工流程完成。
