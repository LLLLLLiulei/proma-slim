## 1. 模块拆分与外部模型迁入

- [x] 1.1 新增 `image-search/` 子模块目录，迁入并适配外部项目的 `ImageProvider`、`ImageResult`、`DownloadedImage`、`FailedDownload`、`ProviderDiagnostics` 等类型
- [x] 1.2 将当前 Bing 搜索、Bing HTML 解析和尺寸补全逻辑迁入 `image-search/providers/bing.ts`，输出改为外部 `ImageResult` 字段语义
- [x] 1.3 迁入外部项目的图片尺寸解析、下载结果类型和基础下载流程到 `image-search/asset-importer.ts`，但目标目录固定为 workspace `assets/`
- [x] 1.4 保持 `image-search-sdk-tools.ts` 的 `image_search` server 名、`search_images` 和 `download_images` 工具名不变
- [x] 1.5 移除旧 Bing-only 候选输入兼容要求，`download_images` 只要求处理新版 provider-aware `ImageResult` 候选

## 2. Provider 配置与多平台 adapter

- [x] 2.1 新增 provider config resolver，读取 `IMAGE_SEARCH_PROVIDERS`、`PEXELS_API_KEY`、`PIXABAY_API_KEY`、`UNSPLASH_ACCESS_KEY`，图片搜索新增配置不使用项目前缀变量
- [x] 2.2 迁入并改造 Pexels provider adapter，使用注入的 config、fetch、timeout 和 logger，并保持外部项目字段映射
- [x] 2.3 迁入并改造 Pixabay provider adapter，保持 query 截断、safe search、orientation 映射、许可和 attribution 字段语义
- [x] 2.4 迁入并改造 Unsplash provider adapter，保留 author、license、`downloadTrackingUrl` 和下载 tracking hook
- [x] 2.5 新增 provider registry，provider 顺序按外部项目固定为 `pexels`、`pixabay`、`unsplash`、`bing`，并集中声明配置状态和缺失配置诊断

## 3. 搜索编排、归一化与排序

- [x] 3.1 将 `search_images` 输入 schema 调整为 `query`、可选 `count`、可选 `orientation`，`orientation` 支持 `landscape`、`portrait`、`squarish`
- [x] 3.2 实现已启用 provider 的聚合搜索，默认启用 Pexels、Pixabay；缺少 key 的 provider 标记为 `skipped`，单 provider 失败标记为 `error` 且不阻断其他 provider
- [x] 3.3 迁入并适配外部项目 ranking：provider priority、去重、orientation 过滤、query relevance、resolution bonus 和基础质量惩罚
- [x] 3.4 在 `search_images` 输出中返回 `results` 与 `diagnostics`，`results` 使用 compact `ImageResult` 字段且不返回 provider 原始 `raw`
- [x] 3.5 保证 Bing、Pexels、Pixabay、Unsplash 的结果字段统一包含 `provider`、`downloadUrl`、`url`、`width`、`height`、`sourcePage`

## 4. Assets 导入与下载安全

- [x] 4.1 将 `download_images` 输入 schema 调整为新版 provider-aware `ImageResult` 候选数组和可选 `count`
- [x] 4.2 为下载导入增加 URL 安全校验，拒绝非 HTTP(S)、localhost、内网、link-local 和 metadata IP
- [x] 4.3 为重定向后的最终 URL、content-type、magic number、SVG、单张最大字节数和最小尺寸增加校验
- [x] 4.4 将下载流程改为有限并发并按候选顺序导入，成功达到请求数量后停止下载后续候选
- [x] 4.5 导入结果继续返回 `assetFileName`、`assetRelativePath`、`assetPreviewPath`、尺寸、provider、来源和失败项
- [x] 4.6 对带 `downloadTrackingUrl` 的 Unsplash 候选触发 download tracking，并确保 tracking 失败不会阻断其他图片导入
- [x] 4.7 确保 `download_images` 不接受 `save_dir`，不写入 workspace 外路径，不直接修改页面 HTML

## 5. 提示词、skill 与说明同步

- [x] 5.1 排查默认 skill、CLAUDE.md、agent/system prompt、工具描述和前端工具标签中涉及图片搜索 MCP 的旧描述
- [x] 5.2 将相关说明更新为新版多 provider 搜索语义：`search_images` 使用 `query` / `count` / `orientation`
- [x] 5.3 将相关说明更新为新版导入语义：`download_images` 接收 `search_images` 返回的 provider-aware `ImageResult` 候选并导入 workspace assets
- [x] 5.4 确保提示词和 skill 不再引导模型使用旧 `originalUrl` 候选结构，也不引导使用 `save_dir`

## 6. 测试与规格验证

- [x] 6.1 补充 Bing provider 拆分后的回归测试，覆盖去重、SVG 过滤、尺寸补全和失败路径
- [x] 6.2 补充 Pexels、Pixabay、Unsplash provider mapping 测试，覆盖请求参数、认证配置、orientation 和元数据归一化
- [x] 6.3 补充 provider 缺失配置、默认多 provider 聚合、diagnostics 和 ranking 测试
- [x] 6.4 补充 `download_images` 新版候选 schema 测试，确认旧 Bing-only 候选结构不再作为兼容要求
- [x] 6.5 补充下载安全测试，覆盖不安全 URL、重定向、SVG、非图片响应、超大图片和部分失败
- [x] 6.6 补充 Agent 编排回归测试，确认 `image_search` 仍只对 page-builder query 注入且不写入 workspace `mcp.json`
- [x] 6.7 使用本地 `.env.local` 中的 provider key 覆盖 config resolver 读取测试，避免在测试输出中打印 key 明文
- [x] 6.8 运行相关 focused tests、`bun run --filter='@ai-page-builder/app' typecheck` 和 `openspec validate add-multi-provider-image-search-runtime --strict`

## 7. 图片搜索 MCP 详细日志

- [x] 7.1 将 `image_search` runtime 接入现有 backend 诊断日志体系，使用 `image_search_runtime` / `mcp_tool` 标识日志来源
- [x] 7.2 为 `search_images` 增加工具开始、成功、失败日志，记录完整入参、返回值摘要/明细、耗时、结果数量和 diagnostics
- [x] 7.3 为 provider 搜索增加 skipped、start、request、success、error 日志，记录 provider、请求参数、结果数量和错误信息
- [x] 7.4 为 ranking 增加完成日志，记录合并数量、最终数量、provider 分布和排序结果
- [x] 7.5 为 `download_images` 增加工具开始、成功、失败日志，记录完整入参、返回值、耗时、导入数量和失败数量
- [x] 7.6 为下载候选增加 start、success、failed 日志，记录 URL、provider、sourcePage、content-type、bytes、尺寸、资产路径和失败原因
- [x] 7.7 将 `requestId`、`turnId`、`sessionId`、`workspaceId`、`workspaceSlug` 传入图片搜索 runtime 日志，便于串联单次对话链路
- [x] 7.8 补充日志测试，确认 backend 日志包含工具参数、返回值、provider 中间过程和下载过程，且不打印 provider API key
