## Context

当前权限体系以全局 `agentPermissionMode` 为主，`auto` 会让 Agent SDK 直接走 `bypassPermissions`，从而跳过整个 `canUseTool` 链路。这个行为适合“全部默认放行”的场景，但不适合 page-builder：page-builder 需要自动放行文件读写、命令执行等工具调用，以减少终端用户在网页生成过程中的打断；同时又必须保留 `AskUserQuestion`，用于在需求不明确或需要确认时继续向用户发起交互式提问。

当前 `page-builder` 只在创建工作区时通过 `template: 'page-builder'` 初始化 `CLAUDE.md`，但 `AgentWorkspace` 元数据本身没有保存该类型标记。主进程在编排权限时只能看到全局设置，无法稳定识别“这个会话属于 page-builder 工作区”，因此也无法只对这类会话应用特定权限策略。

这个改动跨越共享类型、工作区持久化、权限服务、Agent 编排和测试，需要先明确工作区级策略的判定来源与优先级，再进入实现。

## Goals / Non-Goals

**Goals:**
- 为后续新建的 `page-builder` 工作区持久化稳定、显式的类型标记，供运行时直接识别。
- 让 `page-builder` 会话默认放行除 `AskUserQuestion` 外的工具调用，避免文件读写等权限横幅频繁打断网页生成。
- 保留 `AskUserQuestion` 的现有交互式问答链路，确保页面需求确认仍由产品 UI 驱动。
- 不改变普通工作区、普通会话和现有全局权限模式的默认行为。
- 保持对历史工作区数据的兼容，不要求回填或迁移旧数据。

**Non-Goals:**
- 不为历史 `page-builder` 工作区自动补写类型标记。
- 不新增新的全局权限模式，也不重构整个权限系统的数据模型。
- 不改变 `CLAUDE.md` 模板内容或 `AskUserQuestion` 的题型/UI 交互协议。
- 不把 page-builder 的特殊策略扩展到普通工作区或其他产品入口。

## Decisions

### 1. 在 `AgentWorkspace` 上持久化可选的 `template` 标记

新增工作区级可选字段，推荐直接复用创建参数语义，保存为 `template?: 'page-builder'`。这样新建 `page-builder` 工作区时可以在索引中直接持久化该标记，运行时只需读取工作区元数据即可判断是否命中 page-builder 权限策略。

选择这个方案，而不是会话级标记或运行时推断，有两个原因：
- 该行为本质上是“工作区策略”，应跟随工作区而不是单条会话，避免迁移会话、恢复会话时出现语义漂移。
- 依赖 `CLAUDE.md`、slug 或目录结构推断不够稳定，后续模板或目录命名演进时容易误判。

历史工作区不回填。旧索引记录缺少该字段时继续按普通工作区处理；旧版本程序若读取到这个额外 JSON 字段，也应当能够安全忽略。

### 2. 为 page-builder 引入工作区级“非 AskUser 自动放行”策略，而不是复用全局 `auto`

全局 `auto` 直接让 SDK 走 `bypassPermissions`，会把 `AskUserQuestion` 一并绕过，因此不能直接用于 page-builder。page-builder 应使用独立的工作区级策略：
- `AskUserQuestion` 继续通过现有 AskUser 服务下发到前端并等待用户回答。
- 其他工具调用直接返回 `allow`，包括文件读写、编辑、命令执行和其他需要权限横幅的操作。

这个策略建议在权限服务中显式建模，例如引入工作区级策略参数或派生的“effective permission behavior”，而不是把判断散落在多个调用点。这样可以继续复用现有 AskUser 和 whitelist/readonly 判断框架，同时让 page-builder 策略具备清晰入口。

选择这个方案，而不是简单在 orchestrator 里对单个工具名写大量特判，是为了把“工具是否需要拦截”保留在权限服务内部，减少编排层对工具细节的耦合。

### 3. page-builder 工作区策略优先于全局 `agentPermissionMode`

运行时需要先解析当前会话所属工作区，再决定实际权限行为：
- 若工作区 `template === 'page-builder'`，则强制使用“保留 AskUserQuestion、其余自动放行”的 page-builder 策略。
- 若不是 page-builder 工作区，则继续遵循全局 `agentPermissionMode` 的现有行为。

这意味着 page-builder 会话即使在全局设置为 `auto` 的环境下，也不能再把 SDK 配置为 `bypassPermissions`，否则 AskUser 链路会失效。对这类会话，编排层需要强制保持 `sdkPermissionMode: 'default'` 与 `allowDangerouslySkipPermissions: false`，从而保留 `canUseTool` 回调；普通工作区则维持现有映射逻辑。

这是一个有意的局部优先级覆盖。理由是 page-builder 的产品需求比全局默认授权更具体，并且只作用于明确标记的工作区，不会扩大影响面。

### 4. 测试以“策略分流”而非纯 UI 行为为核心

本次改动应重点覆盖以下测试层次：
- 工作区创建测试：验证 `template: 'page-builder'` 会被持久化到工作区索引，普通工作区不会带该字段。
- 权限/编排测试：验证 page-builder 会话在非 `AskUserQuestion` 工具上得到 `allow`，并且 `sdkPermissionMode` 仍为 `default`。
- AskUser 保真测试：验证 page-builder 会话在 `AskUserQuestion` 上仍然触发 `ask_user_request` / resolve 链路，而不是被 bypass。
- 回归测试：验证普通工作区依然遵循原有 `smart` / `supervised` / `auto` 行为。

这样可以直接验证真正的行为边界，而不是只依赖 UI 横幅是否出现。

## Risks / Trade-offs

- [全局 `auto` 与 page-builder 特殊策略存在优先级差异] → 在设计与测试中明确“page-builder 工作区策略优先”，并通过编排测试锁定 `sdkPermissionMode` 行为，避免后续回归。
- [工作区索引结构新增字段后可能出现兼容疑虑] → 使用可选字段并保持向后兼容；旧数据不要求迁移，旧代码读取额外字段时应忽略。
- [策略判断若散落在 orchestrator 与 permission service 两边，后续易失配] → 将“是否自动放行”收敛为显式的有效权限策略输入，由 orchestrator 负责解析工作区身份，由 permission service 负责执行工具级判断。
- [未来其他产品入口也可能提出类似策略需求] → 先限定为 `template === 'page-builder'` 的最小闭环，后续若扩展，再抽象成更通用的工作区策略枚举。

## Migration Plan

1. 扩展 `AgentWorkspace` 持久化结构，允许新建工作区写入可选 `template` 字段。
2. 更新 `createAgentWorkspace(..., { template: 'page-builder' })` 的写入路径，使新建 page-builder 工作区持久化该标记。
3. 在 Agent 编排阶段解析当前工作区的有效权限策略；page-builder 工作区保留 `canUseTool`，禁用 SDK bypass；普通工作区维持现有逻辑。
4. 在权限服务中加入 page-builder 的“非 AskUser 自动放行”分支，并补充针对 AskUser/普通工具/普通工作区的测试。
5. 发布后仅影响新建 page-builder 工作区；旧工作区维持原状，无需数据回填。

回滚时可以停止写入新字段并移除运行时特判。已存在的 `template` 字段可留在索引中，不会影响旧逻辑读取。

## Open Questions

- None.
