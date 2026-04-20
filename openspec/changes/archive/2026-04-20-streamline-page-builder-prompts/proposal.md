## Why

当前 `page-builder` 的根级 `CLAUDE.md`、`page-builder-guided-generation`、`cms-binding-apply` 以及附属引用材料之间存在较多重复与职责交叉，导致模型在“普通专题页生成”“已有页面普通迭代”“用户想接 CMS 但尚未完成选择”“已确认 CMS 选择并准备 apply”这几类场景之间不易稳定分流。尤其是普通引导 flow 与 CMS apply flow 的边界仍有冲突，使模型更容易重复提问、误造 `cms-*` 标签，或在已确认 CMS 选择后仍停留在抽象说明而没有进入正式 apply。

## What Changes

- 新增 page-builder prompt 分层能力，明确根级 `CLAUDE.md` 只承担工作区硬约束、场景路由和全局边界，不再重复 skill 内部执行细节。
- 调整 `page-builder-guided-generation`，将其收敛为普通用户专题页 briefing、确认、生成和轻量迭代的主控 skill，并补充更明确的停止提问阈值与 CMS 预选择边界。
- 调整 `cms-binding-apply`，将其收敛为“已确认 CMS 选择后的 Phase 1A 决策与执行入口”，强调结构化判定、最小短澄清和 `ready -> mcp__cms__apply_cms_binding` 的同轮执行。
- 统一主运行文档、引用示例和测试策略，使它们验证分层职责，而不是要求同一条规则在根模板、skill 和 reference 中重复出现。

## Capabilities

### New Capabilities
- `page-builder-prompt-layering`: 定义 page-builder 根级工作区提示、普通专题页主控 skill 与 CMS apply skill 之间的分层职责和场景路由。

### Modified Capabilities
- `page-builder-guided-generation`: 调整普通用户 flow 的提问/确认边界，移除与已确认 CMS apply flow 重叠的职责，并补充更明确的成稿阈值与 CMS 预选择分流。
- `page-builder-cms-apply-skill`: 调整 `cms-binding-apply` 的 Phase 1A 决策、短澄清和正式 apply 路径，使其成为新建或重绑 `cms-*` 的唯一受控 authoring 入口。

## Impact

- Affected docs and prompts:
  - `apps/app/resources/templates/page-builder-workspace-claude.md`
  - `apps/app/default-skills/page-builder-guided-generation/**`
  - `apps/app/default-skills/cms-binding-apply/**`
- Affected tests:
  - page-builder prompt / skill doc tests
  - workspace template tests tied to prompt content
- Affected systems:
  - page-builder ordinary user generation flow
  - CMS selection handoff and apply guidance
  - prompt loading and maintenance strategy for page-builder workspaces
