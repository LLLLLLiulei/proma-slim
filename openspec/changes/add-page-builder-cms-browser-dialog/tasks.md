## 1. Shared Contracts And Dependencies

- [x] 1.1 在 `packages/shared` 中新增 page-builder CMS 浏览所需的 query / response 类型，并导出给 main 与 renderer 共用
- [x] 1.2 在 `apps/page-builder/package.json` 中加入 `@radix-ui/react-dialog`、`@radix-ui/react-tabs` 与 `@rc-component/tree` 依赖
- [x] 1.3 在共享 renderer UI 层新增可复用的 `dialog` 与 `tabs` primitives，供 `page-builder` 使用

## 2. Main-Side CMS Browse Routes

- [x] 2.1 在 `apps/app/src/main/http/routes/page-builder.ts` 中新增 CMS 栏目列表读取接口，并复用现有 `CmsGateway`
- [x] 2.2 在 `apps/app/src/main/http/routes/page-builder.ts` 中新增 CMS 内容列表读取接口，并复用现有 CMS 配置解析与错误翻译
- [x] 2.3 为新增 page-builder CMS 路由补充 main 侧测试，覆盖成功、配置缺失和上游失败场景

## 3. Renderer CMS Browser UI

- [x] 3.1 在 `apps/app/src/renderer/lib/api.ts` 中新增 page-builder CMS 栏目与内容列表 API client 方法
- [x] 3.2 在 `apps/page-builder/src/renderer/components/` 中实现 `CmsBrowserDialog`，包含只读双页签、打开关闭、加载态、空态和错误态
- [x] 3.3 在 `apps/page-builder/src/renderer/components/` 中实现 `CmsCatalogTree`，支持共享当前栏目、展开状态和默认栏目初始化
- [x] 3.4 在 `apps/page-builder/src/renderer/components/` 中实现 `CmsContentList`，展示标题、摘要、内容形状和素材计数摘要
- [x] 3.5 抽离 `useCmsBrowserState` 或等价状态管理逻辑，完成按需加载、会话内缓存和栏目切换后的内容加载

## 4. Builder Integration And Verification

- [x] 4.1 更新 `apps/page-builder/src/renderer/pages/BuilderPage.tsx`，在 composer action 区域新增“浏览 CMS”按钮并接入弹框开关状态
- [x] 4.2 确认 CMS 浏览弹框与现有页面区块选择模式彼此独立，不在打开、关闭或切换页签时触发选区写入逻辑
- [x] 4.3 为 `BuilderPage` 和 CMS 浏览组件补充 renderer 测试，覆盖入口展示、弹框切换、栏目选择、内容加载和错误态
