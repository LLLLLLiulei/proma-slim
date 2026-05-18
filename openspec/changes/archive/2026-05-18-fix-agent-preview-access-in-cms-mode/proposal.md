## Why

CMS 集成模式下，Agent 使用 Docker Playwright MCP 排查页面时会收到当前工作区预览 URL，但该 URL 混用了 public base path 与内部 server origin，导致直连后端时命中错误路由；即使修正路径后，预览 GET 请求仍会因缺少浏览器侧 CMS access cookie 被拒绝。需要让 Agent 在不额外走 CMS handoff、不设置 token、不共享用户浏览器 cookie 的前提下，稳定访问当前预览页面完成诊断。

## What Changes

- 单独修正注入给 Agent / Docker Playwright 的内部预览 URL，避免把 public base path `/pagebuilder` 拼到 `http://server:8888` 这类内部后端 origin 上。
- 在 CMS 集成模式下，仅对来自 `AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN` 的内部只读预览展示 GET 请求跳过 CMS access cookie 校验。
- 内部例外范围仅覆盖原本受 Builder Access Session 保护的 workspace preview HTML/静态资源、workspace-scoped CMS 资产代理和预览渲染所需的只读 CMS 数据接口；preview bridge、CMS rendering runtime 等全局只读脚本继续保持既有公开静态资源语义，不依赖该例外。
- 内部 workspace-scoped CMS 数据和资产请求必须通过 URL 中的 `workspaceId` 反查 CMS project binding 并使用 binding `siteId` 限定站点范围；binding 或内部资源缺失时必须失败关闭，且不得访问 CMS 上游。
- 外部 public preview URL、builder 页面、session 消息、发送消息、CMS 选择/应用、页面修改、导出等非内部预览链路继续沿用现有 CMS handoff/access session 校验。
- 不引入新的 Agent 专用入口、URL token、handoff 流程或公开免校验预览能力。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-cms-integration`: 调整 CMS 集成模式下内部 Agent/Playwright 访问预览展示链路的 access cookie 校验要求。
- `page-builder-docker-deployment`: 明确 Docker Playwright sidecar 使用内部 server origin 访问预览时的 URL 构建和内部只读放行行为。
- `page-builder-live-preview`: 调整 Agent 注入的预览 URL 构建规则，确保 Docker 内部预览 URL 使用内部 API path。

## Impact

- 影响 Agent 动态上下文中 `<page_builder_browser_preview_url>` 的生成逻辑。
- 影响 CMS access middleware 对特定内部 GET 预览请求的校验分支。
- 影响 workspace preview、workspace-scoped CMS asset proxy 和只读 CMS data routes 在内部 Playwright 访问场景下的访问控制。
- 需要新增/调整单元测试覆盖内部 URL base path 剥离、内部预览 GET 放行、CMS project binding 失败关闭、外部无 cookie 仍拒绝、写接口仍拒绝等行为。
