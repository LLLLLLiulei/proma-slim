## 1. 测试覆盖

- [x] 1.1 为 `resolvePageBuilderInternalPreviewUrl` 增加单元测试，覆盖 `/pagebuilder` 和多级 `/ai/pagebuilder` base path 下剥离 public base path 后拼接 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`。
- [x] 1.2 为 Agent 动态上下文增加/调整单元测试，确认 Docker HTTP Playwright 模式下注入的 `<page_builder_browser_preview_url>` 不包含 public base path。
- [x] 1.3 为 CMS Builder Access middleware 或相关 route 增加单元测试，确认 CMS 模式下内部 origin 的 workspace preview GET 无 cookie 可访问。
- [x] 1.4 增加单元测试，确认外部 public origin 无 cookie 访问 workspace preview 仍返回 `builder_access_required`。
- [x] 1.5 增加单元测试，确认内部 origin 的 workspace-scoped CMS sites/catalogs/contents/assets GET 可服务预览，且仍按 workspace 对应 project binding 限定站点范围。
- [x] 1.6 增加单元测试，确认内部 origin 的 workspace-scoped CMS sites/catalogs/contents/assets GET 在找不到 project binding、binding 指向 workspace/session 缺失、query `siteId` 不匹配时失败关闭，且不访问 CMS 上游。
- [x] 1.7 增加单元测试，确认 session send/messages、workspace 写接口、CMS auto handoff、导出、builder context 等非预览链路即使来自内部 origin 且无 cookie 也仍被拒绝。

## 2. URL 构建实现

- [x] 2.1 在 Agent 内部预览 URL resolver 中剥离 `AI_PAGE_BUILDER_BASE_PATH`，仅影响 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` 拼接链路。
- [x] 2.2 保持 `getWorkspacePreviewState().entryUrl`、首页 `previewUrl`、CMS handoff preview location 和前端 public URL 行为不变。
- [x] 2.3 确认 base path 为空、`/`、单级、多级路径时 resolver 均保持稳定。

## 3. 内部预览只读放行

- [x] 3.1 在 CMS Builder Access middleware 中实现内部只读预览请求识别：仅 `GET`、请求 URL origin 等于 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN`、路径属于允许清单时跳过 cookie 校验。
- [x] 3.2 允许清单仅覆盖原本受 Builder Access Session 保护的 workspace preview、workspace-scoped CMS assets、sites、catalogs、catalog detail 和 contents；preview bridge、CMS rendering preview runtime、CMS rendering Vue runtime 保持既有全局只读静态资源语义，不通过本次 bypass 扩权。
- [x] 3.3 内部只读例外不得挂载 `cmsBuilderAccess`，不得创建或续期 access session，成功响应不得写出新的 access cookie。
- [x] 3.4 workspace-scoped CMS data/assets route 在内部只读例外下必须通过 workspace 反查 CMS project binding，并继续使用 binding siteId 限定站点范围。
- [x] 3.5 workspace-scoped CMS data/assets route 在内部只读例外下找不到 binding、binding 内部资源缺失或 query `siteId` 与 binding `siteId` 不匹配时必须拒绝请求，且不得调用 CMS 上游。
- [x] 3.6 保持外部 public 请求和所有状态变更请求继续走现有 CMS access cookie、Origin/Referer 和 edit lock 规则。

## 4. 验证与文档

- [x] 4.1 运行相关单元测试，至少覆盖 `page-builder-runtime-playwright`、`agent-orchestrator.workspace`、`cms-builder-access-middleware`、`cms-integration` 或受影响 route 测试。
- [x] 4.2 运行 `bun run typecheck`。
- [x] 4.3 在 Docker CMS 模式下用 curl 或 Playwright MCP 验证 Agent 注入形态的内部预览 URL 可直接访问，且预览 HTML 中的 CMS rendering runtime 能继续加载 workspace-scoped CMS sites/catalogs/contents/assets。
- [x] 4.4 验证外部 public preview URL 无 cookie 仍被拒绝，避免误变成公开预览。
- [x] 4.5 如 Docker 部署文档或 env 示例涉及内部预览 origin 语义，补充说明该 origin 用于 Agent/Playwright 内部只读预览访问，默认应指向 compose 内部 `server` origin，不应配置为浏览器 public origin。
