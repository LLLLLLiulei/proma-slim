## Context

`cms-binding-apply` 目前已经把主 `SKILL.md` 压缩成了 Phase 1A 决策路径，但其主要 reference `references/contract-examples.md` 仍然是一个混合型大文件：它同时承载 payload shape、`ready / needs-clarification / incompatible` 示例、`cms-catalog` / `cms-content` authoring 样例、共享 anti-pattern、以及 malformed payload 边界。这使模型在单次 CMS apply 决策中，需要自己从同一份长文里筛出“当前 selection 真正相关的部分”。

与此同时，canonical CMS authoring contract 已经天然是 component-specific 的：`cms-catalog` 与 `cms-content` 在 allowed props、supported source modes 和 `itemFieldMeta` 上都有清晰分界。当前问题不是 contract 缺失，而是人类可读 guidance 还没有把这种 component-specific 结构显式组织出来，也没有让 `cms-binding-apply` 明确告诉模型“先按 `selection.selectionKind` / `authoringContext.component` 去读对应标签说明”。

另一个约束是当前 Web runtime 会把 workspace skills 目录整体暴露给 Claude SDK；它不会按当前 selection 自动物理裁剪 reference 文件。因此这次 change 更适合先解决“信息架构与读取路径”问题，而不是扩大到宿主层 prompt assembly 或 runtime skill injection 机制改造。

## Goals / Non-Goals

**Goals:**

- 把 `cms-binding-apply` 的 reference 结构从单一混合大文件重组为更清晰的分层结构，降低 catalogs/contents 混合噪音。
- 为 `cms-catalog` 与 `cms-content` 提供各自独立的人类可读 authoring guidance，分别说明适用场景、source modes、required props、slot scope、字段语义与常见写法。
- 保留一个轻量入口 reference，集中放置最小 payload / decision 示例，并显式把模型路由到对应组件 guidance。
- 把共享 authoring rules 从组件示例中抽离出来，统一承载 HTML-first、slot inner content、Vue boundary、anti-pattern 与 apply payload 边界。
- 通过 skill 文案和文档测试约束模型优先读取当前 selection/component 相关 guidance，而不是默认扫描全部混合示例。

**Non-Goals:**

- 不修改 page-builder 宿主层的 prompt assembly 或 skill 注入机制。
- 不改变 `PageBuilderCmsApplySkillInput`、CMS apply tool、或 canonical authoring contract 的 runtime protocol。
- 不新增新的 CMS source mode、props、slot API 或 item fields。
- 不把 `page-builder-guided-generation`、root `CLAUDE.md` 或其他 page-builder skill 一并重组为同样的 reference 结构，除非实现中发现直接依赖。

## Decisions

### Decision: 保留 `contract-examples.md` 作为轻量入口，而不是彻底删除它

`references/contract-examples.md` 将继续存在，但角色改变为“入口/索引 + 最小 decision 示例”：

- 保留最小的 payload shape 示例
- 保留 `ready / needs-clarification / incompatible / malformed-payload` 结果示例
- 明确写出 catalogs/contents 应分别查看哪份组件说明
- 不再承载完整的组件 authoring 教程或大段 anti-pattern 库

这样可以保留现有稳定入口路径和测试锚点，同时把大部分噪音移出主 reference。

**Alternatives considered**

- 直接删除 `contract-examples.md` 并让主 skill 同时指向多个文件：可行，但会失去单一入口，且需要更大幅度调整现有文档测试与引用路径。
- 保留原文件并继续增长：会继续恶化 catalogs/contents 混合噪音，不满足本 change 的核心目标。

### Decision: 将人类可读 authoring guidance 拆成 shared rules + `cms-catalog` / `cms-content` 两个组件文件

新的 reference 分层采用以下结构：

- `references/contract-examples.md`: 决策示例与索引入口
- `references/shared-authoring-rules.md`: 两个组件共享的 authoring 规则
- `references/cms-catalog-authoring.md`: `cms-catalog` 专项说明
- `references/cms-content-authoring.md`: `cms-content` 专项说明
- `references/downstream-integration.md`: 保留 host-side handoff / write-pipeline 说明

其中：

- `shared-authoring-rules.md` 负责统一说明 slot inner content、统一 slot scope、major container inside slot、HTML-first、Vue boundary、禁止 `<script>` / `<style>`、禁止 page-wide Vue runtime/bootstrap，以及 apply payload 外壳边界。
- `cms-catalog-authoring.md` 负责说明何时使用 `cms-catalog`、`catalogs-by-parent` / `catalogs-by-ids` 的 required props、`item.path` / `item.logoUrl` / `item.children` 等字段语义，以及 nav / catalog-list 两类常见 recipe。
- `cms-content-authoring.md` 负责说明何时使用 `cms-content`、`contents-by-catalog` / `contents-by-ids` 的 required props、`item.publishUrl` / `item.listLogoUrl` / `item.addedAt` 等字段语义，以及 content-list / featured-card 等常见 recipe。

**Alternatives considered**

- 只在一个大文件里增加 “cms-catalog” / “cms-content” 两个 section：仍然会把共享边界、异常分支和两个组件的具体 recipe 混在一起。
- 每种 block intent 再拆成更多文件，例如 `catalog-nav`、`catalog-list`、`content-list`：粒度过细，初期维护成本高，且会把同一个组件的 contract 切得过碎。

### Decision: `cms-binding-apply` 主 skill 明确按 `selection.selectionKind` / `authoringContext.component` 路由读取 reference

主 `SKILL.md` 将不再只是笼统地说“读 contract-examples”；而是明确要求：

- 先读 `contract-examples.md` 获取当前 decision contract 和结果 shape
- 若 `selection.selectionKind = catalogs` 或 `authoringContext.component = cms-catalog`，优先读 `cms-catalog-authoring.md`
- 若 `selection.selectionKind = contents` 或 `authoringContext.component = cms-content`，优先读 `cms-content-authoring.md`
- 若需要确认共享边界与 anti-pattern，再读 `shared-authoring-rules.md`
- `downstream-integration.md` 继续只用于 host-side write path 与 handoff 说明

这条路由是 skill-level 的读取策略，不要求 runtime 在物理层裁剪文件。

**Alternatives considered**

- 通过 runtime 只向模型暴露某一份组件 reference：方向合理，但已超出这次 change 的 prompt/doc 组织范围，需要改动宿主 prompt assembly。
- 完全依赖模型自己从目录结构里挑文件：不够稳定，skill 需要给出更直接的显式路由。

### Decision: 组件说明继续以 canonical contract 为单一真相源，不在 reference 中引入第二套独立字段表

组件说明文件会把 props、source modes、slot scope 和 item fields 讲清楚，但它们的内容必须保持为 canonical contract 的人类可读投影，而不是发明第二套文档真相源。

也就是说：

- `cms-catalog-authoring.md` 只能说明 `cms-catalog` 当前 contract 中存在的 props / fields
- `cms-content-authoring.md` 只能说明 `cms-content` 当前 contract 中存在的 props / fields
- 文档测试继续检查这些说明不重新引入历史 alias 或未实现字段

这样既能让模型更容易读懂组件差异，又不会让文档和 contract 漂移。

**Alternatives considered**

- 在 reference 中手写一套更“完整”的字段百科：容易和 canonical contract 分叉。
- 只保留 contract 名称，不再做人类可读说明：对模型不够友好，无法解决这次注意力与导航问题。

## Risks / Trade-offs

- [文档拆分后跳转路径变多] → 在主 `SKILL.md` 和轻量入口文件中明确 catalogs/contents/shared 的读取顺序，降低模型自行摸索的成本。
- [多个 reference 文件可能与 canonical contract 漂移] → 让 `page-builder-cms-authoring-contract` spec 显式承接 component-specific guidance 要求，并通过文档测试锁定关键字段与禁止项。
- [用户期望“按需加载”意味着 runtime 物理裁剪] → 在本 change 中明确只做 skill-level 路由，不承诺宿主层注入粒度变化；若后续仍需更强隔离，再单独起 runtime change。
- [`cms-catalog` 内部仍包含 nav 与 catalog-list 两类 recipe] → 保持一个组件文件，但按 block intent 分小节组织，避免文件数爆炸。

## Migration Plan

1. 更新 `cms-binding-apply` proposal/spec 对 reference 分层与 component-specific guidance 的要求。
2. 重写 `SKILL.md` 的 reference 路由说明，使其先读 decision/index，再按 selection/component 进入对应组件 guidance。
3. 把当前 `contract-examples.md` 中的共享规则、组件说明与异常示例拆分到新文件结构。
4. 更新相关文档测试，使测试目标从“单个大文件包含所有内容”转为“主 skill 保持聚焦、入口文件保持轻量、组件说明按职责分层”。

回滚策略很简单：若新结构效果不好，可把 component-specific guidance 合回旧 reference；由于本 change 不涉及 runtime protocol、MCP 接口或 persisted data，回滚不需要迁移。

## Open Questions

- 暂无阻断性开放问题。本 change 默认不处理 host-side runtime prompt assembly，只处理 `cms-binding-apply` skill 与 reference 的组织、路由和 contract-aligned guidance。
