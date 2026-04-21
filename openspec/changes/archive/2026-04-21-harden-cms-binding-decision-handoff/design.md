## Context

当前 confirmed CMS binding 链路已经有两层职责分离：

- `cms-binding-apply` 负责 Phase 1A 决策、HTML-first authoring 边界、source-atomic 约束与 apply ready checklist。
- `mcp__cms__apply_cms_binding` 负责正式写入、contract preflight、HTML mutation pipeline、manifest/validation/preview state。

问题不在于这两层职责冲突，而在于它们之间仍然缺少机器可判定的硬中间态。当前 runtime 会同时把 skill 与 CMS MCP tools 暴露给模型，但不会强制“先 skill，再 decision，再 apply”，因此模型仍可能：

- 只停留在 skill 的自然语言 `ready` 结论，不继续正式写入
- 在没有稳定决策状态的前提下裸调 `mcp__cms__apply_cms_binding`
- 绕开受控链路，直接编辑 `workspace-files/index.html` 或引入整页 Vue runtime

同时，当前 confirmed apply 收紧后又暴露出两类新问题：

- confirmed handoff prompt 已经内联了足够多的 downstream 指令，模型可以在没有显式启动 `cms-binding-apply` 的情况下直接进入 decision/apply tool 链
- 首次绑定成功后，普通 follow-up 消息会重新回到 `page-builder-guided-generation`，虽然带有 `cms-island` 的 source-atomic 选择语义，但仍缺少“改样式”与“改数据源/改 query props”之间的宿主分流
- persisted apply plan 当前只绑定 target/source identity，不表达“外层壳子是否保留、major container 归谁所有”等结构约束，因此模型在 block target 上很容易既保留旧壳层，又在 slot 里再生成一层主布局容器

这次变更的约束已经明确：

- 保留 skill layer 与 tool layer
- 在两层之间引入硬中间态：`decisionId` / apply plan
- 正式 `apply_cms_binding` 无 decision 不写入
- CMS browser confirm 后必须由宿主自动发起 handoff，不依赖用户再补一句话
- confirmed handoff 进入 `cms-binding-apply` 不能只靠 prompt 层软提示
- 已绑定 `cms-island` 的普通 follow-up 需要区分“样式/slot 迭代”和“数据源/绑定重入”

## Goals / Non-Goals

**Goals:**

- 让宿主而不是模型自己决定 confirmed CMS handoff 何时进入 `cms-binding-apply`
- 为 confirmed CMS apply 引入机器可消费的 decision/apply-plan 中间层
- 让 `cms-binding-apply` 的 `ready` 路径必须先物化为 decision，再进入正式 apply
- 让 `mcp__cms__apply_cms_binding` 对缺失、失效、冲突或目标失配的 decision fail closed
- 让选中 `cms-island` 的 follow-up 请求能够根据意图分流为普通样式迭代或受控 CMS 重绑
- 让 apply plan 带上结构 guardrails，使正式 apply 能拒绝与当前壳层冲突的模板形状
- 保持 HTML-first CMS islands authoring，不让模型把 confirmed CMS apply 退化为整页 Vue 方案
- 维持 ordinary page-builder flow 与 confirmed CMS apply flow 的职责边界

**Non-Goals:**

- 移除 `cms-binding-apply` 或 `mcp__cms__apply_cms_binding`
- 改写现有 CMS selection contract、targetSelection contract 或 apply mutation pipeline 的核心能力边界
- 让宿主在 CMS browser confirm 后完全替代模型做全部区块语义判断与模板 authoring
- 放宽 ordinary page-builder flow 对新建/重绑 `cms-*` 的限制

## Decisions

### 1. 新增宿主管理的 `mcp__cms__decide_cms_binding` 工具作为硬中间态入口

confirmed CMS apply 不再把 skill 的自然语言输出当作正式写入前置条件，而是新增一个宿主管理的 decision tool，把模型在 `cms-binding-apply` 语境中的结论转换为结构化结果。

该工具属于现有 CMS runtime MCP server 的 tool layer，而不是新的 prompt layer。推荐命名：

- tool id: `decide_cms_binding`
- public name: `mcp__cms__decide_cms_binding`

它的职责是：

- 接收 confirmed CMS handoff 的结构化上下文
- 接收模型在 skill 语境下得出的候选决策结论
- 验证该结论是否与当前 selection / target / authoring contract / target snapshot 一致
- 在 `ready` 时持久化完整 apply plan，并返回 `decisionId` 与机器可读的 decision summary
- 在 `needs-clarification` 或 `incompatible` 时返回结构化结果，但不创建可执行 decision

之所以新增 decision tool，而不是解析 assistant 文本中的 JSON，是因为 skill 不是 runtime API。把自由文本解析成硬状态既脆弱，也无法可靠做 replay/staleness 校验。

**Alternatives considered**

- 解析 `cms-binding-apply` 的自然语言或 JSON 文本输出
  - 放弃，原因是输出形状不稳定，无法可靠绑定 workspace revision、target snapshot 与一次性 decision 生命周期
- 让宿主在 CMS browser confirm 后直接预先生成完整 apply plan
  - 放弃，原因是这会过度削弱 skill 的价值，无法让模型结合当前壳子、target snapshot 与 authoring boundary 做保守判断

### 2. `ready` 决策必须生成与当前目标绑定的 decision record

`mcp__cms__decide_cms_binding` 在 `ready` 时生成的 decision record 必须同时绑定：

- `workspaceId`
- `sessionId`
- `targetSelection`
- `selection`
- `authoringContext`
- `targetSnapshot`
- 当前 workspace HTML revision / snapshot digest
- 归一化后的 `toolKind` 与 source props

`decisionId` 应该是该 record 的唯一句柄，而完整 apply plan 存储在宿主侧。模型只拿到 `decisionId` 与机器可读摘要，不直接拥有“脱离宿主上下文即可重放”的完整写入 authority。

这样做的原因是：

- 允许 apply tool 在正式写入前重新校验目标是否仍然是同一个 source target
- 防止同一个 ready 决策被复用到后续已变化的页面
- 避免模型绕过宿主 decision store，手工拼装 apply 输入重放旧 decision

**Alternatives considered**

- 只返回完整 apply plan，不保留 decisionId
  - 放弃，原因是无法强约束 replay、staleness 与一次性消费语义
- 使用 session-global “最近一次 ready 决策” 的隐式状态
  - 放弃，原因是多个 CMS handoff 并发或页面变化后容易串目标

### 3. `mcp__cms__apply_cms_binding` 改为只消费 `decisionId` + templates

正式 apply tool 继续负责：

- template contract preflight
- 生成 `cms-catalog` / `cms-content`
- HTML mutation pipeline
- manifest / validation / preview state

但它不再接受“裸的 confirmed selection + target + source”作为充分写入 authority。正式写入输入改为：

- `decisionId`
- `templateBody`
- `emptyTemplate?`
- `errorTemplate?`

工具执行时：

1. 根据 `decisionId` 取回宿主持久化的 apply plan
2. 重新校验 workspace revision / target snapshot / targetSelection identity
3. 只有在 decision 与当前作者态仍然一致时才继续 apply
4. 成功或失败后按策略消费/失效该 decision

这样既保留了现有 apply tool 的强校验，也把“无 decision 不写入”落到 runtime 层，而不只是 prompt 层建议。

**Alternatives considered**

- 保留旧 apply 输入，同时把 `decisionId` 设为可选
  - 放弃，原因是这无法真正封闭无状态裸调 apply 的路径
- 让 apply tool 既接受 `decisionId` 也接受完整 apply plan
  - 默认不采用，原因是完整 plan 直传仍可能削弱宿主持久化与 replay 防护；如后续测试需要，可单独评估受限的内部调用模式

### 4. confirmed CMS browser handoff 必须进入“skill -> decision tool -> apply tool”的链路

CMS browser confirm 后，宿主仍然通过 programmatic send 复用当前 Builder 会话，但其目标不再是“让模型自己记得接着 apply”，而是明确进入 decision-backed flow：

- programmatic send 携带结构化 handoff payload
- 显式注入 `mentionedSkills: ['cms-binding-apply']`
- 显式注入 `mentionedMcpServers: ['cms']`
- hidden payload / prompt guidance 明确：先基于 skill 做决策，再调用 `mcp__cms__decide_cms_binding`，只有 decision ready 后才能调用 `mcp__cms__apply_cms_binding`

宿主不应等待用户再补一句自然语言触发 apply，也不应把 `ready` 的普通 assistant 文本视为正式写入信号。

### 5. `cms-binding-apply` 的 `ready` 语义改为“可以创建 decision 并继续正式 apply”

skill 仍然保留 `ready / needs-clarification / incompatible` 三态，但 `ready` 的含义要更收紧：

- 不是“模型可以直接写文件”
- 也不是“模型可以裸调 apply tool”
- 而是“当前输入已经足够调用 `mcp__cms__decide_cms_binding` 物化 decision；若该 decision tool 返回 ready，可继续正式 apply”

相应地：

- `needs-clarification` 与 `incompatible` 不应产生可执行 `decisionId`
- skill 需要在主文案与 references 中明确禁止直接编辑 workspace 文件来替代 decision/apply chain

### 6. runtime CMS MCP tool surface 增量暴露 decision tool，但不改变 ordinary flow 的边界

现有 runtime CMS MCP bundle 已提供：

- `mcp__cms__list_catalogs`
- `mcp__cms__list_contents`
- `mcp__cms__apply_cms_binding`

本次新增：

- `mcp__cms__decide_cms_binding`

这不会改变 ordinary page-builder flow 的边界。ordinary flow 仍不能凭空新建或重绑 `cms-*`；只有 confirmed CMS selection flow 才能进入 skill -> decision tool -> apply tool 的受控链路。

### 7. confirmed CMS handoff 必须由宿主硬启动 `cms-binding-apply`，而不是只依赖 `mentionedSkills`

当前 `mentionedSkills: ['cms-binding-apply']` 只是一层 prompt-level 提示，不足以保证模型真的先进入 skill 层。对于 CMS browser confirm 产生的 programmatic handoff，系统必须把 `cms-binding-apply` 视为宿主编排阶段的一部分，而不是让模型自己决定是否先发一个可观察的 `Skill` tool。

设计上允许保留：

- `mentionedSkills` 用于 prompt 清晰度与可观察性
- 模型在运行时显式再发一次 `Skill` tool 用于审计

但 correctness 不能依赖这一步是否发生。宿主必须提供等价的 hard bootstrap 语义，使 confirmed handoff 在进入自由推理前就已经处于 `cms-binding-apply` 的控制边界内。

**Alternatives considered**

- 继续只依赖 `<mentioned_tools>` 文本提示
  - 放弃，原因是这只是一层软提示，已经被实际 transcript 证明会被跳过
- 彻底移除 skill 层，把所有指令都内联进 auto handoff prompt
  - 放弃，原因是这会让 `cms-binding-apply` 名存实亡，也弱化技能文档对 decision boundary 的长期维护价值

### 8. 已绑定 `cms-island` 的 follow-up 请求必须按“样式迭代”与“绑定重入”分流

首次绑定完成后，用户对同一 `cms-island` 的后续消息不应一律继续走普通迭代，也不应一律重新进入 CMS browser。宿主应先做保守分流：

- 若请求只涉及布局、视觉、slot 内结构、图片比例、文案层级等样式/模板问题，则继续走 ordinary `page-builder-guided-generation`，同时保留 `source-atomic` / `replace-whole-source-component` 语义
- 若请求涉及更换栏目、重新选择 CMS 内容、改变 `site-id` / `catalog-id` / `ids` / `page-size` / `take` 等 binding identity，则宿主必须把它重新路由回 CMS browser confirm 与 decision/apply chain
- 若请求语义不够明确，则先发一个短澄清，而不是让 ordinary flow 静默改动 query props

**Alternatives considered**

- 把所有 `cms-island` follow-up 都送回 `cms-binding-apply`
  - 放弃，原因是纯样式微调会过度重量化，破坏 ordinary iteration 体验
- 把所有 `cms-island` follow-up 都继续留在 ordinary flow
  - 放弃，原因是这会继续依赖模型自觉识别“这是重绑而不是样式调整”

### 9. persisted apply plan 必须表达结构 guardrails，而不只是 target/source identity

decision/apply-plan 层当前已经能表达：

- targetSelection identity
- confirmed selection
- component / toolKind
- normalized source props
- revision / snapshot binding

但这还不足以稳定 authoring。对于 block target，系统还需要把“当前壳层是否保留、major container 归谁所有”固化进 apply plan，供正式 apply 做结构校验。推荐的 guardrail 信息包括但不限于：

- `shellMode`
  - 例如 `preserve-target-shell`
  - 例如 `replace-existing-cms-island`
- `majorContainerOwner`
  - 例如 `shell`
  - 例如 `slot`
- 与 `targetSnapshot` 对应的结构事实
  - 当前 block 是否已经承担 grid/list/nav 主布局职责
  - 当前目标是否本来就是 `cms-island` source-atomic replacement

正式 `mcp__cms__apply_cms_binding` 应根据这些 guardrails fail closed：

- 若 plan 表示外层 shell 已承担 major container，则 `templateBody` 不得再生成一个竞争性的主 grid/list/nav 容器
- 若 plan 表示 slot 拥有完整动态区域，则 `templateBody` 必须承载该完整区域
- 当模板与计划冲突时，工具必须返回可恢复、可重试的稳定错误，而不是继续落盘一个“语法合法但结构打架”的模板

**Alternatives considered**

- 继续只靠 prompt 告诉模型“尽量保留现有壳层”
  - 放弃，原因是这无法在 runtime 层稳定阻止双层 major container
- 让 apply tool 每次临时从 HTML 现推断结构策略，而不把它固化进 apply plan
  - 放弃，原因是这样 decision/apply 之间的契约仍然不完整，也不利于稳定报错与测试

## Risks / Trade-offs

- [更严格的 fail-closed 会增加早期失败率] → 通过结构化错误、明确 stale/mismatch diagnostics 和自动重试路径降低用户困惑
- [decision record 可能因页面快速变化而频繁失效] → 将 decision 绑定到 revision/snapshot digest，并在失效时要求重新走 decision，而不是默默套用旧状态
- [新增 decision tool 让调用链更长] → 保持 decision tool 只负责状态物化与一致性校验，不把 HTML mutation 或模板预检再重复实现一遍
- [当前生产代码中 programmatic handoff 接入可能尚未完全打通] → 以宿主单一 owner 的 handoff service 落地，并用 renderer/main integration tests 覆盖 CMS confirm -> auto send -> decision -> apply 全链路
- [宿主硬 bootstrap 可能让 prompt 里出现“既预加载 skill 又显式 mention skill”的重复感] → 允许保留 mention 用于透明度，但以单一宿主 bootstrap 路径作为唯一 correctness 入口
- [follow-up 请求的重绑分流存在误判风险] → 先从显式 query-prop / source-change 触发词和已有 `cms-island` 目标语义做保守分类，边界模糊时退回一次短澄清
- [结构 guardrails 会让 apply tool 报更多“不写入”的错误] → 以稳定、可恢复的错误文案指导模型改为兼容模板，而不是允许落盘后再让用户看到错乱布局

## Migration Plan

1. 先新增 decision contract、decision store 与 `mcp__cms__decide_cms_binding`
2. 更新 `cms-binding-apply` 与 auto handoff 文案/contract，让 ready 路径改为 decision-backed flow
3. 改造 `mcp__cms__apply_cms_binding` 为 `decisionId` gating，并补 stale/mismatch fail-closed 校验
4. 补齐 CMS browser confirm 的 production handoff integration 与端到端测试
5. 清理旧的“无 decision 也可 apply”调用路径与测试夹具
6. 将 confirmed CMS browser handoff 从 prompt-only mentioned skill 升级为宿主硬 bootstrap，并保留显式 skill mention 作为观察性信号
7. 为选中 `cms-island` 的 ordinary follow-up 增加“样式迭代 vs 绑定重入”分流
8. 把 shell/major-container ownership 结构 guardrails 纳入 apply plan，并为 apply tool 增加对应 fail-closed 校验与稳定报错

## Open Questions

- 当前 proposal 已经锁定“无 decision 不写入”的目标，因此本次 design 不再保留开放式架构分叉；剩余问题应在实现阶段转化为具体接口与测试细节，而不是回退到软编排方案
