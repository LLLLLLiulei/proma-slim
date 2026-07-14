## ADDED Requirements

### Requirement: Docker server 必须支持可选的 PageBuilder runtime MCP provider 配置
系统 SHALL 在 PageBuilder Docker 部署中为 `server` 容器暴露泛化的 AI providers JSONC 配置文件入口，使宿主注入的 `pagebuilder` runtime MCP 能通过 `runtimeMcp.pagebuilder` 配置启用，并在配置缺失时保持未安装语义。

#### Scenario: 默认 compose 暴露 AI providers JSONC 配置入口
- **WHEN** 操作者查看 `build/docker-compose.yml` 中的 `server` 服务环境变量定义
- **THEN** 系统 SHALL 显式声明 `AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE`
- **AND** compose SHALL 允许该变量为空
- **AND** 默认 compose SHALL NOT 强制声明一长串 PageBuilder MCP provider 平铺环境变量

#### Scenario: release compose 与默认 compose 保持配置入口语义一致
- **WHEN** 操作者查看 `build/docker-compose.release.yml` 中的 `server` 服务环境变量定义
- **THEN** 系统 SHALL 为 `server` 声明与默认 compose 等价的 `AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE` 配置入口
- **AND** release 部署 SHALL 在该变量为空或配置文件未包含可用 `runtimeMcp.pagebuilder` provider key 时保持 PageBuilder MCP 未安装语义

#### Scenario: env 示例说明 PageBuilder MCP provider 配置是可选能力
- **WHEN** 操作者查看 `build/.env.standalone.example` 或 `build/.env.cms.example`
- **THEN** 文档 SHALL 说明 PageBuilder runtime MCP provider 推荐配置在 AI providers JSONC 的 `runtimeMcp.pagebuilder` 段
- **AND** 文档 SHALL 说明未配置 provider key 时 Agent 会把 `pagebuilder` runtime MCP 工具视为未安装能力
- **AND** 示例文件 SHALL NOT 提交真实 provider key

#### Scenario: apiKeyEnv 引用必须说明容器环境前提
- **WHEN** 文档展示 `runtimeMcp.pagebuilder.apiKeyEnv` 或 `authTokenEnv` 用法
- **THEN** 文档 SHALL 说明被引用的环境变量必须已经注入 `server` 容器
- **AND** 文档 SHALL NOT 暗示默认 compose 会自动透传所有 PageBuilder MCP provider 平铺环境变量

### Requirement: Docker 默认部署不得强制启动独立 PageBuilder MCP sidecar
系统 SHALL 保持 PageBuilder 默认 Docker 部署不强制启动独立 `pagebuilder-mcp-server` sidecar；宿主 runtime MCP SHALL 在 `server` 进程内按需注册，独立 MCP HTTP/stdio 服务继续作为单独部署示例存在。

#### Scenario: 默认 compose 不声明强制 PageBuilder MCP sidecar
- **WHEN** 操作者查看默认 `build/docker-compose.yml`
- **THEN** compose SHALL NOT 默认声明或依赖名为 `pagebuilder-mcp-server` 的服务
- **AND** `server` SHALL NOT 因该 sidecar 未启动而启动失败

#### Scenario: release compose 不声明强制 PageBuilder MCP sidecar
- **WHEN** 操作者查看 `build/docker-compose.release.yml`
- **THEN** compose SHALL NOT 默认声明或依赖名为 `pagebuilder-mcp-server` 的服务
- **AND** `server` SHALL NOT 因该 sidecar 未部署而启动失败

#### Scenario: 独立 MCP HTTP 部署示例继续保留
- **WHEN** 操作者需要单独运行 `packages/pagebuilder-mcp-server` 的 HTTP 或 stdio 服务
- **THEN** 系统 MAY 继续提供独立 Dockerfile、compose 示例或 README 说明
- **AND** 该独立部署 SHALL NOT 成为默认 PageBuilder Docker 部署的必需服务

### Requirement: Docker server 生产镜像必须包含 PageBuilder runtime MCP 所需代码与依赖
系统 SHALL 确保 `server` 生产镜像在启用 PageBuilder runtime MCP provider 配置后能够解析并运行 `packages/pagebuilder-mcp-server` 中首期暴露的 `generate_image` 与 `analyze_image` 能力，而不是只在本地开发环境可用。

#### Scenario: server 镜像可解析 pagebuilder-mcp-server package
- **WHEN** 生产 `server` 容器启动且 provider 配置可用
- **THEN** 应用层 SHALL 能解析 `@ai-page-builder/pagebuilder-mcp-server` 所需入口或等价 bundled runtime 代码
- **AND** 容器 SHALL NOT 因缺少 workspace package 源码或依赖而无法注册 runtime `pagebuilder` MCP

#### Scenario: server 镜像包含图片处理依赖
- **WHEN** runtime `generate_image` 需要将生成图片写入 workspace assets，或 `analyze_image` 需要处理本地 workspace 图片
- **THEN** `server` 生产镜像 SHALL 包含完成首期工具所需的图片处理运行依赖
- **AND** 系统 SHALL NOT 依赖容器内额外安装 `curl` 或 `wget` 来下载生成图片

#### Scenario: 未配置 provider 时生产镜像仍可正常启动
- **WHEN** 生产 `server` 容器未配置 PageBuilder runtime MCP provider key
- **THEN** `server` SHALL 正常启动
- **AND** Agent 查询 SHALL 不注册 runtime `pagebuilder` MCP
- **AND** 系统 SHALL NOT 因 provider 配置缺失在启动阶段失败
