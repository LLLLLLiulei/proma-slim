## Context

截至 Chunk 4，`page-builder` 已经具备 CMS rendering 的共享运行时、preview 注入、static export SSR、manifest 重建与 validator 写后链路。当前缺口集中在作者态正式入口：Builder 侧已经能在 CMS Browser 确认后自动向 Agent 注入 `cms-binding-apply` 结构化 payload，但这一链路仍停留在“skill 做决策，`ready` 后继续直接编辑 workspace 文件”的阶段。

这带来三个现实问题：

- 没有正式的 `apply_cms_binding` app-layer tool 承接 block 级 HTML 写入，因此 `data-proma-block-id` 维护、manifest 重建、validator 执行与 preview state 刷新还没有被收口成一个稳定合同。
- `cms` runtime tool surface 当前只暴露只读查询工具，和集成方案里“查询 + 受控 apply” 的作者态闭环不一致。
- 共享 apply contract 与 skill 文档中仍保留了未来阶段的映射模型，例如 `fixed-contents-list`；但当前正式 runtime 只真正支持：
  - `cms-catalog`: `level`、`parentId`、`contentType`、`searchKeyword`、`take`
  - `cms-content`: `catalogId`、`keyword`、`pageIndex`、`pageSize`

因此 Chunk 5 的设计重点不是扩展运行时能力，而是把“当前已经实现的 CMS rendering 能力”通过一个正式的 app-layer apply tool 暴露出来，并同步收敛 skill / contract / tool surface。

## Goals / Non-Goals

**Goals:**
- 新增正式 `apply_cms_binding` tool，在目标 block 内生成 `cms-catalog` / `cms-content` 组件标记。
- 让 tool 统一复用已有 workspace HTML mutation pipeline，自动完成 block-id 维护、manifest 重建、validator 执行与 preview state 刷新。
- 将 `cms` runtime SDK tool surface 从只读查询扩展为“只读查询 + 受控 apply 工具”。
- 对齐 `cms-binding-apply` skill 与共享 apply contract，使 `ready` 路径调用正式 tool，而不是直接改文件。
- 将支持范围收敛到当前 runtime 已实现的 props / 查询模型，避免在作者入口层先暴露尚未闭环的运行时能力。

**Non-Goals:**
- 不在本 change 中实现新的 CMS 查询能力，例如 `CmsGateway.getContentsByIds()`。
- 不在本 change 中扩展 `cms-catalog` 的 `catalogIds` 过滤、`cms-content` 的固定 `contentIds`、alias 查询或多栏目聚合内容列表。
- 不在本 change 中改造 CMS Browser 的选择 UI 或 `PageBuilderCmsSelectionResult` 基础协议。
- 不在本 change 中修改 preview / static export 主链路；它们继续消费当前共享 runtime 与 mutation pipeline 产物。

## Decisions

### Decision: `apply_cms_binding` 作为 app-layer tool 实现，并复用统一 HTML mutation pipeline

**Decision**
- 新增 `apps/app/src/main/lib/page-builder-cms-rendering-tools.ts`，在 `apps/app` 层实现 `apply_cms_binding`。
- tool 内部不直接手写 manifest 或 validator，而是统一调用 `pageBuilderWorkspaceHtmlService.mutate(...)`。
- 目标 block 的 HTML 定位、block-id 补写和内层 HTML 替换都在 tool 内完成；写后派生逻辑仍由统一 mutation pipeline 负责。

**Rationale**
- `workspace-files/index.html`、`.proma/cms-rendering-manifest.json` 与 preview state 都是 app-layer 路径语义，不能回灌到共享 runtime package。
- Chunk 4 已经把 manifest / validator / preview state 刷新收口到统一 mutation pipeline；Chunk 5 不应绕开这条链路再发明第二个写入入口。
- 这样可以保证所有作者态 HTML 写入都共享一致的 postprocess 语义。

**Alternatives considered**
- 让共享 package 自己读写 workspace 文件：会把路径和文件系统副作用耦合进 runtime package。
- 让 tool 直接读写 `index.html` 再手动调用 manifest / validator：会破坏 Chunk 4 刚建立的单写入点原则。

### Decision: Tool 合同只暴露当前 runtime 已支持的语义组件与 props

**Decision**
- `apply_cms_binding` 在本 change 中只生成当前正式组件支持的标签与 props：
  - `cms-catalog`: `level`、`parent-id`、`content-type`、`search-keyword`、`take`
  - `cms-content`: `catalog-id`、`keyword`、`page-index`、`page-size`
- 对于 `catalogIds`、固定 `contentIds`、alias 查询、`contentSelectType` 等尚未在 runtime 端闭环的能力，本 change 不对外承诺支持。
- `cms-binding-apply` skill 的 `ready` 路径也只允许进入这组当前可执行映射；其他输入必须明确停在 `incompatible` 或等价的不可执行结果。

**Rationale**
- 当前 `packages/page-builder-cms-rendering/src/components/cms-catalog.ts` 与 `cms-content.ts` 才是真正可预览、可导出的组件合同。
- 先把作者入口对齐到已实现运行时，可以避免 tool/skill 先承诺未来能力、再反过来倒逼 runtime 扩 scope。
- 这也让 Chunk 5 保持“正式化当前能力”的性质，而不是把运行时增强混进作者入口 change。

**Alternatives considered**
- 在 tool 合同里提前暴露 `catalogIds` / 固定 `contentIds`：会导致 preview/export/runtime 与作者入口合同脱节。
- 为了兼容旧思路而在 tool 内写临时 HTML hack：会制造无法稳定测试的双轨语义。

### Decision: `ready` 路径必须调用正式 tool，而不是继续让 skill 自行编辑文件

**Decision**
- 修改 `page-builder-cms-apply-skill` 的规范与 workspace skill 文档：
  - `ready` 只表示“已经具备调用 `apply_cms_binding` 的最小必要信息”
  - 真正写文件的动作必须通过 tool 完成
- `needs-clarification` 与 `incompatible` 仍然不得触发任何文件写入。

**Rationale**
- 现有 skill 文档中的“ready 后直接编辑 workspace 文件”属于过渡态约束；一旦正式 tool 存在，就应该把 file mutation 能力收敛回宿主工具层。
- 这样可以把 block-id 维护、mutation pipeline、tool result、diagnostics 摘要统一到一个可测试入口上。
- 也能让 auto handoff、手工 agent 调用和后续 UI 集成共享同一条 apply path。

**Alternatives considered**
- 保留 skill 直接编辑文件，仅把 tool 当可选优化：会让真实行为继续分散在 prompt/skill 与宿主工具两层。
- 让 tool 只返回建议 HTML，由 skill 再决定是否写回：仍然不能形成稳定的宿主执行边界。

### Decision: Tool 目标定位继续以 `targetBlock.selector` 为事实入口，并在首次成功写入时稳定化 block-id

**Decision**
- 沿用当前 handoff payload 中稳定已有的 `targetBlock.selector` 作为 block 定位入口。
- `apply_cms_binding` 定位到 block 容器后：
  - 若已有 `data-proma-block-id`，保持不变
  - 若缺失，则生成新的 `pb_blk_<hex>` 并写入容器
- tool 只替换目标 block 的内部 HTML，不替换外层 block 容器本身。

**Rationale**
- 现有 `PageBuilderCmsApplySkillInput` 和 auto handoff 已经稳定携带 `targetBlock.selector`，而不是 `blockId`。
- Chunk 5 不需要倒推修改 handoff 协议；首次 apply 成功后，block-id 会由 tool 建立并进入后续 manifest / diagnostics 路径。
- 保留外层容器能让 preview 选择、block toolbar 和已有 CSS 锚点保持稳定。

**Alternatives considered**
- 在 Chunk 5 先要求 handoff 一律提供 `blockId`：会扩大范围到 preview bridge / selection 协议。
- 直接用组件标签替换整个 block 容器：会破坏 Builder 现有 block 识别与样式锚点。

### Decision: Tool result 返回结构化 apply 摘要，供 skill 与宿主消费

**Decision**
- `apply_cms_binding` 成功时返回结构化结果，至少包含：
  - `applied`
  - `targetBlock.selector`
  - `blockId`
  - `component`
  - `generatedHtml`
  - `manifest` 或最小 manifest entry 摘要
  - `validation` 摘要
  - `previewState`
- 失败时返回稳定错误，供宿主映射为 tool error，而不是只输出自然语言说明。

**Rationale**
- skill 与后续 UI 都需要知道这次 apply 到了哪个 block、生成了什么标签、是否带来 validator warning。
- 统一 result shape 可以避免后续再去反读磁盘文件做二次解析。
- 这也让 Chunk 5 的测试更直接：可以同时断言 HTML 写回结果与结构化返回。

**Alternatives considered**
- 只返回一段文本说明：不利于后续宿主、UI 和测试消费。
- 返回整个 HTML 文件：信号过强且容易让调用方依赖无关上下文。

## Risks / Trade-offs

- **[当前 UI 仍然会产生 `contents-fixed` 选择结果]** → Mitigation: 在 skill / contract 中明确把超出当前 runtime 的映射标为不可执行，避免假阳性 `ready`。
- **[selector 定位可能不唯一或已失效]** → Mitigation: tool 必须把“未找到 / 非唯一”作为稳定错误返回，并拒绝任何部分写入。
- **[先收敛到当前 props 会延后 catalogIds / fixed contentIds 的作者体验]** → Mitigation: 在 proposal / design / skill 中明确这是后续 runtime 能力扩展，而不是当前 change 的遗漏。
- **[tool surface 从只读扩展到写入会提高宿主执行责任]** → Mitigation: 继续保留 workspace-scoped、block-scoped 与 `replace-current` 护栏，不开放自由文件写入。

## Migration Plan

1. 新增 `page-builder-cms-rendering-tools.ts`，实现 `apply_cms_binding` 的参数校验、block 定位、HTML 生成与统一 mutation pipeline 调用。
2. 修改 `cms-sdk-tools.ts`，将 `apply_cms_binding` 注册到 `cms` runtime MCP server，并同步调整 allowed tools。
3. 更新 `packages/shared/src/types/page-builder-cms-apply.ts`，使共享 apply contract 与当前 runtime 能力、tool 调用路径保持一致。
4. 更新 `apps/app/default-skills/cms-binding-apply/SKILL.md` 及其 reference/test，使 `ready` 路径改为调用正式 tool。
5. 增加 tool / contract / skill 对齐测试，确认写入后 manifest、validator 与 preview state 都来自统一 mutation pipeline。

**Rollback**
- 如需回滚，可移除 `apply_cms_binding` tool 注册，恢复 `cms` runtime server 为只读工具面。
- `pageBuilderWorkspaceHtmlService`、manifest、validator 和 preview/export 主链路不会因此失效，因为它们已独立于本 change 落地。

## Open Questions

- 当前没有阻塞本 change 的开放问题。后续如果要支持 `catalogIds`、固定 `contentIds` 或 alias 查询，应单独通过 runtime / gateway 能力变更推进，而不在本 change 中隐式扩 scope。
