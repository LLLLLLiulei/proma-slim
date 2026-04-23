## ADDED Requirements

### Requirement: Page-builder 会话必须暴露宿主创建的图片搜索 runtime tools
系统 SHALL 在 `page-builder` 会话执行 Agent 查询时，为该次 query 附加宿主创建的 runtime `image_search` SDK MCP server，并仅暴露 Bing 图片搜索与导入相关工具，而不是要求用户额外启动外部 MCP 进程。

#### Scenario: Page-builder 查询附加图片搜索 runtime tools
- **WHEN** 某个带有 `page-builder` 模板标记的会话开始执行 Agent 查询
- **THEN** 系统 SHALL 为该次 query 附加 runtime `image_search` SDK MCP server
- **AND** 系统 SHALL 允许该查询调用 `mcp__image_search__search_images` 与 `mcp__image_search__download_images`

#### Scenario: 普通工作区默认不附加图片搜索 runtime tools
- **WHEN** 某个不带 `page-builder` 模板标记的会话开始执行 Agent 查询
- **THEN** 系统 SHALL NOT 为该查询默认附加 runtime `image_search` SDK MCP server

### Requirement: `search_images` 必须返回过滤后的 Bing 图片结果
系统 SHALL 允许 `page-builder` 会话通过 `search_images` 使用 Bing 图片搜索，并返回经过去重、格式过滤和尺寸补全的结构化结果。

#### Scenario: 关键词搜索返回结构化图片元数据
- **WHEN** 模型调用 `mcp__image_search__search_images` 并提供关键词与可选过滤条件
- **THEN** 系统 SHALL 返回匹配图片的结构化列表
- **AND** 每条结果 SHALL 至少包含原图地址、缩略图地址、宽度、高度和来源页面

#### Scenario: 搜索结果会去重并过滤 SVG
- **WHEN** Bing 搜索结果中包含重复原图地址或 `.svg` 链接
- **THEN** 系统 SHALL 对重复原图地址去重
- **AND** 系统 SHALL 过滤掉 `.svg` 结果

#### Scenario: 搜索失败时返回可理解的工具错误
- **WHEN** Bing 搜索请求在重试后仍然失败
- **THEN** 系统 SHALL 返回说明搜索失败原因的工具错误
- **AND** 系统 SHALL NOT 因单次搜索失败直接让整个 Agent query 崩溃

### Requirement: `download_images` 必须将图片导入当前 workspace `assets/`
系统 SHALL 将 `download_images` 定义为“导入图片到当前 `page-builder` workspace `assets/`”的工具，而不是允许模型将图片下载到任意本地目录。

#### Scenario: 下载结果直接写入当前 workspace assets
- **WHEN** 模型调用 `mcp__image_search__download_images` 并成功找到可下载图片
- **THEN** 系统 SHALL 将图片写入当前 workspace 的 `workspace-files/assets/`
- **AND** 系统 SHALL 返回每张成功导入图片的资产路径与尺寸元数据

#### Scenario: 工具输入不允许任意保存目录
- **WHEN** 模型调用 `mcp__image_search__download_images`
- **THEN** 工具输入 SHALL NOT 要求或接受任意本地 `save_dir`
- **AND** 系统 SHALL 始终使用当前 workspace 的受控 `assets/` 目录作为目标位置

#### Scenario: 下载结果返回可供 page-builder 后续消费的资产路径
- **WHEN** 某张图片成功导入当前 workspace `assets/`
- **THEN** 系统 SHALL 在结果中返回该图片的工作区内相对资产路径
- **AND** 系统 SHALL 返回该图片可直接供后续页面引用使用的预览路径语义

#### Scenario: 单张图片下载失败不影响其他图片导入
- **WHEN** 某次 `download_images` 调用中只有部分图片下载或写入失败
- **THEN** 系统 SHALL 保留其余图片的成功导入结果
- **AND** 系统 SHALL 在返回结果中明确标注失败项

### Requirement: 图片导入工具首版不得直接修改页面 HTML
系统 SHALL 将图片搜索与图片导入限制为素材准备能力，而不是在本次变更中直接替换页面元素或自动修改当前 HTML。

#### Scenario: 导入完成后不自动替换页面图片
- **WHEN** 模型调用 `mcp__image_search__download_images` 成功导入图片到当前 workspace `assets/`
- **THEN** 系统 SHALL 仅返回资产路径和相关元数据
- **AND** 系统 SHALL NOT 直接修改当前页面 HTML
- **AND** 系统 SHALL NOT 自动替换页面中的图片元素
