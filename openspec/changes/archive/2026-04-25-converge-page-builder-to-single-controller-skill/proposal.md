## Why

当前 `page-builder` 普通流仍然在“宿主多 owner 路由”“页面级 CMS guidance 噪音”“`brainstorming` 默认抢主控”之间摇摆，导致模型即使看到了正确 skill，也可能绕过主链路直接进入别的 meta skill 或直接 `Read` / `Edit`。既然宿主难以稳定判断普通流里的细粒度意图，就需要把普通 turn 收敛到单一 controller，再让该 controller 去 consult 或调度下游 skills。

## What Changes

- 将普通 `page-builder` turn 收敛到单一主控 skill：除 confirmed CMS apply 之外，普通页面创建、普通迭代、repair、redo、selected-block follow-up 全部先进入 `page-builder-guided-generation`。
- 将 `page-builder-cms-region-authoring-guidance` 从普通 turn 的并列 owner 降级为 consult-only specialist guidance；命中已有 CMS region 时由主 skill 先 consult 它，而不是由宿主切换到第二个 owner。
- 调整 page-builder 根级 `CLAUDE.md` 与 prompt layering，让所有 skills 可以继续暴露在上下文里，但默认 turn-level promotion / bootstrap 只围绕单一主控 skill 展开；page-level CMS notice 保留 advisory 边界，confirmed CMS apply 继续由宿主硬切到 `cms-binding-apply`。
- 改写 `brainstorming` skill 的 contract，使其从“任何 creative work 的默认前置 skill”收敛为“仅在用户显式要求时进入的讨论型 skill”，并明确不得覆盖 workspace-specific controller flow。
- 保留现有 confirmed CMS browser confirm -> auto handoff -> `cms-binding-apply` 决策/写入链路，但要求 ordinary controller 在发现 rebind / query prop 变更意图时升级回正式 CMS 选择流程，而不是直接写已有 `cms-*` 绑定属性。

## Capabilities

### New Capabilities
- `brainstorming-skill`: 约束 `brainstorming` 为显式进入的分析型 skill，并禁止其覆盖已有 workspace-specific controller flow。

### Modified Capabilities
- `page-builder-app`: 普通 Builder 发送路径将固定进入单一主控 skill，confirmed CMS apply 继续保留为宿主硬切换例外。
- `page-builder-guided-generation`: ordinary controller 将成为普通 flow 的唯一主入口，并承担下游 visual worker / CMS specialist consult 的调度职责。
- `page-builder-prompt-layering`: page-builder 根级 `CLAUDE.md` 与 turn-level prompt surfacing 将改为“单主控 + consult specialist + confirmed apply 例外”分层。
- `page-builder-cms-region-authoring-guidance`: 既有 CMS 区域 guidance 将从并列 owner 收敛为 consult-only specialist guidance。

## Impact

- Affected code:
  - `apps/page-builder/src/renderer/pages/BuilderPage.tsx`
  - `apps/app/resources/templates/page-builder-workspace-claude.md`
  - `apps/app/default-skills/page-builder-guided-generation/`
  - `apps/app/default-skills/page-builder-cms-region-authoring-guidance/`
  - `apps/app/default-skills/brainstorming/`
  - page-builder turn-level skill promotion / bootstrap logic
- Affected systems:
  - Builder ordinary send preparation
  - page-builder prompt layering and skill surfacing
  - workspace-local skill contracts for page-builder and brainstorming
  - ordinary CMS region edit routing versus confirmed CMS apply handoff
- No new external dependencies are expected.
