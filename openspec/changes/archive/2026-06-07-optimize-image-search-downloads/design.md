## Context

`image_search` runtime 的 `download_images` 当前在 `asset-importer.ts` 中完成远程图片下载、URL 安全校验、content-type 校验、magic number 校验、尺寸解析和 workspace `assets/` 写入。现有实现通过 `MAX_IMAGE_BYTES = 15 * 1024 * 1024` 对 `content-length` 和实际 buffer 体积做硬拒绝，这会让部分高质量但可压缩的大图无法导入。

本变更要求在不降低分辨率的前提下优化超过 1MB 的非动图图片体积；优化失败或未达到 1MB 以下也不应阻断导入。GIF/动图需要保持原样，避免破坏动画。

## Goals / Non-Goals

**Goals:**

- 去除 `download_images` 当前 15MB 绝对下载上限，不再仅因为远程图片体积超过 15MB 拒绝导入。
- 对超过 1MB 的非动图图片执行压缩优化，优先降低静态图片文件体积。
- 压缩优化不得缩小分辨率，不要求结果必须低于 1MB。
- GIF 和可识别动图不压缩，保持原始内容导入。
- 压缩失败、压缩无收益或输出不可用时回退原图，不让单张图片导入因优化失败而失败。
- 图片优化过程写入现有 image_search backend 诊断日志。
- 增加测试覆盖，避免重新引入硬体积拒绝或缩放分辨率。

**Non-Goals:**

- 不新增前端配置界面。
- 不实现强制压到指定体积以下的算法。
- 不通过 resize、裁剪或降采样降低图片分辨率。
- 不压缩 GIF/动图，也不将动图转为静态图。
- 不改变 `download_images` 的工具输入结构、workspace assets 写入目录或页面 HTML 修改语义。

## Decisions

### 1. 使用 `sharp` 作为服务端图片优化库

新增 `sharp` 依赖，在后端下载导入流程中对静态图片做格式转换和质量压缩。`sharp` 基于 libvips，支持 JPEG、PNG、WebP、AVIF 等常见格式，适合 Bun/Node 后端执行图片压缩。

默认输出格式使用 WebP，质量档位从高到低尝试，例如 `82 -> 78 -> 74 -> 70`。每个候选结果都会读取输出 metadata，确认宽高没有变化且结果是有效图片；最终选择体积小于原图的最小可用结果。如果所有优化结果都大于等于原图，则保留原图。

备选方案：使用 Squoosh/WASM codecs。该方案压缩能力强，但引入 WASM 初始化、运行时体积和部署复杂度，不适合当前后端导入链路首版。纯 JS 图片库性能和格式支持不足，不采用。

### 2. 优化只在下载后、安全校验后、写入前执行

`fetchImageBuffer` 继续负责远程下载、SSRF 防护、重定向后 URL 校验、SVG 拒绝、content-type 校验、magic number 校验和最小尺寸校验。图片通过这些校验后，才进入优化流程。

优化模块接收原始 buffer、content-type、扩展名、解析出的 width/height 和 logger，返回最终要写入的 buffer、extension、contentType、byteLength 以及 optimization metadata。`importImagesToWorkspace` 使用该返回值写入文件并记录日志。

原因：先保留现有安全边界，再做优化，可以避免压缩库直接处理明显不安全或非图片内容；写入前优化可以保持 workspace assets 中只出现最终产物。

### 3. 移除硬体积拒绝，但保留其他安全边界

删除 `content-length > MAX_IMAGE_BYTES` 和 `buffer.byteLength > MAX_IMAGE_BYTES` 的拒绝逻辑，并移除或停止使用 `MAX_IMAGE_BYTES` 常量。远程响应仍会完整读入内存，因此实际最大体积仍受运行时内存限制；但代码层不再以 15MB 作为业务拒绝规则。

保留的限制包括：HTTP(S) 协议、localhost/内网/link-local/metadata IP 拒绝、重定向最终 URL 校验、SVG 拒绝、非图片响应拒绝、magic number 校验、最小尺寸校验和按候选顺序导入。

原因：用户明确要求去除绝对 15MB 下载上限；但 SSRF 和文件格式安全边界仍是导入远程资源的必要保护。

### 4. GIF/动图跳过优化

优化前通过轻量检测识别不应压缩的动图：

- GIF magic number：`GIF87a` / `GIF89a`。
- WebP `VP8X` animation flag。
- PNG `acTL` chunk。
- AVIF/HEIF `avis` brand 或其他可识别动画标记。

识别为 GIF 或动图时直接跳过优化，写入原始 buffer 和原始扩展名，并记录 `image_optimize_skipped`，原因标记为 `animated_image` 或 `gif`。

原因：把动图交给普通静态压缩流程可能丢帧、变静态图或破坏动画；首版保持原样最稳妥。

### 5. 压缩目标是“尽量降低体积”，不是强制达标

优化触发阈值为 1MB。原图小于等于 1MB 时跳过优化。原图超过 1MB 时尝试 WebP 质量档位，但不要求最终体积小于 1MB。选择规则：

1. 只接受宽高与原图一致的优化结果。
2. 只接受 magic number 可识别的图片结果。
3. 优先选择体积小于原图的最小结果。
4. 如果没有任何结果小于原图，则回退原图。
5. 如果优化过程抛错，则记录 warn 并回退原图。

原因：用户要求尽量保持分辨率和清晰度，且不要求压到 1MB 以下。强制目标体积会导致质量下降或需要 resize，不符合本次约束。

### 6. 配置与日志

首版内置默认值：

- `IMAGE_IMPORT_OPTIMIZE_THRESHOLD_BYTES = 1048576`
- 输出格式：`webp`
- 质量档位：`82,78,74,70`
- 不启用 resize

如实现中需要环境变量，命名使用 `IMAGE_IMPORT_OPTIMIZE_*`，不得使用 `PROMA` 前缀。日志复用现有 `image_search_runtime` / `mcp_tool` backend 诊断体系，新增阶段：

- `image_optimize_skipped`
- `image_optimize_start`
- `image_optimize_candidate`
- `image_optimize_success`
- `image_optimize_fallback`
- `image_optimize_failed`

日志记录原始体积、优化后体积、输入/输出格式、quality、宽高、跳过原因和失败原因。日志不记录 API key。

## Risks / Trade-offs

- [大图完整读入内存可能增加内存压力] → 移除 15MB 业务上限是明确要求；首版保持当前 `arrayBuffer()` 流程，后续如遇内存问题再引入流式下载或全局资源预算。
- [WebP 输出兼容性] → page-builder 静态页面和现代浏览器普遍支持 WebP；如果后续需要更强兼容，可增加配置改用 JPEG/PNG。
- [压缩耗时增加] → 只对超过 1MB 的静态图触发，质量档位有限；日志记录耗时，便于后续调优。
- [动图识别不可能覆盖所有格式] → 覆盖 GIF、WebP animation、APNG、常见 AVIF animation 标记；无法识别的格式如果 sharp 处理失败会回退原图。
- [压缩后仍超过 1MB] → 符合需求，不强制失败；日志记录结果便于排查。

## Migration Plan

1. 增加 `sharp` 依赖并更新 lockfile。
2. 新增或拆分图片优化 helper，封装静态图片压缩、动图检测和优化结果选择。
3. 修改 `asset-importer.ts`，移除 15MB 硬拒绝，在写入前调用优化 helper。
4. 更新 `types.ts` 中相关常量和导入结果内部元数据。
5. 补充测试：大图压缩、小图跳过、GIF/动图跳过、移除 15MB 拒绝、压缩失败回退、日志输出。
6. 运行 focused tests、app typecheck 和 OpenSpec 校验。

回滚策略：如果 `sharp` 在目标运行环境存在兼容问题，可将优化入口临时禁用，保留去除 15MB 上限以外的原导入流程；如需完全回滚，移除优化 helper 和依赖，并恢复原写入路径。

## Open Questions

无阻塞问题。当前按用户确认执行：去除 15MB 绝对下载上限；超过 1MB 尝试压缩但不强制低于 1MB；不允许缩小分辨率；不压缩 GIF/动图。
