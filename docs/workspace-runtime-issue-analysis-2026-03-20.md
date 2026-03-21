# Proma Workspace Runtime 问题分析与修复建议

生成时间：2026-03-20

更新说明：2026-03-21

- 本文档最初用于分析修复前的运行时断点，其中部分问题已经在后续 change 中修复。
- 截至当前代码状态：
  - Skill 命名契约、workspace plugin manifest、动态 workspace prompt 已收口。
  - scratch workspace 下的 subagent `worktree` / 非法 `team_name` 误用已通过 guardrail 修复。
  - Agent Teams inbox / auto-resume 结果回收链路已恢复。
  - Memory 策略已明确为 workspace-local `memory/MEMORY.md`，不再以“恢复原版 MCP memory”为目标。
- 因此，本文第 3 节更适合作为“历史问题与根因分析”；当前未解决问题应以最新实现与验证结果为准。

## 1. 文档目的

本文档用于系统整理以下三类信息：

- 当前 Web 简化版在工作区、Skills、Memory、Subagent 相关链路上出现截图中问题的根因
- 原版 Electron 工程在这些能力上的真实实现方式
- 当前仓库更合适的修复方向与实施顺序

本文档聚焦两个仓库：

- 原版 Electron 工程：
  - `/Users/liu/Documents/work/learning/ai-page-builder/Proma`
- 当前简化版 Web 工程：
  - `/Users/liu/Documents/work/learning/Proma`

这里描述的是“代码和运行日志能够证明的事实”，不是对历史版本的推测。

## 2. 核心结论

当前问题不是单点 bug，而是一次架构迁移后的“运行时契约漂移”：

- 原版 Electron 的工作区能力依赖一整套配套机制共同工作：
  - workspace plugin manifest
  - namespaced skill 调用规则
  - 动态 workspace prompt
  - MCP memory 注入
  - Agent Teams 结果回收和 auto-resume
- 当前 Web 简化版保留了部分入口：
  - 默认 skills 拷贝
  - workspace/session 目录结构
  - plugin path 注入
  - SDK project 配置隔离
  - Tasks/Agent Teams 环境变量
- 但删掉或弱化了部分配套：
  - 原版的强约束 prompt
  - 原版的 memory MCP 逻辑
  - 原版对 workspace state 的完整动态说明
  - 原版 Agent Teams 的 auto-resume 收口逻辑

结果就是：旧入口还在，旧契约却不完整，新的 Web 运行时又有自己的默认行为，最终形成多条能力链互相打架。

一句话概括：

> 原版不是“把 skills 放到目录里”这么简单，而是“workspace plugin + prompt 规则 + memory MCP + SDK team/task 结果回收”一起工作的。当前简化版最初删掉了一半配套，却保留了另一半入口，所以截图中的问题会成串出现。当前代码已经修复了其中的 Skill / 路径 / scratch subagent 契约，memory 则改为新的本地文件策略。

### 2.1 当前状态摘要

截至当前仓库代码状态，可以将本文分析的问题分为三类：

- 已修复：
  - Skill 调用命名空间漂移
  - workspace plugin manifest 初始化缺失
  - workspace 拓扑提示不足
  - scratch workspace 下的 `worktree` / 非法 `team_name` 子代理误用
  - Agent Teams inbox / auto-resume 结果回收缺失
- 已明确收口为新策略：
  - Memory 不恢复原版 MCP，而是使用 workspace-local `memory/MEMORY.md`
- 仍属独立问题：
  - Claude 上游 `WebFetch` 域名安全校验失败

## 3. 截图问题与根因对照

### 3.1 Skill 调用失败

现象：

- 运行日志中先调用了 `proma-workspace-default:skill-creator`
- 随后报错 `Unknown skill: proma-workspace-default:skill-creator`
- 再次调用 `default:skill-creator` 后成功

证据：

- 当前仓库仍在注入旧命名空间格式：
  - `apps/electron/src/main/lib/agent-orchestrator.ts`
  - 代码会把 mentioned skill 拼成 `proma-workspace-${workspaceSlug}:${slug}`
- 当前测试也仍然固化了这个假设：
  - `apps/electron/src/main/lib/agent-orchestrator.workspace.test.ts`
- 当前真实会话日志中，`proma-workspace-default:skill-creator` 失败，而 `default:skill-creator` 成功：
  - `~/.proma/agent-sessions/fab64de5-84fe-4814-90b3-9c5c6d27a896.jsonl`
  - `~/.proma/sdk-config/projects/-Users-liu--proma-agent-workspaces-default-fab64de5-84fe-4814-90b3-9c5c6d27a896/717dbc37-4907-4829-8ae0-3f6416d07ed1.jsonl`

根因：

- 当前代码仍然延续原版 Electron 的“旧 skill namespace 假设”
- 但当前 Web 运行时里，Claude SDK 实际接受的 skill 名称已经不再与这个旧前缀一致
- 当前 `workspace-service.ts` 也不再像原版那样把 `.claude-plugin/plugin.json` 作为显式契约的一部分来初始化 clean environment

需要注意的一点：

- 用户当前本地 `~/.proma/agent-workspaces/default/.claude-plugin/plugin.json` 实际已经存在
- 这说明问题不能简单归结为“本地没有 plugin.json”
- 更准确的判断是：
  - 当前运行时对 skill 命名空间的真实解析规则，已经和当前代码注入的旧前缀不一致
  - 同时当前仓库代码也没有把 plugin manifest 的创建和 skill 命名规则收敛为一个统一契约

### 3.2 `MEMORY.md` 路径混乱

现象：

- 模型尝试读取 `sdk-config/projects/.../memory/MEMORY.md`
- 用户也观察到会读取工作区下的 `memory/MEMORY.md`

证据：

- 当前 Claude SDK 仍然以 project setting source 运行：
  - `apps/electron/src/main/lib/adapters/claude-agent-adapter.ts`
  - `settingSources: ['project']`
- 当前 Proma 仍然为 SDK 设置独立配置目录：
  - `apps/electron/src/main/lib/agent-orchestrator.ts`
  - `CLAUDE_CONFIG_DIR: getSdkConfigDir()`
- 当前 Web 简化版中已经没有原版 Electron 的：
  - `memory-service.ts`
  - `injectMemoryTools(...)`
  - `mcp__mem__recall_memory / mcp__mem__add_memory` 提示词约束

根因：

- 修复前的当前工程没有自己的“Proma memory 契约”
- 但 Claude SDK 自己仍然有 project-level memory / project context 行为
- 因此模型会尝试从 SDK 视角下的 project memory 路径读取 `MEMORY.md`
- 这些路径有时落在 `sdk-config/projects/.../memory/MEMORY.md`，有时落在实际 workspace/project 目录，取决于 SDK 对 project 边界的识别方式

结论：

- 这类 `sdk-config/projects/.../memory/MEMORY.md` 行为，不是原版 Proma memory 机制
- 而是 Claude SDK 的 project memory / project context 行为
- 当前仓库已经不再沿用“是否恢复原版 MCP memory”这个目标，而是明确采用 workspace-local `memory/MEMORY.md`
- 当前正式策略是：
  - 由 Proma 为每个 workspace 显式创建 `~/.proma/agent-workspaces/{slug}/memory/MEMORY.md`
  - prompt 中显式暴露这个绝对路径
  - 明确要求模型只读写这个文件，不回退到 SDK 内部路径猜测
- 因此本节保留作为历史问题分析，但不应再把“未恢复 MCP memory”视为当前阻断项

### 3.3 `cwd` 为空或看不到 skills

现象：

- 模型在当前 `working_directory` 下执行 `Glob("*")`，结果为空
- 但直接去 `~/.proma/agent-workspaces/default/skills/...` 下又能看到实际 skill 文件

证据：

- 当前运行时将主 `cwd` 设置为 session 目录：
  - `apps/electron/src/main/lib/agent-orchestrator.ts`
  - `resolveWorkspaceRuntimeContext(...)`
- 当前 session 目录路径为：
  - `~/.proma/agent-workspaces/{workspaceSlug}/{sessionId}`
- 而实际 skills 位于：
  - `~/.proma/agent-workspaces/{workspaceSlug}/skills`
- 当前 prompt 只暴露了：
  - `working_directory`
  - `workspace_name`
  - `workspace_slug`
- 但没有暴露：
  - workspace root
  - skills path
  - workspace-files path
  - attached directories

根因：

- 当前的路径拓扑本身是分裂的：
  - `cwd` = session scratch dir
  - `plugins` = workspace root
  - `skills` = workspace root 下的 `skills/`
  - `workspace-files` = 独立目录
  - SDK project memory = 又是另一棵目录树
- 但 prompt 没有把这套拓扑解释清楚，模型自然会把 `cwd` 误当成“所有资源都应该在这里”

### 3.4 Subagent `worktree` 失败

现象：

- 模型进入 plan mode 后调用 `Agent(...)`
- 指定了 `isolation: "worktree"`
- 随即报错：
  - `Cannot create agent worktree: not in a git repository and no WorktreeCreate hooks are configured`

证据：

- 当前工程仍然为 SDK 打开了：
  - `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
  - `CLAUDE_CODE_ENABLE_TASKS=true`
- 当前主 `cwd` 仍是 session 目录，而不是 git repo root：
  - `~/.proma/agent-workspaces/{slug}/{sessionId}`

根因：

- `worktree` 依赖 git 仓库或对应 hook
- 当前 session `cwd` 不是 git 仓库
- 当前 Web 版又没有在非 git 模式下对 `Agent` 工具做能力降级或前置阻止

### 3.5 `Team "local" does not exist`

现象：

- 在 `worktree` 失败后，模型又尝试调用：
  - `Agent(... team_name: "local")`
- 报错：
  - `Team "local" does not exist. Call spawnTeam first to create the team.`

根因：

- 当前运行时没有告诉模型：
  - 什么情况下允许 team
  - team 是否已经创建
  - 非 git scratch mode 下是否应该避免 team/worktree 型子代理
- 因此模型在失败后继续尝试一个同样不成立的调用方式

## 4. 原版 Electron 工程的真实处理方式

## 4.1 Workspace / Skills 不是单纯目录复制

原版 Electron 对 workspace skills 的处理包含三层契约：

### 4.1.1 工作区目录与默认 skills 拷贝

原版在创建 workspace 时：

- 创建工作区目录
- 复制默认 skills 到 `~/.proma/agent-workspaces/{slug}/skills`

### 4.1.2 Workspace plugin manifest

原版会显式创建 `.claude-plugin/plugin.json`：

- 文件：`apps/electron/src/main/lib/agent-workspace-manager.ts`
- `ensurePluginManifest(workspaceSlug, workspaceName)`

manifest 内容里会把 plugin 名固定为：

- `proma-workspace-${workspaceSlug}`

这一步的意义是：

- 不是“顺手建个文件”
- 而是显式把 workspace 声明为 Claude SDK 的 local plugin

### 4.1.3 Prompt 中强约束 skill 名称

原版 prompt 不是最小 prompt，而是直接把 skill 调用规则写死：

- 调用 Skill 工具时必须使用完整命名空间名称
- 例如：
  - `proma-workspace-default:brainstorming`
- 动态上下文中也会列出所有可用 skills，并带完整前缀

这意味着原版的 skill 机制本来就是一个封闭契约：

- plugin manifest 决定 workspace plugin 名
- prompt 告诉模型必须用这个名字
- runtime 通过 plugin path 把该 workspace 作为 local plugin 注入给 SDK

当前 Web 简化版的问题不是“技能复制坏了”，而是：

- 还保留了旧命名空间入口
- 但没有保留和它配套的完整契约

## 4.2 原版 Memory 是 MCP，不是 `MEMORY.md`

原版 Electron 中，memory 走的是独立 memory service 和 MCP 注入链路：

- `apps/electron/src/main/lib/memory-service.ts`
- `apps/electron/src/main/lib/agent-orchestrator.ts`
  - `injectMemoryTools(...)`
- `apps/electron/src/main/lib/agent-prompt-builder.ts`
  - 明确告诉模型必须使用 `mcp__mem__recall_memory`
  - 明确告诉模型不要用 `MEMORY.md`

因此原版的 memory 契约是：

- Proma 自己控制 memory 能力注入
- Proma 自己控制模型如何使用 memory
- Memory 是 MCP 工具，不是本地文件模拟

当前简化版已经删除了这一整条链，所以现在看到的 `MEMORY.md` 行为并不代表“原版就是这么做的”。

但需要额外澄清：

- 这不再构成当前版本的“待恢复缺口”
- 当前版本的产品决策已经明确为：
  - 不恢复原版 MCP memory
  - 采用 workspace-local `MEMORY.md` 作为本地记忆持久化入口
- 因此这里的对照意义在于“说明原版并不是这么做的”，而不是“要求当前版本必须补回原版实现”

## 4.3 原版 Subagent 主要补的是结果回收，不是 worktree 前置条件

原版 Electron 对 subagent 的处理方式是：

- 打开 Agent Teams 与 Tasks 功能
- 接收 SDK 发回的 `task_started / task_progress / task_notification`
- 通过 `agent-team-reader.ts` 读取：
  - `~/.claude/teams`
  - `~/.claude/tasks`
  - team lead inbox
- 在 worker 全部 idle 后触发 auto-resume
- 再用同一个 SDK session 发起一轮 resume，把所有 teammate 的结果汇总为最终回复

这套设计的重点是：

- Proma 不负责自己创建 subagent runtime
- Proma 负责在 Claude SDK 已经产生了 team/task 结果之后，把结果收回来

换句话说，原版 Electron 在 subagent 方向补强的是：

- 结果可见性
- 自动汇总
- auto-resume 用户体验

而不是：

- 自动初始化 git 仓库
- 自动创建 worktree hooks
- 自动保证任意 `Agent(... isolation: "worktree")` 都能成功

## 4.4 原版没有自动 `git init`

这是一个非常重要的澄清。

原版工程中可以找到的是：

- Git 运行时检测
- 某个目录是不是 git repo 的状态查询
- 当前分支、远程地址、是否有改动的读取

但找不到：

- `git init`
- `git worktree add`
- `WorktreeCreate/WorktreeRemove` hook 配置
- “把 workspace/session 目录自动初始化成 git 仓库”的逻辑

原版对 git 的真实处理方式是：

- 只做检测，不做自动初始化

因此原版并没有从根本上解决：

- “session cwd 不是 git repo，但模型强行要求 worktree isolation” 这一类问题

原版只是因为：

- prompt 更强
- 团队结果回收更完整
- 用户更可能附加真实项目目录

所以体验上不一定总会先撞到这个问题，但从代码能力边界上说，它并没有提供自动 `git init` 这类保障。

## 5. 当前问题的本质

当前 Web 简化版的问题可以概括为 4 个“契约断点”：

### 5.1 Skill 契约断点

- 旧 namespace 注入仍在
- 当前实际可调用名称却已漂移
- plugin manifest 初始化也没有被当前代码显式收口成正式契约

### 5.2 Memory 契约断点

- 修复前的断点是：
  - 原版 memory MCP 已移除
  - Claude SDK project memory 还在
  - 产品与 prompt 没有明确宣告当前到底采用哪套 memory 语义
- 当前已收口为新契约：
  - 不恢复原版 MCP memory
  - Proma 显式提供 workspace-local `memory/MEMORY.md`
  - prompt 明确要求模型只使用该路径
- 因此这一项已从“断点”转为“已明确的产品策略变更”

### 5.3 路径契约断点

- `cwd`
- workspace root
- skills path
- workspace-files
- attached directories
- SDK project memory path

这些目录都存在，但 prompt 没有把关系讲明白。

### 5.4 Subagent 能力边界断点

- runtime 开了 Teams / Tasks
- 但 scratch mode 并不满足 worktree 的前置条件
- 也没有在 prompt 或工具层阻止模型误用

## 6. 推荐的修复方向

推荐原则：

- 不建议把当前 Web 版硬拉回原版 Electron 的全部实现
- 建议明确把当前产品定位成“简化版本地 Web 工作区”
- 然后围绕这个定位重新收敛一套完整契约

换句话说，不是“回滚到原版”，而是“在 Web 版里把该保留的契约补完整”。

## 6.1 修复建议一：统一 Skill 命名契约

建议：

- 新增统一 helper，例如：
  - `resolveWorkspaceSkillInvocationName(workspaceSlug, skillSlug)`
- 所有下列位置都统一从这个 helper 取值：
  - mentioned skill prompt 注入
  - dynamic workspace state
  - UI capability 展示
  - 测试断言

短期建议：

- 以当前真实运行观察到的格式为准，而不是继续硬编码旧的 `proma-workspace-${slug}:${skill}`
- 当前已知默认工作区实际成功格式为：
  - `default:skill-creator`

这里的关键不是“改成某个字符串”，而是：

- 彻底停止“多处各自拼 skill 名”
- 把 skill 调用名收敛为单一真相源

## 6.2 修复建议二：恢复 workspace plugin manifest 的显式初始化

建议：

- 在当前 `workspace-service.ts` 中恢复 `ensurePluginManifest(...)`
- 在以下路径统一调用：
  - `ensureDefaultWorkspace()`
  - `createAgentWorkspace()`
  - 任何迁移兼容入口

原因：

- 即使当前运行时最终使用的 skill namespace 已经发生变化
- plugin manifest 仍然应当是 workspace 作为 local plugin 的正式初始化步骤
- clean environment 不应依赖“用户本地目录刚好还留着旧文件”

## 6.3 修复建议三：恢复面向 Web 版的动态 workspace prompt

当前问题并不一定都要通过改目录结构来解决，先把 prompt 补全就能显著降低误判。

建议 `buildDynamicContext(...)` 至少暴露：

- `workspace_root`
- `session_working_directory`
- `workspace_files_path`
- `attached_directories`
- 当前可用 skill 列表
- 当前可用 skill 的真实调用名
- MCP 服务器列表

并加入明确说明：

- `working_directory` 是 session scratch dir，不是 workspace root
- skills 位于 workspace root 下的 `skills/`
- `workspace-files` 与 attached directories 是额外可见目录
- 不要凭空假设 `MEMORY.md` 的位置

## 6.4 修复建议四：明确当前 Memory 策略

当前推荐方案：

- 明确不恢复原版 Proma MCP memory
- 明确当前本地记忆入口就是 workspace-local `memory/MEMORY.md`
- 文档和提示词中明确说明：
  - Proma 会为每个 workspace 创建稳定的本地 memory 文件
  - 模型只应读写该文件，不应回退到 `sdk-config/projects/.../memory/MEMORY.md`
  - 这是一条 Proma 自己维护的本地文件契约，而不是原版 MCP memory 的兼容层

当前实现要点：

- `workspace-service.ts` 负责创建 `memory/MEMORY.md`
- `agent-prompt-builder.ts` 与 `agent-orchestrator.ts` 负责把该路径注入到运行时上下文

可选后续方案：

- 如果未来确实需要产品级工具化长期记忆
- 再单独把“新的 memory feature”设计成独立能力
- 但那将是新 feature，不是“恢复原版 MCP memory”的兼容任务

不推荐现在的状态：

- 一半是本地 `MEMORY.md` 叙事
- 一半又默认落回 Claude SDK 的内部 project memory 路径猜测

这会持续制造歧义。

## 6.5 修复建议五：把 Subagent 能力分为 scratch mode 与 repo mode

这是当前最关键的治理点。

推荐把工作区运行模式分成两档：

### 6.5.1 Scratch mode

适用场景：

- 当前默认工作区
- 没有附加真实 git 项目目录
- 主要做轻量文档、prompt、skills、工具配置类工作

行为建议：

- 主 `cwd` 仍为 session scratch dir
- 禁止 `worktree` isolation
- 禁止使用未创建 team 的 `team_name`
- 如无法可靠支持 subagent，直接禁止 `Agent` 工具或在 `canUseTool` 中对特定调用拒绝

### 6.5.2 Repo mode

适用场景：

- 工作区附加了明确的 git repo
- 用户确实要做代码改动或需要 worktree isolation

行为建议：

- 主 `cwd` 切换到附加 repo 的根目录
- session scratch dir 退为 `additionalDirectories`
- 只有这一模式才允许 `worktree` / Agent Teams 等更强子代理能力

这个方案比“直接 git init 当前 session 目录”更合理，原因是：

- 当前 session 目录本来就不是项目目录
- 在 scratch 目录里初始化 git 仓库并不能真正解决代码上下文问题
- 真正需要 worktree 的场景，本来就应该以用户附加的真实项目目录为主

## 6.6 修复建议六：补回原版没有但当前必须要有的 guardrails

当前 Web 版即使参考原版，也不应原样复制它的缺陷。

建议新增的 guardrails：

- 在非 git scratch mode 下，明确禁止：
  - `Agent(... isolation: "worktree")`
- 在未创建 team 的情况下，禁止：
  - `Agent(... team_name: "...")`
- 在当前没有产品级 memory feature 时，降低模型主动读取 `MEMORY.md` 的优先级
- 当 skills path 不等于 `cwd` 时，明确告诉模型资源位置

这些 guardrails 可以通过两层实现：

- prompt 约束
- `canUseTool` / 运行时显式拒绝

仅靠 prompt 不够稳，推荐同时做工具层限制。

## 7. 推荐实施顺序

按收益和风险排序，建议分三阶段。

### 第一阶段：先止血

目标：

- 先解决截图中的直接错误

建议改动：

1. 收敛 skill invocation helper
2. 恢复 plugin manifest 初始化
3. 修正 mentioned skill 注入和测试断言
4. 在 scratch mode 下禁止 `worktree` 和非法 `team_name`

### 第二阶段：修正路径与提示词

目标：

- 让模型理解当前 Web 工作区拓扑

建议改动：

1. 扩展 `buildDynamicContext(...)`
2. 暴露 workspace root / session dir / workspace-files / attached directories
3. 列出当前 skills 与实际调用名
4. 明确 workspace-local `MEMORY.md` 行为说明

### 第三阶段：补能力，不补幻觉

目标：

- 只在真正有前提时开放更强能力

建议改动：

1. 引入 repo mode
2. 工作区附加 git repo 后，切换主 `cwd`
3. 仅 repo mode 开启 worktree / team 型 subagent
4. 如确有需要，再单独设计新的产品级 memory feature

## 8. 测试建议

建议新增或调整以下测试：

### 8.1 Skills / Workspace

- clean config dir 下创建默认工作区，断言会生成 plugin manifest
- mentioned skill 注入断言应基于统一 helper，而不是写死旧前缀
- clean environment 下验证默认 skills 会从 `default-skills` 正确同步到 workspace

### 8.2 路径提示

- 断言 prompt 中包含：
  - workspace root
  - session `cwd`
  - `workspace-files`
  - attached directories
  - skill 列表

### 8.3 Subagent Guardrails

- non-git scratch mode 下，`Agent` 工具请求 `worktree` 时应被拒绝
- 未创建 team 时，`team_name` 请求应被拒绝或改写
- repo mode 下，若 `cwd` 是真实 git repo，则允许进入更强 subagent 能力路径

### 8.4 Memory

- 断言 prompt 中包含 workspace-local `memory/MEMORY.md` 的稳定绝对路径
- 断言 prompt 中明确要求模型不要回退到 `sdk-config/projects/.../memory/MEMORY.md`
- 若未来新增独立 memory feature，再单独补充新的集成测试

## 9. 不推荐的做法

以下做法不建议采用：

### 9.1 只改一行 skill namespace

问题：

- 可以临时修掉第一张截图
- 但路径误判、subagent worktree 失败等问题仍然存在

### 9.2 整包照搬原版 Electron

问题：

- 当前产品已经不是原版 Electron IPC 结构
- 原版里很多前提和配套不再成立
- 机械迁移只会把当前 Web 版重新带回“看起来能力更全，实际契约更混乱”的状态

### 9.3 在 session scratch 目录里自动 `git init`

问题：

- 这不能真正解决代码项目上下文问题
- 也不能自然支持真实工程的 worktree 场景
- 它只是把“非项目目录”伪装成 git repo，副作用很大，收益很低

## 10. 最终建议

当前最合理的方向是：

- 保持 Web 简化版定位
- 收敛一套新的、明确的、能自洽的 runtime 契约

这套契约应当明确回答 4 个问题：

1. Skill 名称到底怎么调用
2. Memory 的正式产品策略是什么，以及模型应该只使用哪个路径
3. `cwd`、workspace root、skills、workspace-files、attached dirs 之间的关系是什么
4. 哪些模式允许 subagent/worktree，哪些模式不允许

推荐的总体策略是：

- Skills：保留，但统一命名契约
- Workspace plugin：保留，并恢复显式初始化
- Memory：短期降级为“SDK project memory 行为可见，但非 Proma 正式能力”
- Subagent：只在满足条件的 repo mode 下开放强能力，默认 scratch mode 做 guardrail

如果后续要继续落地实现，优先顺序建议是：

1. 修 skill invocation contract
2. 补 plugin manifest 初始化
3. 扩展动态 workspace prompt
4. 加入 subagent scratch/repo 分级与 guardrails
5. 最后再决定是否恢复原版 memory MCP
