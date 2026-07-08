## ADDED Requirements

### Requirement: PageBuilder MCP server SHALL exist as an independent workspace package
系统 SHALL 在 monorepo 内提供独立的 PageBuilder MCP server package，用于承载迁移后的 MCP tools，并允许其独立于 `apps/app` 与 `apps/page-builder` 构建和运行。

#### Scenario: package 位于 packages 目录
- **WHEN** 开发者检查仓库源码
- **THEN** 系统 SHALL 在 `packages/pagebuilder-mcp-server` 提供独立 package
- **AND** 该 package SHALL 拥有自己的 `package.json`、源码入口、测试与 README

#### Scenario: package 不依赖 PageBuilder runtime 接入
- **WHEN** 该 package 被新增到 monorepo
- **THEN** 系统 SHALL NOT 自动修改 PageBuilder Agent 编排逻辑
- **AND** 系统 SHALL NOT 自动修改默认 workspace MCP 配置生成逻辑
- **AND** 系统 SHALL NOT 要求 PageBuilder 当前运行流程必须启动该 MCP server

### Requirement: PageBuilder MCP server SHALL preserve migrated tool capabilities
系统 SHALL 迁移外部 MCP 服务当前有效工具能力，并在 PageBuilder MCP server 中继续注册这些 tools。

#### Scenario: MCP client lists migrated tools
- **WHEN** MCP client 连接到 PageBuilder MCP server 并列出 tools
- **THEN** 系统 SHALL 提供 `ui_to_artifact`
- **AND** 系统 SHALL 提供 `extract_text_from_screenshot`
- **AND** 系统 SHALL 提供 `diagnose_error_screenshot`
- **AND** 系统 SHALL 提供 `understand_technical_diagram`
- **AND** 系统 SHALL 提供 `analyze_data_visualization`
- **AND** 系统 SHALL 提供 `ui_diff_check`
- **AND** 系统 SHALL 提供 `analyze_image`
- **AND** 系统 SHALL 提供 `analyze_video`
- **AND** 系统 SHALL 提供 `generate_image`

#### Scenario: 工具注册逻辑被共享
- **WHEN** stdio 入口和 HTTP 入口启动 MCP server
- **THEN** 两个入口 SHALL 使用同一套工具注册逻辑
- **AND** 新增或删除工具时 SHALL NOT 要求分别维护两份工具注册清单

### Requirement: PageBuilder MCP server SHALL provide a stdio MCP entry
系统 SHALL 保留 stdio MCP transport 入口，使本地 MCP client 或兼容场景仍可通过标准输入输出连接该服务。

#### Scenario: stdio bin starts MCP server
- **WHEN** 操作者执行 `pagebuilder-mcp-server`
- **THEN** 系统 SHALL 启动 stdio MCP server
- **AND** stdout SHALL 保持 MCP protocol 输出，不被普通日志污染

#### Scenario: stdio entry uses PageBuilder server identity
- **WHEN** stdio MCP server 完成初始化
- **THEN** MCP server name SHALL 默认为 `pagebuilder-mcp-server`
- **AND** MCP server version SHALL 来自 package 版本或等价的集中配置

### Requirement: PageBuilder MCP server SHALL provide a Streamable HTTP MCP entry
系统 SHALL 提供 HTTP MCP 服务入口，用于通过 HTTP 方式访问 MCP tools。

#### Scenario: HTTP server exposes MCP endpoint
- **WHEN** 操作者启动 HTTP MCP 服务
- **THEN** 系统 SHALL 监听 `PAGEBUILDER_MCP_HOST` 与 `PAGEBUILDER_MCP_PORT` 指定的地址
- **AND** 未配置时 SHALL 默认监听 `0.0.0.0:3000`
- **AND** 系统 SHALL 在 `PAGEBUILDER_MCP_PATH` 指定路径暴露 MCP endpoint
- **AND** 未配置时 MCP endpoint SHALL 默认为 `/mcp`

#### Scenario: HTTP server exposes health endpoint
- **WHEN** HTTP 客户端请求 `/healthz`
- **THEN** 系统 SHALL 返回成功状态码
- **AND** 响应 SHALL 表明服务已启动

#### Scenario: HTTP endpoint uses MCP SDK streamable transport
- **WHEN** MCP client 通过 HTTP endpoint 发起 MCP initialize 或 tools/list 请求
- **THEN** 系统 SHALL 使用 MCP SDK Streamable HTTP transport 处理请求
- **AND** 响应 SHALL 保持 MCP 协议语义

### Requirement: PageBuilder MCP server SHALL externalize provider and runtime configuration
系统 SHALL 通过环境变量配置模型供应商、模型、超时、日志和 HTTP 监听参数，不得要求在源码中硬编码密钥或私有服务地址。

#### Scenario: runtime HTTP config uses PageBuilder env prefix
- **WHEN** 操作者需要配置 HTTP 服务监听参数
- **THEN** 系统 SHALL 支持 `PAGEBUILDER_MCP_HOST`
- **AND** 系统 SHALL 支持 `PAGEBUILDER_MCP_PORT`
- **AND** 系统 SHALL 支持 `PAGEBUILDER_MCP_PATH`
- **AND** 系统 SHALL 支持 `PAGEBUILDER_MCP_LOG_PATH`

#### Scenario: provider compatibility env remains supported
- **WHEN** 操作者配置模型供应商参数
- **THEN** 系统 SHALL 继续支持 `PLATFORM_MODE`
- **AND** 系统 SHALL 继续支持 `Z_AI_API_KEY`、`Z_AI_BASE_URL` 与相关 ZHIPU/ZAI 兼容变量
- **AND** 系统 SHALL 继续支持 `ALIYUN_*`、`QWEN_*` 与 `DASHSCOPE_*` 供应商变量
- **AND** 文档 SHALL 将这些变量描述为模型供应商兼容配置，而不是服务产品命名

#### Scenario: secrets are not committed
- **WHEN** 开发者检查迁移后的 package
- **THEN** 系统 SHALL NOT 包含外部仓库 `.env` 中的真实密钥
- **AND** 系统 SHALL 只提供不含真实密钥的 env 示例

### Requirement: PageBuilder MCP server SHALL not migrate external runtime state
系统 SHALL 只迁移外部 MCP 服务的有效源码、测试和公开配置示例，不得把外部仓库的运行状态或本地工具状态迁入当前仓库。

#### Scenario: external runtime files are excluded
- **WHEN** 开发者检查 `packages/pagebuilder-mcp-server`
- **THEN** 系统 SHALL NOT 包含外部仓库的 `.git`
- **AND** 系统 SHALL NOT 包含外部仓库的 `.env`
- **AND** 系统 SHALL NOT 包含外部仓库的 `node_modules`
- **AND** 系统 SHALL NOT 包含外部仓库的 `.claude`、`.codex`、`.serena`
- **AND** 系统 SHALL NOT 包含外部仓库的 `openspec` 目录
- **AND** 系统 SHALL NOT 包含外部仓库独立 lockfile
