## Context

`packages/pagebuilder-mcp-server` 当前已经提供独立 stdio/HTTP MCP 服务，并在 `src/server.js` 中集中注册视觉理解、生图、视频分析等工具。PageBuilder Agent runtime 现有宿主 MCP 模式来自 `cms` 与 `image_search`：它们由 `apps/app` 在每次 Agent query 中临时注入 SDK MCP server，并同步维护 `mcpServers`、`allowedTools` 与动态 prompt。

本次需求是把 PageBuilder MCP 的首期能力接入当前 PageBuilder Agent，而不是新增默认 sidecar。首期只需要 `generate_image` 与通用视觉理解 `analyze_image`，并且生图结果必须能直接落到当前 workspace 的 `assets/`，避免模型拿到临时 URL 后无工具可下载。

## Goals / Non-Goals

**Goals:**

- 在 `page-builder` 会话中按 provider 可用性注入 runtime `pagebuilder` SDK MCP server。
- 首期只暴露 `generate_image` 与 `analyze_image`，并将 allowed tools、prompt guidance 与实际工具面保持一致。
- 让 `generate_image` 在 PageBuilder runtime 下返回 `./assets/...` 本地预览路径。
- 修正生图工具描述，明确禁止图片内文字。
- 对 runtime `analyze_image` 增加宿主 source resolver，使相对路径按当前 workspace files 目录解析；按当前需求不再施加 workspace-local 或安全 HTTP(S) URL 限制。
- 复用更泛化的 AI providers JSONC 配置文件，为 PageBuilder runtime MCP 提供 `runtimeMcp.pagebuilder` provider 配置，并补齐生产镜像依赖。

**Non-Goals:**

- 不把 `pagebuilder` MCP 写入 workspace `mcp.json`。
- 不强制默认 Docker compose 启动独立 `pagebuilder-mcp-server` sidecar。
- 不安装 `curl` 或 `wget`。
- 不新增通用 URL 下载工具。
- 不首期暴露全部 9 个 PageBuilder MCP 工具。
- 不重写所有 MCP tools 为 app 内 TypeScript `tool(...)` 实现。
- 不引入鉴权、配额、多租户隔离或远程 MCP HTTP session 管理。

## Decisions

### 1. 使用宿主 runtime SDK MCP，而不是默认 sidecar 或 workspace mcp.json

PageBuilder runtime MCP 按 CMS MCP 类似路径注入到当前 Agent query：

```text
Agent query
  ├─ workspace mcp.json MCP
  ├─ cms runtime MCP
  ├─ image_search runtime MCP
  └─ pagebuilder runtime MCP
       ├─ mcp__pagebuilder__generate_image
       └─ mcp__pagebuilder__analyze_image
```

理由：

- runtime MCP 可以按当前 workspace 和 provider 配置动态启停。
- 缺少 provider key 时可以完全隐藏能力，避免提示词和工具面错位。
- 不污染 workspace `mcp.json`，也不诱导模型创建或修改 MCP 配置。
- 不要求默认 Docker 部署额外编排一个 sidecar 服务。

替代方案：

- **默认 HTTP sidecar**：会增加 compose 依赖、健康检查、网络配置、session 管理和“sidecar 未启动工具不可用”的故障面，不符合当前“类似 CMS MCP 注册方式”的方向。
- **workspace mcp.json 默认配置**：无法可靠表达 provider 缺失时的未安装语义，并会把宿主管理能力变成用户工作区持久配置。

### 2. 在 MCP package 上做小型 embedding/filter/context 扩展

保留 `packages/pagebuilder-mcp-server` 的独立服务入口，同时增加足够薄的可嵌入能力：

- 支持创建只注册指定工具的 MCP server，例如仅注册 `generate_image` 与 `analyze_image`。
- `registerGenerateImageTool` 接受可选 runtime asset sink；没有 sink 时保持返回临时 URL。
- `registerGeneralImageAnalysisTool` 或其 service 接受可选图片来源解析器；没有解析器时保持既有本地路径/URL 行为。

理由：

- 工具注册点已集中在 `src/server.js`，过滤工具面比在 app 内重写工具更小。
- 独立 stdio/HTTP 服务可继续注册全部工具并保持兼容。
- PageBuilder runtime 可以只把需要的上下文注入到两个首期工具，不需要重构所有工具。

替代方案：

- **在 `apps/app` 重写两个工具**：会复制 provider 调用、schema 和错误处理逻辑，后续与独立 MCP 包容易漂移。
- **大规模依赖注入改造所有工具**：能形成通用框架，但当前只需要两个工具，改动面过大。

### 3. provider 可用性由 app 侧显式 preflight 决定

`apps/app` 新增 PageBuilder runtime MCP resolver 时，优先从 `AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE` 指向的 AI providers JSONC 读取 `runtimeMcp.pagebuilder`。该配置段独立于对话模型 `providers[]`，不会随前端聊天模型切换改变生图或视觉理解 provider。

`runtimeMcp.pagebuilder` 支持：

- `enabled: false`：显式关闭 runtime `pagebuilder` MCP。
- `provider: "zhipu" | "zai" | "aliyun" | "qwen" | "dashscope"`：选择生图/视觉理解 provider。
- `apiKey` / `authToken`：直接在受控 JSONC 文件中配置 provider 凭据。
- `apiKeyEnv` / `authTokenEnv`：引用已经注入 `server` 进程的环境变量。
- `vision` / `image` / `timeoutMs` / `retryCount`：透传给 MCP package 的模型、尺寸、超时和重试配置。

preflight 按解析后的 provider 配置检查凭据：

- Aliyun/Qwen/DashScope 模式要求 `apiKey` 或可解析的 `apiKeyEnv`/`authTokenEnv`。
- ZHIPU/ZAI 模式要求 `apiKey` 或可解析的 `apiKeyEnv`/`authTokenEnv`。
- `ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY` 等 Agent 对话模型凭据不作为 PageBuilder MCP provider key。

只有 preflight 成功才创建 runtime MCP bundle、加入 allowed tools 和注入 prompt guidance。如果没有 `runtimeMcp.pagebuilder` 配置，app 侧保留旧平铺 provider env 的兼容回退，但文档、默认 compose 和 env 示例不再推荐或默认暴露这组旧变量。

理由：

- PageBuilder MCP provider 与 Agent SDK provider 是不同能力面，不能默认混用凭据。
- 失败前置到注册阶段，可以实现“未配置即未安装”的用户体验。

### 4. 生图 asset sink 复用现有图片导入安全语义

`generate_image` 在 PageBuilder runtime 下的流程：

```text
prompt -> provider image URL -> host fetch/validate/optimize -> workspace-files/assets/xxx -> ./assets/xxx
```

实现上优先复用或抽取 `image_search` 的远程图片导入安全逻辑，包括 URL 校验、重定向校验、content-type/magic 校验、SVG 拒绝、尺寸解析和必要的图片优化。该 helper 是 app 内部实现，不暴露为模型可调用的通用下载工具。

理由：

- 现有图片搜索导入已经解决了 PageBuilder asset 写入路径和图片安全校验问题。
- 模型不需要也不应该用 shell、curl/wget 或任意保存目录处理临时 URL。

### 5. `analyze_image` source resolver 不再限制 workspace-local 或安全 HTTP(S) URL

PageBuilder runtime 给 `analyze_image` 注入图片来源解析器：

- `./assets/foo.png`、`assets/foo.png` 等相对路径解析到当前 workspace 的 `workspace-files/` 下。
- 绝对本地路径原样传递给底层 `analyze_image`。
- 带 URL scheme 的图片来源原样传递给底层 `analyze_image`，不再由 PageBuilder runtime resolver 限制为安全 HTTP(S) URL。
- 空字符串仍作为无效输入拒绝。

理由：

- 用户当前明确要求去除 PageBuilder runtime resolver 的本地路径和远程 URL 安全限制。
- 底层 MCP image service 仍会对本地文件存在性、扩展名、大小以及 provider 输入形态做自身校验。
- 生成图落地后天然能通过 `./assets/...` 再传给 `analyze_image` 做自检。

### 6. prompt guidance 只在可用时注入

动态上下文新增 PageBuilder runtime MCP 可用状态。与 CMS 不同，缺少 PageBuilder MCP provider 时不注入“不可用说明”，而是保持沉默，避免让模型认为应该修复或安装该 MCP。

可用时 prompt 说明：

- `pagebuilder` MCP 是宿主 runtime 注入，不是 workspace `mcp.json` 配置。
- 可调用 `mcp__pagebuilder__generate_image` 与 `mcp__pagebuilder__analyze_image`。
- `generate_image` 应生成无文字视觉素材，并使用返回的 `./assets/...` 路径。
- `analyze_image` 可使用远程 URL、本地绝对路径，或相对当前 workspace files 目录的路径；不要用它读取无关敏感文件。

### 7. Docker 只补运行所需，不新增默认 sidecar

Docker 调整聚焦三点：

- `server.environment` 暴露 `AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE`，让容器内应用可读取挂载的 AI providers JSONC。
- `server` 生产镜像能解析并运行 `@ai-page-builder/pagebuilder-mcp-server` 首期工具所需代码与依赖。
- `.env` 示例与文档说明 provider 配置是可选能力，未配置 `runtimeMcp.pagebuilder` 或 provider key 时视为未安装。

默认 compose 不新增 `pagebuilder-mcp-server` 服务，不要求 `AI_PAGE_BUILDER_MCP_URL` 才能使用 host runtime MCP。

## Risks / Trade-offs

- **Risk: MCP package 使用 JavaScript 且当前 app 是 TypeScript** → 通过明确的 app 侧 wrapper 类型和聚焦测试覆盖导入边界，避免把类型补丁扩大到全部 package。
- **Risk: 过滤工具注册可能影响独立 MCP 服务** → 默认 `createPageBuilderMcpServer()` 继续注册全部工具；仅 PageBuilder runtime 显式传入首期工具白名单。
- **Risk: 生成图下载落地失败会让模型无法使用临时 URL** → 工具错误必须明确说明落地失败；不返回不存在的本地路径。必要时后续可考虑保留临时 URL 元数据供人工排查，但不鼓励模型继续使用远程临时 URL。
- **Risk: 远程 URL 安全校验误拒绝少量可用图片** → 首期优先安全边界；对 PageBuilder 页面制作而言，workspace asset 和公开 HTTPS 图片足以覆盖主要场景。
- **Risk: `apiKeyEnv` 在 Docker 中引用的变量未注入容器** → 默认文档推荐在受控挂载的 AI providers JSONC 中直接配置 `apiKey`，或明确说明 `apiKeyEnv` 只适用于操作者已经通过 compose override、secret 注入或其他方式传入 `server` 容器的环境变量。

## Migration Plan

1. 新增 PageBuilder runtime MCP wrapper，并在 orchestrator 中按 provider preflight 注入。
2. 扩展 MCP package 的工具过滤、`generate_image` asset sink 和 `analyze_image` source resolver，保持默认独立服务兼容。
3. 补齐 prompt guidance、allowed tools、工具标签与测试。
4. 补齐 AI providers JSONC 配置入口、Docker 生产镜像复制/依赖与文档测试。
5. 本地运行 unit tests 和相关 Docker asset tests；真实 provider E2E 仅在有效 provider key 可用时执行。

回滚策略：移除 app 侧 runtime bundle 注入即可让 PageBuilder Agent 不再暴露 `pagebuilder` MCP；MCP package 的兼容扩展保留不会影响独立 stdio/HTTP 默认行为。

## Open Questions

无阻塞问题。首期默认视觉理解工具为现有通用 `analyze_image`；`ui_to_artifact`、OCR、UI diff、视频分析等工具留待后续单独评估本地文件访问边界后再开放。
