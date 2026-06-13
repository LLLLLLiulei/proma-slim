## 1. 配置与状态接口

- [x] 1.1 在 CMS integration 配置解析中新增 `devStandaloneEntryEnabled` 字段，只在 `NODE_ENV=development`、`AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS` 为显式真值时返回 `true`。
- [x] 1.2 扩展 `CmsIntegrationConfig`、`CmsIntegrationStatus` 和前端 API client 类型，支持 `devStandaloneEntryEnabled` 非敏感状态字段。
- [x] 1.3 更新 `buildCmsIntegrationStatus()`，在开发态例外生效时返回 `devStandaloneEntryEnabled: true`，其他场景不得返回 true。
- [x] 1.4 补充配置单元测试，覆盖默认 standalone、普通 CMS、development 下 dev 开关生效、production 下 dev 开关被忽略、状态接口不暴露敏感信息。

## 2. 后端 CMS gate 与 API 放行

- [x] 2.1 为 `assertCmsBuilderApiAvailableInCmsMode()` 增加开发态 standalone 入口例外，使全量 workspace/page-builder 项目列表、本地创建 workspace 和历史项目删除在开发态 CMS 模式下按 standalone 语义放行。
- [x] 2.2 为 CMS Builder Access middleware 增加路由级 dev bypass 控制，默认允许开发态 standalone 项目 API 绕过 Builder Access Session，但保留既有 workspace/session/template/edit lock 业务校验。
- [x] 2.3 挂载 `/api/integrations/cms/builder-context` middleware 时显式禁用 dev bypass，确保 builder context 仍要求并挂载 `cmsBuilderAccess`。
- [x] 2.4 确认 `/api/page-builder/projects`、`/api/workspaces`、`/api/sessions`、session-scoped messages/send/activity/attachments 等 direct builder 所需 API 在开发态 CMS 模式下可用。
- [x] 2.5 补充后端路由测试，覆盖开发态 CMS 模式允许历史列表、本地创建 workspace/session、删除 page-builder 历史项目、直接访问 session-scoped API。
- [x] 2.6 补充后端安全回归测试，覆盖非 development 环境即使设置 dev 开关仍拒绝 standalone API，且 builder context 不被 dev bypass 绕过。

## 3. 前端 HomePage 与 BuilderPage

- [x] 3.1 调整 HomePage integration gate：`cms enabled` 且 `devStandaloneEntryEnabled !== true` 时展示 CMS 受限入口；dev 例外生效时复用现有 standalone 输入框、创建流程、错误恢复和历史区。
- [x] 3.2 调整 BuilderPage runtime loader：dev 例外生效时复用 standalone `listSessions + listWorkspaces + resolveBuilderContext + bootstrap cache` 加载路径，不要求 CMS handoff access cookie。
- [x] 3.3 保持普通 CMS 模式 builder context-first、status fail-closed、builder context 失败页和 standalone 模式行为不变。
- [x] 3.4 更新 HomePage 单元测试，覆盖开发态 CMS 模式展示输入框和历史区、允许创建项目，以及普通 CMS 模式仍不挂载历史区。
- [x] 3.5 更新 BuilderPage 单元测试，覆盖开发态 CMS 模式直接 builder URL 走 standalone 加载路径、不请求 builder context、不展示 CMS access 失效页。
- [x] 3.6 更新 API client 或 renderer 类型测试，覆盖 `devStandaloneEntryEnabled` 字段在 status 响应中的解析和使用。

## 4. 验证

- [x] 4.1 运行相关后端单元测试：CMS integration config、CMS integration routes、page-builder routes、workspace routes、session routes。
- [x] 4.2 运行相关前端单元测试：HomePage、BuilderPage、PageBuilderHistorySection、API client。
- [x] 4.3 运行 `bun run --filter='@ai-page-builder/page-builder' typecheck` 和必要的 app/shared typecheck，确认新增字段类型一致。
- [x] 4.4 运行 `openspec validate allow-dev-standalone-entry-in-cms-mode --strict`，确认 proposal、design、specs 和 tasks 均通过校验。
