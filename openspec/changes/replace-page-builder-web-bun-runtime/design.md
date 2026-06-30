## Context

`page-builder-web` 当前在生产镜像中使用 `oven/bun:1.2.5` 作为 runtime，并通过 `bun apps/page-builder/src/server/prod-server.js` 提供 PageBuilder SPA 静态入口、`/api/*` 反向代理、public base path 兼容和运行时配置注入。线上排查显示，在 CentOS 7 / Linux kernel 3.10 环境下，Docker 升级与 `seccomp=unconfined` 已能让 Playwright sidecar 启动，但 Bun 执行 Web 入口文件仍失败，说明 Web runtime 对 Bun 与宿主内核组合存在兼容风险。

本变更先聚焦 `web` 容器，保持 `server` 容器和 Agent 后端运行方式不变。这样可以用最小变更验证 Node runtime 能否解决 Web 容器启动问题，并避免同时迁移后端带来定位复杂度。

## Goals / Non-Goals

**Goals:**

- 让 `page-builder-web` 生产运行路径不再依赖 `Bun.serve()`、`Bun.file()` 或 Bun CLI。
- 使用轻量 Node.js runtime 镜像运行 Web 容器，优先选择 `node:22-bookworm-slim`。
- 保持现有 Web 网关行为：静态资源服务、SPA fallback、`index.html` runtime config 注入、public base path 兼容、`/api/*` 代理和 forwarded 头传递。
- 构建阶段继续使用 Bun/Vite，避免扩大构建链路变更。
- 在本地完成 Web 镜像构建和容器启动验证，确认 Node runtime 版 Web 容器可以监听端口。

**Non-Goals:**

- 不迁移 `server` 容器到 Node runtime。
- 不重构 PageBuilder renderer、CMS 集成、Agent SDK 调用或后端 API 契约。
- 不改变 `AI_PAGE_BUILDER_BASE_PATH`、`AI_PAGE_BUILDER_SERVER_ORIGIN`、`AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS` 等运行时配置语义。
- 不要求本期解决老内核上 Bun 后端容器启动失败问题。

## Decisions

### 使用 Hono Node server，而不是 Fastify 重写 Web 网关

`prod-server.ts` 已经围绕 Fetch API `Request` / `Response` 组织核心处理函数，Hono 与 `@hono/node-server` 可以直接承载该模型。相比 Fastify，Hono Node server 对当前代码侵入更小，不需要把现有 Fetch handler 重写成 Fastify request/reply 风格。

替代方案：引入 Fastify。该方案可行，但会增加适配层和路由迁移成本；本次目标是降低 Bun runtime 风险，不需要同时更换 Web 框架。

### 构建阶段保留 Bun，运行阶段切换 Node

Dockerfile 继续使用 Bun 完成依赖安装、Vite 构建和 server bundle 生成；runtime stage 改为 `node:22-bookworm-slim`，只复制 PageBuilder dist 与 Node 目标的生产入口产物。这样可以避免一次性替换 monorepo 构建链路，同时让生产容器入口脱离 Bun。

替代方案：完全改为 Node 包管理和构建。该方案变更过大，会影响 lockfile、workspace 构建和现有脚本，不适合作为当前验证阶段。

### 静态资源优先使用 Hono Node 静态服务能力，保留自定义 index 与 fallback 控制

普通静态资源可通过 `@hono/node-server/serve-static` 或等价 Hono Node 静态能力处理，以减少手写 MIME 与文件流逻辑。但 `index.html` 需要按运行时注入 `<base>` 和 `window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__`，SPA fallback 也需要区分“带扩展名资源 404”和“前端路由返回 shell”，因此这些逻辑继续由 `prod-server.ts` 自定义控制。

如果静态中间件与动态 public base path strip 适配导致实现复杂，允许退回到一个很薄的 Node `fs` helper，但该 helper 只能服务普通文件响应，不能恢复 Bun runtime API。

### 保留现有路径规范化与代理语义

现有 `normalizePageBuilderPublicBasePath`、`stripPageBuilderPublicBasePath`、`toPageBuilderBaseHref` 逻辑继续作为路径语义来源。`/api/*` 代理仍按 strip 后路径转发到 `AI_PAGE_BUILDER_SERVER_ORIGIN` / `PROMA_APP_ORIGIN`，并继续补充 `x-forwarded-host` 与 `x-forwarded-proto`。

### Docker 验证先以 Web 容器启动为成功边界

本地验证阶段需要构建 `page-builder-web` 镜像并运行容器，确认其启动、监听端口并能返回 SPA shell/静态资源。由于 `server` 容器仍未迁移，本期不把完整业务对话 API 可用性作为 Web 改造完成条件；`/api/*` 代理可以通过不可达上游或本地 mock 验证路径转发行为。

## Risks / Trade-offs

- [Risk] Node bundle 仍错误引用 Bun 全局对象 → Mitigation：测试和源码扫描必须确认 Web 生产入口不再包含 `Bun.serve`、`Bun.file` 运行路径，并以 Node 运行本地 smoke 验证。
- [Risk] 静态中间件与 public base path strip 顺序冲突 → Mitigation：保留现有路径规范化单元测试，覆盖根路径、base path、资源 404 和 SPA fallback。
- [Risk] Node runtime 镜像缺少必要 CA 或系统能力 → Mitigation：选择 Debian slim 系列而非 Alpine，优先 `node:22-bookworm-slim`。
- [Risk] Web 容器启动成功但整套部署仍不可用 → Mitigation：明确本期只验证 Web runtime，后续单独处理 `server` 容器 Bun runtime 迁移或宿主内核升级。
- [Risk] Docker 镜像体积相对极简运行时增加 → Mitigation：runtime stage 只复制 dist 与入口产物，不复制完整源码、node_modules 或构建缓存。

## Migration Plan

1. 更新 `apps/page-builder` 生产服务依赖，加入 Hono Node server 运行所需依赖。
2. 改造 `prod-server.ts`，用 Hono/Node server 启动服务，并移除 Web 生产路径中的 Bun API。
3. 更新 `build/Dockerfile.page-builder-web`，构建 Node target 入口，runtime stage 使用轻量 Node.js 镜像和 `node` 启动命令。
4. 更新测试，覆盖 Web 服务行为和 Dockerfile 运行时基线。
5. 本地构建 Web 镜像并运行容器 smoke test，确认容器启动和基础页面响应。
6. 如需回滚，恢复 Web Dockerfile runtime stage 为 Bun 版本和原启动命令；该回滚不影响后端数据。

## Open Questions

无关键未决问题。实现中如果发现 Hono 静态中间件与现有 base path 语义冲突，应优先保持现有语义，并使用 Node `fs` helper 替代静态中间件的冲突部分。
