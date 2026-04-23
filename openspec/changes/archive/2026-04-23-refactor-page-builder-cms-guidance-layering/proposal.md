## Why

当前 page-builder 在 confirmed CMS apply 链路上已经具备较强的 host-controlled 约束，但 ordinary flow 中对已有 `cms-catalog` / `cms-content` 的理解仍然过度依赖模型自行阅读长 skill 和 references。现在需要把 CMS 相关提示词、skill 与最小 contract digest 重新分层，让模型在命中已有 CMS 区域时先进入正确 guidance 语境，再决定如何安全修改。

## What Changes

- 新增一个专门面向“已有 CMS 区域普通修改”的轻量 guidance capability，用于承接模型对已有 `cms-*` 标签的理解、阅读顺序和普通 authoring 边界，并要求宿主在命中已有 CMS 区域时通过 runtime-controlled 的方式稳定把该 guidance 顶到模型前面；当当前页面已存在 CMS 区域但本轮还没有显式 target 时，宿主也应提供轻量 page-level notice 先建立正确语境。
- 调整 page-builder 根级 prompt layering，只保留全局稳定约束、场景路由和“命中宿主管理 CMS 构造时先 consult canonical guidance”的统一规则。
- 精炼 `page-builder-guided-generation`，让它继续负责 ordinary page-builder 控制流与高层 CMS 边界，但不再承载过重的 CMS 组件级 authoring 细则。
- 继续收敛 `cms-binding-apply`，让它只承担 confirmed CMS selection 之后的 decision/apply controller 职责，不再充当 ordinary CMS literacy 的默认入口。
- 扩展 canonical CMS authoring contract 的派生能力，使宿主可以在命中已有 CMS 区域时注入更小、更稳定的 component-aware digest；当页面只需要 page-level 提醒而没有显式 target 时，则只注入轻量 notice 而不注入 target-scoped digest，优先帮助模型理解当前标签和页面语境，而不是依赖长篇 references。
- 约束新的 ordinary CMS guidance 保持轻量和分层：主 skill 只保留阅读顺序、不要猜测和 ordinary/confirmed 边界，组件细则和共享规则继续由 contract-derived digest 与小型 guidance/references 承接，而不是重新长成一个大而全 skill。
- 本阶段不修改 `page-builder-cms-targeted-edit-guardrails` 现有的 rollback / turn recovery 语义，聚焦 guidance layering 与 prompt routing。

## Capabilities

### New Capabilities
- `page-builder-cms-region-authoring-guidance`: 定义已有 CMS 区域普通修改场景下的 guidance 入口、阅读顺序、skill 路由和最小 authoring digest 约束。

### Modified Capabilities
- `page-builder-prompt-layering`: 调整 page-builder 全局 prompt 分层，使根级约束只保留稳定边界、默认路由与“命中 CMS 先 consult canonical guidance”的规则，并允许页面已含 CMS 区域时注入轻量 page-level notice。
- `page-builder-guided-generation`: 调整 ordinary page-builder 主控 skill 对已有 CMS 区域的职责边界，避免继续承担过重的组件级 CMS authoring 细则。
- `page-builder-cms-apply-skill`: 进一步收敛 confirmed CMS apply skill 的职责，使其只面向已确认 CMS 选择后的 formal apply controller。
- `page-builder-cms-authoring-contract`: 扩展 contract 派生出的普通 authoring digest，使其能够支撑已有 CMS 区域的最小 guidance 注入与 component-aware 阅读。

## Impact

- Affected specs: `page-builder-prompt-layering`, `page-builder-guided-generation`, `page-builder-cms-apply-skill`, `page-builder-cms-authoring-contract`, and new `page-builder-cms-region-authoring-guidance`
- Affected code and content: page-builder workspace `CLAUDE.md` template, default skills, CMS references, runtime guidance injection/orchestration, and any prompt assembly logic that decides when existing CMS guidance should be loaded
- Affected systems: page-builder ordinary editing flow, existing CMS region authoring flow, confirmed CMS apply prompt routing
- Guardrail note: this phase does not change the existing rollback/restore semantics defined under `page-builder-cms-targeted-edit-guardrails`
