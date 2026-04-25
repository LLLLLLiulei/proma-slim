## 1. Prompt Layering And Routing

- [x] 1.1 调整 Builder 普通发送准备逻辑，使 ordinary turn 只默认提升 `page-builder-guided-generation`，confirmed CMS apply 继续保留 `cms-binding-apply` 例外
- [x] 1.2 调整 page-builder prompt layering / `CLAUDE.md` 模板，明确“单主控 + consult specialist + confirmed apply 例外”的分层
- [x] 1.3 收敛 turn-level skill surfacing，区分 workspace-visible skills 与 turn-promoted skills，避免 `brainstorming` 成为 ordinary turn 的默认竞争者

## 2. Skill Contracts

- [x] 2.1 改写 `page-builder-guided-generation`，使其成为 ordinary page-builder flow 的唯一主控，并使用 `taste-skill` / `redesign-skill` 作为 canonical visual worker 名称
- [x] 2.2 改写 `page-builder-cms-region-authoring-guidance`，使其成为 consult-only specialist guidance，并对齐 digest-first 的阅读顺序
- [x] 2.3 改写 `brainstorming` skill，使其收敛为显式进入的讨论型 skill，并禁止覆盖 workspace-specific controller flow

## 3. CMS Flow Verification

- [x] 3.1 验证 ordinary 页面编辑、已选 CMS island 的样式/slot 迭代、以及 binding identity 变更三类请求的路由边界
- [x] 3.2 验证 ordinary flow 命中已有 CMS 区域时会 surfacing canonical guidance，但不会切换成并列 owner
- [x] 3.3 验证 confirmed CMS apply 仍保持宿主硬切换与 decision-backed apply 链路，不被 ordinary controller 回退覆盖

## 4. Regression Coverage

- [x] 4.1 为单主控 ordinary routing、visible-vs-promoted skill surfacing、以及 `brainstorming` 不再默认抢主控补充回归验证
- [x] 4.2 为 page-level CMS notice、target-scoped CMS digest / guidance surfacing 与 selected follow-up continuity 补充回归验证
