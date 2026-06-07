## ADDED Requirements

### Requirement: `search_images` 必须按外部 image-search-mcp 设计支持多 provider 聚合搜索
系统 SHALL 允许 `page-builder` 会话通过 `search_images` 使用 Pexels、Pixabay、Unsplash、Bing 进行多 provider 图片搜索，并默认聚合已启用且可用 provider 的结果。

#### Scenario: 默认搜索聚合默认启用 provider
- **WHEN** 模型调用 `mcp__image_search__search_images` 并提供 `query`
- **THEN** 系统 SHALL 默认启用 `pexels` 与 `pixabay`
- **AND** 系统 SHALL 对已启用且已配置或无需配置的 provider 发起搜索
- **AND** 系统 SHALL 合并多个 provider 的结果并按统一 ranking 返回指定数量的图片

#### Scenario: 环境变量控制启用 provider
- **WHEN** 后端配置 `IMAGE_SEARCH_PROVIDERS`
- **THEN** 系统 SHALL 只启用该变量中声明的有效 provider
- **AND** 当该变量为空或没有有效 provider 时，系统 SHALL 回退到默认的 `pexels,pixabay`

#### Scenario: 缺少 API key 的 provider 自动跳过
- **WHEN** 已启用的 Pexels、Pixabay 或 Unsplash 未配置 API key
- **THEN** 系统 SHALL 将对应 provider 标记为 `skipped`
- **AND** 系统 SHALL 继续执行其他可用 provider 的搜索

#### Scenario: 单个 provider 失败不影响其他 provider
- **WHEN** 某个 provider 在搜索过程中发生网络、鉴权或 API 错误
- **THEN** 系统 SHALL 将该 provider 标记为 `error` 并记录可理解的失败原因
- **AND** 系统 SHALL NOT 因单个 provider 失败直接中止其他 provider 的搜索

#### Scenario: 搜索输入使用外部项目一致的核心字段
- **WHEN** 模型调用 `mcp__image_search__search_images`
- **THEN** 工具输入 SHALL 使用 `query`、可选 `count` 和可选 `orientation`
- **AND** `orientation` SHALL 支持 `landscape`、`portrait`、`squarish`

### Requirement: 图片搜索必须返回 provider 诊断信息
系统 SHALL 在 `search_images` 结果中返回 provider 级诊断信息，用于说明每个 provider 的搜索状态、结果数量和失败原因。

#### Scenario: provider 诊断包含状态和数量
- **WHEN** `search_images` 返回结果
- **THEN** structured content SHALL 包含 `diagnostics`
- **AND** 每个 provider 的诊断 SHALL 包含 `status` 与 `count`

#### Scenario: provider 搜索失败时返回错误原因
- **WHEN** 某个 provider 搜索失败
- **THEN** 对应诊断 SHALL 包含 `error`
- **AND** `error` SHALL 使用可理解文本描述失败原因

### Requirement: 搜索结果必须使用 provider-aware ImageResult 结构
系统 SHALL 使用接近外部 `image-search-mcp` 的 `ImageResult` 字段返回图片候选，而不是继续返回旧 Bing-only 候选结构。

#### Scenario: 关键词搜索返回 ImageResult 元数据
- **WHEN** 模型调用 `mcp__image_search__search_images` 并提供关键词与可选过滤条件
- **THEN** 系统 SHALL 返回匹配图片的 `results` 列表
- **AND** 每条结果 SHALL 至少包含 `provider`、`downloadUrl`、`url`、`width`、`height` 和 `sourcePage`

#### Scenario: 结果保留 provider 元数据
- **WHEN** provider 返回作者、许可、预览图、缩略图、标签、颜色或下载追踪地址
- **THEN** 系统 SHOULD 在结果中保留对应的 `author`、`licenseName`、`previewUrl`、`thumbnailUrl`、`tags`、`dominantColor`、`downloadTrackingUrl` 等字段
- **AND** 系统 SHALL NOT 返回 provider 原始 `raw` 对象

#### Scenario: 搜索结果会去重并过滤 SVG
- **WHEN** 搜索结果中包含重复图片地址、重复 provider id、重复来源项或 `.svg` 链接
- **THEN** 系统 SHALL 对重复结果去重
- **AND** 系统 SHALL 过滤掉 `.svg` 结果

### Requirement: 多 provider 下载必须执行安全边界校验
系统 SHALL 在 `download_images` 导入远程图片前执行 URL、重定向、内容类型、图片格式、大小和并发安全校验。

#### Scenario: 下载拒绝不安全 URL
- **WHEN** 模型调用 `mcp__image_search__download_images` 并传入 localhost、内网、link-local、metadata IP 或非 HTTP(S) URL
- **THEN** 系统 SHALL 拒绝下载该图片
- **AND** 系统 SHALL 在失败项中返回明确原因

#### Scenario: 下载拒绝 SVG 与超大图片
- **WHEN** 远程响应是 SVG、非图片内容或超过单张图片大小限制
- **THEN** 系统 SHALL 拒绝导入该响应
- **AND** 系统 SHALL NOT 将该响应写入 workspace `assets/`

#### Scenario: 下载按候选顺序导入成功项
- **WHEN** 模型传入多张候选图片并指定导入数量
- **THEN** 系统 SHALL 使用有限并发按候选顺序尝试下载
- **AND** 系统 SHALL 在成功导入达到请求数量后停止继续下载无关候选

### Requirement: 图片搜索 runtime 必须输出详细 MCP 执行日志
系统 SHALL 将 `image_search` runtime 的工具调用、provider 搜索、排序和下载导入过程写入现有 backend 诊断日志，并关联当前 Agent turn 的 trace 信息。

#### Scenario: search_images 输出工具级和 provider 级日志
- **WHEN** 模型调用 `mcp__image_search__search_images`
- **THEN** 系统 SHALL 记录工具开始、成功或失败日志
- **AND** 系统 SHALL 记录完整工具入参、返回结果、provider diagnostics、耗时和结果数量
- **AND** 系统 SHALL 记录 provider skipped、start、request、success、error 以及 ranking 完成日志

#### Scenario: download_images 输出工具级和候选下载日志
- **WHEN** 模型调用 `mcp__image_search__download_images`
- **THEN** 系统 SHALL 记录工具开始、成功或失败日志
- **AND** 系统 SHALL 记录完整工具入参、返回结果、耗时、导入数量和失败数量
- **AND** 系统 SHALL 记录每个下载候选的 start、success 或 failed 日志，包括 URL、provider、来源页、content-type、字节数、尺寸、资产路径和失败原因

#### Scenario: 图片搜索日志关联 Agent turn 且不输出 API key 明文
- **WHEN** 图片搜索 runtime 在某次 Agent turn 中执行
- **THEN** 日志 SHALL 包含可用的 `requestId`、`turnId`、`sessionId`、`workspaceId` 和 `workspaceSlug`
- **AND** 日志 SHALL NOT 输出 Pexels、Pixabay、Unsplash API key 明文

## MODIFIED Requirements

### Requirement: Page-builder 会话必须暴露宿主创建的图片搜索 runtime tools
系统 SHALL 在 `page-builder` 会话执行 Agent 查询时，为该次 query 附加宿主创建的 runtime `image_search` SDK MCP server，并仅暴露图片搜索与导入相关工具，而不是要求用户额外启动外部 MCP 进程。

#### Scenario: Page-builder 查询附加图片搜索 runtime tools
- **WHEN** 某个带有 `page-builder` 模板标记的会话开始执行 Agent 查询
- **THEN** 系统 SHALL 为该次 query 附加 runtime `image_search` SDK MCP server
- **AND** 系统 SHALL 允许该查询调用 `mcp__image_search__search_images` 与 `mcp__image_search__download_images`

#### Scenario: 普通工作区默认不附加图片搜索 runtime tools
- **WHEN** 某个不带 `page-builder` 模板标记的会话开始执行 Agent 查询
- **THEN** 系统 SHALL NOT 为该查询默认附加 runtime `image_search` SDK MCP server

### Requirement: `search_images` 必须返回过滤后的图片结果
系统 SHALL 允许 `page-builder` 会话通过 `search_images` 使用已配置的图片搜索 provider，并返回经过去重、格式过滤、尺寸补全、ranking 和 provider 归一化的结构化结果。

#### Scenario: 搜索失败时返回可理解的工具错误
- **WHEN** 所有已启用且可用 provider 搜索请求均失败或没有任何可搜索 provider
- **THEN** 系统 SHALL 返回说明搜索失败原因的工具错误或诊断信息
- **AND** 系统 SHALL NOT 因单个 provider 的搜索失败直接让整个 Agent query 崩溃

#### Scenario: 结果排序优先参考外部项目 scoring 规则
- **WHEN** 多个 provider 返回候选图片
- **THEN** 系统 SHALL 参考外部 `image-search-mcp` 的 provider priority、query relevance、orientation match、resolution bonus 和去重规则进行排序
- **AND** 系统 SHALL 返回排序后的 compact structured content 供模型继续选择下载

### Requirement: `download_images` 必须将图片导入当前 workspace `assets/`
系统 SHALL 将 `download_images` 定义为“导入图片到当前 `page-builder` workspace `assets/`”的工具，而不是允许模型将图片下载到任意本地目录；该工具 SHALL 使用新版 provider-aware `ImageResult` 候选图片结构。

#### Scenario: 下载结果直接写入当前 workspace assets
- **WHEN** 模型调用 `mcp__image_search__download_images` 并成功找到可下载图片
- **THEN** 系统 SHALL 将图片写入当前 workspace 的 `workspace-files/assets/`
- **AND** 系统 SHALL 返回每张成功导入图片的资产路径、尺寸、provider 与来源元数据

#### Scenario: 工具输入不允许任意保存目录
- **WHEN** 模型调用 `mcp__image_search__download_images`
- **THEN** 工具输入 SHALL NOT 要求或接受任意本地 `save_dir`
- **AND** 系统 SHALL 始终使用当前 workspace 的受控 `assets/` 目录作为目标位置

#### Scenario: 工具输入使用新版 ImageResult 候选结构
- **WHEN** 模型调用 `mcp__image_search__download_images`
- **THEN** 工具输入 SHALL 接受由 `search_images` 返回的 provider-aware `ImageResult` 候选
- **AND** 系统 SHALL NOT 为旧 Bing-only `{ originalUrl, thumbnailUrl, width, height, sourcePage }` 候选结构提供额外兼容要求

#### Scenario: 下载结果返回可供 page-builder 后续消费的资产路径
- **WHEN** 某张图片成功导入当前 workspace `assets/`
- **THEN** 系统 SHALL 在结果中返回该图片的工作区内相对资产路径
- **AND** 系统 SHALL 返回该图片可直接供后续页面引用使用的预览路径语义

#### Scenario: 单张图片下载失败不影响其他图片导入
- **WHEN** 某次 `download_images` 调用中只有部分图片下载或写入失败
- **THEN** 系统 SHALL 保留其余图片的成功导入结果
- **AND** 系统 SHALL 在返回结果中明确标注失败项
