## Why

开发环境需要在 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 下同时验证 CMS 集成链路和普通 PageBuilder 首页体验，但当前 CMS 模式会隐藏首页输入框与历史区，并拒绝本地创建、全量历史列表和直接 builder 入口，导致开发调试必须频繁切换环境变量。

本变更引入一个仅开发模式生效的显式开关，让开发者可以在保留 CMS 集成能力的同时使用 standalone 首页对话、历史项目列表和历史项目编辑/删除能力；生产环境继续保持现有 CMS 受控入口安全边界。

## What Changes

- 新增开发专用配置 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS=true`。
- 该配置仅在 `NODE_ENV=development` 且 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 时生效；生产环境即使设置也必须被忽略。
- CMS integration status 增加非敏感布尔能力标记，用于告知前端当前是否允许开发态 standalone 入口。
- 开发态开关生效时，首页继续展示 standalone 输入框和历史项目列表，并允许从首页创建 page-builder 项目。
- 开发态开关生效时，历史项目的预览、编辑和删除按 standalone 行为可用；直接打开 builder URL 不要求 CMS handoff access cookie。
- CMS integration server-to-server API、handoff、builder context、CMS 浏览/取数等 CMS 集成链路继续保留，开发者仍可验证 CMS 接入能力。
- 非开发环境和未显式开启该配置时，现有 CMS 模式首页受限入口、API fail-closed 和 builder context-first 行为保持不变。
- **BREAKING**: 无。该能力仅增加开发态例外，不改变默认行为或生产行为。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-cms-integration`: 为 CMS 集成模式的前端门控、项目 API fail-closed 和状态探测增加开发态 standalone 入口例外。
- `page-builder-app`: 允许 HomePage 和 BuilderPage 在开发态开关生效时使用 standalone 首页启动和直接 builder 加载流程。
- `page-builder-home-history`: 允许首页历史区在开发态 CMS 模式下加载和操作历史项目。
- `session-management`: 允许开发态 CMS 模式下使用 standalone session 列表与本地创建 session 流程，同时保持生产 CMS 模式禁止。

## Impact

- 影响后端 CMS integration 配置解析、status 响应和 CMS Builder Access middleware / API gate 判断。
- 影响 PageBuilder HomePage、BuilderPage 的 integration status 状态机和加载分支。
- 影响 `/api/page-builder/projects`、`/api/workspaces`、`/api/sessions` 等 standalone API 在开发态 CMS 模式下的放行规则。
- 影响前端 API 类型和相关单元测试；不引入新的运行时依赖或数据迁移。
