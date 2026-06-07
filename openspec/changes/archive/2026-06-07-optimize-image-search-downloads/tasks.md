## 1. 依赖与优化模块

- [x] 1.1 新增 `sharp` 依赖并更新 lockfile，确认 Bun/当前 app typecheck 可解析该依赖
- [x] 1.2 新增图片优化 helper，封装 1MB 阈值判断、WebP 质量档位压缩、结果选择和失败回退
- [x] 1.3 在优化 helper 中实现 GIF、WebP 动图、APNG、常见 AVIF 动图的跳过检测
- [x] 1.4 确保优化 helper 不调用 resize、crop 或任何会改变分辨率的处理，并校验输出宽高不变

## 2. 下载导入流程改造

- [x] 2.1 移除 `asset-importer.ts` 中基于 `content-length` 和 `buffer.byteLength` 的 15MB 绝对拒绝逻辑
- [x] 2.2 保留现有 URL 安全、重定向安全、SVG、非图片、magic number 和最小尺寸校验
- [x] 2.3 在写入 workspace `assets/` 前对通过校验的图片调用优化 helper
- [x] 2.4 根据优化后的实际 buffer、extension、contentType 和 byteLength 写入资产文件并返回原有导入元数据
- [x] 2.5 确保 GIF/动图、小于等于 1MB 的图片、优化失败或优化无收益的图片均可按规则回退原图导入

## 3. 日志与配置

- [x] 3.1 为图片优化阶段增加 backend 诊断日志，覆盖 skipped、start、candidate、success、fallback、failed
- [x] 3.2 日志记录原始体积、优化后体积、输入格式、输出格式、quality、宽高、跳过原因和失败原因中的可用信息
- [x] 3.3 如新增环境变量，使用 `IMAGE_IMPORT_OPTIMIZE_*` 命名并同步示例配置，禁止使用 `PROMA` 前缀

## 4. 测试与验证

- [x] 4.1 先补失败测试：超过 1MB 的静态图片会尝试优化并写入更小的 WebP 资产
- [x] 4.2 补测试：优化后仍超过 1MB 不导致导入失败，且不会缩小分辨率
- [x] 4.3 补测试：GIF/动图跳过压缩并保持原始扩展名和内容导入
- [x] 4.4 补测试：超过 15MB 的图片不再因为固定体积上限被拒绝
- [x] 4.5 补测试：优化失败或优化结果无收益时回退原图并记录日志
- [x] 4.6 运行 `bun test apps/app/src/main/lib/image-search-sdk-tools.test.ts`、相关 focused tests、`bun run --filter='@ai-page-builder/app' typecheck` 和 `openspec validate optimize-image-search-downloads --strict`
