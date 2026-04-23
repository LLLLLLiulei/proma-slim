## 1. Runtime Tool Foundation

- [x] 1.1 新增宿主侧 `image_search` runtime tool bundle，使用 `tool()` 与 `createSdkMcpServer()` 定义 `search_images` 和 `download_images`
- [x] 1.2 在 Agent orchestrator 中仅为 `page-builder` 查询装配当前 query 级 `image_search` runtime MCP server
- [x] 1.3 在附加 `image_search` runtime server 时显式放行 `mcp__image_search__search_images` 与 `mcp__image_search__download_images`，且不回写工作区持久化 MCP 配置

## 2. Bing Search And Asset Import Tools

- [x] 2.1 迁移 Bing 图片搜索抓取、解析、过滤与去重逻辑到 Proma 主进程可复用模块
- [x] 2.2 实现 `search_images` 的结果归一化，返回原图地址、缩略图地址、宽高、来源页面，并在失败时输出可理解的工具错误
- [x] 2.3 迁移图片下载、尺寸检测和单张失败隔离逻辑，并将 `download_images` 改造成固定导入当前 workspace `workspace-files/assets/`
- [x] 2.4 为导入到 `assets/` 的图片生成宿主侧稳定文件名，并返回工作区相对资产路径、预览路径语义和失败项信息
- [x] 2.5 补齐迁移 Bing 搜索所需的依赖和装配代码，同时保持工具不会直接修改页面 HTML 或自动替换页面元素

## 3. Verification

- [x] 3.1 为 runtime `image_search` MCP merge、`page-builder` 专属暴露和 query 级非持久化语义补充测试
- [x] 3.2 为 `search_images` 的 Bing 结果归一化、去重过滤和失败路径补充测试
- [x] 3.3 为 `download_images` 的 `assets/` 导入路径、部分失败返回和无任意 `save_dir` 语义补充测试
- [x] 3.4 验证非 `page-builder` 会话不会获得图片搜索 runtime tools，且工具结果不会直接改写页面 HTML
