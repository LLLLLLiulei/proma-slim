## 1. Preview assets and injector

- [x] 1.1 新增 `packages/page-builder-cms-rendering/src/preview/detect-cms-rendering-usage.ts`，基于 DOM 与 `scan-cms-islands()` 识别顶层 CMS islands
- [x] 1.2 实现 `cms-rendering-preview-injector.ts`，注入 runtime config、本地 Vue 资产和 CMS rendering preview bootstrap，并保证重复注入幂等
- [x] 1.3 实现 `cms-rendering-preview-bootstrap.ts` 的浏览器端 islands 挂载逻辑，复用核心包组件、browser client 与模板编译能力
- [x] 1.4 在 `apps/app/src/main/http/routes/page-builder.ts` 中暴露 CMS rendering preview 资产与本地 Vue 运行时资产路由，并补齐版本化读取逻辑

## 2. Preview pipeline and renderer state

- [x] 2.1 在 `apps/app/src/main/lib/workspace-preview-service.ts` 中串联“CMS 资源 URL 重写 -> CMS rendering 注入 -> bridge 注入”的稳定顺序
- [x] 2.2 扩展主进程与 renderer 共用的 `WorkspacePreviewState` contract，增加 `hasCmsRendering` 与 `requiresSameOrigin`
- [x] 2.3 更新 `apps/page-builder/src/renderer/lib/preview-state.ts`、`preview-state-cache.ts` 与 `BuilderPage.tsx`，使新的 preview 元数据参与轮询、缓存和透传
- [x] 2.4 更新 `apps/page-builder/src/renderer/components/builder/PreviewPane.tsx`，基于显式 metadata 动态控制 iframe sandbox

## 3. Bridge readiness coordination

- [x] 3.1 更新 `apps/app/src/main/lib/page-builder-preview-bridge.ts` 和 `apps/app/resources/page-builder/page-builder-preview-bridge.js`，使 bridge 在普通页面立即初始化、在 CMS 页面等待 `proma:cms-rendering-ready`
- [x] 3.2 让 preview bootstrap 在单个 island 挂载失败时也能正常递减 ready 计数并最终派发 ready 事件
- [x] 3.3 确认 bridge 继续基于稳定区块容器进行选区识别，而不是依赖被替换掉的 `cms-*` 标签

## 4. Verification

- [x] 4.1 为 usage detection、preview injector 与 asset routes 增加单元测试，覆盖有 CMS、无 CMS、注释文本误判与重复注入场景
- [x] 4.2 为 `workspace-preview-service.ts`、preview state 流和 `PreviewPane.tsx` 增加测试，覆盖新的 CMS metadata 与 `allow-same-origin` 行为
- [x] 4.3 为 preview bridge 增加时序测试，覆盖普通页面立即初始化与 CMS 页面等待 ready 的两条路径
- [x] 4.4 运行 Chunk 2 相关测试与必要的 typecheck，确认普通页面预览与 CMS 页面预览都可稳定工作
