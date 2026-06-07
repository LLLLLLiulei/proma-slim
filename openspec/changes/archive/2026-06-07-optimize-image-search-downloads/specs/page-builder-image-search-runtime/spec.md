## ADDED Requirements

### Requirement: `download_images` 必须优化大体积非动图图片
系统 SHALL 在 `download_images` 导入远程图片时，对超过 1MB 的非 GIF、非动图图片尝试执行体积优化，并在不缩小分辨率的前提下写入最合适的图片产物。

#### Scenario: 超过 1MB 的静态图片会尝试优化
- **WHEN** 某张通过安全校验的静态图片体积超过 1MB
- **THEN** 系统 SHALL 在写入 workspace `assets/` 前尝试压缩优化该图片
- **AND** 系统 SHALL NOT 通过缩小分辨率、裁剪或降采样来降低体积
- **AND** 系统 SHALL 在优化产物比原图更小时写入优化产物

#### Scenario: 优化结果不强制低于 1MB
- **WHEN** 某张超过 1MB 的静态图片经过优化后仍大于 1MB
- **THEN** 系统 SHALL 允许导入该优化产物或原图
- **AND** 系统 SHALL NOT 仅因为优化后仍超过 1MB 而将该图片标记为导入失败

#### Scenario: 优化无收益时回退原图
- **WHEN** 所有优化候选都不小于原图或优化过程失败
- **THEN** 系统 SHALL 回退写入原始图片内容
- **AND** 系统 SHALL 保留该图片的导入成功语义
- **AND** 系统 SHALL 记录优化失败或回退原因

#### Scenario: GIF 和可识别动图不压缩
- **WHEN** 下载结果是 GIF 或系统可识别的动图格式
- **THEN** 系统 SHALL 跳过压缩优化
- **AND** 系统 SHALL 原样导入该图片内容
- **AND** 系统 SHALL NOT 将动图转换为静态图片

#### Scenario: 小于或等于 1MB 的图片不做优化
- **WHEN** 某张通过安全校验的图片体积小于或等于 1MB
- **THEN** 系统 SHALL 跳过压缩优化
- **AND** 系统 SHALL 原样导入该图片内容

## MODIFIED Requirements

### Requirement: 多 provider 下载必须执行安全边界校验
系统 SHALL 在 `download_images` 导入远程图片前执行 URL、重定向、内容类型、图片格式和并发安全校验，但 SHALL NOT 设置固定的单张图片绝对体积拒绝上限。

#### Scenario: 下载拒绝不安全 URL
- **WHEN** 模型调用 `mcp__image_search__download_images` 并传入 localhost、内网、link-local、metadata IP 或非 HTTP(S) URL
- **THEN** 系统 SHALL 拒绝下载该图片
- **AND** 系统 SHALL 在失败项中返回明确原因

#### Scenario: 下载拒绝 SVG 与非图片响应
- **WHEN** 远程响应是 SVG 或非图片内容
- **THEN** 系统 SHALL 拒绝导入该响应
- **AND** 系统 SHALL NOT 将该响应写入 workspace `assets/`

#### Scenario: 下载不再因为固定体积上限直接拒绝图片
- **WHEN** 远程图片的 `content-length` 或实际下载体积超过 15MB
- **THEN** 系统 SHALL NOT 仅因为图片超过 15MB 而拒绝导入
- **AND** 系统 SHALL 在通过其他安全校验后继续执行图片导入或优化流程

#### Scenario: 下载按候选顺序导入成功项
- **WHEN** 模型传入多张候选图片并指定导入数量
- **THEN** 系统 SHALL 使用有限并发按候选顺序尝试下载
- **AND** 系统 SHALL 在成功导入达到请求数量后停止继续下载无关候选

### Requirement: 图片搜索 runtime 必须输出详细 MCP 执行日志
系统 SHALL 将 `image_search` runtime 的工具调用、provider 搜索、排序、下载导入和图片优化过程写入现有 backend 诊断日志，并关联当前 Agent turn 的 trace 信息。

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

#### Scenario: 图片优化过程输出日志
- **WHEN** `download_images` 对下载图片执行优化判断或优化处理
- **THEN** 系统 SHALL 记录优化跳过、开始、候选结果、成功、回退或失败日志
- **AND** 系统 SHALL 记录原始体积、优化后体积、输入格式、输出格式、quality、宽高、跳过原因和失败原因中的可用信息

#### Scenario: 图片搜索日志关联 Agent turn 且不输出 API key 明文
- **WHEN** 图片搜索 runtime 在某次 Agent turn 中执行
- **THEN** 日志 SHALL 包含可用的 `requestId`、`turnId`、`sessionId`、`workspaceId` 和 `workspaceSlug`
- **AND** 日志 SHALL NOT 输出 Pexels、Pixabay、Unsplash API key 明文
