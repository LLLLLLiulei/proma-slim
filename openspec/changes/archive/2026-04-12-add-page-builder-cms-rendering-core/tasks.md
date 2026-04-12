## 1. Package scaffold

- [x] 1.1 新增 `packages/page-builder-cms-rendering/package.json`、`tsconfig.json` 与 `src/index.ts`，建立核心包基础结构
- [x] 1.2 更新根 `package.json` 与 `pnpm-workspace.yaml`，将 `packages/page-builder-cms-rendering` 纳入 workspace
- [x] 1.3 为新核心包声明 `vue`、`@vue/compiler-dom`、`@vue/server-renderer` 与 `linkedom` 等所需依赖

## 2. Runtime and viewmodel

- [x] 2.1 实现 `runtime/cms-runtime-client.ts`，使 `CmsRuntimeClient` 对齐 `@proma/shared` 的 CMS query/result 契约
- [x] 2.2 实现 `runtime/browser-cms-client.ts`，基于生产侧 CMS 代理路由构建浏览器端 client
- [x] 2.3 实现 `viewmodel/catalog.ts` 与 `viewmodel/content.ts`，补齐稳定 ViewModel 字段并保留 catalog `children`
- [x] 2.4 在核心包中定义 `CmsSlotError`、`CmsSlotScope<T>` 与强类型的 `CMS_RUNTIME_CLIENT_KEY`

## 3. Components and template utilities

- [x] 3.1 实现 `components/helpers.ts`，统一处理 prop/query 归一化，并显式保留 `pageIndex` 的 0-based 语义
- [x] 3.2 实现通用 `components/create-cms-resource-component.ts`，复用 catalog/content 的取数、loading、empty 与 error 状态处理
- [x] 3.3 实现 `components/cms-catalog.ts`，在组件层处理 `level`、`parentId` 与 `take` 语义
- [x] 3.4 实现 `components/cms-content.ts`，对归一化 content 结果映射稳定 ViewModel 并输出统一 slot scope
- [x] 3.5 实现 `template/compile-island-template.ts`，提供共享作者模板编译入口
- [x] 3.6 实现 `template/scan-cms-islands.ts`，统一扫描 `cms-catalog` / `cms-content` 节点并返回可复用扫描结果

## 4. Verification

- [x] 4.1 为 runtime 与 viewmodel 增加单元测试，覆盖 shared contract 对齐、catalog children 与 `pageIndex=0` 语义
- [x] 4.2 为 `cms-catalog` / `cms-content` 增加组件测试，覆盖默认态、空态、错误态与统一 slot scope 合同
- [x] 4.3 为 `compile-island-template` 与 `scan-cms-islands` 增加测试，验证作者模板编译与 CMS 节点扫描行为
- [x] 4.4 运行核心包相关测试与 typecheck，确认共享包可被后续 preview/export chunk 复用
