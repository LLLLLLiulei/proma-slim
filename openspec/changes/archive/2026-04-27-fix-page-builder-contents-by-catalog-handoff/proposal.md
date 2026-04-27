## Why

`contents-by-catalog` 当前会把 CMS 浏览树节点的 `snapshot.catalog` 直接送入 auto handoff，而该树节点来自 `/api/catalogsTree`，其 `total`、`path` 等元数据可能与真实栏目内容状态不一致。这会让后续 `cms-binding-apply` 把 `catalog.total = 0` 误判成“空目录”并拒绝本来可绑定的内容目录。

## What Changes

- 在 `contents-by-catalog` 的 auto handoff 链路中引入宿主侧 authoritative refresh，使用 `siteId + catalogId` 重新解析栏目元数据与最小内容探针结果，而不是直接信任浏览树快照。
- 让 handoff / apply skill 输入显式区分“用户确认时的 selection”与“宿主校正后的权威来源上下文”，避免后续模型继续把树节点 `snapshot.catalog.total` 当作内容可用性的事实依据。
- 修正 `cms-binding-apply` 的内容目录判定语义：`contents-by-catalog` 不再因为树节点 `catalog.total = 0` 自动视为空目录，也不再仅因目录当前无内容就直接判为 `incompatible`。
- 收紧 `cms-binding-apply` 的兼容性判断口径：只允许按目标结构、authoring contract 和运行时边界判断兼容性，不再因为 CMS 内容主题、行业或占位文案与当前模块不一致而拒绝绑定。
- 保持现有 CMS 浏览器整体交互、选择结果协议和 `/api/catalogsTree` 浏览用途不变；本次只修 confirmed handoff 与决策输入边界。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `page-builder-cms-auto-agent-handoff`: `contents-by-catalog` confirmed handoff 在进入 agent 决策前需要基于 `catalogId` 解析权威栏目与内容上下文，而不是直接把树节点快照当作正式来源事实。
- `page-builder-cms-apply-skill`: `cms-binding-apply` 需要使用宿主提供的权威内容探针来判断 `contents-by-catalog` 的可绑定性，并允许空内容目录继续作为可展示 empty state 的合法绑定来源；其兼容性判断只看结构与 contract，不看内容主题是否像当前模块。

## Impact

- Affected code: `apps/app/src/main/lib/page-builder-cms-auto-agent-handoff-service.ts`, `packages/shared/src/types/page-builder-cms-apply.ts`, `packages/shared/src/types/page-builder-cms-auto-agent-handoff.ts`, `apps/app/default-skills/cms-binding-apply/**`, related tests.
- Affected systems: page-builder CMS confirmed handoff flow, persisted handoff input, agent-side CMS apply decision boundary.
- Non-goals: full CMS browser data-source replacement, lazy catalog loading, or removing `/api/catalogsTree` from the browsing UI.
