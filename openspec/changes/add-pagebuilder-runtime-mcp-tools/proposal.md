## Why

当前 `packages/pagebuilder-mcp-server` 已作为独立 MCP 服务存在，但 PageBuilder Agent 默认不能以宿主管理的方式访问其中的生图与视觉理解能力。专题页生成流程需要稳定使用宿主生图工具生成 banner 图，并能对参考图或生成图做基础视觉理解，同时避免要求用户手动配置外部 MCP 或处理临时图片 URL。

## What Changes

- 为 `page-builder` 会话新增宿主注入的 runtime `pagebuilder` MCP server，按 CMS MCP 类似方式在每次 Agent query 中临时挂载，而不是写入 workspace `mcp.json`。
- 首期仅暴露 `generate_image` 与 `analyze_image` 两个工具，工具名为 `mcp__pagebuilder__generate_image` 与 `mcp__pagebuilder__analyze_image`。
- 仅在 PageBuilder MCP provider 配置可用时注册该 runtime MCP；推荐通过 `AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE` 指向的 AI providers JSONC 中的 `runtimeMcp.pagebuilder` 配置该能力。不可用时不注册 server、不加入 allowed tools、不注入相关提示词，并将能力视为未安装。
- 扩展 `generate_image` 的 PageBuilder runtime 行为：生成远程图片后由宿主下载到当前 workspace 的 `workspace-files/assets/`，并返回可直接用于 HTML 的 `./assets/...` 路径。
- 修订 `generate_image` 工具说明，移除 embedded text 推荐，并明确禁止生成图片内可读文字、伪文字、标语、logo 字、牌匾字或 UI 文案；页面文字应由 HTML/CSS 渲染，供应商自动水印可忽略。
- runtime `analyze_image` 不再施加 PageBuilder workspace 本地路径或安全 HTTP(S) URL 限制；非空远程 URL 原样传递，本地绝对路径原样传递，相对路径按当前 workspace files 目录解析。
- Docker 部署继续不强制启动独立 PageBuilder MCP sidecar；默认部署只暴露 AI providers JSONC 配置文件入口，并补齐 server 容器内宿主 runtime MCP 正常工作所需的生产镜像依赖可用性。

## Capabilities

### New Capabilities

- `page-builder-runtime-mcp-tools`: 定义 PageBuilder 会话中宿主注入的 `pagebuilder` runtime MCP server、可用性判断、首期工具面、生成图片落地、视觉理解访问边界与 prompt guidance。

### Modified Capabilities

- `page-builder-docker-deployment`: 补充 PageBuilder runtime MCP 在 Docker server 容器中的 AI providers JSONC 配置入口、生产镜像依赖可用性，以及默认部署不强制启动 PageBuilder MCP sidecar 的要求。

## Impact

- 影响 `apps/app` Agent 编排、动态 prompt 构建、runtime MCP allowed tools 合并逻辑。
- 影响 `packages/pagebuilder-mcp-server` 的 `generate_image` 文案、PageBuilder runtime asset sink 和 `analyze_image` source resolver 行为。
- 影响 `build/` Docker compose、env 示例、部署 README、server 镜像构建资产和相关测试。
- 不引入 breaking change；独立 `pagebuilder-mcp-server` 的 stdio/HTTP 用法应保持兼容。
