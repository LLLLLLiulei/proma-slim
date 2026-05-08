## Context

CMS 集成第一阶段要求浏览器通过 CMS 同源路径访问 PageBuilder，例如 `/pagebuilder/`、`/pagebuilder/builder/...`、`/pagebuilder/api/...`。生产环境通常由 Nginx 或 CMS 网关在 `location /pagebuilder/` 下反向代理 PageBuilder Web，并剥离 `/pagebuilder` 前缀后转发给 upstream。

当前 PageBuilder 的应用内部路径均假设根路径：Web 生产服务代理 `/api/*`，Vite 静态资源引用使用 `/assets/*`，renderer 路由只解析 `/` 与 `/builder/*`，API client 直接 fetch `/api/*`，服务端 preview state 和运行时脚本 URL 也返回 `/api/*`。这些路径在浏览器公开 base path 下会请求到 CMS 根路径，导致页面资源、API、预览和运行时脚本失效。

## Goals / Non-Goals

**Goals:**

- 支持 PageBuilder public base path，例如 `/pagebuilder`，用于浏览器地址、静态资源、前端 API 请求、builder 导航、preview URL 和 runtime script URL。
- 保持无 base path 时的 standalone 根路径行为完全兼容。
- 生产推荐 Nginx/CMS 网关 strip-prefix 模型：浏览器请求 `/pagebuilder/*`，PageBuilder Web upstream 接收根相对路径 `/*`。
- PageBuilder Web 同时支持未剥离 base path 的直连兼容：直接请求 `/pagebuilder/*` 时可剥离后按 upstream 路径处理。
- 保持 `apps/app` 后端内部路由只接收 `/api/*`，避免把 public base path 泄漏到后端 route 层。

**Non-Goals:**

- 不实现 CMS project binding、handoff、Builder Access Session、Cookie Path、鉴权中间件或 API 保护。
- 不落地真实生产 Nginx 配置，只在文档和部署示例中说明推荐 `location /pagebuilder/` strip-prefix 语义。
- 不在构建阶段固化某个 public base path；生产 HTML 由 PageBuilder Web 在运行时注入当前 base path。
- 不切换 CMS 数据接口，也不改变现有 CMS browser、static export、edit lock 的权限语义。

## Decisions

### Decision 1: 将 `AI_PAGE_BUILDER_BASE_PATH` 定义为 public/browser-facing base path

`AI_PAGE_BUILDER_BASE_PATH` 表示浏览器可见的 PageBuilder 挂载前缀，例如 `/pagebuilder`。它影响前端路由、生产 HTML 运行时注入、API client、preview URL、runtime script URL、静态导出下载 URL 和后续 Cookie Path，但不表示 `apps/app` 后端 route 要挂载到 `/pagebuilder/api/*`。

替代方案是把 base path 作为应用 upstream mount path，让 PageBuilder Web 和 Server 都直接处理 `/pagebuilder/*`。该方案会把生产 Nginx 的 prefix strip、应用内部 route 和后续 access cookie 边界混在一起，容易造成双重剥离或双入口，因此不采用。

配置值应在统一 helper 中规范化和校验：

- 未设置、空字符串或 `/` 表示 root mode；浏览器公开前缀为空。生产构建使用 runtime-neutral 的相对资源路径，运行时注入的 base href 为 `/`。
- `pagebuilder`、`/pagebuilder`、`/pagebuilder/` 应规范化为同一个 public base path：`/pagebuilder`。
- base path 必须是 path-only 前缀；包含 origin、query、hash、路径穿越片段或反斜杠的值应视为非法。
- 非法值应在构建或服务启动时 fail fast，并输出清晰配置错误；系统 SHALL NOT 静默回退到 root mode。

### Decision 2: 生产推荐由 Nginx/CMS 网关剥离 prefix，应用保留根相对 upstream

生产推荐路径：

```text
Browser /pagebuilder/api/status
  -> Nginx strip /pagebuilder
  -> PageBuilder Web /api/status
  -> PageBuilder Server /api/status
```

PageBuilder Web 在 upstream 层继续支持 `/`、`/builder/*`、`/assets/*`、`/api/*`。这与现有部署和本地 standalone 行为兼容，也让 `apps/app` Server 不需要新增 `/pagebuilder/api/*` route。

### Decision 3: PageBuilder Web 提供未剥离 base path 的直连兼容

为了便于本地测试、Docker 直连和没有 Nginx 的简单部署，PageBuilder Web 在配置 base path 后也可以直接处理 `/pagebuilder/*`：先剥离 public base path，再按 upstream root-relative 路径进行静态资源、SPA fallback 或 API proxy。

这不是生产推荐主路径，但能用单元测试覆盖 `GET /pagebuilder/api/status`、`GET /pagebuilder/builder/...` 等行为，并降低联调成本。

### Decision 4: Web 镜像使用 runtime-neutral 构建，生产 HTML 运行时注入 base path

Vite 构建产物使用相对资源路径，避免在镜像构建阶段固化某个 public base path。生产 Web server 在返回 `index.html` 或 SPA fallback 时注入 `<base href="...">` 与 `window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__`，renderer 优先读取该运行时配置；同一 web 镜像可通过运行时 `AI_PAGE_BUILDER_BASE_PATH` 切换 `/`、`/pagebuilder` 或多级 base path。

替代方案包括构建期固化 Vite public base path，或只依赖相对资源路径而不注入运行时 `<base>`。构建期固化会导致切换 base path 必须重建镜像；只依赖相对路径则会在 `/pagebuilder/builder/:workspaceId/:sessionId` 这类深层 SPA fallback 下把资源解析到错误层级，因此不采用。

### Decision 5: 前端继续使用逻辑路径，统一在边界解析 public base path

业务代码不应到处拼 `/pagebuilder`。renderer 路由 helper 负责构建首页和 builder 路径；API client 继续接受逻辑 `/api/*`，在 PageBuilder runtime 下解析为 `${basePath}/api/*`；服务端 URL helper 负责生成浏览器可访问的 preview 和 runtime script URL。

这样可以保持主应用共享的 `api.ts` 不受影响，并减少重复前缀风险。

共享 API client 的 base path 解析必须由 PageBuilder renderer 明确启用，例如通过运行时注入配置或 PageBuilder 专用 public path helper 得到当前 public base path；它不应在主应用运行时读取或套用 PageBuilder base path。该解析只允许作用于逻辑相对 `/api/*` 路径，绝对 URL、非 API 相对路径和 root mode 下的 `/api/*` 必须保持现有行为。

## Risks / Trade-offs

- **运行时注入残留旧 base path** → Web server 在注入前清理既有 `<base>` 和 runtime config，确保切换 `AI_PAGE_BUILDER_BASE_PATH` 后响应 HTML 不残留旧前缀。
- **Nginx 和 PageBuilder Web 双重剥离 prefix** → 生产推荐 Nginx strip 后 upstream 接收根相对路径；PageBuilder Web 的 `/pagebuilder/*` 兼容仅在请求实际带 prefix 时生效，剥离只发生一次。
- **共享 API client 误影响主应用** → base path 解析只应用于相对逻辑 `/api/*`，且默认 base path 为空或 `/` 时保持现状；补充主应用根路径测试。
- **后端返回 URL 漏掉 base path** → 将 preview `entryUrl`、CMS asset proxy、preview bridge、CMS rendering runtime script URL 和静态导出下载 URL 纳入同一 public path 处理，并补充单元测试。
- **直连兼容被误认为生产必需路径** → spec 和 design 明确生产推荐 Nginx strip-prefix，直连 `/pagebuilder/*` 只是兼容和测试便利。

## Migration Plan

1. 默认未设置 `AI_PAGE_BUILDER_BASE_PATH` 时保持现有根路径部署，无需迁移。
2. 需要 CMS 同源挂载时，在运行环境中设置 `AI_PAGE_BUILDER_BASE_PATH=/pagebuilder`，并配置 Nginx/CMS 网关将 `/pagebuilder/` 反向代理到 PageBuilder Web upstream `/`。
3. 如发现 base path 部署异常，可回滚为未设置 `AI_PAGE_BUILDER_BASE_PATH` 的根路径运行方式，无需重建 web 镜像。

## Open Questions

无阻塞问题。Change 1 先按 Nginx strip-prefix 为生产推荐、PageBuilder Web 直连 prefix 为兼容路径推进。
