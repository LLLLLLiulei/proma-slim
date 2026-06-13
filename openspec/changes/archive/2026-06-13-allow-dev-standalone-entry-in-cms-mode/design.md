## Context

现有 CMS 集成模式将 CMS 作为 PageBuilder 的受控入口：首页只展示“请从 CMS 系统进入”的提示，BuilderPage 必须先通过 builder context 校验，后端也会拒绝全量 workspace/session/page-builder 项目列表、本地创建和删除等 standalone API。这一设计适合生产，但开发阶段会带来明显摩擦：开发者在 `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 下调试 CMS 取数、渲染、handoff 或导出能力时，无法同时使用首页输入框、历史列表和直接 builder 入口来快速创建和回归项目。

本变更只引入开发态显式例外，不改变 CMS 集成模式的默认行为，也不降低生产环境的访问控制边界。

## Goals / Non-Goals

**Goals:**

- 增加 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS` 开发配置，并强制只在 `NODE_ENV=development` 下生效。
- 开发配置生效时，`integrationMode=cms` 仍表示 CMS 集成能力启用，但首页可展示 standalone 输入框和历史区。
- 开发配置生效时，允许本地创建 page-builder workspace/session、读取历史项目列表、打开历史项目 builder、删除历史项目。
- 保留 CMS server-to-server API、handoff、builder context 和 CMS 数据读取能力，便于按需关闭开发开关后验证完整 CMS 受控链路。
- 生产环境、测试/未设置开发开关、或 integration mode 非 cms 时保持现有语义。

**Non-Goals:**

- 不让生产 CMS 模式支持 standalone 首页入口。
- 不改变 CMS project binding、handoff、Builder Access Session、CMS 登录态校验或 CMS 同步导出的契约。
- 不新增用户级权限模型，也不引入 UI 开关；该能力只通过环境变量控制。
- 不迁移已有 workspace、session 或 project binding 数据。

## Decisions

### 1. 使用 dev-only 显式环境变量，而不是复用 integration mode

新增配置名建议为 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS`，布尔值仅接受显式真值（如 `true`、`1`、`yes`、`on`）。最终生效条件为：

```text
NODE_ENV=development
AND AI_PAGE_BUILDER_INTEGRATION_MODE=cms
AND AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS=true
```

不采用 `AI_PAGE_BUILDER_INTEGRATION_MODE=hybrid`，因为 hybrid 容易被误用到生产，并且会把开发便利和生产运行模式混在同一个配置维度。dev-only 开关更容易审计，也能在代码中强制生产忽略。

### 2. integration status 返回非敏感能力标记

`GET /api/integrations/cms/status` 在 CMS 模式下继续返回 `integrationMode: "cms"` 和 `enabled: true`；开发态例外通过新增 `devStandaloneEntryEnabled: true` 暴露给前端。该字段不包含 secret、cookie、CMS baseUrl、workspace 或 session 信息。

前端不应通过读取 `NODE_ENV` 或环境变量自行推断能力，而应以后端 status 为准。这样 Vite、Docker、生产 server 和测试环境可以复用同一判断来源。

### 3. 首页在 dev 例外下按 standalone 入口渲染

HomePage 的 gate 从“cms enabled 就受限”调整为“cms enabled 且未启用 dev standalone entry 才受限”。当 `devStandaloneEntryEnabled=true` 时，首页挂载现有输入框和 `PageBuilderHistorySection`，不新增独立开发 UI，也不复制历史列表逻辑。

这样能最大限度复用当前 standalone 首页流程，同时保持默认 CMS 模式的 fail-closed 行为不变。

### 4. BuilderPage 在 dev 例外下走 standalone load path

开发态例外生效时，BuilderPage 对 `/builder/:workspaceId/:sessionId` 使用现有 standalone `listSessions + listWorkspaces + resolveBuilderContext + bootstrap cache` 流程，不强制请求 CMS builder context，也不要求 handoff access cookie。

该例外只改变 builder 入口和项目上下文加载方式，不代表 CMS 数据能力不可用。只要 integration status 表示 `integrationMode: "cms"` 且 `enabled: true`，构建页仍应保留选中区块后的 CMS 选择入口、CMS browser dialog 和 workspace-scoped CMS browser API；`devStandaloneEntryEnabled` 不应用作隐藏 CMS 选择能力的条件。

workspace-scoped CMS browser API 在开发态例外下不应要求 Builder Access Session。若当前 workspace 已存在 CMS project binding，仍优先沿用该 binding 的 `siteId` 做范围约束；若当前 workspace 是本地 standalone 创建且没有 binding，则使用默认 CMS 配置加载数据，供开发环境调试 CMS 选择与填充流程。CMS browser 使用的 CMS `/api/*` 数据接口只应使用服务账号 token 鉴权，不应转发 `CurrentSite`、`ZUSID` 或其它 CMS UI Cookie；`CurrentSite/ZUSID` 仅用于 CMS `/ui/*` 登录态校验链路。

替代方案是先请求 builder context，失败后再 fallback standalone。该方案会在历史项目打开时制造预期内的 401/403 噪音，也更容易让错误处理和重试逻辑复杂化。因此本变更采用 status 驱动的直接分支：dev 例外生效时明确走 standalone 前端入口；需要完整 CMS handoff/builder-context 前端链路测试时，关闭该 dev 开关即可。

### 5. 后端 API gate 增加 dev bypass，但不影响 CMS integration 路由本身

现有 `assertCmsBuilderApiAvailableInCmsMode()` 和 CMS Builder Access middleware 是后端阻止 standalone API 的关键边界。开发态例外生效时：

- `/api/page-builder/projects`、`/api/workspaces`、`/api/sessions` 等 standalone 首页/历史/直接 builder 必需 API 可以按 standalone 语义执行。
- workspace/session/page-builder scoped API 可以不要求 Builder Access Session，但仍保留现有 edit lock、workspace 模板、session 归属等业务校验。
- CMS integration server-to-server API、handoff 创建、handoff open、builder context 不因 dev bypass 改写契约；其中 builder context 仍应通过 CMS access session 验证，便于在关闭前端 dev 入口后测试完整 CMS 模式。

实现上应避免在 middleware 中无条件 early return，否则 `/api/integrations/cms/builder-context` 会拿不到 `cmsBuilderAccess` 上下文。更稳妥的方式是让 middleware 支持路由级选项，例如 `allowDevStandaloneBypass !== false`；builder context 挂载 middleware 时显式禁用该 bypass。

### 6. 生产环境强制忽略开发配置

所有判断都必须以同一个配置解析结果为准，且 `NODE_ENV !== "development"` 时 `devStandaloneEntryEnabled` 必须为 `false`。测试应覆盖生产环境下即使设置 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS=true` 也不会放行。

## Risks / Trade-offs

- [开发开关误用于生产] → 代码层面强制 `NODE_ENV=development`，status 和后端 gate 都从统一配置读取，生产忽略该变量。
- [dev 例外降低本地 CMS access 校验覆盖率] → 这是显式取舍；需要验证完整 CMS 受控入口时关闭 dev 开关即可。
- [前后端 gate 判断不一致] → status、API gate 和 middleware 统一使用同一配置解析字段，并补充集成单元测试。
- [builder context middleware 被 dev bypass 误绕过] → builder context route 挂载 middleware 时禁用 dev bypass，避免路由内部缺少 `cmsBuilderAccess`。
- [历史删除误删 CMS binding 项目] → dev 例外按 standalone 行为放行仅面向开发数据；生产继续 fail-closed。实现时不额外联动删除 CMS binding 之外的数据模型。

## Migration Plan

1. 扩展 CMS integration config 和 status 类型，新增 `devStandaloneEntryEnabled`。
2. 调整 HomePage 和 BuilderPage 的 status 分支，让 dev 例外复用 standalone 子树和 load path。
3. 调整后端 CMS API gate 和 CMS Builder Access middleware，按 dev 例外放行 standalone API，并确保 builder context 仍走 CMS access 校验。
4. 补充后端配置、路由和前端页面单元测试。
5. 回滚方式：删除或置空 `AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS`，或设置 `NODE_ENV` 非 development，即回到现有 CMS fail-closed 行为。

## Open Questions

无。已确认开发态例外应允许首页输入框、历史列表、历史项目预览/编辑/删除和直接 builder 入口；生产环境不得受影响。
