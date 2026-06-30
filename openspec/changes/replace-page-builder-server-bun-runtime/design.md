## Context

`page-builder-server` 当前生产镜像使用 `oven/bun:1.2.5` 作为 runtime，并通过 `bun run start` 执行 `apps/app/src/main/index.ts`。后端 HTTP 服务使用 `Bun.serve()` 承载 Hono app，多个静态/下载/预览接口使用 `Bun.file()` 返回文件，preview bridge 与 CMS rendering preview 资产在运行时通过 `Bun.build()` 动态生成。

线上验证已经确认：在目标 CentOS 7 / Linux kernel 3.10 环境中，升级 Docker 与增加 `seccomp=unconfined` 后 Bun runtime 仍会导致 server 容器启动失败；而 `page-builder-web` 迁移到 `node:22-bookworm-slim` 后可以正常启动并返回页面。server 迁移必须在保持 API、SSE、Agent SDK、CMS、预览和历史数据路径不变的前提下完成。

## Goals / Non-Goals

**Goals:**

- 让 `page-builder-server` 生产运行阶段使用 `node:22-bookworm-slim`，不再要求容器 runtime 内安装或调用 Bun CLI。
- 后端 HTTP 服务从 `Bun.serve()` 迁移到 Node/Hono server，并保持现有 `createHttpServer()` 使用方需要的 `port` 与 `stop(force?)` 能力。
- 所有 server 生产运行路径不再调用 `Bun.file()`；文件、预览和下载响应改为 Node 兼容实现。
- preview bridge 与 CMS rendering preview bootstrap 改为构建阶段预生成，运行时只读取构建产物。
- 保持 `server` 镜像名、compose 环境变量、端口、数据卷 `/home/bun/.ai-page-builder`、Agent SDK env 注入和 CMS 集成语义不变。
- 本地完成 server 镜像构建与容器 smoke test，覆盖 `/api/status`、静态文件、preview 资产和 SDK CLI 可发现性。

**Non-Goals:**

- 不把 monorepo 构建链路从 Bun 全量迁移到 npm/pnpm。
- 不重写 Hono 路由、REST API、SSE 协议、CMS 集成业务逻辑或 Agent Orchestrator。
- 不迁移或重命名历史数据目录 `/home/bun/.ai-page-builder`。
- 不在本变更中改变 Playwright sidecar 镜像、MCP 配置或 Agent SDK env 白名单。
- 不要求解决所有宿主机内核兼容问题；本变更只消除 server runtime 对 Bun 的依赖。

## Decisions

### 构建阶段保留 Bun，运行阶段使用 Node 22

Dockerfile 继续用 Bun 安装 workspace 依赖、执行 `@ai-page-builder/app` Vite build，并用 `bun build --target=node --format=esm` 生成 Node 可执行的 server bundle。runtime stage 使用 `node:22-bookworm-slim` 并直接 `node apps/app/src/main/index.mjs` 启动。

替代方案是把构建也迁移到 npm/pnpm。该方案会扩大 lockfile、workspace 安装、脚本和 CI 影响范围，不符合当前“先让生产 server 在老内核上启动”的目标。生产容器也不建议通过 `npm run start` 或 `pnpm start` 间接启动，因为当前 start 脚本仍以 Bun 为默认本地运行路径，且 Node runtime 直接执行 bundle 更可控。

### 使用 `@hono/node-server` 承载现有 Hono app

`apps/app/src/main/http/app.ts` 已经把路由组织为 Hono app，server 入口只需要替换底层监听器。`@hono/node-server` 能直接接收 Hono `fetch` handler，避免引入 Express/Koa/Fastify 适配层。

实现上需要在 `createHttpServer()` 返回一个轻量 wrapper，暴露当前 `index.ts` 依赖的 `port` 和 `stop(force?)`。`stop()` 内部关闭 Node server；`force` 参数只保留兼容语义，不要求映射到 Bun 的强制关闭能力。

### 统一 Node 文件响应 helper，避免各路由重复处理 fs stream

`Bun.file()` 使用点分布在静态资源、workspace preview、template preview、静态导出下载和 CMS export 下载中。迁移时应新增一个小型 Node 兼容 helper，例如 `createFileResponse(filePath, { headers })`，集中处理：

- 文件存在性由调用方或 helper 按既有错误语义处理；
- 使用 `fs.createReadStream()` 与 `Readable.toWeb()` 生成 Web `Response` body；
- 保留调用方传入的 `cache-control`、`content-disposition`、`content-type`；
- 对普通静态资源使用轻量 MIME 解析库或集中映射补齐内容类型。

替代方案是引入 Express `serve-static` / `send`。这些库偏 Node `req/res` 模型，与当前 Hono/Web Response 模型不一致，会引入额外适配层；本次不采用。

### 构建期预生成 preview 运行时资产

`page-builder-preview-bridge.ts` 与 `page-builder-cms-rendering-preview.ts` 运行时调用 `Bun.build()` 是 Node runtime 的阻断点。Docker build stage 应预生成：

- `page-builder-preview-bridge.js`
- `cms-rendering-preview.js`

运行阶段通过环境变量指定产物路径并只读加载。preview bridge 已有 `PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_PATH` 覆盖入口；CMS rendering preview 需要增加等价的 `PROMA_PAGE_BUILDER_CMS_RENDERING_PREVIEW_PATH`。本地 Bun 开发模式仍可保留动态构建 fallback，以减少开发流程变化。

### 用环境变量显式固定 runtime 资源目录

server bundle 后，`import.meta.url` 相对路径可能不再对应源码目录。runtime stage 应显式设置内置资源路径，避免 bundle 输出位置变化导致资源找不到：

- `PROMA_DEFAULT_SKILLS_DIR=/app/apps/app/default-skills`
- `PROMA_WORKSPACE_TEMPLATES_DIR=/app/apps/app/resources/templates`
- `PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_PATH=/app/apps/app/dist-server/page-builder-preview-bridge.js`
- `PROMA_PAGE_BUILDER_CMS_RENDERING_PREVIEW_PATH=/app/apps/app/dist-server/cms-rendering-preview.js`

同时继续保留 `AI_PAGE_BUILDER_CONFIG_DIR=/home/bun/.ai-page-builder` 与 `AI_PAGE_BUILDER_SDK_HOME=/home/bun/.ai-page-builder/sdk-config`，保证历史数据卷兼容。

### Agent SDK 继续走 Node executable

现有 Agent Orchestrator 已优先选择检测到的 Node runtime，再 fallback Bun。Node 22 runtime 镜像中应能通过 `which node` 检测到 Node，并通过 `createRequire(import.meta.url)` 找到 `@anthropic-ai/claude-agent-sdk/cli.js`。server bundle 不应把 Agent SDK CLI 打包成不可解析形态，因此 runtime 仍需要复制 `node_modules`，并让 `@anthropic-ai/claude-agent-sdk`、`sharp` 等依赖保持可用。

## Risks / Trade-offs

- [Risk] server bundle 后相对资源路径失效 → Mitigation：Docker runtime 显式设置 default skills、workspace templates、preview 资产路径，并保留必要资源目录复制。
- [Risk] `Bun.build()` fallback 在 Node runtime 下被误触发 → Mitigation：Dockerfile 必须生成并配置 preview 资产路径，测试断言 runtime 入口不依赖 Bun build。
- [Risk] `Bun.file()` 替换导致下载或静态资源内容类型变化 → Mitigation：集中 helper 保留调用方 headers，并用测试覆盖 zip 下载、HTML preview、静态 asset 响应。
- [Risk] Agent SDK CLI 在 bundle 后无法解析 → Mitigation：runtime 复制 `node_modules`，并用 `/api/status` 与容器 smoke test 验证 `sdkCliAvailable=true`。
- [Risk] native 依赖如 `sharp` 在 Node slim runtime 下加载失败 → Mitigation：使用 Debian bookworm slim，与构建环境保持 glibc 系列兼容；镜像 smoke test 覆盖图片优化或至少 Node 加载路径。
- [Risk] Node server `stop()` 语义与 Bun `stop(true)` 不完全一致 → Mitigation：保持接口兼容并在 shutdown handler 中关闭 Node server；Agent 停止仍先由 `stopAllAgents()` 完成。
- [Risk] 镜像体积可能因复制 `node_modules` 较大 → Mitigation：本期优先保证稳定启动，后续再考虑生产依赖裁剪。

## Migration Plan

1. 增加 `@hono/node-server` 与必要轻量文件 MIME 依赖，更新 lockfile。
2. 改造 `http-server.ts`，以 Node/Hono server 启动并返回兼容 `port` / `stop(force?)` 的 server handle。
3. 新增 Node 文件响应 helper，替换所有 server 生产路径中的 `Bun.file()`。
4. 为 CMS rendering preview 增加预构建资产覆盖路径；复用 preview bridge 既有覆盖路径。
5. 更新 `build/Dockerfile.page-builder-app`：构建 Node server bundle 和 preview 资产，runtime stage 改为 `node:22-bookworm-slim`，设置显式资源路径并用 `node` 启动。
6. 更新 Docker 资产测试、HTTP/static/file response 测试和 preview 相关测试。
7. 本地构建并运行 server 镜像，验证容器启动、`/api/status`、静态资源、preview 资产、zip 下载和 SDK CLI 可发现性。
8. 如验证通过，构建 amd64 server 镜像并推送；服务器只重建 `server` 服务验证不再重启。
9. 回滚方式：恢复 `build/Dockerfile.page-builder-app` runtime stage 为 Bun 版本和原 `bun run start` 命令；代码层 Node 兼容改造可保留，因为本地 Bun 也可运行 Hono app 与 Node fs helper。

## Open Questions

无关键未决问题。实现阶段如发现某个依赖被 bundle 后不能正常运行，应优先将其标记为 external 并保留在 runtime `node_modules` 中，而不是扩大业务代码重写范围。
