## Context

Builder 当前的“导出静态包”按钮会直接调用前端 API 创建导出任务，API 以空 body POST 到 `/page-builder/export-static-jobs`，后端 `PageBuilderStaticExportService.createJob(workspace)` 创建任务并在 `runJob()` 中复制 `workspace-files/`、静态化 CMS islands、扫描 HTML/CSS 资源、下载远程资源并打包。

静态导出链路已具备 CMS 资源识别和受控下载能力：`resolveRenderableReference()` 会把 `/preview/...`、`/upload/...`、`/assets/...` 等 CMS 根相对资源解析为 CMS 源站绝对 URL，`localizeRemoteResource()` 会通过 `isCmsResourceUrl()` 标记 `via: 'cms'`，`fetchRemoteResource()` 会对 CMS 资源走 `CmsGateway.fetchAsset()`。本次变更应复用这些边界，只在导出任务维度增加“是否下载 CMS 远程资源”的策略。

## Goals / Non-Goals

**Goals:**
- 在 Builder 点击导出后展示确认弹框，并提供“导出 CMS 远程资源”勾选项。
- 默认保持现有行为：勾选后继续下载 CMS 远程资源并改写为包内相对路径。
- 未勾选时仅跳过 CMS 远程资源下载，最终 HTML/CSS 中保留或恢复为 CMS 源站可访问 URL。
- 未勾选时仍导出非 CMS 远程资源、远程 CSS、字体、附件和本地 `workspace-files/` 资源。
- 在导出报告和 Builder 成功提示中明确表达“成功但 CMS 资源未离线化”的离线完整性告警。
- 保持同一工作区活动导出任务复用逻辑，不引入并发导出。

**Non-Goals:**
- 不改变 CMS content navigation link 的处理语义，例如 `publishUrl` 这类内容链接不因该选项变成资源下载目标。
- 不新增“记住上次选择”的用户偏好。
- 不改变预览期 `/api/page-builder/cms/assets?...` 代理逻辑。
- 不改变非 CMS 远程资源的安全校验、下载预算或失败分类。
- 不支持在同一活动导出任务运行中动态切换选项。

## Decisions

### Decision 1: 在导出任务创建 API 中传递显式选项

新增共享请求类型，例如 `PageBuilderStaticExportJobCreateRequest`，支持可选的 `downloadCmsRemoteAssets` 字段。外部请求可以省略 body 或省略该字段，后端统一归一化为 `{ downloadCmsRemoteAssets: true }`；Builder 弹框提交时始终传递显式 boolean。前端 `createPageBuilderStaticExportJob(workspaceId, options)` 将该选项以 JSON body POST 给后端，后端路由读取并校验 boolean 后传入 `createJob(workspace, options)`。

Rationale: 该选项是任务级行为，必须随任务快照进入后端执行链路。相比依赖查询参数或全局配置，请求 body 更容易扩展，也与“每次导出使用当次选择，不记忆状态”的语义一致。

Alternative considered: 使用服务端全局配置关闭 CMS 资源下载。该方案无法满足用户每次导出时选择，也会影响所有工作区和所有用户。

### Decision 2: 复用现有 CMS URL 识别，在本地化入口短路跳过

在 `ExportContext` 中保存 `downloadCmsRemoteAssets`。`processRenderableReference()`、`processStylesheetReference()`、`processSrcset()`、`processInlineCss()` 和附件链接处理仍先通过 `resolveRenderableReference()` 得到规范化 URL；当 `resolved.type === 'remote'` 且 `isCmsResourceUrl(resolved.url, context.cmsBaseUrl)` 且选项为 false 时，不调用 `localizeRemoteResource()`，而是返回可直接访问的 CMS 源站 URL。若被跳过的是 CMS 远程 stylesheet，导出器不下载该 stylesheet，也不解析其中的嵌套资源，页面运行时直接从 CMS 源站加载 stylesheet 及其依赖。

Rationale: CMS 根相对路径和 preview 代理 URL 的归一化已经集中在 `resolveCmsAssetUrl()` / `resolveRenderableReference()`，跳过逻辑放在本地化入口可以避免重复实现 CMS URL 判断，并保证 `/preview/...`、`/upload/...`、`/assets/...` 和 `/api/page-builder/cms/assets?url=...` 最终都能落到源站 URL，而不是保留不可独立访问的 preview 代理路径。

Alternative considered: 在扫描前批量替换 HTML 中所有 CMS URL。该方案容易漏掉 CSS `url(...)`、`srcset`、远程 CSS 中的相对资源，以及 SSR 后新增的 CMS 资源引用。

### Decision 3: 将跳过的 CMS 资源记录为 warning 和 retained external link

共享 report 类型新增 retained reason 和 warning code，例如 `cms-remote-asset-skipped`。当 CMS 资源因用户选项被跳过时，collector 记录资源 URL、retained external link reason 和 warning。`summary.hasWarnings` 继续作为 Builder 提示“导出完成但存在离线告警”的统一判断。

Rationale: 未下载 CMS 资源不是导出失败，因为页面仍能通过 CMS 源站 URL 访问资源；但它会降低离线完整性，必须在报告和 UI 中可见。复用现有 warning 汇总可以避免新增前端结果状态。

Alternative considered: 新增 job status，如 `completed-with-warnings`。该方案会扩散到轮询、下载、toast 和后端状态机，收益不高。

### Decision 4: 导出弹框由 BuilderPage 管理，PreviewPane 继续保持展示组件职责

`PreviewPane` 保留导出按钮和 pending 禁用展示，点击时通知 `BuilderPage`。`BuilderPage` 管理确认弹框状态、checkbox 默认值、调用 API 和轮询任务。弹框提交后沿用现有 `staticExportJob` pending 逻辑。

Rationale: `BuilderPage` 已持有 workspaceId、API 调用、toast、导出任务状态和现有 `AlertDialog` 使用模式，把任务选项也放在这里可以避免 PreviewPane 承担业务状态。

Alternative considered: 在 PreviewPane 内直接发起 API。该方案会破坏当前容器/展示组件分工，并让 PreviewPane 依赖 workspaceId 和 API。

## Risks / Trade-offs

- [Risk] 未勾选时静态包无法完全离线访问 CMS 图片等资源。→ Mitigation: 默认勾选，未勾选时在导出报告和 Builder toast 中提示存在离线完整性告警。
- [Risk] HTML/CSS 中可能存在 preview 代理 URL，直接保留会导致静态包脱离本地服务后不可用。→ Mitigation: 跳过前统一通过 `resolveRenderableReference()` / `resolveCmsAssetUrl()` 得到 CMS 源站 URL，禁止在导出产物中保留 `/api/page-builder/cms/assets?...`。
- [Risk] 同一工作区已有活动导出任务时，用户再次选择不同选项可能误以为已应用新选项。→ Mitigation: 保持现有防并发语义，前端 pending 时禁用导出入口，后端继续返回活动任务而不创建新任务。
- [Risk] 远程 CSS 中以相对路径引用 CMS 资源时需要正确恢复为绝对 CMS URL。→ Mitigation: 对 CSS 处理继续传入 `remoteBaseUrl`，由 URL 标准解析先得到绝对地址，再执行 CMS 识别和跳过。
