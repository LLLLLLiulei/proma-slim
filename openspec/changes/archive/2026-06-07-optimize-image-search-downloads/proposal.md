## Why

当前图片搜索 MCP 下载远程图片后会原样导入 workspace `assets/`，较大的图片会直接占用更多磁盘空间和页面加载带宽；同时现有 15MB 绝对下载上限会让可压缩的大图直接失败，不利于从 Pexels、Pixabay、Unsplash 等平台导入高质量素材。

本变更在保持图片分辨率和清晰度优先的前提下，为超过 1MB 的非动图图片增加自动压缩优化，并移除固定 15MB 体积拒绝限制。

## What Changes

- `download_images` 下载图片后，如果图片体积超过 1MB，系统会尝试用图片处理库压缩优化后再写入 workspace `assets/`。
- 压缩优化默认不缩小分辨率，不要求压缩结果必须低于 1MB；系统应选择体积更小且格式可用的结果，压缩无收益或失败时回退写入原图。
- GIF/动图不做压缩优化，保持原始内容导入，避免破坏动画。
- 去除当前下载导入流程中的 15MB 绝对图片体积上限，不再因为图片超过 15MB 直接拒绝导入。
- 保留现有 URL 安全、重定向安全、content-type、magic number、SVG 拒绝、最小尺寸、workspace assets 写入边界等校验。
- 增加图片优化过程日志，记录是否触发优化、跳过原因、原始体积、优化后体积、输出格式、质量参数和失败回退信息。
- 增加相关测试覆盖，包括大图优化、小图跳过、GIF/动图跳过、移除 15MB 拒绝和压缩失败回退。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-image-search-runtime`: 修改 `download_images` 图片导入要求，增加超过 1MB 的非动图图片自动压缩优化语义，移除单张图片 15MB 绝对下载上限，并明确压缩不缩小分辨率、不强制压到 1MB 以下、GIF/动图不压缩。

## Impact

- 影响后端图片搜索导入模块：`apps/app/src/main/lib/image-search/asset-importer.ts` 及可能新增的图片优化 helper 模块。
- 影响图片搜索 runtime 常量和配置：需要新增 1MB 优化阈值、质量档位、输出格式等内部配置；新增环境变量时不得使用 `PROMA` 前缀。
- 影响依赖：预计引入 `sharp` 用于服务端图片压缩和格式转换，并更新 lockfile。
- 影响测试：需要更新 `image-search-sdk-tools.test.ts`，覆盖优化行为和移除体积上限。
- 影响日志：图片搜索 MCP backend 诊断日志将新增图片优化阶段日志。
