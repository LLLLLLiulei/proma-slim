## Context

外部 MCP 服务位于 `/Users/liu/Documents/work/learning/mcp-server`，当前包名为 `@z_ai/mcp-server`，bin 为 `zai-mcp-server`，主要通过 `StdioServerTransport` 暴露 MCP tools。该服务已经包含视觉理解、截图文本提取、错误截图诊断、技术图分析、数据可视化分析、UI diff、通用图片分析、视频分析和图片生成等工具，但不在当前 monorepo 中，无法随 AI Page Builder 一起进行 workspace 依赖管理、测试和 Docker 构建。

本变更只负责把该 MCP 服务迁移为当前仓库内的独立 package，并补齐 HTTP MCP 服务和独立 Docker 部署能力。PageBuilder Agent 运行时是否使用该 MCP server、如何注入到 workspace、如何在技能或编排层调用，均留给后续独立变更处理。

## Goals / Non-Goals

**Goals:**

- 在 `packages/pagebuilder-mcp-server` 新增独立 workspace package，使用 `@ai-page-builder/pagebuilder-mcp-server` 包名和 `pagebuilder-mcp-server` bin。
- 迁移外部 MCP 服务当前工作树中的有效源码、测试和必要文档，保留现有工具能力。
- 将 MCP server 创建和工具注册逻辑抽离为可复用模块，使 stdio 和 HTTP 入口共享同一套工具注册逻辑。
- 保留 stdio 入口，并新增 Streamable HTTP MCP 入口，默认监听 `0.0.0.0:3000`，默认 MCP endpoint 为 `/mcp`，健康检查为 `/healthz`。
- 新增独立 Dockerfile、compose 示例和 env 示例，使服务可以单独构建、启动和健康检查。
- 对外服务命名、README、env 示例、日志默认路径使用 `pagebuilder-mcp-server`，避免继续暴露 `zai-mcp-server` 服务产品名。

**Non-Goals:**

- 不把该 MCP server 接入 `apps/app` 的 Agent 编排、默认 MCP 配置生成、workspace `mcp.json` 或 skill 流程。
- 不改造 PageBuilder 现有 web/server/playwright Docker 主 compose 拓扑。
- 不重写外部 MCP 服务的全部 provider 配置模型；第一期允许保留 `Z_AI_*`、`PLATFORM_MODE`、`ALIYUN_*`、`QWEN_*`、`DASHSCOPE_*` 等模型供应商兼容变量。
- 不引入鉴权、多租户隔离或 PageBuilder workspace 级访问控制；该 HTTP MCP 服务第一期按内部可信服务部署。
- 不迁移外部仓库的 `.env`、运行产物、隐藏工具配置、外部 openspec 目录或独立 lockfile。

## Decisions

### 1. 使用独立 workspace package，而不是合并进 `apps/app`

新服务放在 `packages/pagebuilder-mcp-server`，root `package.json` workspace 列表显式加入该 package。这样可以保持 MCP server 与 PageBuilder 主后端的进程边界，后续 Docker 部署、发布、依赖升级和接入策略都可以独立推进。

备选方案是直接把 MCP tools 合并进 `apps/app`。该方案短期接入更直接，但会让模型 provider SDK、图像处理依赖和 MCP transport 与主后端耦合，增加主服务镜像体积和故障面，因此不作为本期方案。

### 2. 保留 JavaScript ESM 源码，不强制 TypeScript 重写

外部 MCP 服务当前为 JavaScript ESM，且已有测试。迁移阶段优先保持源码形态，降低功能回归风险；仅对入口拆分、命名、HTTP transport 和 Docker 适配做必要改造。

后续如果需要更强类型约束，可以再单独推进 TypeScript 化或更细粒度模块重构。

### 3. 抽离 server factory，共享 stdio 与 HTTP 工具注册逻辑

迁移后建议形成以下入口结构：

- `src/server.js`：创建 `McpServer`，注册所有 tools，暴露 `createPageBuilderMcpServer()` 或等价 factory。
- `src/index.js`：stdio 入口，继续通过 `StdioServerTransport` 连接 server。
- `src/http.js`：HTTP 入口，启动 HTTP 服务并把 MCP 请求交给 `StreamableHTTPServerTransport`。

这样可以避免 stdio 和 HTTP 入口各自维护 tool 注册列表，降低后续新增工具时遗漏某个 transport 的风险。

### 4. HTTP MCP 第一阶段采用无会话或短生命周期 transport

HTTP 入口使用 MCP SDK 的 Streamable HTTP transport 暴露 `/mcp`。第一阶段以内部部署和兼容 MCP client 为目标，不引入业务会话、用户身份或 PageBuilder workspace 权限模型。

如果 SDK 使用方式要求每个请求创建 transport，HTTP 入口需要确保请求生命周期结束后释放资源；如果采用 session 管理，则 session 存储必须保持进程内、短生命周期，不能伪装成持久化业务会话。

### 5. 对外命名切换为 `pagebuilder-mcp-server`，provider 变量兼容保留

服务级命名必须切换：

- package：`@ai-page-builder/pagebuilder-mcp-server`
- bin：`pagebuilder-mcp-server`
- MCP server 默认 name：`pagebuilder-mcp-server`
- 默认日志目录或文件名：使用 `pagebuilder-mcp-server` 相关命名
- README 和 Docker 文档：不再把服务称为 ZAI MCP server

但模型供应商配置变量可以保留 `Z_AI_API_KEY`、`Z_AI_BASE_URL` 等兼容入口，因为这些变量在当前外部服务中表示供应商接口配置，而不是本服务的产品名。env 示例应明确其含义，避免把兼容变量包装成新的服务品牌。

### 6. Docker 独立部署，不并入 PageBuilder 主 compose

新增 `build/Dockerfile.pagebuilder-mcp-server` 和独立 compose 示例，例如 `build/docker-compose.pagebuilder-mcp-server.yml`。该 compose 只负责启动 MCP server，不修改 `build/docker-compose.yml`、`build/docker-compose.release.yml` 或 CMS 集成 compose。

Docker 构建应以仓库根目录为 context，安装 workspace 依赖并只运行 MCP server package。由于该服务依赖 `sharp`，镜像构建必须在目标平台内安装依赖，避免复用宿主机 native module。

### 7. 迁移当前工作树有效内容，但排除外部运行状态

实施时以外部 MCP 仓库当前工作树的有效源码为迁移基准，因为该仓库存在未提交变更且这些变更可能包含最新 provider 适配。迁移时只复制必要内容：

- `src/**`
- `test/**`
- README 或重写后的 README
- `.env.example` 中可公开的配置说明
- package metadata 中必要依赖和脚本

必须排除 `.env`、`node_modules`、运行产物、外部 `.git`、`.claude`、`.codex`、`.serena`、外部 `openspec`、外部 lockfile 和平台临时文件。

## Risks / Trade-offs

- [Risk] HTTP MCP transport 与部分 client 的 session 语义不兼容。→ Mitigation：优先使用 MCP SDK 官方 Streamable HTTP transport，并补充基本 health 和 MCP initialize/list tools 验证。
- [Risk] `sharp` native dependency 在 Docker 跨平台构建中安装失败。→ Mitigation：Dockerfile 在镜像目标平台内执行依赖安装，不复制宿主机 `node_modules`。
- [Risk] 外部服务中的 `Z_AI_*` 变量仍可能让使用者误解服务归属。→ Mitigation：对外命名、README 和 env 注释使用 PageBuilder MCP server 表述，并把 `Z_AI_*` 明确标注为供应商兼容变量。
- [Risk] 无鉴权 HTTP MCP endpoint 暴露到公网后可能被滥用。→ Mitigation：第一期文档要求作为内部服务部署，不暴露公网；鉴权和 PageBuilder 集成留给后续独立变更。
- [Risk] 迁移当前工作树内容可能引入外部仓库未完成修改。→ Mitigation：实施后运行 package 测试、基本启动验证和 Docker 构建验证，必要时在任务中单独审查迁移 diff。

## Migration Plan

1. 新增 `packages/pagebuilder-mcp-server`，迁移外部服务有效源码、测试和公开文档。
2. 修改 package metadata、bin、server 默认 name 和 README 命名。
3. 抽离共享 server factory，分别实现 stdio 与 HTTP 入口。
4. 更新 root workspace 列表并刷新 lockfile。
5. 新增 Dockerfile、compose 和 env 示例。
6. 运行 package 测试、stdio 基本启动检查、HTTP health/MCP endpoint 检查和 Docker 构建检查。

如果迁移后出现不可快速修复的功能回归，可以回滚新增 package 与 build 资产；由于本变更不接入 PageBuilder runtime，回滚不会影响现有 PageBuilder 运行链路。

## Open Questions

当前无阻塞性开放问题。后续是否将该 MCP server 接入 PageBuilder Agent、是否增加 HTTP 鉴权、是否发布到私有镜像仓库，均应通过独立 change 再设计。
