## Context

当前对话页中工具活动列表与权限提示横幅分别维护自己的工具名称展示逻辑：

- 工具活动列表直接显示 `activity.toolName`，`Skill` 摘要也直接显示原始 skill 调用名。
- 权限横幅有一套单独的 `formatToolName`，目前只对部分 MCP 工具名做格式拆分，没有中文本地化，也与工具活动列表不一致。

当前与该需求直接相关的名称来源可分为三层：

- 内置工具名：`ToolActivityItem` 当前显式处理 `Edit`、`Write`、`Read`、`Bash`、`Glob`、`Grep`、`WebFetch`、`WebSearch`、`NotebookEdit`、`Skill`、`TodoWrite`、`TodoRead`、`Task`、`TaskCreate`、`TaskUpdate`、`TaskGet`、`TaskList`、`TeamCreate`、`Agent`，权限层还会命中 `AskUserQuestion`。
- 第一方 MCP 工具名：当前代码里稳定出现 `mcp__cms__list_catalogs`、`mcp__cms__list_contents`、`mcp__cms__decide_cms_binding`、`mcp__cms__apply_cms_binding`、`mcp__image_search__search_images`、`mcp__image_search__download_images`。
- 默认 skill 名：`apps/app/default-skills` 当前包含 `brainstorming`、`cms-binding-apply`、`find-skills`、`page-builder-cms-region-authoring-guidance`、`page-builder-guided-generation`、`redesign-skill`、`soft-skill`、`taste-skill`；运行时调用名可能是纯 slug，也可能是 `<workspace-slug>:<skill-slug>`。

当前稳定出现的第一方 MCP server 名称为：

- `cms`
- `image_search`

本次需求已经明确收敛为“只改前端展示效果”：

- 不修改后端事件结构、SSE 数据或消息持久化格式。
- 不修改真实 `toolName`、skill slug 或调用协议。
- 不修改消息正文里用户手输的 `/skill:...`、`#mcp:...` mention chip。
- 未命中映射时直接显示原名称，不增加“未知工具”“未知技能”等文案。

因此，这次最合适的实现方式是增加一层 renderer 侧共享展示名称映射，而不是把本地化字段塞进后端协议或持久化数据。

## Goals / Non-Goals

**Goals:**

- 为对话页工具活动列表中的常见工具名称提供中文展示名称。
- 为当前第一方 MCP 工具名称提供中文展示名称。
- 为 `Skill` 工具对应的已知内置 skill 调用名提供中文展示名称。
- 让权限提示横幅与工具活动列表复用同一套名称映射规则，避免同一工具在不同 UI 中显示不一致。
- 保持未命中映射的工具名、MCP 名和 skill 名原样显示。
- 以最小改动完成前端展示层本地化，不扩散到后端和协议层。

**Non-Goals:**

- 不修改后端 `AgentEvent`、SSE、REST API 或消息持久化结构。
- 不修改消息正文内的 `/skill:...`、`#mcp:...` mention 渲染。
- 不为所有未来可能新增的第三方工具、自定义 skill 或自定义 MCP server/tool 自动生成中文名。
- 不引入新的国际化框架或配置中心。

## Decisions

### 1. 在 renderer 侧新增共享名称格式化模块

新增一个前端共享 formatter，负责：

- 把常见工具名映射为中文展示名。
- 把第一方 MCP 工具名映射为中文展示名。
- 把已知内置 skill slug 或 workspace-qualified skill 调用名映射为中文展示名。
- 在未命中映射时直接返回原名称。

这样 `ToolActivityItem` 与 `PermissionBanner` 可以复用同一套逻辑，避免继续各自维护不同规则。

选择该方案而不是分别在两个组件内硬编码的原因：

- 能保证名称展示一致。
- 后续补充映射项时只需改一个地方。
- 不会影响现有 `toolName` 作为图标映射、状态判断和事件去重 key 的用途。

备选方案：

- 分别在两个组件内就地翻译：改动表面更小，但后续容易漂移。
- 让后端事件直接下发中文 `displayName`：侵入协议层，超出本次范围。

### 2. 工具名、MCP 工具名和 skill 名分三层映射

工具活动展示里存在三类名称：

- 工具类型名，例如 `AskUserQuestion`、`Skill`、`Bash`
- MCP 工具调用名，例如 `mcp__cms__apply_cms_binding`
- `Skill` 工具承载的 skill 调用名，例如 `page-builder-guided-generation` 或 `workspace-slug:page-builder-guided-generation`

因此需要三层映射：

- `tool label map`：负责工具类型中文名
- `mcp tool label map`：负责第一方 MCP 工具中文名
- `skill label map`：负责 skill 中文名

skill 映射会先对调用名做最小规范化：

- 如果形如 `<workspace-slug>:<skill-slug>`，先提取后半段 `skill-slug`
- 仅对已知内置 skill slug 做中文映射
- 未命中映射时直接保留原字符串

选择该方案而不是只翻译 `Skill -> 技能使用` 的原因：

- 否则用户仍会在摘要里看到难理解的英文 slug，体验改善有限。
- 这仍然属于前端展示层处理，不需要新增后端字段。

备选方案：

- 只翻译工具类型、不翻译 skill 名：实现更省，但用户仍需理解英文 skill slug。
- 从工作区能力接口动态读取 skill 中文名：扩散到 API 和 capability surface，超出最小改动目标。

### 3. MCP 本地化只覆盖第一方固定清单，自定义 MCP 保持原名

MCP 展示采用“第一方固定清单 + 其他原样保留”的策略：

- 对当前代码中稳定出现的 `cms` 与 `image_search` runtime tools 提供中文映射。
- 对用户自定义 workspace MCP server 或未来新增的未登记 MCP 工具，不尝试猜测中文名，直接显示原名称。

选择该方案的原因：

- 与“未匹配到中文时直接显示原名称”的用户要求一致。
- 避免把 `mcp__<server>__<tool>` 强行拆成半中文半英文，导致含义更乱。
- 能让当前首批映射足够清晰，同时保留未来扩展空间。

备选方案：

- 保留旧的 `server / tool` 文本拆分：可读性略高，但不符合“未命中直接保留原名称”的要求。
- 为所有 `mcp__*` 自动机器翻译：误译风险高，也不利于维护。

### 4. 本地化只作用于展示标签，不改变详情数据和底层语义

本次本地化只用于 UI 标签：

- 工具活动行标题
- 第一方 MCP 工具标题
- `Skill` 摘要中的 skill 显示名
- 权限横幅的工具名称

工具输入、结果内容、事件持久化和内部判断仍继续使用原始工具名与原始输入数据。

选择该方案的原因：

- 可以最大限度降低改动面和回归风险。
- 有利于保持现有测试与运行时语义稳定。
- 出现新工具或未映射 skill 时，直接回退原名即可。

备选方案：

- 同时本地化详情面板中的复制标题、JSON key 或消息正文：会扩大影响面，也容易让排查信息和真实协议不一致。

### 5. 当前首批中文映射清单固定在设计文档中

为了让实现和测试有稳定目标，首批中文映射清单固定如下。

命名规则如下：

- 内置工具：优先使用简洁的“动词 + 对象”结构，强调当前动作，例如“读取文件”“执行命令”。
- 第一方 MCP 工具：统一使用“领域 / 动作”结构，先表达服务域，再表达具体操作，例如“CMS / 查询栏目列表”。
- skill：优先表达该 skill 的职责或阶段角色，而不是逐词直译 slug，例如“页面引导生成”“二阶段视觉精修”。
- 若后续新增映射项，新增名称 SHOULD 与当前清单保持同一风格；若无法稳定命名，则保留原名称。

内置工具名称：

| 原名称 | 中文显示 |
| --- | --- |
| `AskUserQuestion` | `向用户提问` |
| `Bash` | `执行命令` |
| `Read` | `读取文件` |
| `Write` | `写入文件` |
| `Edit` | `编辑文件` |
| `Glob` | `查找文件` |
| `Grep` | `搜索文本` |
| `WebSearch` | `网页搜索` |
| `WebFetch` | `抓取网页` |
| `NotebookEdit` | `编辑笔记本` |
| `Skill` | `调用技能` |
| `TodoWrite` | `更新待办事项` |
| `TodoRead` | `查看待办事项` |
| `Task` | `委派子任务` |
| `TaskCreate` | `创建任务` |
| `TaskUpdate` | `更新任务` |
| `TaskGet` | `查看任务详情` |
| `TaskList` | `查看任务列表` |
| `TeamCreate` | `创建协作组` |
| `Agent` | `调用子代理` |

第一方 MCP 工具名称：

| 原名称 | 中文显示 |
| --- | --- |
| `mcp__cms__list_catalogs` | `CMS / 查询栏目列表` |
| `mcp__cms__list_contents` | `CMS / 查询内容列表` |
| `mcp__cms__decide_cms_binding` | `CMS / 生成绑定方案` |
| `mcp__cms__apply_cms_binding` | `CMS / 应用内容绑定` |
| `mcp__image_search__search_images` | `图片搜索 / 搜索图片` |
| `mcp__image_search__download_images` | `图片搜索 / 导入图片` |

第一方 MCP server 名称参考：

| 原名称 | 中文显示 |
| --- | --- |
| `cms` | `CMS` |
| `image_search` | `图片搜索` |

默认内置 skill 名称：

| 原名称 | 中文显示 |
| --- | --- |
| `brainstorming` | `方案探索` |
| `cms-binding-apply` | `CMS 绑定执行` |
| `find-skills` | `技能发现` |
| `page-builder-cms-region-authoring-guidance` | `既有 CMS 区域内容编辑指导` |
| `page-builder-guided-generation` | `页面引导生成` |
| `redesign-skill` | `二阶段视觉精修` |
| `soft-skill` | `高端视觉设计` |
| `taste-skill` | `首轮视觉设计` |

对 `<workspace-slug>:<skill-slug>` 形式的 skill 调用名，系统先取 `skill-slug` 再按上表匹配；未命中时直接保留原字符串。

## Risks / Trade-offs

- [映射表需要人工维护] → 通过集中式 formatter 管理映射，后续新增工具、第一方 MCP 工具或 skill 时只补一处并同步文档。
- [未知工具、MCP 或 skill 仍显示英文原名] → 这是明确接受的兜底策略，优先保证最小改动和无误译。
- [权限横幅现有 MCP 名称拆分逻辑会被收敛] → 统一改为“先查中文映射，未命中则原样显示”，以满足“未匹配到中文时直接显示原名称”的要求。
- [只改展示层，无法让正文 mention 同步中文化] → 这是本次刻意保留的边界，避免扩大到用户原始输入渲染。

## Migration Plan

本次为纯前端展示层变更，无数据迁移与部署顺序要求。

- 发布后新渲染的工具活动和权限横幅立即使用新的中文展示名。
- 既有持久化消息无需迁移，重新打开后会按新的前端 formatter 重新显示。
- 如需回滚，只需移除前端 formatter 调用并恢复原有展示逻辑。

## Open Questions

- None.
