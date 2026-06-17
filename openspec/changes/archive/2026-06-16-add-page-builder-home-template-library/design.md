## Context

PageBuilder 模板库一期前 4 个 change 已提供基础链路：用户模板目录与 registry、当前项目另存模板、Builder 页面另存入口，以及 `POST /api/page-builder/templates/:templateId/use` 将模板实例化为新 workspace/session 并返回 `previewState`。

当前首页 standalone 模式在 prompt 输入框下方直接挂载 `PageBuilderHistorySection`。Change 5 需要把这一区域升级为“模板库 / 历史记录”资源区：模板库成为默认 Tab，历史记录保留现有交互但不再作为首页默认直接展示区域。CMS 集成生产模式仍应隐藏 standalone 入口，开发 bypass 则按 standalone 行为加载资源区。

## Goals / Non-Goals

**Goals:**

- 在 standalone 首页 prompt 输入框下方展示“模板库 / 历史记录”Tabs，并默认打开“模板库”。
- 展示用户模板列表，覆盖 loading、empty、error、retry 状态。
- 模板卡片展示名称，并在卡片主体内使用 iframe 展示模板实时预览效果；不展示模板描述或标签。
- 模板卡片内嵌 iframe 加载 `previewUrl` 展示预览效果，并使用与历史记录卡片一致的 iframe 缩放策略展示桌面缩略预览；同时保留“预览”按钮新窗口打开完整预览。
- 使用模板时先输入新项目名称，再调用模板实例化 API，成功后写入 preview state cache 并在当前窗口进入 Builder。
- 使用模板不得写入 bootstrap prompt，不得触发 Agent 首轮消息。
- 支持删除用户模板，删除前二次确认，删除成功后更新列表，失败展示明确反馈。
- 历史记录作为 Tab 内容复用现有 `PageBuilderHistorySection`，不改变其卡片预览、编辑、删除语义。
- CMS 集成生产模式不挂载资源区；现有 dev standalone bypass 按 standalone 展示。

**Non-Goals:**

- 不新增内置模板。
- 不新增模板缩略图、截图或独立缩略图存储。
- 不实现 Builder 页面另存模板入口或后端模板生成逻辑。
- 不修改模板 registry、模板实例化、静态导出或 CMS 固化规则。
- 不支持使用模板时输入 prompt 或自动发送 Agent 消息。
- 不为资源区 Tab 做 localStorage 持久化；一期每次进入首页默认模板库。

## Decisions

### 1. 首页资源区独立为 `PageBuilderHomeResourceTabs`

在 `HomePage` standalone 分支中，将底部原 `PageBuilderHistorySection` 替换为 `PageBuilderHomeResourceTabs`。该组件负责渲染 Tab 容器，并把模板库和历史记录作为两个并列资源视图。

替代方案：直接在 `HomePage` 内写 Tab 和模板列表逻辑。该方案会让首页 prompt 创建、integration gate、模板库和历史记录状态耦合在同一文件中，不利于测试和后续扩展，不采用。

### 2. 默认打开模板库，两个 Tab 内容保持挂载

`PageBuilderHomeResourceTabs` 默认值为 `templates`。模板库和历史记录两个内容区都保持挂载，非当前 Tab 使用 `hidden` / `aria-hidden` 隐藏。这样可以保留两个列表的加载状态和数据，避免从历史记录切回模板库时重新进入 loading skeleton，并减少资源区高度短暂塌陷导致的滚动抖动。

取舍：这会让首页首屏同时请求模板列表和历史项目列表。当前两个请求都属于首页资源区基础数据，且换来更稳定的 Tab 切换体验，接受该成本。

### 3. 模板 API client 和 hook 分层

在 `apps/app/src/renderer/lib/api.ts` 增加：

```text
listPageBuilderTemplates()
getPageBuilderTemplate(templateId)
usePageBuilderTemplate(templateId, { projectName })
deletePageBuilderTemplate(templateId)
```

其中 `usePageBuilderTemplate` 调用时必须传入 `{ projectName }` 请求体。

在 `apps/page-builder/src/renderer/hooks/usePageBuilderTemplates.ts` 管理模板库 UI 状态：列表加载、刷新、删除、使用模板的 pending 状态和错误反馈。组件层只负责展示和触发动作。

理由：项目已有 `usePageBuilderHistory` 采用相同模式；模板库按同样分层可降低 HomePage 复杂度，并便于测试 hook 与组件交互。

### 4. 使用模板跳转只写 preview state cache

用户点击“使用模板”后先打开项目名称弹框，默认使用模板名称填充项目名称。项目名称 trim 后不能为空；确认后调用模板实例化 API 并传入 `{ projectName }`。

模板使用成功后执行：

```text
clearBootstrapPayload(session.id)
writeWorkspacePreviewState(workspace.id, previewState)
navigate current window to buildBuilderPath(workspace.id, session.id, publicBasePath)
```

不得调用 `writeBootstrapPayload`，也不得复用 `createPageBuilderProject` / `retryPageBuilderSession`。这样 BuilderPage 进入后可以直接根据 workspace preview state 展示模板页面，且不会读到 `initialUserMessage` 并触发 Agent 自动发送首轮消息。

替代方案：把模板名称或说明写入 bootstrap prompt，让 Agent 继续生成。该方案违背“模板复用后预览区直接展示模板效果”的目标，不采用。

### 5. 模板卡片内展示 iframe 预览，并保留新窗口预览

模板卡片主体使用 `iframe` 加载 `template.previewUrl`，并采用与 `PageBuilderHistoryCard` 相同的缩放策略：扩大 iframe 内部画布后通过 `transform: scale(0.28)` 压缩到卡片区域，让模板库列表和历史记录一样能看到桌面页面缩略效果；点击“预览”按钮时仍调用 `openUrlInNewWindow(template.previewUrl)` 打开完整预览。

理由：用户已明确一期不需要缩略图，这里的 iframe 是实时预览承载，不生成或保存 `thumbnail` 资源。模板列表需要具备和历史记录相近的可视判断能力，因此卡片内预览比纯文本占位更符合使用模板前的决策场景。

### 6. 删除模板复用现有确认交互风格

模板删除使用现有 `AlertDialog` 风格做二次确认。删除成功后可本地移除或重新刷新列表；删除失败通过模板库区域错误或 toast 给出明确反馈，且不得误移除卡片。

模板列表项只有 `deletable === true` 时展示删除入口。虽然一期只有用户模板且 `deletable: true`，前端仍按契约判断，避免后续引入只读模板时需要重写卡片。

### 7. CMS 模式复用现有 HomePage integration gate

`HomePage` 继续先调用 `api.getCmsIntegrationStatus()`：

- `integrationMode === 'cms' && enabled && devStandaloneEntryEnabled !== true`：显示现有 CMS 限制页，不挂载 prompt、模板库或历史记录。
- 其他情况：按 standalone 渲染 prompt 和资源 Tabs。

理由：后端全局模板库 API 已在 CMS 集成生产模式阻断；前端仍应避免无意义请求并保持当前入口约束。

## Risks / Trade-offs

- [Risk] 现有 `page-builder-home-history` 规格要求首页直接展示历史区，Change 5 默认展示模板库会形成规格冲突。→ 本 change 同步修改 `page-builder-home-history` 规格，把历史记录定义为资源 Tabs 中的“历史记录”Tab，并保持历史业务语义不变。
- [Risk] 使用模板误复用 prompt 创建流程会写入 bootstrap payload，导致 Builder 自动发送首轮消息。→ 为模板使用路径单独测试 `sessionStorage`，断言 bootstrap payload 不存在且 preview state cache 已写入。
- [Risk] 用户重复点击“使用模板”可能创建多个项目。→ 使用模板 pending 期间禁用所有模板卡片的使用按钮或至少禁用当前模板按钮，并禁用项目名称弹框确认按钮。
- [Risk] 模板库卡片内 iframe 会增加首页模板库的资源加载成本。→ 仅加载当前模板列表卡片的 `previewUrl`，不生成缩略图；iframe 使用与历史记录一致的缩略缩放策略，后续如模板数量过多可再引入分页或懒加载。
- [Risk] 同时挂载两个 Tab 会让模板列表和历史列表在首页首屏同时请求。→ 两个请求均为资源区基础数据；如后续数据量明显增大，可再引入缓存或分页，而不是恢复切换时重新挂载。
- [Risk] 删除模板后列表状态和确认框状态不一致。→ 删除成功后关闭确认并本地移除或刷新列表；404 可刷新列表，其他错误保留明确提示。
- [Risk] public base path 下跳转或 API 路径错误。→ API wrapper 继续走 `resolveApiUrl`；Builder 跳转使用 `buildBuilderPath(..., publicBasePath)`；模板 `previewUrl` 直接使用服务端返回值。

## Migration Plan

- 这是前端功能接入，不需要迁移已有模板、workspace 或历史项目。
- 已有历史记录组件和 hook 保留，作为 Tab 内容复用。
- 回滚本 change 时移除新增模板库组件/hook/API wrapper，并让 `HomePage` 恢复直接挂载 `PageBuilderHistorySection` 即可；后端模板 API 不受影响。

## Open Questions

- 无阻塞问题。默认策略为：模板库默认 Tab 不持久化、模板库和历史记录两个 Tab 内容同时挂载并用 `hidden` 切换、删除确认复用 `AlertDialog`、使用模板先输入项目名称并在当前窗口跳转 Builder。
