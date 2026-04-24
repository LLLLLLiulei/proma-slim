## Why

当前 `page-builder` 已经具备普通页面生成、已有 CMS 区域编辑与 confirmed CMS apply 的分层能力，但真实运行日志表明这些能力仍会在同一轮里同时竞争主控权。宿主虽然会在普通 turn 中提及 `page-builder-guided-generation`，但它只是以“请立即调用此 Skill”的软提示出现；模型仍可能绕过该 controller，直接改走 `brainstorming`，或者在没有经过预期 visual worker 链路的情况下自行 `Read` / `Edit`。这说明当前问题不只是“skill 内容不够清楚”，而是 page-builder 缺少稳定的 owner-controller 编排层。

要让专题页开发、局部重设计、已有 CMS 区域 ordinary edit 与 confirmed CMS apply 稳定落到预期链路，必须把 routing 改成：

- 由宿主先确定本轮 scene 与唯一 owner-controller
- owner-controller 在当前 turn 内被锁定
- 其他 skills 只承担 discussion-only / consult-only / execute-only 的二级角色
- `CLAUDE.md` 只承载工作区硬边界与角色分层，主 skill 再承载执行细节

## What Changes

- 收紧 `page-builder` 的回合路由，让宿主基于结构化上下文先决定本轮 scene，并只选择一个 owner-controller；ordinary page flow 与 explicit existing CMS region ordinary edit 都由 `page-builder-guided-generation` 主控，confirmed CMS apply 继续由 `cms-binding-apply` 主控。
- 调整 page-builder prompt layering，让当前 owner-controller 通过 bootstrapped prompt 注入成为本轮硬上下文，并附带 turn-level routing metadata；owner 变化必须走宿主 handoff，而不是由模型在同一轮里自行切换到另一个 owner skill。
- 改写 page-builder 根级 `CLAUDE.md`，把 page-builder 的工作区硬规则、scene routing、skill 角色分层与 handoff 规则上移到全局层，避免模型只有在先读到主 skill 时才知道这些控制边界。
- 调整 `page-builder-guided-generation`，让它明确承接 ordinary create / iterate / repair / redo / selected-block follow-up / existing CMS region ordinary edit，并按需 consult `page-builder-cms-region-authoring-guidance`、discussion-only `brainstorming`、以及 execute-only `taste-skill` / `redesign-skill`。
- 收紧 `page-builder-cms-region-authoring-guidance` 为 consult-only specialist guidance，不再作为并列 owner；当前 target 明确命中已有 CMS source region 时，由 ordinary owner 先 consult 它，而不是切换成第二个 owner。
- 收紧 `brainstorming` 为 discussion-only skill，仅在用户显式要求“先讨论/先 brainstorm”时进入；普通 page-builder turn 不得把它当默认入口。
- 统一视觉 worker 角色：`taste-skill` 作为首轮视觉执行 worker，既用于首版整页生成，也用于首轮 block 级明显视觉重设计；`redesign-skill` 只用于已有结果基础上的第二阶段提质、升级或精修；`soft-skill` 不再参与 page-builder 默认竞争面。
- 调整 page-level CMS notice 与 target-scoped guidance layering：page-level notice 仅保留 advisory 边界，只有当前 target 明确命中 existing CMS region 时才注入 digest 与 consult-only guidance；binding identity 变更仍必须升级回 confirmed CMS browser/handoff/apply 链路。
- 移除基于自由文本 continuation 猜测而保留的隐藏 target context；Builder 发送阶段只依赖当前显式选区、显式 CMS target 与 confirmed CMS handoff 这类结构化事实，不再从消息文本推断是否续写同一目标。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `page-builder-app`: Builder 发送准备阶段将由宿主先完成 scene 分类、owner-controller 选择与 turn-level owner lock，而不是把 controller 选择留给模型在多个 skills 中自由判断。
- `page-builder-guided-generation`: ordinary controller 将成为普通页面 flow 与 existing CMS region ordinary edit 的统一 owner-controller，并统一调度 `taste-skill` / `redesign-skill` 作为 canonical visual workers。
- `page-builder-prompt-layering`: prompt 注入将改成“宿主选 owner + bootstrapped owner + turn routing metadata + secondary role surfacing”的分层；page-level CMS notice 继续保留 advisory 角色。
- `page-builder-cms-region-authoring-guidance`: 既有 CMS 区域 guidance 将收敛为 consult-only specialist guidance，不再作为 page-builder ordinary turn 的并列 owner。
- `brainstorming-skill`: `brainstorming` 将被明确收敛为 discussion-only skill，不再作为普通 redesign / modify turn 的默认入口。
- `page-builder-preview-block-selection`: 发送阶段将只依据当前显式选区决定是否附着 `targetSelection`；系统不再保留隐藏 follow-up target context，也不再从 continuation 文本中重建旧目标。

## Impact

- Affected code:
  - `apps/page-builder/src/renderer/pages/BuilderPage.tsx`
  - `apps/page-builder/src/renderer/lib/preview-selection.ts`
  - `apps/app/resources/templates/page-builder-workspace-claude.md`
  - `apps/app/default-skills/page-builder-guided-generation/`
  - `apps/app/default-skills/page-builder-cms-region-authoring-guidance/`
  - `apps/app/default-skills/brainstorming/`
  - `apps/app/default-skills/taste-skill/`
  - `apps/app/default-skills/redesign-skill/`
  - page-builder workspace default skill seeding / capability surfacing logic
  - page-builder turn-level prompt layering and Skill tool guardrails
- Affected systems:
  - Builder ordinary send preparation
  - prompt layering and bootstrapped owner injection
  - workspace skill docs and role taxonomy
  - turn-level owner-controller enforcement
  - selected-target sends only using explicit current selection
- No external dependency changes are expected.
