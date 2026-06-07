## Why

当前 `page-builder` 图片搜索 runtime 只支持 Bing HTML 抓取，结果质量、稳定性和素材来源都受单一平台限制。外部 `/Users/liu/Documents/work/learning/image-search-mcp/` 已沉淀 Pexels、Pixabay、Unsplash 与 Bing 的多平台搜索、统一 `ImageResult` 模型、provider 诊断、排序和下载流程，适合迁入 Proma 的宿主 runtime 工具体系，以提升页面生成和视觉素材准备能力。

## What Changes

- 将 `image_search` runtime 的 `search_images` 从 Bing-only 扩展为支持 Pexels、Pixabay、Unsplash、Bing 的多 provider 搜索。
- 保留 Proma 现有 runtime SDK MCP 形态、server 名 `image_search` 以及工具名 `search_images` / `download_images`，不引入外部 stdio MCP 进程。
- 优先按外部 `image-search-mcp` 的设计迁入 provider 顺序、`ImageResult` 字段、provider diagnostics、ranking、orientation 和 provider adapter 行为。
- `search_images` 使用接近外部项目 search-only 模式的输入输出：`query`、`count`、`orientation`，默认启用并聚合 Pexels、Pixabay，可通过 `IMAGE_SEARCH_PROVIDERS` 扩展到 Unsplash、Bing；缺少 key 的 provider 自动 skipped。
- `download_images` 使用新版 provider-aware `ImageResult` 候选输入，将下载目标固定到当前 `page-builder` workspace 的 `workspace-files/assets/`，不接受任意 `save_dir`。
- 不再要求同时兼容旧 Bing-only 候选输入；如有涉及图片搜索 MCP 的提示词、skill 或说明文档，需要同步更新到新版工具语义。
- 增加 provider API key 配置读取、缺失配置诊断、下载安全边界和相关测试覆盖。
- 不自动修改页面 HTML，不自动替换图片元素。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-image-search-runtime`: 将现有 Bing-only 图片搜索 runtime 扩展为按外部 `image-search-mcp` 设计集成的多 provider 图片搜索 runtime，并保持受控 workspace assets 导入语义。

## Impact

- 影响后端图片搜索 runtime 工具：`apps/app/src/main/lib/image-search-sdk-tools.ts` 及拆分后的 provider/search/import 模块。
- 影响 Agent query 中 `image_search` runtime tool 的输入输出结构：`search_images` 将使用新版 `query` / `count` / `orientation` 搜索语义，`download_images` 将使用新版 provider-aware `ImageResult` 候选结构。
- 可能影响涉及图片搜索 MCP 使用说明的默认 skill、prompt 或文档；需要排查并按新版工具语义更新。
- 影响测试：需要覆盖 provider 映射、缺失配置、默认多 provider 聚合、诊断输出、排序、下载导入、新版候选输入和安全边界。
- 新增或读取图片搜索环境变量：`IMAGE_SEARCH_PROVIDERS`、`PEXELS_API_KEY`、`PIXABAY_API_KEY`、`UNSPLASH_ACCESS_KEY`；图片搜索 MCP 新增配置不使用带项目前缀的变量名。
- 不修改 workspace `mcp.json` 持久化模板，不改变普通 workspace 的图片搜索暴露范围。
