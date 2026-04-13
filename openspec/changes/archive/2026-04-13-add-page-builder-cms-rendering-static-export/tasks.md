## 1. Server runtime and request-scoped cache

- [x] 1.1 新增 `packages/page-builder-cms-rendering/src/runtime/server-cms-client.ts`，通过 app 层注入的 CMS adapter 为导出任务创建服务端 runtime client
- [x] 1.2 新增 `prefetch-cache.ts` 与 `cache-key.ts`，实现基于 runtime transport query 的任务级缓存复用，并明确跨任务不共享缓存
- [x] 1.3 为服务端 runtime 增加测试，覆盖同任务重复查询复用、不同查询不串数据和跨任务缓存隔离

## 2. CMS island SSR integration

- [x] 2.1 新增 `packages/page-builder-cms-rendering/src/ssr/prefetch-cms-islands.ts`、`render-cms-islands.ts` 与 `island-render-errors.ts`，复用共享扫描/模板/组件能力完成 islands 预取与逐 island SSR
- [x] 2.2 在 `apps/app/src/main/lib/page-builder-static-export-service.ts` 中插入“CMS islands SSR -> 资源本地化”的固定顺序，并保持现有导出 phase 不变
- [x] 2.3 扩展 `packages/shared/src/types/page-builder-static-export.ts` 的 failure/report typing，使 CMS island query 或 SSR 失败能以最小结构化信息上浮并阻断导出

## 3. Verification

- [x] 3.1 为 shared package 增加单元测试，覆盖多个 islands、重复查询去重、空结果、query failure 和模板/SSR failure 场景
- [x] 3.2 为 `page-builder-static-export-service.ts` 增加集成测试，验证 SSR 生成的新图片/链接 URL 会在后续资源本地化中被命中
- [x] 3.3 运行本 chunk 相关测试与必要的 typecheck，确认普通页面导出路径与 CMS islands 导出路径都稳定
