## Why

PageBuilder 已具备 CMS project binding、handoff、Builder Access Session 和 builder context，但前端仍会在 CMS 集成模式下走 standalone 首页创建、历史列表和全量 workspace/session 初始化流程。这样会让 CMS 集成入口在用户未通过 handoff 时仍主动请求项目列表或项目上下文，破坏“必须从 CMS 受控进入”的访问模型。

## What Changes

- PageBuilder 前端 API client 增加 CMS integration status 与 builder context 调用方法。
- HomePage 初始化时先读取 CMS integration status；当处于 CMS 集成模式时，只展示“请从 CMS 系统进入 PageBuilder”的受限入口提示。
- CMS 集成模式下 HomePage 不展示本地 prompt 创建入口，不挂载历史项目区，也不请求 `/api/page-builder/projects`、`/api/workspaces` 或 `/api/sessions`。
- BuilderPage 初始化时先读取 CMS integration status；当处于 CMS 集成模式时，将 builder context 作为第一个项目上下文请求。
- CMS 集成模式下 BuilderPage 只有在 builder context 成功后，才初始化 Jotai workspace/session 状态、读取消息、启动 preview polling、获取 edit lock、渲染 AgentView、PreviewPane 和 CMS browser。
- builder context 失败时显示“访问已失效，请从 CMS 系统重新进入 PageBuilder”，并阻止继续请求项目 API；integration status 读取失败时按 fail-closed 展示服务暂不可用，不回退到 standalone。
- standalone 模式保持现有首页创建、历史列表、bootstrap 首条消息、直接 builder URL 和编辑恢复行为。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `page-builder-cms-integration`: 补充前端在 CMS 集成模式下必须使用 integration status 与 builder context 作为受控入口的行为。
- `page-builder-app`: 调整 HomePage 与 BuilderPage 在 CMS 集成模式下的启动和加载流程，同时保持 standalone 行为。
- `page-builder-home-history`: 规定 CMS 集成模式首页不得加载或展示 standalone 历史项目区。
- `page-builder-edit-lock`: 规定 CMS 集成模式下 edit lock 只能在 builder context 成功后获取或续约。

## Impact

- 影响 PageBuilder renderer：`HomePage`、`BuilderPage`、路由级加载状态、builder context 前端 helper、bootstrap cache 使用时机。
- 影响共享 renderer API client：新增 CMS integration status 和 builder context 方法，并保留 public base path 解析。
- 影响首页历史区挂载条件：CMS 集成模式下不挂载 `PageBuilderHistorySection`。
- 不改变后端 CMS integration API、handoff/access session、preview 保护或后端项目 API 鉴权规则；这些已由前置 change 或后续 Change 5 负责。
