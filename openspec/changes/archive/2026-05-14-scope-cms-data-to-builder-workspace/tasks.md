## 1. 后端 workspace-scoped CMS API

- [x] 1.1 抽取或复用现有 CMS browser 路由读取逻辑，避免旧全局路由和 workspace-scoped 路由复制不一致的参数校验、错误映射和 no-store 响应处理。
- [x] 1.2 在 `workspaceRoutes` 下新增 `GET /:workspaceId/page-builder/cms/sites`，CMS 模式下校验 Builder Access Session 和 project binding，并只返回绑定 `siteId` 对应站点。
- [x] 1.3 在 `workspaceRoutes` 下新增 `GET /:workspaceId/page-builder/cms/catalogs`，CMS 模式下强制使用 project binding `siteId`，并拒绝不匹配的 query `siteId`。
- [x] 1.4 在 `workspaceRoutes` 下新增 `GET /:workspaceId/page-builder/cms/catalogs/:catalogId`，CMS 模式下强制使用 project binding `siteId`，并拒绝不匹配的 query `siteId`。
- [x] 1.5 在 `workspaceRoutes` 下新增 `GET /:workspaceId/page-builder/cms/contents`，CMS 模式下强制使用 project binding `siteId`，并拒绝不匹配的 query `siteId`。
- [x] 1.6 在 `workspaceRoutes` 下新增 `GET /:workspaceId/page-builder/cms/assets?url=...`，CMS 模式下校验 Builder Access Session 后复用现有 CMS asset 解析和代理逻辑。
- [x] 1.7 保持旧全局 `/api/page-builder/cms/*` 在 CMS 模式下 fail closed，standalone 模式行为不回退、不破坏。

## 2. CMS siteId 边界与写入链路校验

- [x] 2.1 增加 project binding 解析 helper：从 `c.var.cmsBuilderAccess.projectId` 查找 binding，并校验 binding workspace/session 与 access session 一致。
- [x] 2.2 统一实现 CMS 模式 query `siteId` 校验：缺省使用 binding `siteId`，不匹配时返回 `builder_access_mismatch`，且不得访问 CMS 上游。
- [x] 2.3 在 `cms-auto-handoff` 中校验 `selection.siteId` 必须等于当前 project binding `siteId`，不匹配时拒绝创建 handoff。
- [x] 2.4 确认 workspace-scoped CMS API 成功响应继续设置 no-store，并触发 Builder Access Session 滑动续期；失败响应不续期。

## 3. Preview 和 CMS rendering runtime 路径

- [x] 3.1 调整 `workspace-preview-service.ts` 中 CMS 远程资源重写逻辑，使 preview HTML 生成 `/api/workspaces/:workspaceId/page-builder/cms/assets?url=...` 或带 public base path 的等价 URL。
- [x] 3.2 调整 CMS rendering preview 注入配置，使 `cmsProxyBase` 指向 `/api/workspaces/:workspaceId/page-builder/cms` 或带 public base path 的等价路径。
- [x] 3.3 保持 `cms-rendering-preview.js` 和 `cms-rendering-vue.js` 本身仍为无项目数据静态脚本，不要求 Builder Access Session。
- [x] 3.4 更新 preview 相关测试，覆盖有无 public base path 时 workspace-scoped CMS asset/proxy URL 生成。

## 4. 前端 CMS browser 调用链

- [x] 4.1 扩展 renderer API client，支持按可选 `workspaceId` 构造 workspace-scoped CMS sites/catalogs/detail/contents 路径，未传 `workspaceId` 时继续使用旧全局路径。
- [x] 4.2 扩展 CMS 图片代理 helper，支持按可选 `workspaceId` 生成 workspace-scoped assets URL，并继续兼容 standalone 旧全局 assets URL。
- [x] 4.3 修改 `useCmsBrowserState` 接收可选 `workspaceId`，并在 CMS 集成模式传入 workspaceId 时使用 workspace-scoped CMS API；workspaceId 变化时重置内部状态。
- [x] 4.4 修改 `CmsBrowserDialog` 透传 workspaceId 给 `useCmsBrowserState`、`CmsCatalogDetailPanel` 和 `CmsContentList` 所需图片 helper，不把数据请求职责下放给展示组件。
- [x] 4.5 修改 `BuilderPage` 在 CMS 集成模式下不再设置 CMS browser 暂不可用提示，并把当前 workspaceId 传给 `CmsBrowserDialog`。
- [x] 4.6 保持 standalone 模式 CMS 浏览弹框继续使用旧全局 `/api/page-builder/cms/*` 读取链路。
- [x] 4.7 确认 workspace preview 在 standalone 和 CMS 模式下都生成 workspace-scoped CMS proxy 路径，旧全局 CMS proxy 不再作为 workspace preview runtime 的输出路径。

## 5. 测试与验证

- [x] 5.1 增加 HTTP 路由测试：CMS 模式无 access cookie 请求 workspace-scoped CMS API 返回 `builder_access_required`。
- [x] 5.2 增加 HTTP 路由测试：CMS 模式 access workspace 不匹配返回 `builder_access_mismatch`。
- [x] 5.3 增加 HTTP 路由测试：CMS 模式 query `siteId` 不匹配 project binding 时拒绝，且不会请求 CMS 上游。
- [x] 5.4 增加 HTTP 路由测试：CMS 模式 `sites` 只返回绑定站点，旧全局 CMS API 仍 fail closed。
- [x] 5.5 增加 HTTP 路由测试：CMS 模式 `cms-auto-handoff` 的 `selection.siteId` 不匹配时拒绝。
- [x] 5.6 增加或调整前端测试，覆盖 CMS 集成模式 `CmsBrowserDialog` 使用 workspace-scoped API，standalone 模式仍使用旧全局 API。
- [x] 5.7 运行相关 Bun 单元测试和类型检查，至少覆盖 app 后端路由、workspace preview、CMS browser dialog、BuilderPage 与 page-builder 包 typecheck。
- [x] 5.8 增加或调整 OpenSpec 覆盖，确保 `page-builder-cms-auto-agent-handoff` 记录 CMS 模式 `selection.siteId` 与 project binding 的一致性约束。
- [x] 5.9 运行 `openspec validate scope-cms-data-to-builder-workspace --strict`，确保 proposal/design/specs/tasks 语义和格式通过校验。
