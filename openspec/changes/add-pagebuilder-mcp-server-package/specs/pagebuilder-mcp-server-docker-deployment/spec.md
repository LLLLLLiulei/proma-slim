## ADDED Requirements

### Requirement: PageBuilder MCP server SHALL provide an independent Docker image build
系统 SHALL 提供独立 Dockerfile，用于构建 PageBuilder MCP server 镜像，而不要求构建或启动 PageBuilder web/server 主服务。

#### Scenario: Dockerfile exists under build directory
- **WHEN** 操作者检查仓库的 Docker 部署资产
- **THEN** 系统 SHALL 提供 `build/Dockerfile.pagebuilder-mcp-server`
- **AND** 该 Dockerfile SHALL 以仓库根目录作为构建上下文
- **AND** 该 Dockerfile SHALL 只启动 `@ai-page-builder/pagebuilder-mcp-server` 对应服务

#### Scenario: Docker build installs target platform native dependencies
- **WHEN** 操作者构建 PageBuilder MCP server 镜像
- **THEN** 系统 SHALL 在镜像目标平台内安装 package 依赖
- **AND** 系统 SHALL NOT 复制宿主机 `node_modules` 到镜像中
- **AND** `sharp` 等 native dependency SHALL 在镜像运行平台可用

### Requirement: PageBuilder MCP server Docker image SHALL run the HTTP MCP service
系统 SHALL 让 Docker 镜像默认运行 HTTP MCP 服务，而不是 stdio 入口。

#### Scenario: container starts HTTP entry
- **WHEN** 操作者启动 PageBuilder MCP server 容器
- **THEN** 容器 SHALL 启动 HTTP MCP entry
- **AND** 容器 SHALL 默认暴露 MCP endpoint `/mcp`
- **AND** 容器 SHALL 默认暴露健康检查 endpoint `/healthz`

#### Scenario: container port is configurable
- **WHEN** 操作者通过环境变量配置 `PAGEBUILDER_MCP_PORT`
- **THEN** 容器内 HTTP 服务 SHALL 监听该端口
- **AND** 未配置时 SHALL 监听 `3000`

### Requirement: PageBuilder MCP server SHALL provide an independent compose example
系统 SHALL 提供独立 compose 示例，用于单独启动 PageBuilder MCP server。

#### Scenario: compose file starts only MCP server service
- **WHEN** 操作者检查 PageBuilder MCP server compose 示例
- **THEN** 系统 SHALL 提供独立 compose 文件
- **AND** 该 compose 文件 SHALL 包含 `pagebuilder-mcp-server` 服务
- **AND** 该 compose 文件 SHALL NOT 要求同时启动 `web`、`server` 或 `playwright` 服务

#### Scenario: compose file maps the HTTP port
- **WHEN** 操作者使用独立 compose 示例启动服务
- **THEN** 系统 SHALL 支持将宿主机端口映射到容器内 `PAGEBUILDER_MCP_PORT`
- **AND** 操作者 SHALL 能够通过宿主机访问 `/healthz`

### Requirement: PageBuilder MCP server Docker deployment SHALL externalize runtime configuration
系统 SHALL 提供不含真实密钥的 env 示例，并通过 compose 环境变量传入 MCP server 运行参数与模型供应商配置。

#### Scenario: env example does not contain real secrets
- **WHEN** 开发者检查 PageBuilder MCP server Docker env 示例
- **THEN** 示例 SHALL NOT 包含真实 API key
- **AND** 示例 SHALL 使用占位值或注释说明必填密钥

#### Scenario: compose declares PageBuilder MCP env variables
- **WHEN** 操作者检查独立 compose 示例
- **THEN** compose SHALL 支持传入 `PAGEBUILDER_MCP_HOST`
- **AND** compose SHALL 支持传入 `PAGEBUILDER_MCP_PORT`
- **AND** compose SHALL 支持传入 `PAGEBUILDER_MCP_PATH`
- **AND** compose SHALL 支持传入 `PAGEBUILDER_MCP_LOG_PATH`

#### Scenario: compose declares provider env variables
- **WHEN** 操作者检查独立 compose 示例
- **THEN** compose SHALL 支持传入 `PLATFORM_MODE`
- **AND** compose SHALL 支持传入 `Z_AI_API_KEY`
- **AND** compose SHALL 支持传入 `Z_AI_BASE_URL`
- **AND** compose SHALL 支持传入 `ALIYUN_API_KEY`
- **AND** compose SHALL 支持传入 `QWEN_API_KEY`
- **AND** compose SHALL 支持传入 `DASHSCOPE_API_KEY`

### Requirement: PageBuilder MCP server Docker deployment SHALL remain separate from PageBuilder main deployment
系统 SHALL 保持本次 MCP server Docker 部署资产与现有 PageBuilder web/server 主部署解耦。

#### Scenario: existing PageBuilder compose is not extended
- **WHEN** 本变更实现后开发者检查现有 PageBuilder 主 compose
- **THEN** 系统 SHALL NOT 要求 `build/docker-compose.yml` 新增 PageBuilder MCP server 服务
- **AND** 系统 SHALL NOT 要求 `build/docker-compose.release.yml` 新增 PageBuilder MCP server 服务
- **AND** 系统 SHALL NOT 改变现有 PageBuilder web/server/playwright 主部署启动路径
