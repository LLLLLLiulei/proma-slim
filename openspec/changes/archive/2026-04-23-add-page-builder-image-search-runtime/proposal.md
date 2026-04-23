## Why

`page-builder` 会话已经可以使用受控的运行时 MCP 能力处理浏览器预览与 CMS 数据，但当前图片搜索仍然依赖外部 `image-search-mcp` 工程和独立 stdio 进程，无法与 Proma 的工作区、权限和资产目录边界对齐。既然图片搜索只打算服务 `page-builder` 会话，现在需要把 Bing 搜索与下载能力迁入 Proma 主进程，并让下载结果直接进入当前工作区的 `assets/`，为后续页面引用图片提供稳定输入。

## What Changes

- 为 `page-builder` 会话新增宿主运行时创建的图片搜索 SDK MCP server，而不是要求用户额外启动外部 `image-search-mcp` 进程
- 迁移 Bing 的 `search_images` 与 `download_images` 两个工具，保留现有搜索过滤、去重、尺寸检测和失败隔离行为
- 将 `download_images` 的语义改为“导入图片到当前 `page-builder` workspace 的 `assets/`”，不再允许模型指定任意本地 `save_dir`
- 让图片下载结果返回可直接供 `page-builder` 后续流程消费的资产路径与基础元数据
- 不在本次变更中迁移 Unsplash 工具，不直接修改 HTML，也不自动替换页面中的图片元素

## Capabilities

### New Capabilities
- `page-builder-image-search-runtime`: `page-builder` 会话可以通过宿主创建的运行时 SDK tools 搜索 Bing 图片并将结果导入当前工作区的 `assets/`

### Modified Capabilities
- `workspace-scoped-agent-runtime`: Agent 查询运行时需要在受控的 `page-builder` 场景下合并新的 runtime `image_search` SDK MCP server，并将对应工具名并入当前 query 的 allowlist

## Impact

- `apps/app/src/main/lib/agent-orchestrator.ts`
- 新增宿主侧图片搜索 runtime tool bundle 与 Bing 搜索/下载模块
- `apps/app/src/main/lib/config-paths.ts` 及工作区资产路径装配逻辑
- 运行时 `allowedTools` / runtime MCP merge 相关测试
- 可能新增 `cheerio` 之类的图片搜索解析依赖到 `@proma/app`
