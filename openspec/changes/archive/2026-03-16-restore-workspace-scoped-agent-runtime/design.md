## Context

当前 Bun Web 版在 `simplify-to-claude-code-chat` 变更中有意移除了工作区体系，将 Agent 执行目录固定为服务启动目录，并把工作区、MCP 配置、文件浏览器等能力整体视为非目标。与此同时，仓库中仍保留了一部分工作区相关共享类型、会话字段和输入组件参数位，导致当前实现出现“契约仍在、运行时已失效”的中间状态。

对照 `4564bac` 之前的实现，旧版工作区并非单纯 UI 下拉框，而是完整的工作区作用域执行模型，包括：
- `~/.proma/agent-workspaces.json` 索引与默认工作区
- `agent-workspaces/{slug}/{sessionId}` 形式的 session 级 cwd
- 工作区作用域的 `skills/`、`skills-inactive/`、`mcp.json`、`workspace-files/`
- 会话迁移时的工作目录迁移与 `sdkSessionId` 失效
- 输入组件基于 `workspacePath` / `workspaceSlug` / `attachedDirs` 的引用上下文

本次设计的约束是：恢复工作区作用域运行时，但不回退到 Electron IPC 架构，也不恢复 Chat 模式或旧版完整壳层。

## Goals / Non-Goals

**Goals:**
- 重新引入可持久化的 Agent 工作区实体，并保证默认工作区存在
- 让 Agent 实际 `cwd` 按会话所属工作区解析，而不是固定为 `process.cwd()`
- 恢复工作区作用域的 Skills、MCP、workspace-files 与附加目录能力面
- 通过 Bun HTTP API 暴露工作区 CRUD 与能力查询面
- 在当前 Web UI 中恢复最小工作区选择流程，使新会话和输入引用具备工作区上下文

**Non-Goals:**
- 不恢复 Chat 模式、Electron BrowserWindow / preload / IPC 总线
- 不恢复旧版完整文件浏览器、后台任务、Team 活动面板和复杂分屏外壳
- 不追求与历史 UI 逐像素一致，只保留当前 Web App 所需的最小工作区交互
- 不在第一轮中恢复所有旧设置页，只恢复工作区运行时所必需的能力

## Decisions

### Decision: 复用旧版工作区目录模型，但以 Bun HTTP 服务重建入口

**Decision**
- 复用旧版 `agent-workspaces/{slug}`、`skills/`、`mcp.json`、`workspace-files/`、`{sessionId}/` 的目录模型。
- 重新实现工作区服务为 Bun main 侧模块，并通过 `/api/workspaces` 及相关 REST 路由暴露给 renderer。

**Rationale**
- 旧版目录模型已经把“工作区 = 执行边界 + 能力边界 + 文件边界”表达得比较完整。
- 当前架构已经切换为 Bun Web，继续依赖 Electron IPC 会让恢复范围失控。

**Alternatives considered**
- 直接恢复旧版 `window.electronAPI` / IPC 工作区链路：可复用代码多，但会与当前 Bun Web 架构冲突。
- 完全重新设计工作区目录结构：概念更纯，但会丢失旧用户数据和已有路径语义。

### Decision: Agent `cwd` 使用工作区下的 session 级目录

**Decision**
- 对于绑定工作区的会话，Agent SDK 的 `cwd` 使用 `agent-workspaces/{workspaceSlug}/{sessionId}`。
- 历史会话若缺少 `workspaceId`，在加载或首次使用时补齐到默认工作区。

**Rationale**
- 这与旧版行为一致，能保证不同会话在同一工作区下仍拥有各自独立的工作目录。
- 使用 session 级目录而不是工作区根目录，可以减少不同会话之间的工作文件干扰。

**Alternatives considered**
- 直接把工作区根目录作为所有会话共用 `cwd`：实现更简单，但会弱化会话隔离，并使恢复历史 session 目录语义变得困难。
- 继续使用 `process.cwd()` 并仅把工作区作为 UI 标签：无法满足恢复工作区运行时的目标。

### Decision: 工作区能力面第一轮恢复到“可执行 + 可引用”，不强制恢复完整文件浏览器

**Decision**
- 第一轮恢复 workspace Skills、MCP、workspace-files、工作区级附加目录，以及输入组件的 workspace-aware 引用上下文。
- 文件浏览器和 watcher 不要求完全回到旧版形态；先保证目录与能力可查询、可用于 Agent 运行与输入引用。

**Rationale**
- 当前用户需求首先指向“工作区真正影响执行目录和能力面”，而不是立即恢复整套旧版文件管理壳层。
- 这样能优先恢复核心运行时价值，同时控制前端重建范围。

**Alternatives considered**
- 一次性恢复旧版文件浏览器和 watcher：功能更完整，但会把这次 change 扩大成 UI 大重建。
- 完全不恢复 workspace-files 与引用上下文：工作区会沦为只影响 `cwd` 的半成品。

### Decision: 工作区选择 UI 保持最小化

**Decision**
- 在当前侧边栏中恢复最小工作区选择和创建入口。
- 新会话默认继承当前工作区；工作区上下文同时驱动 RichTextInput 的 workspacePath / workspaceSlug / attachedDirs。

**Rationale**
- 当前 UI 已经被收敛为 Claude Code 单模式应用，重新引入完整旧壳会冲击现有界面稳定性。
- 最小化入口足以让工作区从后端能力变成用户可用能力。

**Alternatives considered**
- 恢复旧版完整 `WorkspaceSelector + MoveSessionDialog + FileBrowser + SidePanel`：复用旧形态更多，但会重新引入此前已明确裁掉的复杂壳层。
- 仅恢复后端能力，不做任何 UI：会让工作区只能通过手工请求或隐式默认值生效，用户不可感知。

### Decision: 侧边栏工作区区块回归原版的列表式心智

**Decision**
- 将工作区区块从“顶部卡片 + 下拉框 + 独立输入表单”重构为“工作区列表 + 当前项高亮 + `+ 新建工作区` 内联入口”的结构。
- `+ 新会话` 入口移动到工作区列表之后。
- `置顶会话`、`MCP / Skills` 和 `设置` 继续保留，但视觉层级整体弱化，以接近旧版 Proma 侧栏节奏。

**Rationale**
- 当前最小工作区实现虽然功能完整，但视觉和交互心智仍明显偏离旧版，用户需要额外理解“卡片里的下拉框”这一新结构。
- 旧版工作区本质上是侧栏里的一级导航对象，把它恢复为列表结构更符合用户已有认知，也能减少“工作区只是一个表单控件”的误解。
- 这种调整只改变 renderer 的信息架构和视觉层级，不会影响已经恢复的工作区运行时语义。

**Alternatives considered**
- 仅微调现有卡片和下拉框样式：实现最便宜，但与旧版差距仍大，无法解决信息架构偏差。
- 完整复刻旧版全部侧栏模块：视觉最像旧版，但会把当前精简版重新拖回复杂壳层。

### Decision: 侧边栏工作区切换与删除遵循保守语义

**Decision**
- 侧边栏切换“当前工作区”只影响后续新会话的默认归属、工作区能力摘要和输入引用上下文，不迁移已经存在的会话。
- 第一轮保留工作区重命名与删除入口，但删除仅允许作用于“非默认且当前没有任何会话归属”的工作区。
- 删除当前选中的空工作区后，侧边栏选择回退到默认工作区；若默认工作区不可用，则回退到剩余列表中的首个工作区。

**Rationale**
- 已恢复的 runtime 是“会话绑定工作区”语义，而不是“全局切换所有打开会话”的语义；侧边栏切换如果隐式迁移现有会话，会与当前实现和用户已存在的会话心智冲突。
- 现有后端删除逻辑只移除工作区索引，不处理仍绑定该工作区的会话；在第一轮中阻止删除非空工作区，是最小且安全的行为。
- 这种保守规则允许 UI 接近旧版，同时避免引入会话 orphan、错误 `cwd` 解析或历史上下文失效等问题。

**Alternatives considered**
- 切换当前工作区时自动迁移当前打开会话：交互看似直接，但会把一个导航操作变成有副作用的数据迁移，风险过高。
- 删除工作区时自动把会话迁移到默认工作区：对用户更“方便”，但会在无确认的情况下改变会话执行边界，不适合作为第一轮默认行为。
- 彻底隐藏删除入口：最安全，但会明显偏离用户已确认的原版侧栏心智。

## Risks / Trade-offs

- **[旧会话兼容迁移]** 历史会话没有 `workspaceId`，恢复后若处理不一致会导致执行目录漂移。  
  → Mitigation: 统一把无归属历史会话补齐到默认工作区，并在首次访问时创建缺失的 session 目录。

- **[SDK resume 与 cwd 绑定]** 工作区切换或迁移后继续复用旧 `sdkSessionId` 会把上下文绑定到错误目录。  
  → Mitigation: 将“工作区变化必须清空 `sdkSessionId`”写入 spec，并在迁移实现中强制执行。

- **[能力面恢复范围过大]** 若一次性恢复 watcher、文件浏览器、旧版各种面板，change 会变成大规模 UI 回滚。  
  → Mitigation: 第一轮只恢复运行时必需能力和最小工作区选择 UI，把完整文件浏览器增强留作后续变更。

- **[旧版 Electron 设计直接搬运]** 旧实现大量依赖 BrowserWindow 与 IPC，直接复用会污染当前 Bun Web 架构。  
  → Mitigation: 复用旧目录模型和工作区职责，不复用旧入口形式；统一改为 HTTP API。

## Migration Plan

1. 引入新的工作区服务与路径助手，确保默认工作区存在。
2. 为历史无归属会话补齐默认工作区，并建立对应 session 级目录。
3. 在 HTTP 路由层增加工作区 CRUD、能力摘要、目录信息等 REST API。
4. 重写 Agent 运行时的工作区解析逻辑，让 `cwd`、Skills、MCP、additionalDirectories 都按会话所属工作区生效。
5. 在当前 Web UI 中补回最小工作区选择和新会话继承逻辑，并将工作区上下文重新传入 RichTextInput。
6. 在 renderer 中把工作区区块重构为接近旧版的列表式侧栏结构，并重新整理 `+ 新会话`、`置顶会话` 与底部辅助信息的视觉层级。

**Rollback**
- 后端可以暂时回退到单一 `process.cwd()` 模式，并忽略工作区路由与 `workspaceId` 字段。
- 已创建的工作区目录和元数据可保留在 `~/.proma/agent-workspaces/`，不要求删除用户文件。

## Open Questions

- 第一轮是否需要恢复最小文件浏览器视图，还是仅恢复 `workspace-files` 与输入引用上下文即可？
- 工作区能力变化的刷新是否需要事件推送，还是先使用按需拉取即可满足当前 Web 架构？
