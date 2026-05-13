## Context

Change 2 已提供 CMS integration status、CMS 登录态校验和 project binding；Change 3 已提供 CMS handoff、`ai_page_builder_access` Cookie、builder context 和 preview 最小保护。当前 PageBuilder renderer 仍按 standalone 模式初始化：HomePage 会展示本地创建入口并挂载历史列表，BuilderPage 会先请求全量 sessions/workspaces，再从本地列表解析当前 workspace/session。

在 CMS 集成模式下，CMS 是项目创建、入口和权限判断的来源。PageBuilder 前端必须先确认当前运行模式；进入 builder 时必须先通过后端 builder context 验证 Builder Access Session，再加载任何项目级 UI 或项目 API。

## Goals / Non-Goals

**Goals:**

- CMS 集成模式首页只展示受限入口提示，不提供 standalone 创建或历史列表入口。
- CMS 集成模式 BuilderPage 使用 builder context 作为第一个项目上下文请求。
- builder context 成功后再加载消息、preview polling、edit lock、AgentView、PreviewPane 和 CMS browser。
- builder context 失败后展示统一失效提示，并阻止继续请求项目 API。
- integration status 读取失败时 fail-closed，不回退到 standalone。
- standalone 模式保持当前首页创建、历史列表、bootstrap 首条消息和直接 builder URL 行为。

**Non-Goals:**

- 不修改后端 integration status、handoff、access session 或 builder context 的 HTTP 契约。
- 不实现 Change 5 的后端项目 API 统一保护、Origin/Referer 校验或 access session 滑动续期。
- 不迁移 CMS 数据浏览路由到 workspace-scoped API。
- 不改变 edit lock 的后端语义。
- 不新增 CMS 业务权限判断；CMS 仍在创建 handoff 前自行判断。

## Decisions

### 1. 前端以 integration status 作为模式开关

PageBuilder renderer SHALL 通过 `GET /api/integrations/cms/status` 判断是否处于 CMS 集成模式。API client 增加类型化方法，继续使用逻辑 `/api/...` 路径，让现有 public base path 解析负责把请求转为 `${basePath}/api/...`。

替代方案是把模式直接注入 runtime config。该方案会绕过后端实际配置状态，且容易与 Docker/Nginx 运行时配置不同步，因此不采用。

### 2. status 请求失败时 fail-closed

HomePage 或 BuilderPage 无法读取 integration status 时，不展示 standalone 创建入口，也不继续加载历史列表或项目 API，而是显示服务暂不可用并允许重试。

这是偏保守的设计：如果后端不可用，standalone 流程也无法可靠工作；如果实际是 CMS 模式，fail-open 到 standalone 会暴露错误入口。

### 3. HomePage 必须先完成模式判断再挂载 standalone 子树

HomePage 的历史区当前挂载后会立即请求 `/api/page-builder/projects`。因此 CMS 模式不能用“先渲染后隐藏”的方式处理，必须在 integration status 结果为 standalone 后才挂载 prompt 创建入口和 `PageBuilderHistorySection`。

### 4. BuilderPage 分离 standalone load path 与 CMS load path

standalone load path 继续使用现有 `listSessions + listWorkspaces + resolveBuilderContext + bootstrap cache` 流程。

CMS load path SHALL 调用 `GET /api/integrations/cms/builder-context?workspaceId=...&sessionId=...`。成功后使用返回的最小 workspace/session 初始化 Jotai 状态，并将 `initialUserMessage` 固定为 `null`，避免读取或发送 standalone bootstrap cache 中的历史 prompt。

### 5. 项目 UI 只在 builder context 成功后挂载

`AgentView` 挂载后会读取消息和 workspace context，`PreviewPane` 会暴露 preview iframe，edit lock effects 会获取或续约锁。因此 CMS 模式下这些组件和 effects 必须被 `loadState.status === "ready"` 且 builder context 成功的状态门控。

### 6. 错误页以“从 CMS 重新进入”为主动作

builder context 返回 401/403/404 或其他失败时，BuilderPage 显示“访问已失效，请从 CMS 系统重新进入 PageBuilder”。页面可以提供“重试”按钮，用于网络抖动或后端短暂恢复，但不应把“返回首页”作为主要恢复路径。

## Risks / Trade-offs

- [前端门控不是安全边界] 用户仍可手动调用未受保护的后端项目 API → Change 5 负责后端系统性保护；本 change 只减少前端主动请求和错误入口。
- [status fail-closed 可能影响 standalone 用户] 后端短暂不可用时 standalone 首页不会展示创建入口 → 这是可接受的，因为后端不可用时创建和历史也无法成功；页面提供重试。
- [CMS 模式只注入单 workspace/session 到 Jotai] 依赖全量列表的通用组件在 CMS 模式下只能看到当前项目 → 这是预期隔离行为，CMS 模式不应暴露全量列表。
- [preview handoff 获得的 access session 也可访问 builder context] 这是 Change 3 已确认的一期语义；本 change 不新增 preview/edit 权限分级。

## Migration Plan

1. 增加 API client 方法和前端集成状态类型，不改变现有 API 调用方式。
2. 改造 HomePage 的初始状态机：`checking`、`standalone`、`cms`、`error`。
3. 改造 BuilderPage 的 runtime loader：先读取 integration status，再选择 standalone 或 CMS load path。
4. 补充 HomePage、BuilderPage、API client 单元测试，覆盖 CMS 模式、status 失败、builder context 失败和 standalone 回归。
5. 如出现问题，可关闭 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 回到 standalone 行为；本 change 不引入数据迁移。

## Open Questions

无。已确认：status 失败按 fail-closed 处理；builder context 失败页可以保留重试入口。
