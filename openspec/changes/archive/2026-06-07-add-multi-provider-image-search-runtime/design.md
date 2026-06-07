## Context

Proma 当前已经在 `page-builder` 会话中通过宿主创建的 runtime SDK MCP server 暴露 `image_search`，并提供 `search_images` 与 `download_images` 两个工具。该 runtime 只对 `page-builder` workspace query 生效，不写入 workspace `mcp.json`，下载结果固定进入当前 workspace 的 `workspace-files/assets/`。

当前搜索实现集中在 `apps/app/src/main/lib/image-search-sdk-tools.ts`，只支持 Bing HTML 抓取。外部 `/Users/liu/Documents/work/learning/image-search-mcp/src` 已有 Pexels、Pixabay、Unsplash、Bing 多平台搜索、统一 `ImageResult` 模型、provider 诊断、排序、orientation 映射和下载流程。外部项目是独立 stdio MCP server，且通过单个 `image_search` 工具的 `save_dir` 同时表达搜索与下载；Proma 不原样接入 stdio server，也不接受任意 `save_dir`，但 provider 设计和数据模型应优先参考该外部项目。

## Goals / Non-Goals

**Goals:**

- 保留 Proma 现有 query 级 runtime SDK MCP 接入方式、server 名 `image_search` 和两个工具名。
- 将 `search_images` 扩展为多 provider 搜索，支持 Pexels、Pixabay、Unsplash、Bing。
- 优先迁入外部 `image-search-mcp` 的 provider 顺序、`ImageResult` 字段、provider diagnostics、ranking 和 orientation 行为。
- `search_images` 默认启用并聚合 Pexels、Pixabay，可通过 `IMAGE_SEARCH_PROVIDERS` 启用 Unsplash、Bing；缺失 API key 的 provider 自动 skipped，单个 provider 失败不影响其他 provider。
- `download_images` 接收新版 provider-aware `ImageResult` 候选，将图片导入当前 workspace `assets/` 并返回资产路径。
- 不再要求兼容旧 Bing-only 候选输入；允许按新版工具输入输出同步调整提示词、skill 和测试。
- 增加 provider 配置读取、下载安全边界和测试覆盖。

**Non-Goals:**

- 不把外部 `image-search-mcp` 作为 stdio MCP 进程接入。
- 不把 `image_search` 写入 workspace `mcp.json` 或 page-builder workspace MCP 模板。
- 不恢复或新增任意 `save_dir` 下载能力。
- 不让图片搜索工具直接修改页面 HTML 或自动替换页面图片。
- 不在首版实现 provider key 的前端设置页。
- 不为兼容旧 Bing-only 候选结构增加额外适配层。

## Decisions

### 1. 保留 Proma runtime SDK MCP 外壳，内部按外部项目拆分 provider 架构

`image-search-sdk-tools.ts` 继续负责 MCP tool 注册、zod schema、参数校验和 tool result 包装。搜索、provider、排序和导入逻辑拆分到 `image-search/` 子模块，并尽量复用外部项目的边界：

- `image-search/types.ts`: 迁入并适配外部 `ImageProvider`、`ImageResult`、`DownloadedImage`、`FailedDownload`、`ProviderDiagnostics` 等类型。
- `image-search/config.ts`: 解析 provider API key 和超时等配置。
- `image-search/providers/*.ts`: Bing、Pexels、Pixabay、Unsplash adapter，字段映射优先跟随外部项目。
- `image-search/provider-registry.ts`: provider 顺序固定为 `pexels`、`pixabay`、`unsplash`、`bing`，并集中暴露配置状态。
- `image-search/search-orchestrator.ts`: 对已启用且可用 provider 执行搜索、合并结果、记录 diagnostics。
- `image-search/ranking.ts`: 迁入外部项目的去重、orientation 过滤、provider priority 和评分逻辑，再根据 Proma 测试做必要收敛。
- `image-search/asset-importer.ts`: 迁入外部下载与尺寸解析逻辑，但目标目录固定为当前 workspace `assets/`。

原因：这样保留 Agent 编排层稳定性，避免新增 MCP server/tool 名带来的 allowlist、前端标签和 OpenSpec 复杂度，同时让搜索行为尽可能贴近外部项目。

备选方案：直接启动外部 stdio MCP server。该方案复用最快，但会引入进程管理、workspace `mcp.json`、权限 allowlist、`save_dir` 安全边界和打包分发复杂度，不采用。

### 2. 工具仍拆成 `search_images` / `download_images`，但语义映射到外部单工具的两个模式

外部项目单个 `image_search` 工具在不传 `save_dir` 时返回 URL 与元数据，传 `save_dir` 时搜索并下载。Proma 保留两个工具：

- `search_images` 对应外部 search-only 模式，输入使用 `query`、`count`、`orientation`，输出返回 `results` 和 `diagnostics`。
- `download_images` 对应外部 download mode 的下载阶段，但不重新开放 `save_dir`，而是接收 `search_images` 返回的新版 `ImageResult` 候选并写入 workspace `assets/`。

搜索结果统一采用外部 `ImageResult` 语义：`id`、`provider`、`title`、`description`、`tags`、`width`、`height`、`downloadUrl`、`url`、`previewUrl`、`thumbnailUrl`、`sourcePage`、`author`、`authorUrl`、`authorId`、`authorAvatarUrl`、`licenseName`、`licenseUrl`、`attributionRequired`、`attributionText`、`dominantColor`、`temporaryUrl`、`downloadTrackingUrl`。Proma 可继续输出 compact structured content，但字段名应与外部 `ImageResult` 保持一致。

原因：保留两个工具可以维持现有编排和权限模型；采用外部字段可以降低后续与外部项目同步成本，并让模型看到更标准的候选结构。

备选方案：继续兼容旧 `{ originalUrl, thumbnailUrl, width, height, sourcePage }` 候选结构。用户已明确可以不同时兼容旧候选输入，因此不采用，避免扩大 schema 和测试复杂度。

### 3. 默认行为改为可配置的多 provider 聚合，而不是 Bing fallback

`search_images` 默认启用 Pexels、Pixabay 并聚合结果。`IMAGE_SEARCH_PROVIDERS` 可用逗号或空白分隔 provider 名称，显式启用 `pexels`、`pixabay`、`unsplash`、`bing` 中的任意组合；为空或没有有效 provider 时回退到默认的 `pexels,pixabay`。已启用但缺少 key 的 Pexels、Pixabay、Unsplash 标记为 `skipped`；Bing 无需 key，但默认不启用。每个 provider 的状态写入 diagnostics：`ok`、`skipped`、`error`，并记录 count 和可理解错误信息。

排序优先参考外部项目：provider priority 为 Pexels > Pixabay > Unsplash > Bing，叠加 query relevance、orientation match、resolution bonus 和基础去重。中文查询的相关性规则可做必要收敛，但不再把 Bing 作为默认优先路径。

原因：这保留多平台搜索能力，同时避免默认启用全部 provider 带来的额外配额和不稳定 HTML 抓取成本；需要扩展来源时可通过环境变量显式打开。

备选方案：默认 fallback，只有显式 `aggregate` 时并行聚合。该方案更省配额，但不符合用户提出的优先按外部项目设计集成。

### 4. Provider adapter 依赖注入配置和 fetch，但字段映射保持外部语义

Pexels、Pixabay、Unsplash adapter 不直接读 `process.env` 或全局 `fetch`。它们从搜索 context 获取 `fetchFn`、provider config、timeout 和 logger；config resolver 只读取图片搜索自身的无项目前缀变量：

- `IMAGE_SEARCH_PROVIDERS`
- `PEXELS_API_KEY`
- `PIXABAY_API_KEY`
- `UNSPLASH_ACCESS_KEY`

字段映射、orientation 参数、Pixabay query 截断和 safe search、Unsplash `downloadTrackingUrl` 等优先保持外部项目行为。

原因：依赖注入保证 Proma 测试可控；字段行为跟随外部项目保证集成一致性；图片搜索 MCP 新增环境变量不再引入项目前缀，便于复用外部 `image-search-mcp` 的配置习惯。

备选方案：照搬外部项目中直接读 `process.env` 的实现。该方案简单，但测试、配置和日志统一性较差，不采用。

### 5. 下载导入继续由 Proma 控制，并补安全边界

`download_images` 继续固定写入 `workspace-files/assets/`，文件名由时间戳和 UUID 生成，可带 provider 或 query 片段但不得依赖外部 `save_dir`。下载前后需要校验：

- 只允许 `http` / `https` URL。
- 拒绝 localhost、内网、link-local、metadata IP 等地址。
- 跟随重定向后仍需校验最终 URL。
- 显式拒绝 SVG。
- 校验 content-type、magic number、最小尺寸和单张最大字节数。
- 使用有限并发，按候选顺序下载直到成功导入 `count` 张。
- Unsplash 候选如带 `downloadTrackingUrl`，导入前触发 tracking，失败写入 diagnostics 或失败项但不阻断其他候选。

原因：多 provider 后候选来源更复杂，下载安全边界必须比当前 Bing-only 更明确；同时 Proma 必须保持 workspace assets 的受控写入模型。

备选方案：复用外部项目任意 `saveDir` 下载器。该方案不符合 Proma workspace 边界，不采用。

### 7. 接入图片搜索 MCP 详细日志

`image_search` runtime 使用现有 backend 诊断日志体系，不新增独立日志目录。日志 component/category 使用 `image_search_runtime` / `mcp_tool`，并携带 `requestId`、`turnId`、`sessionId`、`workspaceId`、`workspaceSlug`，便于和同一次 Agent turn 的 HTTP、prompt、SSE、assistant message 日志串联。

日志覆盖：

- `search_images` 工具开始、成功、失败：记录完整工具入参、返回结果、diagnostics、耗时和结果数量。
- provider 搜索 skipped、start、request、success、error：记录 provider、请求参数、配置状态、结果数量和错误信息。
- ranking 完成：记录合并前数量、排序后数量、provider 分布和最终结果。
- `download_images` 工具开始、成功、失败：记录完整工具入参、返回结果、耗时、导入数量和失败数量。
- 下载候选 start、success、failed：记录候选 URL、provider、来源页、content-type、字节数、尺寸、资产路径和失败原因。
- Unsplash download tracking start、success、failed：tracking 失败只记录日志，不阻断图片导入。

日志记录完整工具参数和返回值，但不记录 provider API key 明文；provider 请求日志只记录 key 是否配置和来源变量名。

原因：图片搜索 MCP 涉及多个外部 provider、排序和远程下载，出现结果为空、下载失败或素材异常时需要能从一次 Agent turn 的日志中还原完整链路。复用 backend 诊断日志可以沿用已有日志级别、文本格式、10MB 滚动归档和重启归档能力。

### 6. 同步提示词、skill 和使用说明

实现时需要排查默认 skill、CLAUDE.md、agent/system prompt、工具描述和前端工具标签中是否存在图片搜索 MCP 的旧描述。如果存在，应更新为新版语义：

- `search_images` 使用 `query`、`count`、`orientation` 搜索多 provider 图片。
- `download_images` 接收 `search_images` 返回的 provider-aware `ImageResult` 候选并导入 workspace assets。
- 不再提示模型传旧 `originalUrl` 候选结构。
- 不提示或暴露 `save_dir`。

原因：工具 schema 改为新版结构后，旧提示词会诱导模型传错参数，导致工具调用失败。

## Risks / Trade-offs

- [Provider API key 缺失导致结果少] → 返回 provider diagnostics，默认跳过未配置 provider；本地 env 已配置时单元测试可覆盖真实 key 读取。
- [默认聚合增加 API 配额消耗] → 默认只启用 Pexels、Pixabay；需要更多来源时通过 `IMAGE_SEARCH_PROVIDERS` 显式启用。
- [Bing HTML 结构变化] → Bing 只作为 provider 之一，其他 API provider 可降低单点失败影响。
- [外部排序对中文查询不稳定] → 优先迁入外部 ranking，再用测试约束中文 query 不被无关英文 token 规则过度过滤。
- [工具输入破坏旧候选调用] → 用户已允许不兼容旧候选；需要同步提示词和测试，避免模型继续使用旧结构。
- [远程图片下载带来 SSRF 和大文件风险] → 增加 URL、重定向、content-type、magic number、大小和并发限制。
- [Unsplash download tracking 合规要求] → 保留 `downloadTrackingUrl`，导入前通过 provider hook 触发 tracking；失败时记录诊断。
- [返回元数据变多导致模型处理成本增加] → 输出 compact JSON，但字段名与外部 `ImageResult` 保持一致，不返回 provider 原始 `raw`。

## Migration Plan

1. 迁入外部 `ImageResult`、diagnostics、ranking 和下载类型，建立 Proma 内部 `image-search/` 模块边界。
2. 将当前 Bing 搜索迁入 Bing provider，并把输出字段改为外部 `ImageResult` 语义。
3. 迁入 Pexels、Pixabay、Unsplash adapter，改造为 config/fetch/context 注入。
4. 将 `search_images` schema 调整为 `query`、`count`、`orientation`，默认聚合已启用且可用 provider 并返回 diagnostics。
5. 将 `download_images` schema 调整为新版 provider-aware `ImageResult` 候选输入，移除旧候选兼容要求并保持 workspace assets 导入。
6. 排查并更新涉及图片搜索 MCP 的默认 skill、prompt、工具描述和测试说明。
7. 补下载安全边界、provider 诊断、真实 env key 读取和多 provider 单元测试。

回滚策略：如果多 provider 行为不稳定，可在 provider registry 中临时只启用 Bing，同时保留新版 `ImageResult` schema；如需完全回滚，再恢复旧 Bing-only 工具 schema 和对应提示词。

## Open Questions

无阻塞实现的问题。当前按用户要求：不要求旧候选输入兼容，优先按外部 `image-search-mcp` 设计集成。
