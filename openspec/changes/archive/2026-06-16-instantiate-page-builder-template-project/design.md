## Context

PageBuilder 模板库一期已分三段完成基础能力：`add-page-builder-template-registry` 提供用户模板目录、manifest 校验、列表/详情/预览/删除；`save-page-builder-project-as-template` 能把 standalone 或 CMS 集成 Builder 当前项目另存为静态快照模板；`add-page-builder-save-template-ui` 给 Builder 页面增加另存入口。

当前仍缺少“使用模板创建项目”的后端闭环。后续首页模板库 UI 需要调用一个稳定 API，将合法用户模板实例化为新的 PageBuilder workspace、创建首个 session，并拿到可直接写入前端 preview state cache 的预览状态。

## Goals / Non-Goals

**Goals:**

- 提供 `POST /api/page-builder/templates/:templateId/use`，使用合法用户模板创建新的 PageBuilder workspace。
- 新项目名称来自请求体中的 `projectName`，服务端负责 trim 和非空校验。
- 只复制模板 `workspace-files/*` 到新 workspace，不复制模板元数据目录。
- 新项目只继承固化后的静态页面和本地资源，不继承 CMS 动态绑定、CMS rendering manifest、CMS 鉴权信息或 Builder Access Session。
- 创建首个 Agent session，并返回 `{ workspace, session, previewState }`。
- 实例化失败时清理新建 workspace、session 元数据、workspace 磁盘目录和临时产物。
- 沿用模板 registry 的 CMS 集成访问边界：生产 CMS 集成模式阻断，开发模式允许 dev bypass。

**Non-Goals:**

- 不实现首页模板库 UI、按钮状态、跳转逻辑或 `sessionStorage` 写入。
- 不写 `writeBootstrapPayload` / `clearBootstrapPayload`，不自动触发 Agent 首轮消息。
- 不复制模板报告、复制 source metadata 或保留模板来源信息到 workspace。
- 不支持 CMS 动态绑定迁移/复用；CMS 集成来源另存出的模板也只作为普通静态快照使用。
- 不改变现有模板 registry、模板预览或另存模板 API 的行为。

## Decisions

### 1. API 放在全局 PageBuilder 模板路由下

新增路由：

```text
POST /api/page-builder/templates/:templateId/use
```

该 API 从模板出发创建新的 workspace，请求开始时还没有 workspace 上下文，因此不放入 `/api/workspaces/:workspaceId/...`。路由层复用 `assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下不可使用本地模板创建项目', { allowDevStandaloneEntry: true })`，和模板列表/详情/预览/删除保持一致。

替代方案：前端先创建 workspace，再调用 workspace scoped API 复制模板。该方案会让模板实例化跨多个请求，失败回滚依赖前端补偿，容易留下空项目或孤儿 session，不采用。

### 2. 请求体要求提供项目名称

一期 `use` API 读取 JSON 请求体中的 `projectName`。服务端对该字段做 trim，空字符串或缺失时返回 400；新 workspace 名称使用 trim 后的项目名称。

理由：

- 用户从模板创建的是新项目，项目名称应和模板名称解耦，避免多个实例都继承同一个模板名。
- 由后端校验 `projectName` 可以防止前端绕过表单直接调用 API 创建空名称项目。
- 请求字段命名为 `projectName`，避免和模板 manifest 的 `name` 混淆。

### 3. 实例化能力放在模板服务中

`PageBuilderTemplateService` 新增类似 `instantiateTemplateProject(templateId, { projectName })` 的方法，内部完成：

1. 使用现有 registry 解析合法模板。
2. 使用请求项目名称创建 PageBuilder workspace。
3. 清空新 workspace 默认 `workspace-files/`。
4. 安全复制模板 `workspace-files/*` 到新 workspace。
5. 移除不允许继承的 `.proma/cms-rendering-manifest.json`。
6. 创建首个 Agent session。
7. 计算并返回 `getWorkspacePreviewState(workspace)`。

理由：模板 registry 的解析、路径校验和模板目录约定都已经集中在模板服务中，实例化流程放在同一服务能避免路由层了解模板内部目录结构。

### 4. 复制使用白名单递归策略而非直接 `cpSync`

实例化只允许复制普通目录和普通文件：

- 普通目录：递归创建。
- 普通文件：复制内容。
- symlink、特殊文件、设备文件：拒绝实例化并触发回滚。

理由：模板预览已通过真实路径校验防止 symlink 逃逸，但实例化如果直接复制 symlink，可能把逃逸链接带入 workspace。直接拒绝比静默跳过更容易暴露损坏或恶意模板。

### 5. 创建 workspace 后必须覆盖默认 `workspace-files`

`createAgentWorkspace(name, { template: 'page-builder' })` 会初始化 PageBuilder 默认页面和默认运行文件。模板实例化必须清空新 workspace 的 `workspace-files/` 后再复制模板内容，保证新项目文件与模板 `workspace-files/` 一致，不和默认骨架混合。

### 6. 回滚优先复用现有 PageBuilder 项目删除能力

实例化过程中一旦 workspace 已创建但后续步骤失败，应清理：

- 新建 session 元数据和 session 工作目录。
- 新建 workspace 索引记录。
- 新建 workspace 磁盘目录。
- 已复制的半成品文件。

优先复用 `deletePageBuilderProject(workspace.id)`，因为它已经删除 workspace 下所有 session、workspace 目录和 workspace 索引。若实现中出现循环依赖或编辑锁状态干扰，则抽出底层 cleanup helper，例如 `deleteAgentWorkspaceDirectoryAndIndex()`，但不改变 API 语义。

### 7. 使用 shared 请求/响应类型

在 shared 模板类型中新增请求和响应类型，例如：

```ts
interface PageBuilderTemplateUseRequest {
  projectName: string
}

interface PageBuilderTemplateUseResponse {
  workspace: AgentWorkspace
  session: AgentSessionMeta
  previewState: {
    hasPreview: boolean
    entryUrl: string | null
    revision: string | null
    hasCmsRendering: boolean
    requiresSameOrigin: boolean
  }
}
```

Change 4 后端路由返回该结构；Change 5 前端 API client 可以直接复用这个契约。

### 8. 错误映射要区分实例化场景

现有 `page-builder.ts` 的模板错误映射主要服务列表/详情/预览/删除，除 `forbidden` 外基本映射为 404。Change 4 需要扩展实例化错误映射：

- 模板不存在或非法 templateId：404。
- 禁止访问或路径逃逸：403。
- 请求或模板输入不合法：400。
- 文件复制失败、symlink 被拒绝、session 创建失败、preview state 异常：409 或 500，不能全部映射成 404。

## Risks / Trade-offs

- [Risk] 复用 `deletePageBuilderProject()` 回滚可能受编辑锁状态影响。→ 新建项目默认没有编辑锁；如测试暴露干扰，则抽底层 cleanup helper，保持行为不变。
- [Risk] 递归复制拒绝 symlink 可能让手工构造的模板无法使用。→ 一期模板应由另存模板流程生成，正常不会包含 symlink；拒绝 symlink 更安全。
- [Risk] 创建 workspace 后再清空默认 `workspace-files` 存在短暂半成品窗口。→ 整个 API 在单请求内同步完成，失败会回滚；前端不会在返回前看到项目。
- [Risk] `previewState` 类型当前主要由 renderer API 本地定义。→ Change 4 在 shared 增加模板使用响应的 preview state 结构，后续可再统一抽公共类型。
- [Risk] 回滚清理失败可能掩盖原始错误或留下残留。→ 实现应优先保留原始失败原因，同时记录清理失败；测试覆盖典型复制失败和 session 创建失败场景。

## Migration Plan

- 新增 API 和服务能力，不迁移已有 workspace、模板目录或历史项目。
- 现有模板 registry、模板预览、删除模板、另存模板和 Builder UI 行为不变。
- 回滚本 change 时删除 use API、实例化服务方法和 shared 响应类型即可；已通过 API 创建出的 PageBuilder workspace 仍是普通历史项目，可按现有项目删除流程处理。

## Open Questions

- 无阻塞问题。Change 4 按“请求体要求 `projectName`、新项目名使用请求项目名称、拒绝 symlink、返回 workspace/session/previewState、生产 CMS 集成模式阻断”的口径推进。
