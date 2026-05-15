## 1. 配置与错误模型

- [x] 1.1 在 `cms-integration-errors.ts` 增加 `project_busy`、`export_upstream_failed`、`export_timeout` 错误码、默认文案和响应映射。
- [x] 1.2 在 `cms-integration-config.ts` 增加 `AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS` 解析，默认 `0` 表示不启用服务端超时。
- [x] 1.3 在 `build/.env.example` 补充 `AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS` 配置说明。
- [x] 1.4 增加配置与错误响应单元测试，覆盖默认值、正整数值、非法值和新增错误码 JSON 响应。

## 2. 静态导出核心抽取

- [x] 2.1 从 `PageBuilderStaticExportService.runJob()` 抽出共享导出核心，返回 ZIP 路径、文件名、report 路径和 report summary。
- [x] 2.2 让浏览器异步导出 job 调用共享导出核心，并通过当前 job 专属回调更新 phase，避免跨 workspace 更新其他 job 状态。
- [x] 2.3 保持现有浏览器异步导出 job 创建、轮询、下载 URL、失败 snapshot 和 report 语义兼容。
- [x] 2.4 增加或调整静态导出服务测试，覆盖共享核心成功、关键资源失败、CMS island 失败、`downloadCmsRemoteAssets` true/false 和 base path 下载 URL 兼容。

## 3. 导出活动互斥与编辑锁 busy

- [x] 3.1 在静态导出服务中实现同 workspace export activity guard，覆盖浏览器异步导出和 CMS 同步导出。
- [x] 3.2 保持浏览器重复创建异步导出时返回现有活动 job 的兼容行为。
- [x] 3.3 让 CMS 同步导出遇到任意同 workspace 活动导出时返回 `project_busy`，且不复用其他导出活动产物。
- [x] 3.4 将 export activity 接入 `page-builder-edit-lock-service` 的 busy 检测，CMS 同步导出期间拒绝新的 edit lock acquire。
- [x] 3.5 更新共享类型 `PageBuilderProjectEditState.reason` 和必要展示/测试，使导出 busy 可与 editor、agent 区分。
- [x] 3.6 增加 edit lock/export activity 测试，覆盖导出期间 acquire 被拒绝、导出结束后可重新 acquire。

## 4. CMS 同步导出服务

- [x] 4.1 新增 `cms-sync-export-service.ts`，封装 projectId 解析、binding 内部资源校验、workspace 模板校验和导出前置检查。
- [x] 4.2 在同步导出前复用 integration secret、`X-CMS-Cookie` 和 CMS `/ui/login` 校验，且不持久化原始 CMS Cookie。
- [x] 4.3 同步导出前检查有效 edit lock、活跃 Agent、`workspace-files/index.html` 和同 workspace 活动导出，失败时映射为 `project_busy`。
- [x] 4.4 同步导出调用共享静态导出核心，成功返回 artifact 信息，导出期关键失败映射为 `export_upstream_failed`。
- [x] 4.5 实现显式超时时的 soft timeout 包装，超时返回 `export_timeout`，默认不启用 PageBuilder 服务端超时。
- [x] 4.6 确保 soft timeout 后后台导出 Promise 被继续 observe，后续完成或失败都释放 workspace export activity guard，且不产生未捕获 rejection。

## 5. HTTP Route 集成

- [x] 5.1 在 `cms-integration.ts` 增加 `POST /projects/:projectId/export` route。
- [x] 5.2 route 解析 JSON body，允许空 body，校验 `downloadCmsRemoteAssets` 只能是 boolean。
- [x] 5.3 route 成功时返回 `application/zip`、`Content-Disposition` 和 ZIP body，不返回 job JSON。
- [x] 5.4 route 失败时返回 CMS integration 结构化 JSON 错误，并确保不返回半成品 ZIP。
- [x] 5.5 确认该 server-to-server route 不要求 Builder Access Session、Origin 或 Referer。

## 6. 测试与验证

- [x] 6.1 增加 CMS integration route 测试：有效请求返回 ZIP，且 ZIP 包含 `index.html` 与 `export-report.json`。
- [x] 6.2 增加 CMS integration route 测试：standalone 模式请求同步导出返回结构化拒绝且不执行导出。
- [x] 6.3 增加 CMS integration route 测试：缺少或错误 secret、缺少或失效 CMS Cookie、CMS `/ui/login` 不可用时返回对应错误。
- [x] 6.4 增加 CMS integration route 测试：未知 `projectId` 或 binding 内部资源缺失返回 `project_not_found`。
- [x] 6.5 增加 CMS integration route 测试：非 boolean `downloadCmsRemoteAssets` 返回 `invalid_request`。
- [x] 6.6 增加 CMS integration route 测试：`downloadCmsRemoteAssets: true` 和 `downloadCmsRemoteAssets: false` 均传入导出核心并产生预期 report 语义。
- [x] 6.7 增加 CMS integration route 测试：有效 edit lock、活跃 Agent、缺少 `index.html`、同 workspace 活动导出均返回 `project_busy`。
- [x] 6.8 增加 CMS integration route 测试：导出期 CMS island 或关键远程资源失败返回 `export_upstream_failed` 且不是 ZIP 响应。
- [x] 6.9 增加 CMS integration route 测试：默认不触发 `export_timeout`，显式配置正数且超时时返回 `export_timeout`，后台导出完成后释放 busy 状态。
- [x] 6.10 运行相关 Bun 测试，至少覆盖 CMS integration routes、static export service、edit lock service 和现有 workspace export routes。
- [x] 6.11 运行 `bun run --filter='@ai-page-builder/app' typecheck`，确保后端与共享类型变更通过类型检查。
- [x] 6.12 运行 `bun run --filter='@ai-page-builder/page-builder' typecheck`，确保共享 editState reason 变更不会破坏 page-builder 前端。
- [x] 6.13 运行 `openspec validate add-cms-sync-static-export-api --strict`，确保 change artifacts 通过校验。
