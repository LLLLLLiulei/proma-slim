## ADDED Requirements

### Requirement: PageBuilder 会话必须按需注入宿主管理的 pagebuilder runtime MCP
系统 SHALL 在 `page-builder` 会话执行 Agent 查询时，根据宿主侧 provider 配置按需附加 runtime `pagebuilder` SDK MCP server，而不是要求用户修改 workspace `mcp.json`、手动启动独立 MCP 服务或在提示词中自行发现该能力。

#### Scenario: provider 可用时附加 pagebuilder runtime MCP
- **WHEN** 某个带有 `page-builder` 模板标记的会话开始执行 Agent 查询，且 PageBuilder MCP provider 配置可用
- **THEN** 系统 SHALL 为该次 query 附加 runtime `pagebuilder` SDK MCP server
- **AND** 系统 SHALL 允许该查询调用 `mcp__pagebuilder__generate_image` 与 `mcp__pagebuilder__analyze_image`

#### Scenario: provider 配置优先来自 AI providers JSONC
- **WHEN** `AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE` 指向的 AI providers JSONC 包含 `runtimeMcp.pagebuilder` 配置
- **THEN** 系统 SHALL 使用该配置决定 runtime `pagebuilder` MCP 是否可用
- **AND** 该配置 SHALL 独立于对话模型 `providers[]`
- **AND** 系统 SHALL 支持通过 `apiKey`、`authToken`、`apiKeyEnv` 或 `authTokenEnv` 提供 PageBuilder MCP provider 凭据
- **AND** 系统 SHALL 在新配置存在时优先于旧平铺 PageBuilder MCP provider 环境变量

#### Scenario: runtimeMcp.pagebuilder 显式关闭时不附加
- **WHEN** `runtimeMcp.pagebuilder.enabled` 为 `false`
- **THEN** 系统 SHALL NOT 为该次 query 附加 runtime `pagebuilder` SDK MCP server
- **AND** 系统 SHALL NOT 因旧平铺 PageBuilder MCP provider 环境变量存在而绕过该显式关闭

#### Scenario: provider 不可用时不附加 pagebuilder runtime MCP
- **WHEN** 某个 `page-builder` 会话开始执行 Agent 查询，但 PageBuilder MCP provider 配置不可用
- **THEN** 系统 SHALL NOT 为该次 query 附加 runtime `pagebuilder` SDK MCP server
- **AND** 系统 SHALL NOT 将任何 `mcp__pagebuilder__*` 工具加入 allowed tools
- **AND** 系统 SHALL NOT 在动态 prompt 中提示该 runtime MCP 可用

#### Scenario: 普通工作区不默认附加 pagebuilder runtime MCP
- **WHEN** 某个不带 `page-builder` 模板标记的会话开始执行 Agent 查询
- **THEN** 系统 SHALL NOT 为该查询默认附加 runtime `pagebuilder` SDK MCP server

#### Scenario: pagebuilder runtime MCP 不写入 workspace mcp.json
- **WHEN** 系统为某次 query 附加 runtime `pagebuilder` SDK MCP server
- **THEN** 系统 SHALL 只在该次 Agent query 的 runtime `mcpServers` 中注入该 server
- **AND** 系统 SHALL NOT 将 `pagebuilder` server 写入 workspace `mcp.json`
- **AND** 系统 SHALL NOT 要求模型或用户创建、修改或安装 workspace MCP 配置来获得该能力

### Requirement: pagebuilder runtime MCP 首期工具面必须限制为生图与通用视觉理解
系统 SHALL 将首期宿主 runtime `pagebuilder` MCP 工具面限制为 `generate_image` 与 `analyze_image`，并确保 allowed tools、动态 prompt 与实际 MCP server 注册结果保持一致。

#### Scenario: 首期只暴露两个工具
- **WHEN** 系统附加 runtime `pagebuilder` SDK MCP server
- **THEN** 该 server SHALL 暴露 `generate_image` 与 `analyze_image`
- **AND** 该次 query 的 allowed tools SHALL 包含 `mcp__pagebuilder__generate_image` 与 `mcp__pagebuilder__analyze_image`
- **AND** 该次 query 的 allowed tools SHALL NOT 因该 runtime server 额外包含 `ui_to_artifact`、`extract_text_from_screenshot`、`diagnose_error_screenshot`、`understand_technical_diagram`、`analyze_data_visualization`、`ui_diff_check` 或 `analyze_video`

#### Scenario: 明确提及不可用 pagebuilder MCP 不绕过可用性判断
- **WHEN** 用户消息显式提及 `pagebuilder` MCP，但宿主 provider 配置不可用
- **THEN** 系统 SHALL NOT 因该提及而注入 runtime `pagebuilder` MCP server
- **AND** 系统 SHALL NOT 把 `mcp__pagebuilder__*` 工具加入 allowed tools

#### Scenario: 首轮默认 MCP 延后挂载不隐藏宿主 runtime MCP
- **WHEN** `page-builder` 会话首轮普通消息触发默认 workspace MCP 延后挂载逻辑
- **THEN** 系统 SHALL 仍可在 provider 可用时附加宿主管理的 runtime `pagebuilder` MCP server
- **AND** 系统 SHALL 将该 server 视为宿主 runtime MCP，而不是 workspace 默认 MCP

### Requirement: PageBuilder runtime generate_image 必须生成可直接引用的 workspace asset
系统 SHALL 在 PageBuilder runtime MCP 中让 `generate_image` 在生成图片后由宿主下载图片到当前 workspace 的 `workspace-files/assets/`，并返回可直接用于页面 HTML/CSS 的相对预览路径，而不是只把临时远程 URL 交给模型处理。

#### Scenario: 生图成功后写入当前 workspace assets
- **WHEN** 模型调用 `mcp__pagebuilder__generate_image` 并且上游 provider 返回可下载图片 URL
- **THEN** 系统 SHALL 将图片下载并写入当前 workspace 的 `workspace-files/assets/`
- **AND** 系统 SHALL 返回资产文件名、工作区相对路径和可直接用于 HTML 的 `./assets/...` 预览路径
- **AND** 系统 SHALL 保留上游临时 URL 作为元数据而不是要求模型自行下载

#### Scenario: 生成图片下载失败时返回可理解错误
- **WHEN** 上游 provider 返回图片 URL，但宿主无法安全下载、校验或写入该图片
- **THEN** 工具调用 SHALL 返回说明生成图落地失败原因的工具错误
- **AND** 系统 SHALL NOT 返回一个不存在的本地 asset 路径
- **AND** 系统 SHALL NOT 因该工具失败直接让整个 Agent query 崩溃

#### Scenario: 生成图片必须通过图片安全校验后写入
- **WHEN** `generate_image` runtime asset sink 下载上游图片
- **THEN** 系统 SHALL 校验响应为图片内容
- **AND** 系统 SHALL 拒绝 SVG、非图片响应、路径穿越文件名或无法识别的图片内容
- **AND** 系统 SHALL 将资产写入当前 workspace 受控 `assets/` 目录

#### Scenario: 独立 MCP 服务兼容既有临时 URL 行为
- **WHEN** 操作者通过 `packages/pagebuilder-mcp-server` 的独立 stdio 或 HTTP 服务直接调用 `generate_image`
- **THEN** 系统 SHALL 保持返回 provider 生成的临时图片 URL 的兼容行为
- **AND** 系统 SHALL NOT 要求独立服务必须具备 PageBuilder workspace asset sink

### Requirement: generate_image 必须禁止模型请求绘制图片内文字
系统 SHALL 在 `generate_image` 的工具描述、`prompt` 字段说明和 PageBuilder runtime prompt guidance 中明确禁止生成图片内可读文字或伪文字；页面标题、正文、按钮、标签、标语和其他用户可见文本 SHALL 由 HTML/CSS 渲染。

#### Scenario: 工具描述不再推荐 embedded text
- **WHEN** 系统注册 `generate_image` 工具
- **THEN** 工具描述 SHALL NOT 将 embedded text、accurate text rendering、海报文字或等价图片内文字渲染作为推荐场景
- **AND** 工具描述 SHALL 明确该工具用于生成无文字视觉素材、背景图、banner 图、插画或场景图

#### Scenario: prompt 字段说明禁止图片内文字
- **WHEN** 模型查看 `generate_image` 的 `prompt` 字段说明
- **THEN** 该说明 SHALL 明确禁止要求模型绘制可读文字、伪文字、标题、标语、logo 字、牌匾字或 UI 文案
- **AND** 该说明 SHALL 指示需要展示的文本必须在页面中使用 HTML/CSS 实现

#### Scenario: 供应商自动水印不视为工具失败
- **WHEN** 上游图片 provider 自动添加“AI生成”或等价供应商水印
- **THEN** 系统 MAY 将该水印视为供应商行为并继续返回生成结果
- **AND** prompt guidance SHALL 区分供应商自动水印与模型主动要求绘制的页面文字

### Requirement: runtime analyze_image source resolver 必须放开 workspace 和安全 URL 限制
系统 SHALL 在 PageBuilder runtime `analyze_image` 中只对图片来源做最小解析：非空远程 URL 原样传递，本地绝对路径原样传递，相对路径按当前 workspace files 目录解析，不再由 PageBuilder runtime resolver 拒绝 workspace 外路径、路径穿越形态或非安全 HTTP(S) URL。

#### Scenario: 相对图片路径按当前 workspace files 目录解析
- **WHEN** 模型调用 `mcp__pagebuilder__analyze_image` 并传入 `./assets/example.png`、`assets/example.jpg` 或等价当前 workspace 内图片相对路径
- **THEN** 系统 SHALL 将该路径解析到当前 workspace 的 `workspace-files/` 下
- **AND** 系统 SHALL NOT 在 PageBuilder runtime resolver 中额外执行文件存在性、图片格式或 workspace 边界校验

#### Scenario: 绝对本地路径原样传递
- **WHEN** 模型调用 `mcp__pagebuilder__analyze_image` 并传入绝对本地路径
- **THEN** 系统 SHALL 将该路径原样传递给底层 `analyze_image`
- **AND** 系统 SHALL NOT 因路径不在当前 workspace 内而在 PageBuilder runtime resolver 中拒绝该调用

#### Scenario: 路径穿越形态按路径解析规则处理
- **WHEN** 模型调用 `mcp__pagebuilder__analyze_image` 并传入包含 `..` 的相对路径
- **THEN** 系统 SHALL 按当前 workspace files 目录解析该相对路径
- **AND** 系统 SHALL NOT 因该路径包含 `..` 而在 PageBuilder runtime resolver 中拒绝该调用

#### Scenario: 带 URL scheme 的图片来源原样传递
- **WHEN** 模型调用 `mcp__pagebuilder__analyze_image` 并传入带 URL scheme 的图片来源
- **THEN** 系统 SHALL 将该来源原样传递给底层 `analyze_image`
- **AND** 系统 SHALL NOT 在 PageBuilder runtime resolver 中限制其必须是安全 HTTP(S) URL

#### Scenario: 空图片来源仍然拒绝
- **WHEN** 模型调用 `mcp__pagebuilder__analyze_image` 并传入空字符串或仅空白字符
- **THEN** 系统 SHALL 拒绝该调用并返回可理解的工具错误

### Requirement: pagebuilder runtime MCP prompt guidance 必须与工具可用性同步
系统 SHALL 只在 runtime `pagebuilder` MCP 实际附加到当前 query 时注入对应动态指导，并在不可用时避免给模型任何会诱导调用不存在工具的提示。

#### Scenario: 可用时注入工具使用指导
- **WHEN** 系统为当前 `page-builder` query 附加 runtime `pagebuilder` MCP server
- **THEN** 动态 prompt SHALL 说明该 MCP 是宿主运行时注入的 SDK MCP server
- **AND** 动态 prompt SHALL 列出 `mcp__pagebuilder__generate_image` 与 `mcp__pagebuilder__analyze_image`
- **AND** 动态 prompt SHALL 要求生成图片使用返回的 `./assets/...` 路径并避免图片内文字

#### Scenario: 不可用时不注入调用提示
- **WHEN** 系统未给当前 query 附加 runtime `pagebuilder` MCP server
- **THEN** 动态 prompt SHALL NOT 提示 `mcp__pagebuilder__generate_image` 或 `mcp__pagebuilder__analyze_image` 可用
- **AND** 动态 prompt SHALL NOT 要求模型安装、配置或启动 PageBuilder MCP 服务

### Requirement: pagebuilder runtime MCP 错误信息必须可操作且不泄露密钥
系统 SHALL 将 provider 配置缺失、上游 API 错误、图片下载落地错误和底层图片处理错误收敛为可操作的工具错误，并避免泄露 provider key、token 或完整请求头。

#### Scenario: provider 错误不泄露密钥
- **WHEN** `mcp__pagebuilder__generate_image` 或 `mcp__pagebuilder__analyze_image` 因 provider 鉴权、网络或 API 错误失败
- **THEN** 工具错误 SHALL 描述失败类别和可恢复方向
- **AND** 工具错误 SHALL NOT 包含 API key、Bearer token、Cookie、完整请求头或未脱敏的 provider 凭据
