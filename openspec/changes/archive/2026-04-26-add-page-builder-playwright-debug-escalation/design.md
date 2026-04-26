## Context

当前 `page-builder` 的 ordinary repair、ordinary follow-up 与 selected-block follow-up 主要由 `page-builder-guided-generation` 主控，并默认基于 `workspace-files` 做静态源码分析与修复。这个流程在大多数结构性修改上足够，但遇到下列问题时容易失效：

- 样式错乱、间距异常、响应式断点错位等真实渲染问题
- 交互失效、DOM 运行时状态异常、控制台报错
- 预览结果与源码表面结构不一致，导致 Agent 连续“盲修”
- 用户已经反馈“还是不对”，但源码层面没有新的静态证据

当前运行时已经具备部分 Playwright 基础设施：

- page-builder 工作区模板默认定义了 `playwright` MCP
- Docker sidecar 场景下已经支持注入内部 Playwright MCP 地址与内部预览 origin
- 动态上下文已经能提示 Docker Playwright 不能使用 `file://`

但当前仍有三个缺口：

1. `page-builder-guided-generation` 还没有一条轻量、稳定的“静态排查失败后升级到 Playwright”的 owner 规则。
2. Agent 还没有一个对本地开发与 Docker 都统一稳定的“浏览器调试入口”抽象，容易继续猜 URL 或误用作者态文件路径。
3. 即使模型成功调用 Playwright 诊断，当前方案也还没有把“诊断完成后必须主动关闭 Playwright 页面/会话”明确成稳定约束，容易留下悬挂浏览器资源。

本次 change 的约束是保守增强：

- 不改 owner routing
- 不新增宿主关键词/正则分流
- 不把浏览器排错写成重型调试手册
- 第一阶段保持现有 page-builder MCP 挂载策略不变

## Goals / Non-Goals

**Goals:**

- 让 `page-builder-guided-generation` 在 ordinary repair、ordinary follow-up 与 selected-block follow-up 的页面问题排查场景中，能在合适时机稳定升级到 Playwright 检查真实预览。
- 让运行时上下文为 Agent 提供稳定的浏览器调试入口与环境说明，覆盖本地开发与 Docker sidecar。
- 保持提示词轻量，避免把 dev/docker 分支逻辑和工具细节复制到多个 skill 中。
- 保持“先静态分析，后浏览器验证”的默认顺序，控制成本与噪音。

**Non-Goals:**

- 不新增独立的 page-builder 调试 owner skill。
- 不把页面问题自动分流逻辑下沉为宿主关键词/正则判定器。
- 不改变 confirmed CMS apply、existing CMS guidance 或 visual worker 的 owner 关系。
- 不在第一阶段放开 page-builder 首轮默认 MCP 压缩策略。

## Decisions

### Decision 1: 由 ordinary owner 负责决定何时升级到 Playwright，而不是由宿主做文本分流

**Decision**

将“什么时候从静态分析升级到 Playwright”定义为 `page-builder-guided-generation` 的 owner 语义规则，而不是宿主基于用户文案做自动判定。

**Why**

- “静态分析是否已经不足”“这次修复是否再次被用户否定”本质上是语义判断，不适合再落回关键词/正则。
- 该判断与 ordinary repair、ordinary iteration、selected-block follow-up 的上下文强绑定，最适合由当前 owner 承担。
- 这样可以保持宿主 routing 简单稳定，避免再次引入脆弱的分流逻辑。

**Alternatives considered**

- 宿主根据“样式不对”“还是有问题”等关键词自动注入 Playwright：拒绝，过于脆弱且会误判。
- 新增独立 debugging skill：拒绝，会增加 owner 竞争面，也会让普通修复链路变重。

### Decision 2: 运行时注入一个统一的浏览器调试入口，而不是让 skill 自己理解 dev/docker URL 差异

**Decision**

运行时 prompt context 为 page-builder 注入一个统一的“优先浏览器预览地址”事实层字段；owner skill 只消费这个结果，不自行理解当前是本地开发还是 Docker sidecar。

该地址的解析顺序为：

1. Docker sidecar Playwright 已启用且内部 origin 可用时，使用内部绝对预览地址。
2. 非 Docker 场景下，优先基于当前 HTTP 请求 origin 与工作区 `entryUrl` 解析浏览器可访问的绝对预览地址。
3. 若当前没有稳定可访问的浏览器预览地址，则省略该字段，而不是让模型猜测地址。

**Why**

- 浏览器访问入口是运行时事实，不是 skill 规则。
- 将 URL 解析集中在宿主可以避免 skill 文案中反复出现 dev/docker 分支与 `file://` 边界。
- 只要字段存在，模型就可以直接用；字段不存在时，也能明确“不猜地址”。

**Alternatives considered**

- 保持当前仅有 Docker 专属 `internal preview` 注入：拒绝，本地开发场景仍会不稳定。
- 在 skill 中直接写死 `localhost:5174` 或猜测公共 URL：拒绝，不稳定且环境耦合过强。

### Decision 3: 第一阶段保持现有首轮 page-builder MCP 挂载策略不变

**Decision**

本次 change 保持当前 page-builder 首轮默认不完整挂载 Playwright MCP 的策略不变，自动浏览器排查优先覆盖 ordinary follow-up、selected-block follow-up、repair、redo-with-existing-page 与用户重复反馈的场景。

**Why**

- 这是最小改动方案，不会扩大所有首轮 create turn 的工具面。
- 用户当前提出的核心诉求是“静态分析后仍查不到”与“用户反复反馈”，这两类主场景天然发生在后续 turn。
- 先把 owner 规则与稳定预览入口做好，比立刻调整首轮 MCP 策略更保守。

**Alternatives considered**

- 直接放开 page-builder 首轮默认 Playwright：暂缓，会扩大普通创建页回合的工具竞争面和成本。

### Decision 4: Playwright 仅作为短生命周期诊断工具，排查完成后必须主动关闭

**Decision**

当 `page-builder-guided-generation` 升级到 Playwright 做真实预览诊断时，Playwright 只用于当前一次排查；在获得所需证据并完成当前修复决策后，系统 MUST 主动关闭 Playwright 页面、标签或会话，而不是让浏览器运行时悬挂到回合结束之后。

**Why**

- 这类浏览器调用是临时诊断行为，不应演变成长生命周期资源占用。
- 显式关闭可以减少后续回合中的上下文污染、残留状态与资源泄漏。
- 该规则属于 owner 的执行纪律，适合与“何时升级到 Playwright”放在同一层，而不需要上升到根级共享模板。

**Alternatives considered**

- 依赖模型自行记住关闭：拒绝，不稳定。
- 由宿主强制托管所有 Playwright 生命周期：暂缓，程序端复杂度更高，本次先用轻量行为约束收敛。

### Decision 5: 提示词保持单点轻量，不向 `CLAUDE.md` 与 visual workers 扩散

**Decision**

将“何时升级到 Playwright”只放在 `page-builder-guided-generation` 的 ordinary iteration、ordinary repair 与 selected-block follow-up 规则附近；将“该访问什么地址、有哪些运行时限制”只放在动态上下文里；不再向 `CLAUDE.md`、`taste-skill`、`redesign-skill` 复制同类规则。

**Why**

- `CLAUDE.md` 应继续只承载共享边界与路由，不应承载具体调试流程。
- visual workers 不是页面问题排查的 owner，不需要重复持有这套策略。
- 单点轻量规则更容易长期维护，也更符合前面 prompt layering 清理的方向。

**Alternatives considered**

- 在多个 skill 与模板中重复这套规则：拒绝，会重新制造提示词冲突和重复。

## Risks / Trade-offs

- [本地开发场景拿不到稳定浏览器预览地址] → 通过当前请求 origin 与 `entryUrl` 组合生成；若仍无法稳定解析，则省略该字段并禁止模型猜测 URL。
- [保持首轮 MCP 压缩会让“第一次就修已有页面”的场景不一定触发 Playwright] → 第一阶段接受该限制，优先覆盖后续 repair / repeated-feedback 主场景。
- [浏览器排查会增加 token、时延与工具成本] → 仅在静态分析不足或用户再次反馈时升级，而不是默认每次都用。
- [模型调用了 Playwright 但未主动关闭] → 在 owner skill 中把“排查完成后必须关闭 Playwright”写成明确规则，并通过测试锁定。
- [owner 语义过重导致 skill 文案膨胀] → 只增加 2 到 3 条轻量规则，不加入操作步骤清单或环境细节。

## Migration Plan

1. 在 `page-builder-guided-generation` 中加入覆盖 ordinary repair、ordinary follow-up 与 selected-block follow-up 的轻量 Playwright 升级规则与“用完必须关闭 Playwright”的执行约束。
2. 为 page-builder 运行时上下文增加统一的浏览器调试预览地址注入与说明。
3. 保留现有 Docker sidecar Playwright 解析逻辑，并补充非 Docker 场景的绝对预览地址解析。
4. 更新 prompt-builder、orchestrator 与 skill 相关测试，覆盖：
   - 静态失败后 owner 可升级浏览器排查
   - Playwright 诊断完成后 owner 会主动关闭浏览器会话
   - Docker sidecar 场景使用内部绝对预览地址
   - 本地开发场景使用浏览器可访问的绝对预览地址
   - 没有稳定地址时不鼓励模型猜测 URL
5. 本次 change 不涉及数据迁移；若回滚，只需移除新的 skill 文案与浏览器预览地址注入逻辑。

## Open Questions

- 第二阶段是否需要在“首次进入已有页面调错”场景放宽 page-builder 首轮 Playwright MCP 压缩策略，留待本次轻量方案落地后再评估。
