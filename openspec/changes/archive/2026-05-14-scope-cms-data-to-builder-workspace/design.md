## Context

当前 PageBuilder CMS 集成模式已经具备 project binding、handoff、Builder Access Session、直接 builder/preview/API 访问保护，以及旧全局 CMS browser API fail closed。遗留问题是 CMS 数据读取和资产代理仍只有旧全局 `/api/page-builder/cms/*` 入口；在 CMS 集成模式下该入口不能继续匿名开放，导致 Builder 页面暂时禁用了 CMS 浏览弹框。

Change 6 的目标是在不切换 CMS 上游数据接口的前提下，把 CMS 站点、栏目、内容和资产代理迁移到带 workspace 上下文的受控入口。该入口应复用现有 Builder Access Session middleware，并以 project binding 中保存的 `siteId` 作为当前 workspace 可访问 CMS 数据的边界。

## Goals / Non-Goals

**Goals:**

- 提供 `/api/workspaces/:workspaceId/page-builder/cms/*` workspace-scoped CMS 数据读取和资产代理路由。
- CMS 集成模式下，所有 workspace-scoped CMS 路由必须通过 Builder Access Session 校验，且只能访问 access session 对应 workspace。
- CMS 集成模式下，所有 CMS 数据读取以 project binding 的 `siteId` 为准，不允许 query 或业务 payload 切换到其他站点。
- 恢复 CMS 集成模式下 Builder 页面的 CMS 浏览弹框，使其使用 workspace-scoped CMS API。
- preview HTML 和 CMS rendering preview runtime 在 workspace 上下文中使用 workspace-scoped CMS 代理路径。
- 保持 standalone 模式旧全局 CMS browser API 的兼容行为。

**Non-Goals:**

- 不切换到 CMS UI 数据接口；仍复用现有 `CmsGateway` 和旧 CMS 读取链路。
- 不重构 `page-builder-static-export-service.ts` 或同步导出核心流程；导出由后续 Change 7 处理。
- 不实现 CMS 业务角色或业务权限判断；CMS 业务权限仍由 CMS 自身在创建 handoff 前判断。
- 不引入多 CMS、多租户或跨实例分布式 session 存储。
- 不在本变更中强制校验每个资产 URL 必然属于绑定站点 URL；先保持现有 CMS asset allowlist/解析逻辑，并补上 workspace/access 边界。

## Decisions

### 1. 新增 workspace-scoped CMS API，而不是让旧全局 API 接受 workspaceId query

新增路由：

- `GET /api/workspaces/:workspaceId/page-builder/cms/sites`
- `GET /api/workspaces/:workspaceId/page-builder/cms/catalogs`
- `GET /api/workspaces/:workspaceId/page-builder/cms/catalogs/:catalogId`
- `GET /api/workspaces/:workspaceId/page-builder/cms/contents`
- `GET /api/workspaces/:workspaceId/page-builder/cms/assets?url=...`

理由：workspaceId 放在路径中可以直接复用 `workspaceRoutes` 的 `workspaceMiddleware` 和 `createCmsBuilderAccessMiddleware`，访问边界清晰；旧全局 API 加 query 容易被误用为匿名入口，也不符合已建立的 fail closed 语义。

替代方案：扩展旧 `/api/page-builder/cms/*?workspaceId=...`。该方案会让旧入口同时承担 standalone 和 CMS 模式职责，增加误放行风险，因此不采用。

### 2. CMS 模式下 siteId 由 project binding 决定

CMS 模式下，workspace-scoped CMS 路由通过 `c.var.cmsBuilderAccess.projectId` 找到 project binding，并校验：

- binding 存在。
- binding.workspaceId 等于 URL workspaceId。
- binding.primarySessionId 与 access session sessionId 仍匹配。
- 请求 query 中的 `siteId` 缺省时使用 binding.siteId。
- 请求 query 中的 `siteId` 存在且不等于 binding.siteId 时拒绝。

理由：`siteId` 是 CMS 创建项目时绑定到 project 的长期边界，浏览器不应通过 query 切换站点读取数据。

替代方案：静默覆盖 query `siteId` 为 binding.siteId。该方案安全但不利于发现前端或调用方错误，因此采用显式拒绝。

### 3. sites 路由在 CMS 模式下只返回绑定站点

`sites` 仍调用现有 `CmsGateway.listSites()` 获取站点摘要，但 CMS 模式响应只保留 binding.siteId 对应项。如果上游没有返回该站点，系统返回空数组并保持 no-store 响应，让弹框展示无可用站点状态；系统不得伪造站点摘要，也不得返回其他站点兜底。

理由：前端现有 CMS browser 依赖站点列表初始化 selectedSiteId；返回单站点可以最小改动恢复交互，同时不泄露其他站点。

替代方案：新增只返回 `{ siteId }` 的轻量接口。该方案需要额外前端分支，且无法展示站点名称，不采用。

### 4. preview 统一使用 workspace-scoped CMS 代理路径

workspace preview 服务在生成 HTML 时已持有 workspace 对象，因此可以生成：

- CMS 资产代理：`/api/workspaces/:workspaceId/page-builder/cms/assets?url=...`
- CMS rendering runtime `cmsProxyBase`：`/api/workspaces/:workspaceId/page-builder/cms`

这些路径再通过现有 public base path helper 加上 runtime base path。

理由：preview HTML 和 preview runtime 是最容易在 CMS iframe/new window 中被直接加载的链路，必须携带 workspace 上下文才能让 access middleware 校验。

替代方案：CMS 模式使用 workspace-scoped，standalone workspace preview 继续使用旧全局 preview 代理。该方案可行但增加模式分支；workspace-scoped preview 在 standalone 下也有 workspace 上下文且不会破坏旧 CMS browser 兼容，因此 workspace preview 统一生成 workspace-scoped 代理路径。旧全局 `/api/page-builder/cms/*` 仅保留给 standalone CMS browser 或其他非 workspace preview 的兼容客户端。

### 5. 前端 API client 提供 scoped/legacy 双入口

`apps/app/src/renderer/lib/api.ts` 保留现有旧全局 CMS browser 方法给 standalone 使用，并新增或扩展可选 `workspaceId` 参数以构造 workspace-scoped URL。`useCmsBrowserState` 根据传入的 `workspaceId` 决定使用 scoped 或 legacy 路径。

理由：模式选择应集中在 hook/API client，展示组件 `CmsCatalogDetailPanel`、`CmsContentList` 不应承担数据请求职责。

替代方案：在每个展示组件中拼接不同 API。该方案会扩大职责和测试面，不采用。

### 6. cms-auto-handoff 同步校验 selection.siteId

CMS 模式下，`cms-auto-handoff` 已是 workspace-scoped 写 API；本变更应在创建 Agent handoff 前确认 `selection.siteId` 等于当前 project binding `siteId`。

理由：CMS browser 读取链路被限制后，手写请求仍可能把其他站点 `siteId` 放入 selection payload。校验该字段可以保持“CMS 数据只属于当前 workspace/project”的一致边界。

替代方案：只约束 GET 数据 API，不约束 handoff payload。该方案留下绕过面，不采用。

## Risks / Trade-offs

- [风险] `sites` 需要先读取全量站点再过滤绑定站点，理论上仍调用了全量上游接口。→ 缓解：全量站点不会返回给浏览器；后续切换 CMS UI 数据接口时再优化为按站点读取。
- [风险] 资产 URL 只做 workspace/access 边界，不做绑定站点 URL 严格归属校验。→ 缓解：沿用现有 CMS asset allowlist，避免误伤历史资源；更严格的站点 URL allowlist 可作为后续增强。
- [风险] preview 统一改为 workspace-scoped CMS proxy 可能影响旧测试中对 `/api/page-builder/cms/assets` 的断言。→ 缓解：更新 preview 相关测试，保留旧全局 CMS browser API 测试覆盖 standalone 兼容。
- [风险] 前端 hook 引入 workspaceId 分支后，状态切换可能复用旧站点/栏目缓存。→ 缓解：将 workspaceId 纳入 hook 依赖，workspaceId 变化时重置 CMS browser 状态。
- [风险] access session 失效后 CMS browser 和 preview runtime 请求会返回 401。→ 缓解：沿用 Builder 页面已有“从 CMS 重新进入”语义，前端展示读取失败/重试，不自动绕过旧全局接口。

## Migration Plan

1. 后端先新增 workspace-scoped CMS route helper，并复用现有 CMS gateway 读取逻辑。
2. 增加 CMS 模式 siteId binding 校验与 standalone 兼容测试。
3. 调整 preview HTML 生成和 CMS rendering runtime proxy base。
4. 调整前端 API client、`useCmsBrowserState` 和 `BuilderPage` 传参，恢复 CMS 模式下 CMS browser。
5. 更新相关 OpenSpec delta specs 与测试断言。
6. 回滚策略：如新 scoped 路由异常，可回滚本 change；旧全局 API 在 CMS 模式下仍 fail closed，不会扩大匿名暴露面。

## Open Questions

无阻塞问题。默认采用“资产代理只补 workspace/access 边界，不在本变更中按绑定站点 URL 做强校验”的口径。
