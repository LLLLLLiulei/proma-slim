## Context

PageBuilder 模板库一期的基础 registry 能力由 `add-page-builder-template-registry` 提供：用户模板目录位于 `getConfigDir()/page-builder-templates/`，合法模板通过 `template.json` 和 `workspace-files/index.html` 被扫描、预览和删除。当前仍缺少从现有 PageBuilder workspace 产出用户模板的后端能力。

现有工程已经具备可复用基础：workspace scoped routes、PageBuilder 编辑锁校验、CMS Builder Access Session middleware、CMS project binding、静态资源包导出服务，以及 standalone CMS 作者态清理逻辑。Change 2 的核心不是重写导出链路，而是在 workspace API 上把“静态导出产物”整理并校验成“用户模板目录”。

本 change 的关键约束：CMS 集成项目另存模板时参考当前静态资源包导出；静态资源包如何导出，另存模板就如何固化 CMS 数据。本 change 不迁移 CMS 数据获取到 handoff/access session Cookie，也不改变 CMS gateway/UI API 鉴权链路。

## Goals / Non-Goals

**Goals:**

- 新增 `POST /api/workspaces/:workspaceId/page-builder/templates`，让当前 PageBuilder workspace 可另存为用户模板。
- 要求 Builder 当前请求持有有效编辑锁，避免非编辑者或失效页面写入模板。
- 支持 standalone 项目另存为模板。
- 支持 CMS 集成 Builder 项目另存为静态快照模板，CMS 动态数据固化方式与现有静态导出一致。
- 对 standalone 源页面做导出前 CMS 作者态标记预扫描，避免现有 standalone 导出清理逻辑静默移除 CMS 区域后生成缺块模板。
- 生成符合 registry 能识别的模板目录，并迁移导出报告、写入模板校验报告。
- 阻断残留 CMS 作者态/runtime/manifest、远程运行时依赖、关键资源下载失败和敏感鉴权信息进入模板。
- 使用临时目录到最终目录的原子 rename，失败时不污染合法模板 registry。

**Non-Goals:**

- 不实现 Builder 前端“另存为模板”入口和表单。
- 不实现首页模板库 UI、模板使用/实例化能力或首页刷新。
- 不支持内置模板、缩略图、自动截图、模板市场、zip 导入或外部 URL 抓取。
- 不支持 CMS 动态绑定迁移/复用；CMS 集成另存结果是普通静态快照模板。
- 不改变现有静态资源包导出 API 的语义、CMS gateway 选择或 UI API 鉴权链路。

## Decisions

### 1. API 放在 workspace scoped routes

新增 API：

```text
POST /api/workspaces/:workspaceId/page-builder/templates
```

该路径复用 `workspaceMiddleware`、CMS Builder Access middleware 和当前 workspace 上下文。route 内部继续调用 `assertPageBuilderEditLockForWorkspace()`，确保 PageBuilder workspace 的另存请求必须来自持有编辑锁的 Builder 页面。

替代方案是放在 `/api/page-builder/templates` 并通过 body 传 workspaceId。该方案会绕开已有 workspace middleware 和 CMS access middleware，权限边界更分散，不采用。

### 2. 来源模式以当前有效上下文识别

来源模式只分两类：

- `cms-integrated`：请求存在有效 `cmsBuilderAccess`，且 access 对应的 CMS project binding 与当前 workspace、primary session 匹配。
- `standalone`：不满足上述条件时按普通 PageBuilder workspace 处理。

CMS 集成生产模式下，middleware 会要求非 GET workspace 子路由具备 Builder Access Session 和 origin 校验；开发模式可继续沿用现有 dev bypass 行为。另存模板只要求 CMS 集成 workspace 当前访问有效，不在本 change 中改变静态导出实际调用 CMS 数据的鉴权来源。

替代方案是只根据全局 `AI_PAGE_BUILDER_INTEGRATION_MODE` 判断来源。该方案会把 CMS 模式下的开发 standalone workspace 误判为 CMS 集成项目，不采用。

### 3. 复用静态导出 zip，再整理为模板目录

一期优先复用现有：

```ts
pageBuilderStaticExportService.exportWorkspaceStaticPackage(workspace, {
  downloadCmsRemoteAssets: true,
})
```

成功后读取 zip 产物并解压到临时模板目录的 `workspace-files/`。导出包中的根部 `export-report.json` 不放入 `workspace-files/`，而是迁移为 `reports/static-export-report.json`。如果静态导出服务后续提供内部“导出到目录”方法，可以替换 zip 解压实现，但这只是内部优化，不影响 API 与 spec。

选择 zip 解压的理由：当前静态导出服务已完成 CMS 渲染、资源离线化、报告生成和失败收集，复用它可以保持“另存模板”和“导出静态资源包”的固化语义一致。

### 4. standalone 源页面先失败，不依赖清理

静态导出在 standalone 模式下会调用 `removePageBuilderStandaloneCmsArtifacts()` 清理 CMS 作者态残留。另存模板不能直接依赖该行为，因为这可能把含 CMS 绑定区域的 standalone 页面保存成缺失内容的模板。

因此，在 standalone 来源下，服务必须先读取 `workspace-files/index.html` 并检测：

- `<cms-content>` / `<cms-catalog>`
- `data-proma-cms-*` / `data-proma-cms-rendering-*`
- `__PROMA_CMS_RENDERING_PREVIEW__`
- `cms-rendering-preview.js`

发现任一标记直接返回 409。

CMS 集成来源允许源页面包含这些标记，但最终模板必须在静态导出和 CMS 渲染后不再包含这些标记。

### 5. 模板质量校验在导出后强制执行

静态导出报告中的某些问题当前是 warning 或 unsupported runtime dependency，不一定导致静态资源包导出失败。模板另存需要更严格：

- `failures.length > 0` 必须失败。
- `unsupportedRuntimeDependencies.length > 0` 必须失败。
- warning code 为 `attachment-download-failed` 或 `cms-remote-asset-skipped` 必须失败。
- 最终 `workspace-files/index.html` 和 HTML 文件不得残留 CMS 作者态标签、CMS runtime 属性、CMS preview/runtime loader。
- `workspace-files/.proma/cms-rendering-manifest.json` 必须被移除或不存在。
- HTML 中远程 `script[src]` 和 `iframe[src]` 必须失败，作为报告之外的防御性校验。

校验结果写入 `reports/template-validation-report.json`。失败时不创建最终模板目录。

### 6. manifest 和 source metadata 只保存非敏感信息

`template.json` 使用 Change 1 registry 支持的 v1 格式：

- `version: 1`
- `id`
- `name`
- `description?`
- `tags?`
- `sourceKind: saved-project`
- `entry: workspace-files/index.html`
- `createdAt`
- `sourceProject.sourceMode`

`source/source-project.json` 可选写入，用于排查来源，但只能包含 workspaceId、workspaceName、sourceMode、exportedAt、非敏感 CMS siteId/externalRecordId/projectId 等信息。任何 CMS cookie、session、token、Builder Access Session、server-to-server secret 都不得写入模板目录、manifest 或报告。

### 7. 原子写入和 ID 生成

模板 ID 由服务生成，建议格式为：

```text
tpl_saved_<YYYYMMDDHHmmss>_<short-random>
```

ID 必须满足 Change 1 registry 的白名单规则。服务先写入模板根目录下的临时目录，例如 `.tmp-<templateId>-<pid>-<random>`，全部校验通过后再 `rename` 到最终目录。失败时清理临时目录；如果最终目录已存在，重新生成 ID 或返回可重试错误。

## Risks / Trade-offs

- [Risk] 复用 zip 会产生压缩再解压的额外开销。→ 一期模板保存不是高频操作，换取实现简单和导出语义一致；后续可在静态导出服务内部补“导出到目录”优化。
- [Risk] CMS 集成另存模板校验了 Builder Access Session，但数据固化仍沿用当前静态导出 CMS gateway。→ 这是已确认的一期边界；后续 CMS UI API/Cookie 数据链路改造应单独 change。
- [Risk] 对 warning 采取严格失败可能让部分可浏览页面无法另存模板。→ 模板要求离线可复用且不依赖远程关键资源，严格失败更安全；错误消息应提示用户先修复资源或 CMS 配置。
- [Risk] 敏感信息可能出现在导出 HTML 或报告的非预期字段。→ 另存模板服务应做字符串级敏感关键词防御性扫描，至少阻断明显的 cookie/session/token/access secret 字段进入模板。
- [Risk] Change 2 依赖 Change 1 的模板 registry 类型和目录约定。→ 实施前应确保 `add-page-builder-template-registry` 已合入或在同一分支中可用。

## Migration Plan

- 新增 API 和模板生成能力，不迁移已有 workspace、导出包或模板目录。
- 未调用另存 API 时现有行为不变。
- 回滚时删除 API 和服务扩展即可；已生成的用户模板目录仍是普通 registry 模板，可被现有模板列表/预览能力读取或手工删除。

## Open Questions

- 无阻塞问题。CMS 集成项目另存模板按“静态资源包如何导出就如何固化”的一期边界推进。
