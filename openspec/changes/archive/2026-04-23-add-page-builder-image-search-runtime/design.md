## Context

Proma 当前已经支持两类 `page-builder` 相关运行时能力：

- 工作区持久化的 MCP 配置会在 query 执行时转换为 Claude Agent SDK 的 `mcpServers`
- 宿主可以在受控场景下通过 `tool()` 和 `createSdkMcpServer()` 为单次 query 附加 runtime SDK MCP server，例如现有的 `cms` runtime tools

与之相对，`/Users/liu/Documents/work/learning/image-search-mcp/` 仍然是一个独立的外部 MCP 工程。它把 Bing 图片搜索与下载能力包在 `McpServer + StdioServerTransport` 外壳里，默认面向 Claude Desktop、Cursor 之类的外部 MCP 客户端，并允许模型通过 `save_dir` 把图片写入任意本地目录。

本次变化的核心不是“把一个外部 MCP 再接入 Proma”，而是把其中的 Bing 搜索与下载逻辑宿主化，使其成为 Proma 主进程中只对 `page-builder` 会话开放的 runtime SDK tools，并让下载结果直接进入当前工作区的 `assets/`，为后续页面引用图片提供稳定输入。

## Goals / Non-Goals

**Goals:**
- 为 `page-builder` 会话提供宿主创建的 runtime `image_search` SDK MCP server
- 仅迁移 Bing 的 `search_images` 与 `download_images` 两个工具，不迁移 Unsplash
- 保留 Bing 搜索过滤、URL 去重、SVG 过滤、尺寸检测和单张下载失败隔离等既有行为
- 将 `download_images` 改造为“导入当前 workspace `assets/`”而不是“下载到任意本地目录”
- 让 `download_images` 返回可直接被 `page-builder` 后续流程消费的资产路径和元数据

**Non-Goals:**
- 不迁移 `search_unsplash_photos` 或 `download_unsplash_photos`
- 不继续保留外部 `McpServer` / `StdioServerTransport` 启动模式
- 不允许模型指定任意 `save_dir`
- 不在本次变更中直接修改 HTML 或自动替换页面中的图片元素
- 不把图片搜索 runtime tools 暴露给普通非 `page-builder` 会话

## Decisions

### 1. 使用 query 级 runtime SDK MCP server，而不是复用外部 stdio MCP 进程

图片搜索能力将复用 Proma 已有的宿主 runtime SDK MCP 模式：

- 使用 `tool()` 定义 `search_images` 与 `download_images`
- 使用 `createSdkMcpServer({ name: 'image_search', tools: [...] })`
- 仅在 `page-builder` 查询路径中把该 runtime server 合并进当前 query 的 `mcpServers`

原因：

- Proma 已经有成熟的 `cms` runtime tools 路线，注入点、allowlist 和测试策略都可复用
- 外部 stdio MCP 进程会绕开宿主对工作区路径、权限和日志边界的控制
- 该能力只服务 `page-builder`，没有必要继续维护一个面向通用 MCP 客户端的独立进程外壳

备选方案：

- 继续把 `/Users/liu/Documents/work/learning/image-search-mcp/` 作为外部 MCP 进程接入：实现上更直接，但无法自然绑定 Proma 的工作区和资产目录边界
- 把图片搜索条目写入工作区 `mcp.json`：会把宿主运行时能力错误地伪装成持久化配置，不符合已有 runtime server 设计

### 2. 只迁移纯业务模块，丢弃外部 MCP transport 外壳

迁移时保留：

- Bing 搜索 HTML 抓取与解析逻辑
- 图片尺寸检测、过滤、排序和下载逻辑
- 共用类型与常量

丢弃：

- `McpServer`
- `StdioServerTransport`
- `main()` 启动入口
- 面向外部客户端的 MCP 配置文件说明

原因：

- 这些 transport / server 外壳在 Proma 主进程内没有存在价值
- 真正需要复用的是工具 handler 和纯函数模块，而不是独立服务入口

备选方案：

- 直接把整个外部项目作为 vendored 子工程运行：会保留不必要的启动层，增加维护复杂度

### 3. `download_images` 改造成 workspace `assets/` 导入语义

原工程中的 `download_images` 允许模型指定 `save_dir`，这在独立 MCP 工程中问题不大，但在 Proma 主进程内会直接放大为任意本地写路径能力。本次设计将其改为：

- 固定写入当前 workspace 的 `workspace-files/assets/`
- 不允许工具输入指定任意保存目录
- 返回 `assetRelativePath`、`assetPreviewPath`、尺寸和来源元数据

原因：

- Proma 已经把 `workspace-files/` 作为工作区文件边界，page-builder 现有图片资产也遵循这一模式
- 直接写入 `assets/` 可以让后续页面引用图片时复用已有相对路径语义，如 `./assets/<file>`
- 这样既保留了“下载图片”的能力，也把其能力边界收束到当前工作区内

备选方案：

- 保留 `save_dir`：能力边界过大，与宿主安全边界不一致
- 先写入 `workspace-files/image-search/`：可以实现，但后续若页面要引用图片，还需要再走一次移动或复制链路

### 4. 资产命名采用宿主生成策略，而不是沿用 `{keyword}_{i}.jpg`

导入到 `assets/` 的文件名不继续沿用外部工程的关键词序号命名，而采用 Proma 宿主生成的稳定命名策略，例如时间戳 + UUID。

原因：

- 避免同一关键词重复下载时文件名冲突
- 与 page-builder 现有资产写入风格保持一致
- 减少工具输出与页面引用之间的覆盖风险

备选方案：

- 继续使用关键词序号命名：可读性更强，但冲突和覆盖概率更高

### 5. `search_images` 保持 Bing filter contract，但输出做宿主归一化

`search_images` 会保留原有的 Bing 过滤维度，如 `size`、`color`、`type`、`aspect` 和 `license`，同时输出经过宿主归一化的结构化结果，至少包含：

- `originalUrl`
- `thumbnailUrl`
- `width`
- `height`
- `sourcePage`

原因：

- 这些过滤能力已经在原工程中实现，迁移后不需要再让模型重新适应另一套输入 contract
- 输出字段名称需要更贴近 page-builder 后续消费语义，而不是绑定原工程内部命名细节

备选方案：

- 首版只保留关键词和数量：实现更简单，但会明显削弱图片搜索对设计场景的实用性

### 6. 只为 `page-builder` 查询显式放行 `mcp__image_search__*`

图片搜索 runtime tools 仅在满足 `page-builder` 运行时策略时才进入当前 query 的 `allowedTools`。普通工作区和未附加该 runtime server 的查询保持原有 allowlist 行为。

原因：

- 这样可以把能力面限制在明确需要找图和导入资产的会话中
- 与现有 `cms` runtime tools 的 query 级权限模型一致

备选方案：

- 把图片工具加入全局 `SAFE_TOOLS`：影响面过大，不符合当前产品边界

## Risks / Trade-offs

- [Bing 搜索页面结构可能变化，导致 HTML 解析失效] → 将抓取与解析逻辑独立封装，并补充基于样例 HTML 的解析测试，降低后续修复成本
- [主进程内直接下载远程图片会增加单轮 query 的网络耗时] → 保持下载数量上限、单张失败隔离和超时设置，避免一次失败拖垮整轮工具执行
- [导入 `assets/` 会持续累积文件] → 首版接受“资产即用户显式导入结果”的语义，不做自动清理；后续若需要可补充资产管理能力
- [首版不自动改 HTML，模型仍需自行决定如何消费返回的资产路径] → 保持职责分离，先把搜索与导入链路做稳，再决定是否增加页面编辑联动

## Migration Plan

1. 从 `image-search-mcp` 迁移 Bing 搜索、图片下载和类型模块到 Proma 主进程可复用位置，并引入所需解析依赖。
2. 新增 `image_search` runtime tool bundle builder，在 `page-builder` 查询路径中按策略附加对应 SDK MCP server。
3. 将 `download_images` 改造成固定写入当前 workspace `assets/` 的导入工具，并输出资产路径元数据。
4. 为 runtime MCP merge、allowlist、Bing 结果归一化和资产导入路径补充测试。
5. 仅在 `page-builder` 会话中启用；若需回滚，只需停止附加 runtime `image_search` server 并移除对应工具装配。

## Open Questions

- 当前没有阻塞本次变更的开放问题。Unsplash 支持、自动插图和资产清理策略都明确留作后续变更处理。
