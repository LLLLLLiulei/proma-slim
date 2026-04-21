## Why

`cms-binding-apply` 当前的 reference 组织把决策协议、`cms-catalog` / `cms-content` authoring 示例、共享 anti-pattern 和异常结果样例混在同一个大文件里，已经开始稀释模型对当前 selection 所需信息的注意力。与此同时，现有 canonical authoring contract 明明已经按组件区分了 props、source modes 和 `itemFieldMeta`，但人类可读 guidance 还没有真正按 `cms-catalog` / `cms-content` 拆开并显式路由消费。

## What Changes

- 重组 `cms-binding-apply` 的 reference 结构，把当前臃肿的 `contract-examples.md` 收敛为轻量入口/decision 示例文件，而不是继续承担完整知识库。
- 新增按组件拆分的人类可读 authoring guidance，分别说明 `cms-catalog` 与 `cms-content` 的适用场景、常见 source modes、props、slot scope、可用字段和推荐写法。
- 新增共享 authoring rules，集中承载两个组件共同遵守的 slot inner content、HTML-first、Vue boundary、anti-pattern 和 apply payload 边界。
- 更新 `cms-binding-apply` 主 skill，使其在读取 reference 时显式根据 `selection.selectionKind` 和 `authoringContext.component` 路由到对应组件说明，而不是默认依赖完整混合 reference。
- 补齐相关 skill 文档测试，确保主 skill 保持决策路径聚焦，同时 references 保持分层且与 canonical contract 一致。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `page-builder-cms-apply-skill`: 调整 `cms-binding-apply` 的 prompt/reference 分层方式，并要求该 skill 按当前 catalogs/contents selection 路由到对应组件 guidance，而不是默认读取单一的大型混合 reference。
- `page-builder-cms-authoring-contract`: 增加对 component-specific human-readable guidance 的要求，确保 `cms-catalog` / `cms-content` 的 props、source modes、slot scope 与字段说明能按组件拆分展示且继续与 canonical contract 保持一致。

## Impact

- Skill docs:
  - `apps/app/default-skills/cms-binding-apply/SKILL.md`
  - `apps/app/default-skills/cms-binding-apply/references/`
- Related tests:
  - `apps/app/src/main/lib/cms-binding-apply-skill.test.ts`
- No new runtime capability, CMS tool protocol, or page-builder write-path API is introduced in this change; the focus is prompt/documentation organization and contract-aligned guidance routing.
