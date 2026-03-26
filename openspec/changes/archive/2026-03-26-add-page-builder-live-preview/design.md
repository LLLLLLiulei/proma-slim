## Context

`page-builder` 已经具备首页建项目、builder 双栏布局、右侧复用现有 `AgentView` 对话区、左侧 `PreviewPane` iframe 外壳等基础能力，但实时预览链路仍未打通。当前 builder 左侧始终传入空 `previewUrl`，因此用户即使已经通过对话生成了网页代码，也无法在构建页内看到真实结果。

现有代码中已经存在几个适合复用的基础：

- 工作区模型已经稳定，每个工作区天然拥有独立的 `workspace-files` 目录，并且后端可通过工作区上下文查询返回该目录路径。
- Agent 运行时已经会把 `workspace-files` 自动加入 `additionalDirectories`，因此 Agent 在当前工作区下具备读写该目录的天然上下文。
- `apps/page-builder` 已经完成最小路由、builder 壳、预览面板工具条、工作区级项目标题与嵌入式 `AgentView` 的集成。
- 当前前端通过 `/api/*` 访问 Bun 后端，`page-builder` 开发态已通过 Vite 代理复用这一约定。

当前缺失的不是新的聊天系统，而是“如何把 `workspace-files` 变成可访问的静态网页预览，并把变化反馈到 builder 左侧”的产品级闭环。与此同时，本次需求已经明确将“实时预览”限定为：`workspace-files` 一变化后自动刷新静态网页，而不是启动 React/Vite dev server、HMR 或更重的工程级预览。

## Goals / Non-Goals

**Goals:**

- 让 `workspace-files` 成为 `page-builder` 预览结果的唯一工作区级产物目录。
- 为工作区提供可访问的静态预览路由和轻量预览状态查询接口。
- 让 builder 左侧预览面板加载真实网页，并在 `workspace-files` 变化后自动刷新。
- 继续直接复用现有 `AgentView`、工作区 API 和 Bun HTTP 服务，只做最小扩展。
- 为 page-builder 创建的工作区根目录初始化稳定的 `CLAUDE.md` 约束，使 Agent 将可预览页面写入 `workspace-files/index.html` 及关联静态资源目录。

**Non-Goals:**

- 不引入新的独立预览运行时、端口分配器或工程级 dev server 管理。
- 不在这一阶段支持 React/Vite/Next 等框架项目的 HMR 预览。
- 不让预览直接读取 session cwd、附加目录或任意外部目录中的网页文件。
- 不新增一条独立于现有发送链路的 page-builder 专属聊天实现。
- 不在本次变更中实现发布、导出或多环境部署能力。

## Decisions

### 1. 预览源统一绑定到工作区级 `workspace-files`

builder 左侧的真实预览结果统一来自当前工作区的 `workspace-files` 目录，默认入口约定为 `workspace-files/index.html`，相关静态资源建议放在 `workspace-files/assets/*`。session 工作目录继续作为 Agent 的执行 cwd 使用，但不作为预览结果来源。

**Rationale**

- 项目实体是工作区，预览结果也应归属于工作区，而不是某个会话的临时 cwd。
- 现有 Agent 运行时已经把 `workspace-files` 自动加入可访问目录，天然适合承接生成结果。
- 统一落点可以避免同一项目内多个 session 产生分散、互相覆盖或难以恢复的预览文件。

**Alternatives considered**

- 直接从 session cwd 读取 `index.html`：实现表面上更近，但会让预览与具体会话耦合，项目级语义错误。
- 允许从任意附加目录中选择预览入口：灵活但复杂度高，不符合当前“AI 生成网页”的单一主路径。

### 2. 通过工作区 HTTP 路由提供预览文件访问和预览状态查询

后端在现有工作区路由下新增两类能力：

- `GET /api/workspaces/:workspaceId/preview-state`
  返回轻量预览状态，例如：
  - `hasPreview`: 当前是否存在可访问的 `index.html`
  - `revision`: 当前 `workspace-files` 目录快照版本
  - `entryUrl`: builder 应加载的入口 URL
- `GET /api/workspaces/:workspaceId/preview/*`
  将 `workspace-files` 作为静态网站根目录提供访问；`/preview` 或 `/preview/` 返回 `index.html`，资源路径按相对目录解析。

该能力放在工作区 HTTP 路由下，而不是扩展当前前端产物静态服务逻辑。`static-handler.ts` 仍只负责生产模式下的应用前端资源，工作区预览由独立 helper 处理路径归一化、入口回退和响应头。

**Rationale**

- `/api/workspaces/...` 已经是现有前后端共享的工作区资源命名空间，预览属于工作区资源的一部分。
- `page-builder` 的 Vite 配置已经代理 `/api` 到 Bun 后端，沿用同一路径前缀可避免开发态额外跨域或端口协商。
- 将预览访问与预览状态拆开，可以让 builder 在“不重新加载 iframe”的前提下先获知版本变化，再按需刷新。

**Alternatives considered**

- 把预览路由挂到新的顶级前缀，例如 `/preview/:workspaceId/*`：也能工作，但会打散现有工作区资源域。
- 复用 `static-handler.ts` 直接处理 `workspace-files`：会把“前端应用静态资源”和“工作区预览内容”混在同一个语义层，边界不清晰。

### 3. 预览自动刷新采用 `preview-state` 轮询，而不是新建 watcher / SSE 基础设施

第一阶段的自动刷新采用前端轮询 `preview-state` 的方式实现，不新增工作区级文件 watcher，也不扩展新的预览 SSE 流。builder 挂载后持续轮询当前工作区的预览状态，并在 `revision` 变化时刷新 iframe。

建议采用可见态更积极、隐藏态更保守的节奏：

- 页面可见时：约 `1000ms`
- 页面隐藏时：退避到更长周期，或暂停轮询

后端的 `revision` 不依赖常驻 watcher，而是在每次 `preview-state` 请求时根据 `workspace-files` 当前目录快照计算，例如基于相对路径、文件大小和 `mtimeMs` 生成稳定字符串。

**Rationale**

- 当前已有的 SSE 生命周期绑定在 `POST /api/sessions/:id/send` 上，请求完成后流会关闭，不适合承载工作区级持续订阅。
- 不引入 watcher 可以避免额外的资源管理、清理、边缘状态同步和开发/生产不一致问题。
- `workspace-files` 在本产品场景下通常较小，轻量扫描并生成 revision 的成本可接受。

**Alternatives considered**

- 基于 `fs.watch` 或 `chokidar` 的工作区文件监听：响应更即时，但会显著扩大后端状态管理与测试面。
- 复用当前会话 SSE 推送 `workspace-files-changed`：当前 SSE 生命周期不匹配，且会让 preview 依赖“必须有活跃发送流”这一错误前提。

### 4. Builder 侧通过 revision cache-busting 刷新 iframe，而不是仅依赖 React 重挂载

`PreviewPane` 的真实预览 URL 由 `entryUrl` 和 `revision` 共同决定。builder 侧在 revision 变化后应更新 iframe `src`，例如将其解析为 `entryUrl?v=<revision>`，同时仍保留当前的手动刷新按钮用于强制重载。

当 `hasPreview` 为 `false` 时，预览面板回退为占位空状态；当状态从有预览变为无预览时，应清空当前 `previewUrl`，避免保留一份已经失效的旧页面。

**Rationale**

- 只依赖 React `key` 重新挂载不能完全规避浏览器和代理层的缓存。
- revision query param 能让每次内容变化都对应新的资源 URL，更符合静态资源刷新语义。
- 当前预览工具条已经具备刷新 / 全屏 / 新窗口打开结构，只需把 URL 解析接上。

**Alternatives considered**

- 仅递增 iframe `key`：实现简单，但缓存行为不可控。
- 每次 revision 变化都先清空 iframe 再重建：闪烁更重，体验较差。

### 5. 预览 iframe 默认启用受限 `sandbox`，而不是让生成页面与宿主 UI 完全同源运行

尽管开发态下 `page-builder` 通过 `/api` 代理获取预览内容，浏览器看来仍是同源路径，但 preview iframe 不应默认拥有访问宿主页面的能力。预览容器应启用受限 `sandbox`，允许静态页面脚本执行和基础表单行为，但不默认授予 `allow-same-origin`。

“在新窗口打开”操作继续通过预览工具条在顶层完成，不依赖 iframe 内部自行打开新窗口。

**Rationale**

- 预览内容由 AI 生成，本质上属于不受信任页面。
- 如果让生成页面与宿主 UI 共享完整同源能力，风险高于当前阶段需要。
- sandbox 可以在不新增独立预览域名或端口的前提下提供基础隔离。

**Alternatives considered**

- 完全不加 sandbox：实现最省事，但安全边界过弱。
- 额外启一个独立 origin 专供预览：隔离更强，但会引入更多运行时复杂度和环境协调成本。

### 6. page-builder 通过工作区根目录 `CLAUDE.md` 持久化网页构建约束

page-builder 右侧继续直接复用现有 `AgentView`，但不再改写每次发送的用户消息正文。相反，page-builder 在创建工作区时，于该工作区根目录初始化一份 `CLAUDE.md`，让 Claude Code SDK 通过当前已启用的 `settingSources: ['project']` 自动加载这份项目级指令。该 `CLAUDE.md` 至少应包含以下语义：

- 预览结果必须写入当前工作区的 `workspace-files`
- 页面入口应为 `workspace-files/index.html`
- 静态资源应写入相对目录，例如 `workspace-files/assets/*`
- 修改页面时优先在现有预览文件基础上增量更新，而不是把结果散落到 session cwd

这份 `CLAUDE.md` 只在 page-builder 新创建的工作区初始化一次，不回写历史工作区，也不要求 builder 页面在发送时额外拼接隐藏 prompt。这样既保留了现有聊天 UI 的复用，又避免把产品特定约束伪装成用户真实输入。

**Rationale**

- 用户已经明确要求构建页聊天区直接复用现有聊天页面和列表，不能为此 fork 一套对话层。
- `CLAUDE.md` 是 Claude Code / Agent SDK 原生支持的项目级持久指令载体，更适合承载工作区级网页生成约束。
- 将规则写入工作区根目录后，同一工作区下的新会话也能自然继承这些约束，而不需要每次发送重复注入隐藏消息。

**Alternatives considered**

- 在后端 Agent 编排层写死 page-builder 特殊提示：会把前端产品语义下沉到通用运行时层。
- 在发送链路中继续拼接隐藏 prompt：实现快，但会污染用户消息语义，也不利于工作区级长期约束沉淀。

## Risks / Trade-offs

- [轮询 `preview-state` 带来额外请求开销] → 通过轻量状态响应、页面可见性退避和较低轮询频率控制成本。
- [目录快照 revision 计算可能在大目录下增加扫描成本] → 将 `workspace-files` 继续定位为轻量静态网页产物目录，而不是通用项目根目录；必要时后续再引入 watcher 优化。
- [AI 仍可能把产物写错位置] → 通过 page-builder 工作区根目录 `CLAUDE.md` 提供稳定的项目级约束，并在设计上将 preview 只绑定 `workspace-files`，让错误尽快显性暴露。
- [同源 iframe 预览存在脚本隔离风险] → 默认启用受限 `sandbox`，不直接给出完整同源权限。
- [预览入口被删除后用户看到空白或旧缓存] → `preview-state` 明确返回 `hasPreview`，前端在无入口时回退空状态，同时对真实预览 URL 追加 revision query param。

## Migration Plan

本次变更不涉及持久化数据结构迁移，主要是增量扩展现有 HTTP 路由、page-builder builder 状态和发送链路。

1. 在工作区 HTTP 路由下新增 preview-state 与 preview 静态访问能力，并补充对应测试。
2. 在 `apps/page-builder` builder 页增加预览状态查询与轮询逻辑，将真实 `previewUrl` 传给 `PreviewPane`。
3. 为 page-builder 创建流程增加工作区根目录 `CLAUDE.md` 初始化能力，并移除 builder 侧对用户消息正文的隐藏改写。
4. 完成联调，验证工作区预览创建、增量修改、删除入口后的回退状态，以及现有 `apps/app` 行为未受影响。

回滚时可直接移除 preview 相关路由、page-builder 的预览状态逻辑和 page-builder 工作区 `CLAUDE.md` 初始化逻辑；由于未修改现有存储格式，回滚成本较低。

## Open Questions

- 当前没有阻塞实现的开放问题。
- 后续若要支持 SPA 路由回退、多页面项目或 framework dev server 预览，应在下一次变更中单独设计，不在本次设计内扩展。
