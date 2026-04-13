## Context

Chunk 2 已经让 page-builder preview 能基于真实 CMS 代理接口渲染 `cms-catalog` / `cms-content`，Chunk 3 也已经把同一套共享组件接入了静态导出链路。但作者态仍然存在一个明显的治理缺口：当前多个服务会分别直接读写 `workspace-files/index.html`，而写回之后没有统一的派生后处理入口。

当前至少有三条独立写入路径：

- [page-builder-inline-text-service.ts](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/page-builder-inline-text-service.ts)
- [page-builder-block-deletion-service.ts](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/page-builder-block-deletion-service.ts)
- [page-builder-image-replacement-service.ts](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/page-builder-image-replacement-service.ts)

它们虽然都会在成功写入后重新调用 `getWorkspacePreviewState()`，但缺少统一的“写后派生产物”机制。这意味着：

- 还没有稳定的 `workspace-files/.proma/cms-rendering-manifest.json` 供后续 `apply_cms_binding`、导出失败定位和作者态诊断使用。
- 还没有正式 validator 规则集来约束作者 HTML 中的 CMS islands 写法。
- 一旦未来新增新的 HTML 写入入口，如果开发者忘记补上 manifest / validator 逻辑，就会再次回到“索引失真、诊断滞后”的状态。

因此，Chunk 4 的目标不是改 preview 或 export 主链路，而是建立一个作者态单写入点，把 HTML 写回、manifest 重建、validator 执行和 preview state 刷新绑定成一条固定 pipeline，为 Chunk 5 的 `apply_cms_binding` 和后续错误定位打基础。

## Goals / Non-Goals

**Goals:**
- 新增统一的 workspace HTML mutation 服务，作为 page-builder 作者态 `workspace-files/index.html` 的唯一共享写入 pipeline。
- 让内联文字编辑、区块删除和图片替换改走统一 pipeline，而不是各自直接写回 `index.html`。
- 在统一写入点上重建 `workspace-files/.proma/cms-rendering-manifest.json`，将 top-level CMS islands 的 block 级索引从作者 HTML 中派生出来。
- 在统一写入点上执行 CMS rendering validator，输出结构化 diagnostics，覆盖嵌套 `cms-*`、组件外 Vue 语法、危险标签、slot 写法统一、可选 URL 未保护等常见问题。
- 让统一写入服务在返回前重新计算 preview state，确保 `hasCmsRendering` / `requiresSameOrigin` 始终反映最新的作者 HTML。

**Non-Goals:**
- 不在本 change 中实现 `apply_cms_binding` MCP 工具；该工具在 Chunk 5 中落地，并消费本 change 提供的 pipeline 与 diagnostics。
- 不在本 change 中修改 preview 或 static export 的主渲染逻辑；preview / export 继续使用既有 HTML 扫描和 runtime 流程。
- 不在本 change 中为历史页面批量补写 `data-proma-block-id`；`blockId` 允许为空，必要时由 `selectorSnapshot` 和 `islandIndex` 兜底定位。
- 不在本 change 中把 validator diagnostics 暴露到现有 inline text / block deletion / image replacement HTTP 响应体；这些现有接口继续返回 preview state，完整 diagnostics 先保留在统一服务内部结果中，供后续工具接入。
- 不在本 change 中实现复杂的 Vue AST 级分析；Phase 1 validator 以 DOM 级规则和启发式检查为主。

## Decisions

### Decision: 统一 HTML mutation pipeline 由 app 层服务持有文件系统语义，shared package 只提供纯扫描与纯校验能力

**Decision**
- 新增 `apps/app/src/main/lib/page-builder-workspace-html-service.ts`，作为作者态 HTML 读写的唯一共享 pipeline。
- shared package 只新增：
  - `packages/page-builder-cms-rendering/src/manifest/cms-rendering-manifest.ts`
  - `packages/page-builder-cms-rendering/src/manifest/scan-cms-rendering-manifest.ts`
  - `packages/page-builder-cms-rendering/src/validation/cms-rendering-validator.ts`
- 文件路径、workspace 根目录、`index.html` 读写、`.proma/` 目录创建和 preview state 重算都保留在 app 层。

**Rationale**
- manifest / validator 是共享的作者态能力，但 workspace 路径和文件持久化属于 app 层语义，不能反向塞进 `packages/page-builder-cms-rendering`。
- 这样可以保证 shared package 仍然是“纯函数/纯变换 + 无文件系统业务上下文”的边界。
- 后续 `apply_cms_binding` 也只需要调用同一个 app 层 service，而不必重新实现路径和写回逻辑。

**Alternatives considered**
- 让 shared package 自己读写 `workspace-files`：会把 app 层路径语义和文件系统副作用反向耦合到共享包。
- 继续让每个 HTML 写入服务各自附带 manifest / validator 逻辑：会重复实现，且未来新增写入入口时仍容易漏挂。

### Decision: manifest 只索引 top-level CMS islands，并将作者 HTML 视为唯一真相来源

**Decision**
- manifest 文件路径固定为 `workspace-files/.proma/cms-rendering-manifest.json`。
- manifest 只索引 top-level `cms-catalog` / `cms-content`，与 preview / export 的 island 扫描边界保持一致。
- manifest entry 至少包含：
  - `blockId`
  - `selectorSnapshot`
  - `component`
  - `props`
  - `htmlPath`
  - `islandIndex`
- manifest 由统一 HTML mutation pipeline 在成功写回 HTML 后重建；preview / export 在本 change 中只读不写。

**Rationale**
- 设计文档已经明确“组件标签是作者真相，manifest 是派生索引”；因此 manifest 不应成为独立可编辑的业务真相。
- 只记录 top-level islands 可以与当前运行时一致；嵌套 `cms-*` 属于非法作者态结构，应由 validator 报错，而不是在 manifest 中当作第二个可渲染 island。
- 让 manifest 在统一写入点重建，可以避免预览与导出各自重写同一个派生文件的竞争。

**Alternatives considered**
- 使用旧命名 `cms-vue-manifest.json`：会把 `vue` 暴露到长期稳定的模块命名中，不符合当前 `cms-rendering` 统一命名策略。
- 把所有嵌套 `cms-*` 都写入 manifest：会让 manifest 与真实运行时 islands 集合不一致，增加后续消费复杂度。
- 让 preview / export 在执行前顺手重建 manifest：虽然幂等，但会产生多写者模型，与“单写入点”原则冲突。

### Decision: manifest scanner 与 runtime island scanner 分离，避免把作者态诊断诉求混进运行时扫描

**Decision**
- 继续保留现有 `scanCmsIslands()` 作为 preview / export 运行时扫描能力。
- 新增独立的 manifest scanner，不直接复用当前 runtime scanner 的输出作为最终 manifest。
- manifest scanner 负责：
  - 发现 top-level islands
  - 提取 manifest entry 所需的定位信息
  - 以面向作者 HTML 的方式保留属性信息
- validator 直接基于原始 DOM 扫描，不依赖 runtime scanner 的“已规范化 props”结果。

**Rationale**
- 当前 runtime scanner 的目标是“为运行时渲染准备 island 模板和规范化 props”，它会忽略未知属性，也不会保留作者态诊断所需的全部上下文。
- manifest / validator 的目标是“记录作者写了什么”和“哪里写错了”，二者虽然与 runtime scanner 有交集，但边界不同。
- 把 manifest / validator 直接建在 runtime scanner 之上，容易让 authoring concerns 反向污染 runtime scanning。

**Alternatives considered**
- 直接把现有 `scanCmsIslands()` 输出序列化为 manifest：实现更少，但会丢掉作者态诊断上下文，也不利于未来扩展 manifest entry。
- 让 validator 完全依赖 manifest：会让非法结构在进入 validator 前就被过早过滤，特别是嵌套 islands 和未知 props 场景。

### Decision: `selectorSnapshot` 采用与 preview bridge 对齐的优先级规则，但不在本 change 中强行抽成浏览器/服务端共享代码

**Decision**
- manifest entry 的 `selectorSnapshot` 采用与 preview bridge 相同的优先级语义：
  1. 唯一 `id`
  2. 唯一 `data-*`
  3. 唯一 class 组合
  4. 回退到 `nth-of-type` 路径
- 本 change 在 server/app 侧新增一份同语义的 selector snapshot 生成逻辑。
- 不在本 change 中重构 preview bridge 的浏览器脚本去复用同一个实现文件。

**Rationale**
- 如果 manifest 和 preview bridge 使用两套选择器语义，block 级定位、诊断和当前选区之间会出现错位。
- 但 preview bridge 当前是独立的浏览器资源脚本，本 change 的重点不是桥接脚本重构；强行抽公共模块会扩大范围。
- 先让语义一致、测试对齐，比现在就做跨运行时共享实现更务实。

**Alternatives considered**
- 为了完全复用代码而修改 preview bridge 资源打包方式：收益不足，会把 Chunk 4 变成 preview bridge 重构。
- 直接用极简的 DOM 路径选择器：实现简单，但与当前 Builder 已使用的 block selector 规则偏差太大。

### Decision: validator Phase 1 先做 DOM 级结构规则，并将 diagnostics 作为统一服务内部结果输出

**Decision**
- validator 先覆盖以下规则集：
  - `error`: 嵌套 `cms-*`、`cms-content` 缺少 `catalog-id`、缺少 `v-slot:default`、危险标签
  - `warning`: `#default` 等 slot 简写、未知 props、可选 URL 直接绑定但无 `v-if` 保护、空 default slot
  - `info`: 缺少 empty slot、缺少 error slot
- validator 输出结构化 diagnostics，例如 `severity`、`code`、`message`、`component`、`blockId`、`selectorSnapshot`、`htmlPath` 等。
- 统一 HTML mutation service 内部返回 richer result：`previewState + manifest + diagnostics`。
- 现有 inline text / block deletion / image replacement 对外仍保持只返回 preview state；diagnostics 留给后续 `apply_cms_binding` 和更完整的作者态 UI 接入。

**Rationale**
- 这批规则已经能覆盖设计文档中明确列出的主要作者态坑点，而且主要可以通过 DOM 级信息判断，无需引入更重的模板 AST 分析。
- 如果现在就扩展现有前后端 API 返回契约，会把 Chunk 4 从治理基础设施扩大成 UI 协议改造。
- 先把统一服务内部结果做完整，再让 Chunk 5 的 `apply_cms_binding` 消费 diagnostics，是更稳的演进顺序。

**Alternatives considered**
- 立刻把 diagnostics 暴露到所有现有编辑 API：对 UI 更友好，但会显著扩大本 chunk 改动面。
- 只实现 prompt 约束、不落代码 validator：无法为工具和导出报告复用，也无法稳定测试。
- 一开始就做 Vue AST 级规则：理论上更精确，但当前收益不足，不适合成为 Chunk 4 的前置阻塞。

### Decision: 统一 HTML mutation service 以“变换函数 + 写后派生”的模式组织，并为失败路径保持原子性

**Decision**
- 统一 HTML service 接收“读取当前 HTML -> 执行纯 transform -> 决定是否写回”的模式，而不是让调用方直接传入“已经写好的完整 HTML 文件路径”。
- service 只在 transform 成功后写回 `index.html`，随后串行执行：
  1. manifest 重建
  2. validator 执行
  3. preview state 重算
- 如果 transform 失败，则不写 HTML、不重建 manifest。
- 如果 manifest / validator / preview state 后处理失败，则将该次 mutation 视为失败，并避免对外返回与当前磁盘状态不一致的伪成功结果。

**Rationale**
- 当前三个 HTML 写入入口都已经拥有纯 HTML transform 函数；统一服务可以在不改变它们核心 DOM 逻辑的前提下收敛写回链路。
- 先写 HTML，再基于磁盘上最新内容派生 manifest 和 preview state，可以避免“内存字符串和磁盘文件不一致”的双源问题。
- 对失败路径保持原子语义，有助于避免“HTML 已变更但 manifest 仍旧”的部分成功状态。

**Alternatives considered**
- 让调用方先自行写回 HTML，再调用“manifest/validator refresh”函数：仍然是多写者模式，容易再次漏挂。
- 先在内存中生成 manifest，再写 HTML：如果写文件失败，会出现 manifest 与磁盘 HTML 不一致。

## Risks / Trade-offs

- **[统一 service 成为更多写入路径的耦合点]** → Mitigation: 保持其接口聚焦于 `index.html` mutation 和派生产物刷新，不把 CMS apply、preview bridge 或 export 逻辑混入其中。
- **[manifest scanner 与 preview bridge selector 语义逐渐偏离]** → Mitigation: 明确 selectorSnapshot 的优先级顺序，并通过测试覆盖与现有 bridge 关键场景对齐。
- **[validator Phase 1 规则过弱，无法覆盖所有复杂模板误用]** → Mitigation: 先交付 DOM 级高频规则，后续再按真实误用案例迭代更强的模板分析。
- **[后处理失败时可能出现 HTML 已写回但 manifest 未刷新]** → Mitigation: 将 HTML 写回和派生步骤视为单次 mutation 事务，在失败时至少阻止对外返回伪成功，并通过测试覆盖 manifest/preview state 刷新失败路径。
- **[保留现有 HTTP 返回契约会延迟 diagnostics 在 UI 中可见]** → Mitigation: 在统一 service 内部先返回完整结果，确保 Chunk 5 的 `apply_cms_binding` 可以无缝接入，而不需要重写底层 pipeline。

## Migration Plan

1. 新增 `apps/app/src/main/lib/page-builder-workspace-html-service.ts`，封装 `workspace-files/index.html` 读写、`workspace-files/.proma/` 目录管理、manifest 重建、validator 执行与 preview state 重算。
2. 在 shared package 中新增 manifest scanner、manifest 类型和 validator，并通过包入口导出。
3. 让 [page-builder-inline-text-service.ts](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/page-builder-inline-text-service.ts)、[page-builder-block-deletion-service.ts](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/page-builder-block-deletion-service.ts)、[page-builder-image-replacement-service.ts](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/page-builder-image-replacement-service.ts) 改走统一 HTML mutation pipeline。
4. 为统一 service 和 shared package 新增测试，覆盖 manifest 生成、validator diagnostics、preview state 刷新以及三条既有写入路径的集成行为。
5. 保持现有 route / renderer API 契约不变，使本 change 可独立落地而不阻塞 Chunk 5 的工具接入。

**Rollback**
- 如果需要回滚，可以让三个 HTML 写入服务恢复为各自直接读写 `index.html`；preview / export 主链路不会受影响，因为它们仍然依赖 HTML 扫描和既有 runtime，而不依赖本 change 的 manifest 作为唯一真相。
- shared package 新增的 manifest / validator 模块只服务于作者态治理，移除后不会破坏 Chunk 2 和 Chunk 3 已完成的预览与导出链路。

## Open Questions

- 当前没有阻塞本 change 的开放问题。默认采用以下边界继续推进：
  - manifest 路径固定为 `workspace-files/.proma/cms-rendering-manifest.json`
  - manifest 只索引 top-level islands
  - validator 先做 DOM 级规则
  - 现有编辑 API 不扩展 diagnostics 响应体
  - 历史页面的 `blockId` 允许为空，不在本 change 中自动补写
