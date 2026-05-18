## Context

当前 workspace preview 的 `entryUrl` 是面向浏览器公开路径生成的，会通过 `AI_PAGE_BUILDER_BASE_PATH` 加上 `/pagebuilder`。在 Docker Playwright MCP 模式下，Agent 动态上下文又把这个 public path 直接拼到 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN=http://server:8888`，形成 `http://server:8888/pagebuilder/api/...`。`server:8888` 是内部后端 origin，实际只接收 `/api/...`，所以该 URL 会命中错误路由。

CMS 集成模式下，workspace preview、workspace-scoped CMS 数据和 CMS 资产代理都受 Builder Access Session cookie 保护。Agent 的 Playwright sidecar 使用独立浏览器上下文，不共享用户浏览器中的 `ai_page_builder_access_*` cookie；因此即使 URL path 修正为 `/api/...`，直接访问预览仍会被 `builder_access_required` 拒绝。用户期望 Agent 继续使用系统注入的预览 URL 直接访问，不新增 handoff、token 或额外交互。

## Goals / Non-Goals

**Goals:**

- 让 Docker Playwright MCP 模式下注入给 Agent 的预览 URL 使用内部 server origin 和内部 API path。
- 仅对来自 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` 的内部只读预览展示 GET 请求跳过 CMS access cookie 校验。
- 保持外部 public preview URL、builder 页面和所有编辑/会话/导出 API 的既有 CMS access 校验。
- 对内部 workspace-scoped CMS data/assets 访问执行 project binding 失败关闭策略，避免因缺少 access session 回退到全局站点范围。
- 保持 public `entryUrl` 的 base path 行为，避免影响浏览器 iframe、新窗口预览和 CMS handoff。

**Non-Goals:**

- 不新增 Agent 专用 URL 入口。
- 不新增 URL token、header token 或 Agent 专用 handoff。
- 不把 public preview URL 改成公开免校验。
- 不放行任何状态变更 API、session 消息 API、builder context 或导出下载。

## Decisions

### 1. 在 Agent 内部 URL resolver 层剥离 public base path

`getWorkspacePreviewState()` 继续返回 public `entryUrl`，例如 `/pagebuilder/api/workspaces/:workspaceId/preview/`。只有 `resolvePageBuilderInternalPreviewUrl()` 在拼接 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` 前剥离 `AI_PAGE_BUILDER_BASE_PATH`，得到 `http://server:8888/api/workspaces/:workspaceId/preview/`。

理由：public `entryUrl` 是浏览器 contract，不能为了 Docker Playwright 改动；问题发生在内部 origin 拼接层，因此修复也应限定在 Agent 内部 URL 构建链路。

替代方案：让 server 兼容 `/pagebuilder/api/*`。该方案会扩大 server 路由兼容面，且容易掩盖 public path 与 internal origin 混用的问题，因此不作为首选。

### 2. 在 CMS Builder Access middleware 中实现内部预览只读例外

在执行 access cookie 校验前，判断请求是否满足：

- 当前为 CMS 集成模式。
- HTTP method 为 `GET`。
- 请求 URL origin 等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`。
- 请求未携带 `X-Forwarded-Host`，即没有经过 public web/nginx 代理链路。
- 请求 path 属于原本受 Builder Access Session 保护的预览展示链路，包括 workspace preview、workspace-scoped CMS assets 和预览渲染所需 workspace-scoped CMS data。

满足时直接进入下游 route，不读取 cookie、不挂载 `cmsBuilderAccess`、不滑动续期。

理由：Agent/Playwright 的访问发生在 Docker 内部网络，不应要求用户浏览器 cookie；但例外必须足够窄，避免把外部 public 预览或写接口变成免校验。

替代方案：对所有 preview GET 放行。该方案更简单，但会让外部 public preview 成为知道 workspaceId 即可访问的资源，不符合“只处理 Agent 访问链路”的约束。

### 3. 内部 workspace-scoped CMS 读取必须从 workspace 反查 project binding

内部只读例外不会挂载 `cmsBuilderAccess`，因此 workspace-scoped CMS data/assets route 不能继续依赖 access session 中的 `projectId`。这些 route 必须使用 URL 中的 `workspaceId` 反查 CMS project binding，并执行以下规则：

- 找不到 binding、binding 指向的 workspace/session 不存在或 binding 与 URL `workspaceId` 不一致时，返回结构化拒绝并且不得调用 CMS 上游。
- 缺省站点必须使用 binding `siteId`。
- 请求 query 中显式传入的 `siteId` 如果与 binding `siteId` 不一致，必须拒绝请求，不得用该 query `siteId` 请求 CMS 上游。
- 不允许回退到全局默认 `siteId`、全局 CMS 设置或其他项目的 binding。

理由：内部例外只解决 Agent sidecar 无法携带用户浏览器 cookie 的问题，不改变 CMS 集成模式下“项目绑定决定数据范围”的安全边界。

### 4. 内部放行仍复用现有 route 语义

内部预览请求继续命中现有 workspace preview、CMS data 和 CMS asset route；route 本身仍负责路径解析、workspace 查找、CMS 上游请求、缓存头和内容类型。

理由：避免新增重复内部 preview endpoint，降低与现有预览渲染、CMS 资源重写和日志行为分叉的风险。

### 5. 全局预览脚本不纳入本次 access bypass

`/api/page-builder/preview-bridge.js`、`/api/page-builder/cms-rendering-preview.js`、`/api/page-builder/cms-rendering-vue.js` 等全局只读脚本保持既有公开静态资源语义。这些脚本可被内部 Playwright 访问，但不需要通过本次 CMS Builder Access middleware 例外实现。

## Risks / Trade-offs

- [Risk] `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` 如果被错误配置为 public origin，可能导致 public GET 预览链路被误判为内部请求。→ Mitigation: 仅当 request URL origin 与配置完全一致且请求未携带 `X-Forwarded-Host` 时放行，并在 Docker 示例中继续默认配置为 `http://server:8888`；测试覆盖 public origin 和经代理 internal-origin 请求无 cookie 仍拒绝。
- [Risk] 内部放行请求没有 access session 上下文，workspace-scoped CMS data route 若继续依赖 access session 中的 project binding context 可能无法确定站点范围。→ Mitigation: 内部预览只读请求必须通过 workspaceId 反查 project binding；找不到 binding 或内部资源缺失时失败关闭，不得调用 CMS 上游或回退到全局 siteId。
- [Risk] CMS preview runtime 可能请求的只读接口未完全纳入放行范围，导致 HTML 能打开但动态内容缺失。→ Mitigation: 放行范围覆盖 workspace preview、workspace-scoped CMS assets、sites、catalogs、catalog detail 和 contents，并通过 Playwright/curl 验证 CMS 页面预览实际渲染。
- [Risk] 内部预览只读放行可能被误扩展到写接口。→ Mitigation: 单元测试明确覆盖 `POST /api/sessions/:id/send`、workspace 写 API、export 等无 cookie 仍被拒绝。
