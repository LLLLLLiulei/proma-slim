## Purpose
定义 `page-builder` 如何基于工作区 `workspace-files` 暴露静态预览入口、预览状态接口，以及 builder 左侧 iframe 的自动刷新行为。

## Requirements

### Requirement: 工作区必须暴露 `workspace-files` 的静态预览入口
系统 SHALL 为每个工作区提供基于 `workspace-files` 的静态网页预览入口，使 builder 左侧可以直接加载当前项目的真实页面结果。

#### Scenario: 访问工作区预览入口时返回 `index.html`
- **WHEN** 当前工作区的 `workspace-files/index.html` 已存在，且前端访问该工作区的预览入口
- **THEN** 系统 SHALL 返回该工作区的 `index.html` 内容作为预览首页

#### Scenario: 访问预览静态资源时按相对路径返回文件
- **WHEN** 当前工作区的预览页面通过相对路径请求 `workspace-files` 下的静态资源文件
- **THEN** 系统 SHALL 从该工作区的 `workspace-files` 目录中返回对应资源，而不是回退到应用前端静态资源

#### Scenario: 预览入口不存在时不返回旧内容
- **WHEN** 当前工作区的 `workspace-files/index.html` 不存在
- **THEN** 系统 SHALL 将该工作区视为“暂无可预览页面”，并且不继续返回旧的预览入口内容

### Requirement: 工作区必须提供可轮询的预览状态接口
系统 SHALL 为每个工作区提供轻量预览状态查询能力，使 builder 可以在不直接重载 iframe 的情况下判断当前是否存在预览、预览内容是否发生变化，以及当前页面是否包含 CMS rendering 及其 iframe 权限需求。

#### Scenario: 存在普通预览时返回入口地址、版本和非 CMS 元数据
- **WHEN** 当前工作区存在可访问的 `workspace-files/index.html`，且该页面不包含顶层 `cms-*`
- **THEN** 系统 SHALL 返回 `hasPreview` 为真、可供 iframe 加载的 `entryUrl`，以及表示当前预览快照版本的 `revision`
- **AND** 系统 SHALL 返回 `hasCmsRendering = false`
- **AND** 系统 SHALL 返回 `requiresSameOrigin = false`

#### Scenario: 存在 CMS rendering 预览时返回显式 CMS 元数据
- **WHEN** 当前工作区存在可访问的 `workspace-files/index.html`，且该页面包含顶层 `cms-*`
- **THEN** 系统 SHALL 返回 `hasPreview` 为真、可供 iframe 加载的 `entryUrl`，以及表示当前预览快照版本的 `revision`
- **AND** 系统 SHALL 返回 `hasCmsRendering = true`
- **AND** 系统 SHALL 返回 `requiresSameOrigin = true`

#### Scenario: 不存在预览时返回空状态
- **WHEN** 当前工作区尚未生成任何可访问的预览入口
- **THEN** 系统 SHALL 返回 `hasPreview` 为假，并且不返回可继续加载旧预览的有效入口地址
- **AND** 系统 SHALL 返回 `hasCmsRendering = false`
- **AND** 系统 SHALL 返回 `requiresSameOrigin = false`

#### Scenario: 预览文件变化时状态版本变化
- **WHEN** 当前工作区 `workspace-files` 中参与预览的文件被创建、修改、删除或替换
- **THEN** 系统 SHALL 使后续预览状态查询返回不同于先前值的 `revision`

### Requirement: Builder 页面必须基于预览状态驱动左侧 iframe
系统 SHALL 在 builder 页面中基于当前工作区的预览状态决定左侧显示真实页面还是空状态，并让预览加载指向当前工作区的真实入口；当预览状态要求更宽的同源权限时，builder SHALL 基于该显式元数据调整 iframe sandbox，而不是自行猜测页面内容。

#### Scenario: 存在普通预览时以受限 sandbox 加载真实页面
- **WHEN** builder 页面获取到当前工作区 `hasPreview` 为真，且 `requiresSameOrigin = false`
- **THEN** 系统 SHALL 在左侧预览面板中加载该工作区的真实 `entryUrl`
- **AND** 系统 SHALL 为 iframe 使用不含 `allow-same-origin` 的受限 sandbox

#### Scenario: 存在 CMS rendering 预览时追加 `allow-same-origin`
- **WHEN** builder 页面获取到当前工作区 `hasPreview` 为真，且 `requiresSameOrigin = true`
- **THEN** 系统 SHALL 在左侧预览面板中加载该工作区的真实 `entryUrl`
- **AND** 系统 SHALL 为 iframe sandbox 追加 `allow-same-origin`

#### Scenario: 不存在预览时显示空状态
- **WHEN** builder 页面获取到当前工作区 `hasPreview` 为假的预览状态
- **THEN** 系统 SHALL 在左侧预览面板中显示“预览尚未生成”的空状态
- **AND** 系统 SHALL 不继续显示过期页面

#### Scenario: 新窗口打开使用当前工作区预览入口
- **WHEN** 用户在 builder 左侧点击“新窗口打开”
- **THEN** 系统 SHALL 打开当前工作区最新的预览入口地址
- **AND** 系统 SHALL 不打开固定占位地址或旧 revision 地址

### Requirement: Builder 页面必须在预览变化后自动刷新
系统 SHALL 在 builder 页面挂载期间持续感知当前工作区的预览状态，并在预览版本发生变化时自动刷新左侧 iframe，而不要求用户手动点击刷新。

#### Scenario: 预览版本未变化时不触发自动重载
- **WHEN** builder 页面连续查询到相同的预览 `revision`
- **THEN** 系统 SHALL 保持当前 iframe 内容，不因重复状态查询而执行无意义的自动刷新

#### Scenario: 预览版本变化时自动刷新 iframe
- **WHEN** builder 页面查询到新的预览 `revision`
- **THEN** 系统 SHALL 自动重新加载左侧 iframe，使用户看到更新后的网页结果

#### Scenario: 预览版本变化时刷新地址带有新的缓存规避标识
- **WHEN** builder 页面因 `revision` 变化而重新加载预览页面
- **THEN** 系统 SHALL 使用带有新版本标识的预览地址加载 iframe，以避免继续命中旧缓存内容

### Requirement: page-builder 创建的工作区必须通过根目录 `CLAUDE.md` 约束可预览产物落点
系统 SHALL 在 page-builder 创建工作区时，于该工作区根目录初始化 `CLAUDE.md`，使可预览页面产物稳定落到当前工作区的 `workspace-files` 中，而不通过改写用户消息正文来传递这些约束。

#### Scenario: page-builder 创建工作区时初始化根目录 `CLAUDE.md`
- **WHEN** 用户通过 page-builder 首页创建一个新的项目工作区
- **THEN** 系统 SHALL 在该工作区根目录写入 `CLAUDE.md`
- **AND** 该文件 SHALL 作为该工作区下后续会话共享的项目级网页构建约束

#### Scenario: `CLAUDE.md` 要求入口与静态资源写入 `workspace-files`
- **WHEN** page-builder 创建的工作区中的 Agent 生成或修改可预览网页
- **THEN** 系统 SHALL 在该工作区的 `CLAUDE.md` 中明确约束页面入口写入 `workspace-files/index.html`
- **AND** 系统 SHALL 在该工作区的 `CLAUDE.md` 中明确约束静态资源写入 `workspace-files` 相对目录，而不是散落到 session cwd

#### Scenario: builder 页不通过改写用户消息正文注入 page-builder 约束
- **WHEN** 用户在 page-builder builder 页发送普通网页需求
- **THEN** 系统 SHALL 保持该次可见用户消息正文不被 page-builder 内部约束改写
- **AND** 这些工作区级约束 SHALL 通过根目录 `CLAUDE.md` 生效

#### Scenario: 非 page-builder 创建的工作区不自动写入 `CLAUDE.md`
- **WHEN** 用户通过通用工作区创建链路创建普通工作区
- **THEN** 系统 SHALL 不因为该工作区存在普通 Agent 会话就自动写入 page-builder 专属 `CLAUDE.md`

### Requirement: 工作区预览状态返回的 entryUrl 必须支持 public base path
系统 SHALL 让 PageBuilder Server 返回给浏览器的 workspace preview `entryUrl` 使用当前 public base path，使 builder iframe、新窗口预览和历史卡片预览在 `/pagebuilder` 挂载下不会请求 CMS 根路径 `/api/*`。

#### Scenario: base path 下 preview state 返回带前缀入口
- **WHEN** 当前工作区存在可预览页面，且 public base path 为 `/pagebuilder`
- **THEN** 预览状态接口返回的 `entryUrl` SHALL 形如 `/pagebuilder/api/workspaces/<workspaceId>/preview/`
- **AND** builder iframe SHALL 使用该地址加载预览页面

#### Scenario: base path 下历史项目 previewUrl 返回带前缀入口
- **WHEN** 首页历史项目接口返回存在预览产物的项目，且 public base path 为 `/pagebuilder`
- **THEN** 项目的 `previewUrl` SHALL 形如 `/pagebuilder/api/workspaces/<workspaceId>/preview/`
- **AND** 历史卡片 iframe 和新窗口预览 SHALL 使用该地址加载预览页面

#### Scenario: 无 base path 时 preview state 保持现有入口
- **WHEN** 当前工作区存在可预览页面，且未配置 public base path
- **THEN** 预览状态接口返回的 `entryUrl` SHALL 继续形如 `/api/workspaces/<workspaceId>/preview/`

#### Scenario: CMS 资源代理 URL 使用 public base path
- **WHEN** 预览 HTML 中的 CMS 远程资源被重写为宿主代理 URL，且 public base path 为 `/pagebuilder`
- **THEN** 重写后的资源 URL SHALL 位于 `/pagebuilder/api/page-builder/cms/assets`
- **AND** 系统 SHALL NOT 生成指向 CMS 根路径 `/api/page-builder/cms/assets` 的浏览器 URL

### Requirement: CMS 集成模式下 workspace preview 必须校验 Builder Access Session
系统 SHALL 在 CMS 集成模式下通过统一 CMS Builder Access middleware 对 workspace preview HTML 和静态子资源执行 Builder Access Session 校验，防止未通过 CMS handoff 的浏览器直接访问 preview URL。

#### Scenario: standalone 模式 preview 行为保持不变
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE` 未设置为 `cms` 且请求 `GET /api/workspaces/:workspaceId/preview/`
- **THEN** 系统 SHALL 按现有 standalone preview 规则返回预览响应
- **AND** 系统 SHALL NOT 要求 `ai_page_builder_access` Cookie

#### Scenario: CMS 模式无 access cookie 访问 preview 被拒绝
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且请求 `GET /api/workspaces/:workspaceId/preview/` 没有有效 `ai_page_builder_access` Cookie
- **THEN** 系统 SHALL 返回 `401`
- **AND** 响应 SHALL 表示 `code: "builder_access_required"`

#### Scenario: CMS 模式 access session 不匹配 workspace 时拒绝 preview
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且请求的 preview `workspaceId` 与 Builder Access Session 不匹配
- **THEN** 系统 SHALL 返回 `403`
- **AND** 响应 SHALL 表示 `code: "builder_access_mismatch"`

#### Scenario: CMS 模式 access session 匹配 workspace 时允许 preview HTML
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器携带匹配 workspace 的有效 `ai_page_builder_access` Cookie 请求 preview HTML
- **THEN** 系统 SHALL 返回 workspace preview HTML
- **AND** 响应头 SHALL 包含 `Content-Security-Policy: frame-ancestors 'self'`
- **AND** 响应头 SHALL NOT 包含会阻止同源 iframe 的 `X-Frame-Options: DENY`

#### Scenario: CMS 模式 access session 匹配 workspace 时允许 preview 静态子资源
- **WHEN** `AI_PAGE_BUILDER_INTEGRATION_MODE=cms` 且浏览器携带匹配 workspace 的有效 `ai_page_builder_access` Cookie 请求 preview 下的 CSS、JS、图片或其他静态子资源
- **THEN** 系统 SHALL 返回对应 preview 静态子资源
- **AND** 系统 SHALL NOT 因普通静态资源请求缺少 `Origin` header 而拒绝

#### Scenario: CMS 模式 preview 成功响应刷新 access session
- **WHEN** CMS 模式下 workspace preview HTML 或静态子资源请求通过 Builder Access Session 校验并成功返回
- **THEN** 系统 SHALL 按统一受保护 API 规则滑动续期 Builder Access Session

### Requirement: CMS preview handoff 打开的预览必须是非编辑态预览
系统 SHALL 区分 Builder 页面编辑态 preview 与 CMS preview handoff 打开的预览，CMS preview handoff 不得启用编辑态 bridge、overlay 或 inline edit 能力。

#### Scenario: CMS preview handoff 跳转地址不携带 preview bridge 参数
- **WHEN** 浏览器消费 `target: "preview"` handoff
- **THEN** 系统 SHALL 302 跳转到 `${basePath}/api/workspaces/:workspaceId/preview/`
- **AND** 跳转地址 SHALL NOT 包含 `page-builder-bridge=1`

#### Scenario: CMS preview HTML 不注入 preview bridge
- **WHEN** CMS preview handoff 打开的 workspace preview HTML 被返回
- **THEN** 响应 HTML SHALL NOT 包含 `page-builder-preview-bridge` 脚本
- **AND** 响应 HTML SHALL NOT 启用编辑 overlay 或 inline edit 能力

#### Scenario: Builder 编辑态 preview 仍可按显式参数注入 bridge
- **WHEN** Builder 页面左侧 iframe 在已有编辑态流程中请求 `GET /api/workspaces/:workspaceId/preview/?page-builder-bridge=1`
- **THEN** 系统 SHALL 继续按现有规则判断并注入 preview bridge
- **AND** 该能力 SHALL 不由 CMS preview handoff 自动触发
