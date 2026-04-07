## Why

当前 `page-builder` 虽然已经能把专题页稳定写入工作区 `workspace-files/` 并在 Builder 中实时预览，但用户还无法直接拿到一份可脱离 Proma、解压后即可打开的静态交付包。仅复制现有工作区文件并不能保证离线可用，尤其当页面引用了 CMS 或其他远程资源时，导出结果仍会依赖在线环境，因此需要补齐一个面向交付场景的离线静态导出能力。

## What Changes

- 为 `page-builder` 新增“导出静态包”能力，使用户可以从当前项目生成一份可离线打开的专题页压缩包，而不是只能依赖 Proma 内部预览。
- 新增离线导出构建流程：以当前工作区 `workspace-files/` 为源，复制页面产物到临时 staging 目录，收集并本地化 HTML/CSS 中静态可分析到的远程资源，再生成最终 zip 包。
- 为导出流程新增结构化导出结果报告，记录已本地化资源、保留外链、下载失败项与离线完整性告警；其中附件类链接下载失败时允许继续导出，但必须在 report 中明确告警。
- 在 Builder 预览面板中提供项目级导出入口与导出中的状态反馈，使用户可以直接从当前预览上下文触发导出，而不必离开 builder 工作台。

## Capabilities

### New Capabilities
- `page-builder-offline-static-export`: 定义 page-builder 如何从 `workspace-files/` 生成可离线打开的静态导出包，包括导出任务、静态资源本地化、导出结果报告以及失败边界。

### Modified Capabilities
- `page-builder-app`: 调整 Builder 左侧预览面板的项目级控制项要求，使其除现有预览操作外还支持触发静态包导出并反馈导出状态。

## Impact

- Affected code:
  - `apps/page-builder/src/renderer/pages/BuilderPage.tsx`
  - `apps/page-builder/src/renderer/components/builder/PreviewPane.tsx`
  - `apps/app/src/renderer/lib/api.ts`
  - `apps/app/src/main/http/routes/workspaces.ts`
  - new page-builder static export service under `apps/app/src/main/lib/`
- Affected systems:
  - page-builder workspace preview/output model based on `workspace-files/`
  - CMS asset fetching / remote asset download pipeline
  - temporary export staging, package generation, and download delivery
- Dependencies / runtime impact:
  - 可能需要新增压缩打包能力与临时文件清理逻辑
  - 需要为远程资源抓取补充大小、数量、超时与目标地址限制
