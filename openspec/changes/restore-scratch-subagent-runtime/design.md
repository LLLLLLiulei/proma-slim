## Context

当前 Bun Web 版已经恢复了 workspace 目录、Skills、本地 `memory/MEMORY.md` 和 Agent Teams 相关事件类型，但 subagent 运行时只剩下一个“能启动 Claude SDK”的最小壳层。与原版 Electron 相比，当前实现缺了两块关键拼图：

- `agent-prompt-builder.ts` 不再解释 workspace 目录拓扑，也没有告诉模型 scratch 工作区下应该如何使用 subagent。
- `agent-orchestrator.ts` 仍然打开了 Agent Teams / tasks 能力，但 team inbox 查找、轮询和 idle 检测全部是 stub，导致 teammate 结果无法像原版一样回收和 auto-resume。

现有失败 transcript 已证明，`claude-sonnet-4-6` 在 scratch session cwd 中会直接发出 `Agent(... isolation: "worktree")`，随后被 SDK 以 “not in a git repository” 拒绝。对照原版仓库可以确认，原版并不是通过把每个 workspace 都初始化成 git 仓库来解决这个问题，而是通过更完整的 prompt 约束和真实的 team reader / auto-resume 链路，让 research/task 型 subagent 走普通 sidechain 语义。

本次修复的约束是：恢复原版在 scratch mode 下可工作的 subagent 体验，但不引入自动 git 初始化、不伪造 worktree hook，也不把当前 Web 版重新拖回 Electron IPC 结构。

## Goals / Non-Goals

**Goals:**
- 恢复 scratch workspace 下的 subagent 运行契约，让纯研究/搜索/总结型子代理不再被诱导为 `worktree` 模式。
- 让 Agent prompt 明确暴露 workspace 拓扑、Skill 调用名、本地 `memory/MEMORY.md` 路径及 scratch / repo 模式边界。
- 恢复原版的 team inbox 读取、idle 检测和 resume prompt 组装逻辑，使 teammate 结果能再次自动汇总。
- 为 prompt 约束和 team reader 行为建立可重复执行的后端测试。

**Non-Goals:**
- 不自动把 scratch workspace 初始化为 git 仓库。
- 不实现 `WorktreeCreate` / `WorktreeRemove` hooks，也不承诺所有 `worktree` 型 subagent 都可在非 repo 目录中成功。
- 不在本次 change 中恢复完整 Team 活动面板或新的 renderer 交互。

## Decisions

### Decision: 以 prompt 明示 scratch mode / repo mode，并在必要时增加极窄的 Agent tool guardrail

**Decision**
- 在 workspace prompt 中明确区分两种模式：
  - `scratch mode`: 当前 `cwd` 是 Proma 管理的 workspace session 目录，适合研究、搜索、总结、规划类 subagent；默认不使用 `worktree`。
  - `repo mode`: 用户附加的真实项目目录或当前目录本身是 git repo，且任务涉及代码修改时，才允许考虑 `worktree` isolation。
- 同时补充 workspace 拓扑说明，告诉模型 `cwd`、workspace root、Skills、workspace-files、memory 文件并不在同一层。
- 如果模型在 scratch mode 下仍然发出 `Agent(... isolation: "worktree")`，则在运行时仅移除这个不受支持的 `isolation` 字段和空的 `team_name`，把调用退回普通 subagent 语义。

**Rationale**
- 失败根因是模型在缺乏上下文时用错了 subagent 隔离方式，而不是 SDK 无法支持普通 sidechain subagent。
- 直接恢复原版的“解释型 prompt”成本低、与历史行为一致，而且不会引入伪 git 仓库这种额外状态。
- Playwright 回归表明当前主模型仍可能忽略 prompt 约束，因此需要一层只处理已知坏输入的 guardrail，确保 scratch mode 不再被 `worktree` 立即打断。

**Alternatives considered**
- 自动在每个 scratch workspace 下初始化 git 仓库：会把临时工作目录伪装成代码仓库，副作用大，也偏离原版实现。
- 完全依赖 prompt 约束：实现最简单，但已被当前真实模型行为证明不足以保证修复生效。

### Decision: 将原版 team reader 迁回为独立模块，并从 orchestrator 中移除 stub

**Decision**
- 新增 `agent-team-reader.ts`，直接承接原版职责：
  - 扫描 `~/.claude/teams/`
  - 读取 `~/.claude/tasks/`
  - 查找 team lead inbox
  - 轮询未读消息
  - 标记已读
  - 检测 idle workers
  - 构造 inbox / summary resume prompt
- `agent-orchestrator.ts` 不再保留本地 stub，而是统一依赖这个模块。

**Rationale**
- 这条链路是原版能够在 teammate 完成后继续给出最终汇总回复的核心，不恢复它，subagent 就算偶尔执行成功也会在收口阶段体验不完整。
- 独立模块易测，也能保持 orchestrator 聚焦在事件循环本身。

**Alternatives considered**
- 继续在 orchestrator 内部塞本地辅助函数：实现路径最短，但会继续积累难测的隐藏逻辑。
- 只保留 task summary fallback，不读 inbox：会丢失原版完整 worker 输出，信息质量下降。

### Decision: 为 team reader 引入可覆盖的 Claude home 根目录解析

**Decision**
- team reader 的 `~/.claude` 根路径通过一个小 helper 解析，优先读取测试环境变量，再回退到 `homedir()`。
- 生产逻辑默认仍落在 `~/.claude/teams` 与 `~/.claude/tasks`。

**Rationale**
- 原版写死 `homedir()` 在生产可行，但当前需要稳定的单元测试；如果测试直接污染真实 `~/.claude`，会让结果不可控。
- 小范围注入路径解析不会改变运行时行为，却能大幅提升可测试性。

**Alternatives considered**
- 在测试里直接写用户真实 home：风险高，且容易和本机历史数据互相污染。
- 把整个路径改成 Proma 私有目录：会偏离 Claude SDK / Teams 现有文件布局，不利于兼容原版行为。

### Decision: 先用后端测试锁定契约，再做 Playwright 回归验证

**Decision**
- 先新增两个层面的测试：
  - prompt builder / orchestrator workspace test，验证 scratch-mode subagent 约束和 workspace 拓扑说明已注入 prompt。
  - team reader test，验证 inbox 查找、未读过滤、已读标记、idle 检测与 fallback prompt。
- 代码通过后，再启动应用并用 Playwright 做一次真实 UI 验证。

**Rationale**
- 这次问题跨 prompt、文件系统和事件编排三层，只做 UI 手测很难定位回归点。
- 先把后端契约钉住，后续再遇到模型差异时也能知道是“提示词决策问题”还是“结果回收链路坏了”。

**Alternatives considered**
- 只做 Playwright 回归：能看最终现象，但不能稳定证明内部契约是否被恢复。
- 只做纯单测不跑 UI：无法确认修复后的真实交互路径是否重新打通。

## Risks / Trade-offs

- **[SDK 若未来更改 Agent tool 输入字段]** scratch guardrail 依赖 `isolation` / `team_name` 当前字段约定。  
  → Mitigation: 将 guardrail 封装在独立 helper 中，并通过单元测试锁定当前输入结构。

- **[team inbox 结构依赖 Claude 当前文件布局]** 若 SDK / Claude Code 调整 `~/.claude/teams` 结构，reader 可能再次失效。  
  → Mitigation: 保持 reader 封装独立，并用测试覆盖当前约定的关键文件结构。

- **[恢复原版逻辑可能引入与当前 Web 版不一致的文案]** 直接迁回老代码容易把 Electron 时代的叙述带回来。  
  → Mitigation: 保留原版行为骨架，但按当前 workspace-service 与 Web 版命名重新整理注释和 prompt 内容。

- **[只恢复 scratch mode 仍不能覆盖代码型 worktree 子代理]** 用户若在非 git 目录中要求代码型隔离 subagent，问题依旧存在。  
  → Mitigation: 在本次变更后把 repo-mode / worktree 支持保留为后续独立 change，而不是在本轮混做。

## Migration Plan

1. 新增本次 change 的 delta specs，明确 scratch-mode subagent、workspace prompt 和 auto-resume 契约。
2. 为 prompt builder 和 team reader 写失败测试，验证当前行为与目标契约不符。
3. 新增 `agent-team-reader.ts`，迁回原版 team inbox / idle 检测逻辑，并为测试提供可覆盖的 Claude home 解析。
4. 更新 `agent-orchestrator.ts`，移除 stub，接入 team reader。
5. 更新 `agent-prompt-builder.ts`，补充 workspace 拓扑、scratch / repo subagent 约束及相关注释。
6. 为 scratch-mode Agent tool 增加输入 guardrail，移除不受支持的 `worktree` isolation。
7. 运行 Bun 目标测试，并重新执行 Playwright UI 验证。

**Rollback**
- 若修复引发新问题，可回退到当前最小 prompt + stub 状态，但会重新失去 scratch-mode subagent 可用性和 auto-resume 结果回收。
- 新增的 team reader 为独立文件，回滚边界清晰，不涉及用户数据迁移。

## Open Questions

- repo-mode 的判定后续是基于“当前 cwd 是 git repo”还是“attached directories 中存在用户明确选择的 repo root”更合理？
