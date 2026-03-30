## Context

`page-builder` 当前已经具备三项与本次变更强相关的基础能力：

- Builder 页左预览、右对话的紧凑工作台，以及复用自 `apps/app` 的 `AgentView` 对话能力。
- “从页面中选择”带来的区块选择能力，能够把当前选中的页面区块作为下一条消息的隐藏上下文注入，而不污染可见聊天历史。
- 工作区级 `CLAUDE.md`、`mcp.json` 与 Claude Agent SDK `mcpServers` 透传链路，使 page-builder 工作区可以拥有专用的运行时规则和工具能力。

但目前仍缺少一个真正可落地的业务数据闭环：用户不能把内部 CMS 中的栏目或内容作为页面区块的数据源，也无法在对话中自然触发“去 CMS 里选”。同时，CMS 资源依赖内网鉴权，不能把原始受保护链接直接暴露给 Agent 或最终静态页面；而现有 `AskUserQuestion` 又只适合少量选项确认，不适合承载栏目树、内容搜索和媒体选择。

用户已明确当前边界：

- CMS 访问允许使用 page-builder 的统一只读服务账号代理。
- CMS OpenAPI 导出地址 `http://127.0.0.1:4523/export/openapi/2?version=3.0` 仅用于文档导出；当前实调验证的实际业务接口宿主为 `https://demo.zving.com/zcmstest`。
- 当前阶段宿主将从 `getConfigDir()/cms-settings.json` 读取 `baseUrl`、`currentSite`、`zusid` 等运行时配置；其中 `CurrentSite=277` 已确认，`ZUSID` 由开发者手工更新本地文件，不写入仓库文档或模板。
- 页面区块既可能绑定栏目，也可能绑定单条内容或内容列表。
- CMS 选择器使用方案 A：以 Builder 页内模态框覆盖层形式呈现，不采用抽屉或右侧模式切换，也不改写现有左右布局。
- 第一阶段采用 “B 的轻量版”：页面按快照生成，但要保留区块与 CMS 数据源的轻量绑定元数据，为后续“重新同步”预留基础。
- 当前已验证可直接使用的上游查询接口为栏目列表和栏目内内容列表；第一阶段内容搜索以 `catalogID + title` 为主，不依赖全局内容搜索、`keyWord` 命中率或 `contentSelectType` / `top` 等可选参数。
- 需要支持两种入口：
  - 用户手动打开 CMS 选择器；
  - 用户在对话里表达“这块改成从 CMS 选”“这里下方新增轮播图，图片从 CMS 选”等意图后，由 Agent 主动触发 CMS 选择器。

因此，这次设计的难点不是单一的 API 接入，而是要同时建立：

- 受控的 CMS 只读代理；
- 用户可浏览、可搜索、可预览的 CMS 选择器；
- Agent 可调用的交互工具与数据工具；
- 运行时隐藏上下文与轻量绑定元数据之间的边界。

## Goals / Non-Goals

**Goals:**

- 让 `page-builder` 用户可以在 Builder 中为目标区块选择 CMS 数据源，数据源覆盖栏目、子栏目集合、单条内容和内容列表四类语义。
- 让 Agent 能在用户自然语言触发 CMS 需求时，主动请求打开 CMS 选择器，而不是退化成文本追问或有限选项确认。
- 通过 Proma 主进程托管的统一只读服务账号访问 CMS，对前端、Agent 和静态预览页隐藏 CMS 真实鉴权细节。
- 对受保护图片、文件及其他媒体资源提供可控的代理预览与导入能力，使生成后的静态页面尽量引用 `workspace-files` 中的本地资源，而不是依赖受保护 CMS 原始 URL。
- 扩展 page-builder 的运行时隐藏上下文，使页面区块选择结果和 CMS 选择结果可以共同作用于当前消息，同时保持聊天历史中用户可见文本不变。
- 为页面区块与 CMS 数据源建立轻量绑定元数据，支持未来补充“重新从 CMS 同步”，但不要求本次就做完整自动同步。

**Non-Goals:**

- 不实现 CMS 写回，不让 page-builder 反向修改 CMS 中的栏目或内容。
- 不让最终静态页面在运行时强依赖 CMS 登录态或内网环境。
- 不复用 `AskUserQuestion` 作为主 CMS 浏览入口；它只保留给少量确认型交互。
- 不改变现有 page-builder 的整体双栏工作台结构，也不单独重写一套 Builder 聊天页。
- 不在本次引入复杂的数据绑定执行引擎、增量 diff 同步器或自动轮询 CMS 刷新机制。

## Decisions

### 1. 把 CMS 选择建模为“数据源选择”，而不是“条目选择”

CMS 选择结果不会统一抽象成“某条内容”，而是显式区分四类数据源：

- `channel-node`
- `channel-children`
- `content-item`
- `content-list`

这样可以覆盖用户已经明确提出的几类场景：

- 导航、页脚导航、栏目菜单：更适合 `channel-children`
- 单个栏目卡片或栏目入口：更适合 `channel-node`
- Hero、详情块、单张图片、单个媒体卡片：更适合 `content-item`
- 新闻列表、图文流、轮播、资源列表：更适合 `content-list`

绑定元数据也以“数据源”作为主语，而不是只记录一组内容 ID。每条绑定至少包含：

- 目标页面区块 selector
- 数据源类型
- 栏目 ID / 内容 ID / 内容列表条件
- 期望渲染 hint（例如 `navigation`、`news-grid`、`carousel`）
- 快照时间
- 导入到本地的资源路径映射

这样做的原因：

- 用户说的是“这块数据从 CMS 选”，不是“把第 123 条内容塞进页面”；建模成数据源更贴近产品语义。
- 后续若实现“重新同步”，使用数据源建模更容易在不重构页面协议的前提下扩展。
- 能避免 Agent 把“栏目结构”和“内容列表”混成一种弱类型结果。

备选方案：

- 统一按“内容条目列表”建模，栏目也转成伪内容。实现简单，但会让导航和栏目结构场景变得别扭，并弱化后续同步语义。
- 直接按“最终渲染 JSON”建模，不记录上游来源。短期可用，但不利于后续重新同步。

### 2. CMS 接入统一走 Proma 主进程只读代理，并先做归一化层

Proma 主进程将新增专用的 CMS 接入层，而不是让前端或 Agent 直接访问内部 CMS。建议最少拆为三层：

- `cms-client`
  - 负责使用统一只读服务账号调用 CMS API
- `cms-normalizer`
  - 把栏目、文章、图片、音频、视频、文件等不同响应归一化为前端和 Agent 共用的数据结构
- `cms-service`
  - 对外暴露 page-builder 需要的查询、详情、资源获取、导入等方法

统一代理的职责包括：

- 从 `getConfigDir()/cms-settings.json` 读取 `baseUrl`、`currentSite`、`zusid`
- 持有 CMS 凭证和基础 URL
- 统一拼装与目标站点兼容的请求头，例如 `Cookie`、`Referer`、`Accept-Language`、`User-Agent`
- 屏蔽 CMS 内部字段差异
- 统一错误处理、超时、代理与日志
- 对受保护资源提供预览代理和工作区导入

当前实调得到的最小可用配置形态为：

```json
{
  "baseUrl": "https://demo.zving.com/zcmstest",
  "currentSite": "277",
  "zusid": "<operator-updated>"
}
```

Proma 主进程在发起请求时统一组装：

```http
Cookie: CurrentSite=<currentSite>; ZUSID=<zusid>
```

这样做的原因：

- 用户已经确认可以使用统一只读服务账号，说明宿主进程代理是合理的默认边界。
- 用户已经确认当前阶段 `CurrentSite` / `ZUSID` 可先固定并由本地人工维护，因此最合适的边界是本地运行时配置文件，而不是仓库模板。
- 目标站点对请求头较敏感，直接使用默认后端 HTTP 客户端特征容易触发 403；统一由 `cms-client` 拼装浏览器兼容请求头更稳妥。
- 这样可以避免把 CMS 凭证传进 Agent runtime、工作区文件或前端页面。
- 归一化层能防止前端模态框和 Agent tool 各自理解一套 CMS 原始 schema，后期维护成本会更低。

备选方案：

- 前端直接请求 CMS。鉴权、跨域和安全边界都不合适。
- Agent 直接持有 CMS 凭证并访问 CMS。会扩大凭证暴露面，也不利于权限和审计。

### 3. Agent 能力采用“in-process MCP + custom tools”，而不是纯 prompt 或纯外部 MCP

CMS 相关能力分成两类工具：

- 交互工具
  - `RequestCmsSelection`
- 数据工具
  - `cms_list_channels`
  - `cms_get_channel_children`
  - `cms_search_contents`
  - `cms_list_channel_contents`
  - `cms_get_content_detail`
  - `cms_import_asset_to_workspace`

这组工具建议通过 Anthropic TypeScript SDK 的 `tool(...)` 与 `createSdkMcpServer(...)` 在 Proma 主进程内组装为 page-builder 专用的 in-process MCP server，再在 Agent 查询时注入到 `mcpServers`。

选择这一模式，而不是仅靠 `CLAUDE.md` 或单独起一个外部 MCP 进程，有几个原因：

- skill/`CLAUDE.md` 只能约束“什么时候要选 CMS”，不能直接触发前端模态框或导入受保护资源。
- 外部独立 MCP 进程会把鉴权、日志、错误处理和生命周期再拆散一层，而当前 CMS 能力本来就是 page-builder 的核心业务能力。
- 现有 page-builder 首轮会抑制默认 MCP；若把 CMS 只作为模板默认 `mcp.json` 的普通服务器挂载，首轮关键场景反而可能无法使用。对核心 CMS 工具，运行时注入更稳妥。

同时，`CLAUDE.md` 和 workspace skill 仍然保留，用来约束：

- 遇到“从 CMS 选择”的意图时优先调用 `RequestCmsSelection`
- 导航优先选择 `channel-children`
- 列表优先选择 `content-list`
- 对受保护资源优先导入工作区，而不是直接引用原始 URL

备选方案：

- 仅靠 prompt 让模型自己决定何时问用户。无法弹出真正的 CMS 浏览器，也不可靠。
- 仅靠 `AskUserQuestion` 做选择。现有条目数量和结构都不适合栏目树和内容搜索。

### 4. `RequestCmsSelection` 采用“等待式交互工具”，复用现有 AskUser 式的主进程等待模型

`RequestCmsSelection` 不是普通数据工具，而是一个会触发前端模态框并等待用户完成选择的交互工具。其内部工作方式应类似现有 `AskUserQuestion`：

- Agent 调用工具
- 主进程创建 pending request
- 通过 SSE / 事件流通知 Builder 前端打开 CMS 模态框
- 用户选择完成后，前端把结构化结果回传主进程
- 主进程恢复工具调用并将选择结果返回给 Agent

不同点在于，`RequestCmsSelection` 返回的是结构化 CMS 选择结果，而不是简单的索引到字符串答案映射。工具输入建议允许带上交互提示，例如：

- 当前目标区块 selector
- 当前操作类型：`replace-data` / `insert-below` / `insert-above` / `create-new-section`
- 期望数据源类型
- 允许的内容类型
- 是否允许多选
- 推荐渲染 hint

这样做的原因：

- 用户已经明确需要“在对话里说一句话后也能触发选择器”。
- 这类交互最贴近现有 Proma 的事件驱动等待模型，不需要再发明第二套会话机制。
- 结构化结果比自由文本更适合给 Agent 后续决定布局和数据映射。

备选方案：

- 让 agent 输出一段特殊 markdown，由前端解析后决定弹窗。协议脆弱，且不具备工具级确认语义。
- 让用户只能手动点“从 CMS 选择”。会丢失自然语言驱动的核心体验。

### 5. CMS 选择器作为 Builder 页的模态覆盖层存在，并同时支持手动入口和 Agent 触发入口

用户已明确选择方案 A，因此 CMS 选择器采用 Builder 页内部模态框覆盖层：

- 不替换右侧聊天区
- 不打断左右布局
- 关闭后回到原对话视图

该模态框承担：

- 栏目树浏览
- 基于已选栏目的标题搜索与分页浏览
- 基于归一化 `contentType` / `contentTypeName` 的前端类型筛选
- 结果卡片预览
- 选择模式切换（栏目 / 内容 / 单条 / 列表）
- 确认当前选择结果

打开方式有两种，但底层都走同一套选择器组件：

- 用户手动打开
- Agent 调 `RequestCmsSelection` 后自动打开

这样做的原因：

- 最符合 page-builder 现有页面密度和交互语言，不需要重构 Builder 主布局。
- 手动入口和 Agent 触发入口共享同一套 UI 与结果协议，可减少状态分叉。
- 允许用户先选区块，再自然进入 CMS 选择，而不必跳转到单独页面。

备选方案：

- 右侧聊天区切换为 CMS 模式。会明显破坏现有聊天连续性。
- 新开窗口。上下文割裂，且不方便与当前 Builder 状态协同。

### 6. 页面区块选择和 CMS 选择都只作为运行时隐藏上下文参与当前消息，不直接污染聊天历史

当前 page-builder 已经把页面区块选择作为仅对下一条消息生效的隐藏上下文发送。本次会沿用这个模式，把 CMS 选择结果也做成运行时隐藏上下文，例如：

- `<page_builder_selection> ... </page_builder_selection>`
- `<page_builder_cms_selection> ... </page_builder_cms_selection>`

这些内容只在 `composedUserMessage` 中出现，不直接写入用户可见消息正文，也不作为普通聊天文本持久化。与此同时，轻量绑定元数据会另存到工作区私有文件中，而不是写到聊天历史或导出的 `workspace-files` 里。

这样做的原因：

- 保持聊天历史可读，避免把大量结构化选择信息暴露给最终用户。
- 延续现有 page-builder 的一次性上下文注入模式，改动最小。
- 把“对当前消息的临时上下文”和“未来可重同步的持久绑定”明确分层，避免两个概念混淆。

备选方案：

- 把选择结果写回普通聊天正文。会让历史消息充满技术细节。
- 只做持久绑定，不做当前消息注入。Agent 在当前轮无法稳定获得足够上下文。

### 7. 页面生成阶段采用“快照渲染 + 本地资源优先导入”，而不是最终页面运行时依赖 CMS

第一阶段生成策略采用轻量绑定下的快照模式：

- 文本类内容直接取快照写入页面
- 图片、文件优先导入 `workspace-files/assets/`
- 音频、视频默认也走导入工作区的路径；若实际接口或体积限制导致不可行，再由 `cms-import` 层决定是否需要保留代理型预览兜底，但导出的静态页面不应依赖受保护 CMS 原始 URL
- 当上游仅返回 `upload/...` 相对资源路径时，导入链路优先通过 `https://demo.zving.com/zcmstest/preview/news/<relative-path>` 这类受控预览地址拉取资源，而不是直接拼裸 `https://demo.zving.com/upload/...` 根路径

同时，在工作区私有元数据中记录：

- 该区块来自哪个 CMS 数据源
- 本次快照时间
- 已导入资源的本地路径

这样做的原因：

- 用户当前要的是“AI 构建静态网页”，不是把静态预览页变成 CMS 内网运行时。
- 快照渲染和本地导入最符合现有 `workspace-files` 预览模型。
- 即使后续补“重新同步”，也只需要重新拉快照并覆盖本地资源，而不需要重设计预览架构。

备选方案：

- 最终页面直接引用受保护 CMS URL。预览和导出都会高度依赖 Proma 代理和内网环境。
- 第一阶段就做完整动态绑定执行引擎。复杂度明显过高。

## Risks / Trade-offs

- [Risk] CMS API 的栏目和内容字段结构可能差异较大，归一化规则容易在实现期膨胀
  → Mitigation: 先定义 page-builder 真正需要的统一字段子集，只为导航、列表、单卡片、媒体导入等首批场景做归一化。

- [Risk] 交互工具会引入一个新的“等待用户完成选择”的 pending 生命周期，若前端退出或刷新，可能留下悬空请求
  → Mitigation: 复用现有 AskUser 风格的 pending 管理模式，支持会话结束、页面卸载和请求取消时统一清理。

- [Risk] 受保护媒体资源体积可能过大，全部导入工作区会影响响应时间和磁盘占用
  → Mitigation: 第一阶段按资源类型和大小设置导入策略，并在服务端统一做大小校验与失败回退。

- [Risk] Agent 可能在信息不足时错误调用不合适的 CMS 选择模式
  → Mitigation: 在 page-builder 工作区规则中明确不同页面意图对应的数据源优先级，并让 `RequestCmsSelection` 支持 `presentationHint` 和允许类型约束。

- [Risk] 运行时注入的 in-process CMS MCP 若处理不当，可能和现有 page-builder 首轮 MCP 策略冲突
  → Mitigation: 将 CMS 能力视为 page-builder 的核心运行时能力单独注入，不依赖“工作区默认 MCP 首轮延后挂载”的路径。

- [Risk] 当前阶段 CMS 只读能力依赖人工维护的本地会话 Cookie，若 `ZUSID` 失效会导致整体 CMS 代理不可用
  → Mitigation: 将 `currentSite` / `zusid` 独立存放在 `getConfigDir()/cms-settings.json`，由开发者按需更新，不把实时凭证写入仓库；后续若需要再补登录或续期机制。

## Migration Plan

1. 在 `apps/app` 新增 CMS 运行时配置读取与接入层，统一实现本地 `cms-settings.json` 读取、只读服务账号访问、栏目/内容归一化、资源代理与工作区导入能力。
2. 新增 page-builder 专用的 CMS 交互服务和结构化事件协议，使主进程可以像 `AskUserQuestion` 一样等待前端完成选择。
3. 在 Builder 页新增 CMS 选择器模态框组件，并接入手动打开入口与 Agent 触发后的自动打开流程。
4. 通过 in-process MCP/custom tools 为 page-builder 会话注入 `RequestCmsSelection` 和若干 `cms_*` 数据工具，同时补充 page-builder 工作区规则以规范 Agent 调用时机。
5. 扩展 page-builder 的消息装饰与工作区私有绑定元数据，使当前选中的页面区块和 CMS 数据源能共同参与当前消息生成，并为未来“重新同步”保留基础。
6. 为 page-builder 新增 specs 和现有 capability delta specs，再进入实现阶段。

回滚策略：

- 若交互工具或 CMS 代理链路出现严重兼容问题，可以先关闭 `RequestCmsSelection` 和 Builder 模态框入口，使 page-builder 回退为纯自然语言建页，不影响现有聊天和预览主链路。
- 已写入的轻量绑定元数据和导入资源保持向后兼容，可由后续清理逻辑逐步处理，不需要破坏会话或工作区结构。

## Open Questions

- 当前已确认栏目列表、栏目内内容列表与 `preview/news` 资源链路可用；仍需确认是否存在稳定的专用内容详情接口，若无则第一阶段需要以列表结果与 `extendJSON` 作为详情来源。
- 当前阶段本地 `cms-settings.json` 由人工维护 `ZUSID`；若后续需要长周期稳定运行，仍需补充 Cookie 自动续期或服务账号登录机制。
- 需要在实现阶段根据真实接口能力确认音频、视频、文件资源的导入大小上限与失败回退策略。
