## Why

当前 page-builder 有多条独立的 `workspace-files/index.html` 写入路径，分别在内联文字编辑、区块删除和图片替换后各自直接回写文件。这种分散写入方式无法保证 CMS rendering 的派生索引和作者态校验总是同步更新，后续一旦引入 `apply_cms_binding` 等 CMS 写入能力，就会出现 manifest 失真、校验遗漏和预览元数据滞后的风险。

## What Changes

- 新增统一的 workspace HTML mutation pipeline，收敛 page-builder 对 `workspace-files/index.html` 的写入入口。
- 在统一写入点上自动重建 `workspace-files/.proma/cms-rendering-manifest.json`，将 CMS islands 的 block 级索引从作者 HTML 中派生出来。
- 在统一写入点上执行 CMS rendering validator，为嵌套 `cms-*`、危险标签、缺失默认 slot、可选 URL 未保护等问题生成结构化 diagnostics。
- 让现有的 inline text、block deletion、image replacement 在完成 HTML 写回后通过统一服务重新计算 preview state，确保 `hasCmsRendering` / `requiresSameOrigin` 等元数据与最新 HTML 保持一致。
- 保持 preview / export 在本 change 中只读取 manifest，不再各自负责重建 manifest。

## Capabilities

### New Capabilities
- `page-builder-cms-rendering-manifest-validation`: 定义 page-builder 作者 HTML 的统一 mutation pipeline、CMS rendering manifest 重建规则、validator 诊断规则，以及写后 preview 元数据刷新要求。

### Modified Capabilities
- None.

## Impact

- Affected code:
  - `apps/app/src/main/lib/page-builder-workspace-html-service.ts`
  - `apps/app/src/main/lib/page-builder-inline-text-service.ts`
  - `apps/app/src/main/lib/page-builder-block-deletion-service.ts`
  - `apps/app/src/main/lib/page-builder-image-replacement-service.ts`
  - `packages/page-builder-cms-rendering/src/manifest/*`
  - `packages/page-builder-cms-rendering/src/validation/*`
- Affected systems:
  - page-builder 作者态 HTML 写入链路
  - workspace preview state 刷新链路
  - 后续 `apply_cms_binding` 和导出错误定位所依赖的 manifest / diagnostics 基础设施
- No breaking API changes are required for the existing inline text, block deletion, or image replacement endpoints in this change.
