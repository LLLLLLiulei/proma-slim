## Context

`save-page-builder-project-as-template` 已提供 workspace 维度的另存模板后端 API：`POST /api/workspaces/:workspaceId/page-builder/templates`。该 API 要求当前 workspace 是 PageBuilder workspace，并要求请求携带有效编辑锁。当前 Builder 页面已经持有编辑锁状态、Agent 写入状态和 CMS Builder Context 加载流程，但没有 UI 入口消费该 API。

Builder 页面现有结构中，右侧对话面板顶部由 `ProjectTitleBar` 展示项目名和标题编辑入口；预览面板工具栏已经承载导出静态包、刷新和新窗口预览等操作。另存模板属于项目级操作，不是预览工具，也不是 Agent 对话能力，因此应放在项目标题区域或其相近操作区。

## Goals / Non-Goals

**Goals:**

- 在 Builder 页面提供“另存模板”入口和表单。
- 通过 renderer API client 调用既有另存模板后端 API。
- 另存请求携带当前编辑锁凭证，并在编辑锁失效时复用现有失效处理。
- 在 CMS 集成 Builder 中明确提示 CMS 数据会被固化为静态模板，且不保留动态绑定或鉴权信息。
- 提供清晰的 loading、成功和失败反馈，不影响现有标题编辑、静态导出、Agent 对话和预览编辑。

**Non-Goals:**

- 不修改后端模板生成、模板校验、模板目录结构或 CMS 数据固化逻辑。
- 不实现首页模板库刷新、模板列表 UI、使用模板创建项目或删除模板 UI。
- 不为模板生成缩略图，也不引入内置模板。
- 不新增前端自己的错误分类协议；后端返回的可读错误是用户提示来源。

## Decisions

### 1. 入口放在 ProjectTitleBar 操作区

另存模板是当前项目级操作，和项目名称同属 Builder 右侧项目上下文。入口应扩展 `ProjectTitleBar` 的右侧 action 区，而不是放进预览面板工具栏。

替代方案是在预览工具栏添加按钮。该方案会把项目级模板动作混入预览操作，并且预览工具栏已经有导出、刷新和新窗口打开，继续增加按钮会降低可读性，因此不采用。

### 2. 新增独立 SaveTemplateDialog 组件

另存模板需要表单输入和错误展示，应使用普通 `Dialog` 语义实现独立组件。组件由 BuilderPage 控制 open、submitting、error、默认名称和 CMS 提示开关。表单一期只收集模板名称，避免让用户在保存模板时额外维护描述和标签。

替代方案是直接在 BuilderPage 中内联弹窗 JSX。当前 BuilderPage 已经较大，继续内联会增加状态和渲染复杂度，不利于单测表单规则，因此不采用。

### 3. API client 跟随现有 PageBuilder 写操作约定

在 `api` 中新增 `savePageBuilderWorkspaceAsTemplate(workspaceId, payload, options)`。它应复用现有 request helper 和 `PageBuilderEditLockRequestOptions`，通过 `editLock` 注入编辑锁 header。

替代方案是在 BuilderPage 中直接 `fetch`。该方案会绕过现有 base path、错误解析和编辑锁 header 约定，不采用。

### 4. CMS 提示基于“真实 CMS Builder Context”而不是全局 CMS enabled

`cmsIntegrationEnabled` 只表示 CMS 功能可用；开发模式下 standalone Builder 也可能处于 CMS enabled 状态。另存模板的 CMS 固化提示必须基于当前 Builder 是否通过 `getCmsBuilderContext()` 成功加载。

实现上建议在 BuilderPage 中维护来源状态，例如 `builderSourceMode: 'standalone' | 'cms-integrated'`。只有 CMS Builder Context 分支成功加载后才标记为 `cms-integrated`。

替代方案是直接使用 `cmsIntegrationEnabled`。该方案会在 dev standalone CMS 模式误提示 CMS 固化，不采用。

### 5. 前端只做交互级校验，后端保持最终权威

前端只校验模板名称非空、阻止重复提交、编辑锁不可用和 Agent 正在写入等交互条件。是否存在页面入口、静态导出是否成功、CMS 鉴权是否有效、资源是否可下载、模板质量是否合规，都由后端 API 返回可读错误。

替代方案是在前端根据 `previewState` 或 CMS 状态提前拦截。该方案容易受到 preview polling 滞后影响，也会复制后端规则，不采用。

### 6. Agent 正在写入时禁用另存入口

另存模板会固化当前工作区文件。如果 Agent 正在生成或修改页面，保存模板可能得到中间态产物。因此 BuilderPage 应在 `isAgentStreaming` 时禁用入口或提交，并给出明确提示。

## Risks / Trade-offs

- [Risk] 后端错误粒度依赖 Change 2 API 返回的 message，前端无法精确结构化展示所有错误类型。→ 先直接展示后端可读错误；如后续需要结构化错误码，再单独扩展 API contract。
- [Risk] `ProjectTitleBar` 扩展 action 区可能影响标题编辑布局。→ 操作按钮应使用紧凑尺寸，并保证标题文本继续 `truncate`。
- [Risk] CMS 集成来源状态判断错误会误提示或漏提示固化说明。→ 使用独立 `builderSourceMode`，不要复用 `cmsIntegrationEnabled`。
- [Risk] 用户在无预览但文件刚生成或 preview polling 未完成时点击另存。→ 不以前端 preview 状态阻断；由后端检查 `workspace-files/index.html`。

## Migration Plan

该 change 仅新增前端入口和 API wrapper，不迁移已有数据。部署后，已有 Builder 页面可在获得有效编辑锁后使用另存模板能力。回滚时删除前端入口、dialog 和 API wrapper 即可；已经另存的用户模板仍是普通模板目录，可继续被模板 registry 读取。

## Open Questions

无阻塞问题。另存模板表单一期仅填写模板名称；如后续需要描述、分类或标签，可作为模板元信息增强单独设计。
