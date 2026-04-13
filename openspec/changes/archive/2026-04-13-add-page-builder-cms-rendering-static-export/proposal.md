## Why

当前 `page-builder` 已经具备离线静态导出、远程资源本地化和共享的 CMS rendering core / preview 集成，但 CMS islands 仍未真正接入正式导出链路。没有这一层集成，作者写入的 `cms-catalog` / `cms-content` 只能在预览中动态取数，导出结果仍保留未固化的 `cms-*` 标签或缺失真实 CMS 内容，也无法保证 SSR 生成的新资源 URL 继续被现有本地化流程处理。

## What Changes

- 新增 `page-builder` CMS rendering static export capability，定义导出任务如何为 CMS islands 创建任务级 server runtime、预取并复用查询结果、逐 island 执行 SSR 并将结果写回 staging HTML。
- 将 CMS islands SSR 正式接入 `page-builder-static-export-service`，并明确其执行顺序必须位于资源本地化之前，避免 SSR 生成的图片、链接和 `srcset` 资源遗漏本地化。
- 将 CMS island 查询失败或 SSR 失败提升为导出期可读且结构化的失败，而不是静默导出空内容或未替换的占位结果。
- 在共享包中补充服务端导出所需的 runtime/SSR 支撑模块，但保持 `CmsGateway` 依赖通过 app 层适配注入，而不是直接让共享包反向依赖 `apps/app`。

## Capabilities

### New Capabilities
- `page-builder-cms-rendering-static-export`: 定义 page-builder 静态导出如何为 CMS islands 进行任务级取数、缓存复用、逐 island SSR 和失败上浮。

### Modified Capabilities
- `page-builder-offline-static-export`: 扩展离线导出 contract，要求 CMS islands 在资源本地化前完成静态化，并将 CMS island 渲染失败纳入导出失败与报告语义。

## Impact

- Affected code: `packages/page-builder-cms-rendering/src/runtime/*`, `packages/page-builder-cms-rendering/src/ssr/*`, `apps/app/src/main/lib/page-builder-static-export-service.ts`, `packages/shared/src/types/page-builder-static-export.ts`
- Affected APIs: offline static export report / failure payload, export pipeline ordering contract
- Dependencies: existing `page-builder-cms-rendering` core package, `CmsGateway` app-layer adapter, current offline resource localization pipeline
