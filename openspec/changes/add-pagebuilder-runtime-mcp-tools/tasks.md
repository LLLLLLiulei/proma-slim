## 1. MCP Package Runtime Hooks

- [x] 1.1 为 `packages/pagebuilder-mcp-server` 增加可嵌入的工具白名单注册能力，使 PageBuilder runtime 可只注册 `generate_image` 与 `analyze_image`，同时保持独立 stdio/HTTP 默认注册全部工具
- [x] 1.2 增加首期 runtime 工具名常量或导出，供 `apps/app` 生成 `mcp__pagebuilder__generate_image` 与 `mcp__pagebuilder__analyze_image` allowed tools
- [x] 1.3 扩展 `generate_image` 注册逻辑，支持可选 PageBuilder asset sink；未传入 sink 时保持返回 provider 临时 URL 的兼容行为
- [x] 1.4 修改 `generate_image` 工具描述与 `prompt` 字段说明，移除 embedded text 推荐并明确禁止图片内文字、伪文字、标语、logo 字、牌匾字和 UI 文案
- [x] 1.5 扩展 `analyze_image` 注册逻辑，支持可选图片来源解析器，用于 PageBuilder runtime 下按宿主规则解析图片来源
- [x] 1.6 为 MCP package 增加聚焦测试，覆盖工具白名单注册、独立服务兼容、生图文案禁用图片内文字、asset sink 成功/失败和 `analyze_image` source resolver 行为

## 2. App Runtime Integration

- [x] 2.1 在 `apps/app` 增加 PageBuilder runtime MCP bundle helper，按 `page-builder` workspace 和 provider preflight 决定是否创建 runtime `pagebuilder` SDK MCP server
- [x] 2.2 实现 provider preflight：优先读取 `AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE` 中的 `runtimeMcp.pagebuilder`，按 provider 解析 `apiKey`/`authToken` 或 `apiKeyEnv`/`authTokenEnv`，旧平铺 provider env 仅作为兼容回退，且不把 `ANTHROPIC_*` 对话模型凭据计入可用性
- [x] 2.3 实现 `generate_image` 的 PageBuilder asset sink，将 provider 图片 URL 安全下载、校验并写入当前 workspace `workspace-files/assets/`，返回 `./assets/...` 路径元数据
- [x] 2.4 复用或抽取现有图片导入安全逻辑，覆盖 URL 安全、重定向、content-type、图片 magic、SVG 拒绝、尺寸解析和必要图片优化
- [x] 2.5 实现 `analyze_image` 的 PageBuilder 图片来源解析器：非空远程 URL 原样传递，本地绝对路径原样传递，相对路径按当前 workspace files 目录解析，不再施加 workspace-local 或安全 HTTP(S) URL 限制
- [x] 2.6 将 runtime `pagebuilder` MCP 注入 `agent-orchestrator`，并在 provider 可用时合并 `mcpServers` 与 allowed tools
- [x] 2.7 更新动态 prompt 构建，只在 runtime `pagebuilder` MCP 实际附加时注入工具指导；不可用时不注入调用或安装提示
- [x] 2.8 更新工具标签或展示文案，使 `mcp__pagebuilder__generate_image` 与 `mcp__pagebuilder__analyze_image` 在前端活动流/权限提示中可读
- [x] 2.9 为 app runtime 增加测试，覆盖 provider 缺失不注册、provider 可用注册、首轮默认 MCP 延后时仍注入 runtime MCP、allowed tools、prompt guidance、asset sink 和 analyze_image source resolver 放开行为

## 3. Docker And Deployment Assets

- [x] 3.1 将 `@ai-page-builder/pagebuilder-mcp-server` 作为 `apps/app` 运行依赖接入，并刷新 lockfile
- [x] 3.2 确保 `build/Dockerfile.page-builder-app` 生产镜像包含 PageBuilder runtime MCP 所需 package 源码或 bundled 代码以及图片处理依赖
- [x] 3.3 在 `build/docker-compose.yml` 与 `build/docker-compose.release.yml` 的 `server.environment` 中暴露 `AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE`，不再默认透传一长串 PageBuilder MCP provider 平铺变量
- [x] 3.4 更新 `build/.env.standalone.example`、`build/.env.cms.example` 和部署 README，说明 PageBuilder runtime MCP provider 推荐配置在 AI providers JSONC 的 `runtimeMcp.pagebuilder` 中，未配置时工具视为未安装
- [x] 3.5 确认默认 compose 和 release compose 不强制声明或依赖 `pagebuilder-mcp-server` sidecar，独立 MCP HTTP/stdio 部署示例继续保持独立
- [x] 3.6 更新 Docker 资产测试，覆盖 AI providers 配置文件入口、默认不强制 sidecar、生产镜像依赖可解析和 env 示例说明

## 4. Verification

- [x] 4.1 运行 `bun run --filter='@ai-page-builder/pagebuilder-mcp-server' test` 或等价 package 测试
- [x] 4.2 运行 `bun test` 中与 `agent-orchestrator`、prompt builder、runtime MCP、图片导入和 Docker assets 相关的聚焦测试
- [x] 4.3 运行 `bun run --filter='@ai-page-builder/app' typecheck`
- [x] 4.4 在有效 provider key 可用时执行一次 `generate_image -> workspace assets -> analyze_image` 的手动或脚本化 E2E；无有效 key 时记录该项阻塞原因
- [x] 4.5 执行 `openspec status --change add-pagebuilder-runtime-mcp-tools`，确认 artifacts 和任务状态可被 OpenSpec 正确识别
