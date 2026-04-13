## Context

Chunk 1 已经提供了共享的 `packages/page-builder-cms-rendering` 核心包，Chunk 2 也已经把同一套 `cms-*` 组件接入了 page-builder preview。但当前正式导出链路仍停留在“复制 `workspace-files/` 到 staging -> 扫描 HTML/CSS -> 本地化资源 -> 打包”的模型，[page-builder-static-export-service.ts](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/page-builder-static-export-service.ts) 还完全不知道 `cms-catalog` / `cms-content` 的存在。

这带来三个直接缺口：

- 导出结果不会把 `cms-*` 语义组件固化为真实 CMS 内容，最终包里可能仍残留未替换的 `cms-*` 标签，或者根本没有预期内容。
- 现有资源本地化逻辑只会扫描原始 staging HTML；如果后续 SSR 才生成新的 `img[src]`、`a[href]`、`srcset` 或 inline style URL，这些资源将被遗漏。
- 核心包里的组件在查询失败时会把错误下沉为 slot `error` 状态，而不是天然抛出异常；如果导出侧没有显式的失败上浮策略，就可能出现“导出成功但内容为空”的静默错误。

因此，Chunk 3 的目标不是做完整硬化，而是先把“任务级 server runtime + CMS islands SSR + 资源本地化顺序闭环 + 严格失败上浮”这条最小生产链路接到现有导出服务里，并且不把 Chunk 7 的并发限流、可选严格度和 richer report 字段提前混进来。

## Goals / Non-Goals

**Goals:**
- 在 page-builder 现有静态导出服务中接入 CMS islands SSR，并保证执行顺序为“复制 staging -> CMS islands 预取/SSR -> 资源本地化 -> 打包”。
- 在共享包中新增服务端导出所需的 runtime、缓存和 SSR 模块，但保持对 `CmsGateway` 的依赖通过 app 层适配注入，而不是直接让共享包导入 `apps/app`。
- 为单个导出任务创建独立的 server CMS runtime 与请求复用缓存，避免跨任务共享 CMS 查询结果。
- 在导出侧保留原始 CMS 资源 URL，让现有资源本地化逻辑继续接管这些 URL。
- 将 CMS island 预取失败、模板编译失败或 SSR 失败提升为导出失败，并写入最小结构化 failure 信息。

**Non-Goals:**
- 不在本 change 中引入 `required=\"false\"` 或其他 per-island 严格度控制；Chunk 3 默认任何 CMS island 失败都会使导出失败。
- 不在本 change 中引入预取并发上限、429 保护或更复杂的调度策略；这些保留给 Chunk 7 硬化。
- 不在本 change 中新增导出任务 phase，例如 `rendering`；当前 `copying / scanning / downloading / packaging / completed` 状态保持不变。
- 不在本 change 中补充 `blockId`、`selectorSnapshot` 等 richer export report 字段；当前只要求最小 CMS island failure 上下文。
- 不修改 preview、manifest、validator、统一 HTML mutation pipeline 或 `apply_cms_binding` 工具。

## Decisions

### Decision: 继续以 `page-builder-static-export-service` 作为唯一导出编排入口，并把 CMS islands SSR 插入到资源本地化之前

**Decision**
- 不新增第二套 CMS 专用导出服务，也不让 shared package 自己承担 staging 文件读写。
- [page-builder-static-export-service.ts](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/page-builder-static-export-service.ts) 继续作为唯一导出 orchestrator。
- 在现有 `processHtmlFile()` 资源扫描之前，新增一段 CMS islands 处理步骤：
  1. 扫描当前 HTML 中的 top-level CMS islands
  2. 预取 islands 所需 CMS 数据
  3. 逐 island 编译模板、执行 SSR 并替换回 staging HTML
  4. 再执行原有资源本地化逻辑

**Rationale**
- 当前导出服务已经负责 staging、report、打包与失败回滚，是最自然的集成位置。
- SSR 生成的新资源引用只有先写回 staging HTML，现有 HTML/CSS 本地化逻辑才能继续命中。
- 维持单一 orchestrator 可以避免“shared package 改 HTML、app 再扫一次 HTML”这种重复 IO 和职责重叠。

**Alternatives considered**
- 新增独立 CMS export service，再由当前导出服务调用：会造成 staging/report/phase 管理分裂，收益不足。
- 在资源本地化之后再做 CMS islands SSR：会直接漏掉 SSR 生成的图片、链接和 `srcset` 资源，不满足离线导出要求。
- 新增 `rendering` phase：能更细分状态，但会扩大 shared types、UI 和测试面；Chunk 3 先保持现有 phase 不变。

### Decision: `serverCmsClient` 采用 app 层适配注入 + 任务级实例，而不是共享包直接依赖 `CmsGateway`

**Decision**
- 在 `packages/page-builder-cms-rendering` 中新增 `createServerCmsClient()`，但它只依赖一个窄接口适配器，例如“列栏目 / 列内容”的函数集合。
- `apps/app` 负责把真实 `CmsGateway` 或等价 app 层 adapter 注入给 shared package。
- 每次离线导出任务都创建新的 `serverCmsClient` 与新的请求缓存；任务结束后整个实例即被丢弃。

**Rationale**
- shared package 反向 import `apps/app` 会破坏 workspace 边界，也让后续测试和复用能力变差。
- 请求缓存必须是任务级，而不是进程级，否则导出服务作为长进程运行时会出现跨工作区、跨用户的缓存污染。
- app 层适配注入也让导出测试可以直接用 mock adapter 驱动，而不必实例化完整 CMS 网关。

**Alternatives considered**
- 让 shared package 直接 import `CmsGateway`：实现表面更直接，但会把 app 层业务依赖反向耦合进共享包。
- 使用进程级单例缓存：实现更省，但会把一次导出的查询结果泄漏到下一次导出任务。

### Decision: 服务端缓存 key 只覆盖 runtime transport query，而不混入组件显示层 props

**Decision**
- `cache-key.ts` 只基于真正发送给 server runtime 的 catalog/content query 生成 cache key。
- `cms-catalog` 的 `level`、`parentId`、`take` 等展示层 props 继续由组件层消费，不写入 server runtime transport cache key。
- 同一导出任务内，等价 transport query 复用结果；不同 transport query 必须命中不同 key。

**Rationale**
- Chunk 1 已经把 `level`、`parentId`、`take` 明确定义为组件显示层语义，而不是底层 runtime contract。
- 如果把显示层 props 混入 transport cache key，会把同一份上游 CMS 结果拆成多个无意义缓存项，降低复用价值。
- 反过来，如果遗漏真实 transport query 字段，例如 `catalogId`、`keyword`、`pageIndex`、`pageSize`，又会导致不同 island 串数据。

**Alternatives considered**
- 直接用 island props 全量序列化做 cache key：实现最简单，但会把不影响上游请求的展示层 props 误当作 transport 维度。
- 完全不做查询缓存：实现更少，但相同 island 多次查询会增加 CMS 压力，也削弱预取阶段的价值。

### Decision: 导出侧采用“先显式预取、再逐 island SSR”的两阶段模型，并把预取失败作为严格失败来源

**Decision**
- `prefetch-cms-islands.ts` 先根据扫描结果发起 islands 所需查询，并把结果写入任务级缓存。
- `render-cms-islands.ts` 再逐 island 使用共享组件和模板编译逻辑执行 SSR，并替换回 DOM。
- 预取阶段如果发现某个 island 的查询失败，直接收集结构化 CMS island failure，并中止导出成功路径。
- SSR 阶段主要负责处理模板编译错误、运行时渲染错误和 DOM 替换错误。

**Rationale**
- 当前共享组件在查询失败时会把错误映射到 slot `error`，这对 preview 是好事，但导出若只依赖 `renderToString()` 抛错来判定失败，会漏掉查询失败并产生空内容或错误 slot 的“伪成功”导出。
- 先预取再 SSR，可以把“数据是否可得”与“模板/渲染是否成功”拆成两个可诊断阶段。
- 预取还天然提供查询去重收益，SSR 阶段从缓存拿数据，减少导出时的网络等待。

**Alternatives considered**
- 只做逐 island SSR，让组件内部按需查询：实现更少，但导出严格失败会依赖组件是否抛错，容易静默漏掉 query failure。
- 预取使用 `allSettled` 后忽略失败继续渲染：会产生“导出成功但内容为空”的危险结果，不符合本 chunk 的严格边界。

### Decision: 服务端 runtime 保留原始 CMS 资源 URL，并以最小结构化 failure 进入 export report

**Decision**
- 导出侧 `serverCmsClient` 不复用浏览器 preview client 的资源 URL 重写逻辑；`cms-content` SSR 结果中的 `listLogoUrl` 等字段保持原始 CMS URL。
- `packages/shared/src/types/page-builder-static-export.ts` 中的 failure 结构做最小扩展，使 CMS island failure 至少能记录：
  - `code`
  - `message`
  - `component`
  - `props`
- `blockId`、`selectorSnapshot` 和更丰富的来源定位信息明确延后到 Chunk 7。

**Rationale**
- preview client 会把图片 URL 改写为 `/api/page-builder/cms/assets?...`，这是浏览器预览专用路径；导出 staging HTML 不能使用这个宿主代理地址。
- 保留原始 CMS URL 后，现有离线导出资源本地化逻辑才能继续按 CMS 资源规则抓取并改写。
- Chunk 3 需要 failure 结构化，但没有必要一次性引入所有定位字段；最小上下文足够支撑导出失败诊断与测试。

**Alternatives considered**
- 复用浏览器 preview client：会把 preview 代理 URL 带入静态包，破坏离线导出。
- 在 Chunk 3 一次性补齐 `blockId`、`selectorSnapshot`：可诊断性更强，但会把 manifest/selector 相关复杂度提前引入当前 change。

## Risks / Trade-offs

- **[CMS island SSR 顺序被后续维护者错误调整到资源本地化之后]** → Mitigation: 在导出 service 代码中写明注释，并增加集成测试验证 SSR 新生成的资源 URL 仍会被后续本地化。
- **[请求缓存 key 处理错误导致不同 island 串数据或缓存命中不足]** → Mitigation: 将 key 逻辑集中到 `cache-key.ts`，并用“同任务复用 / 跨任务隔离 / 不同 query 不串数据”三类测试保护。
- **[组件吞掉 query error 导致导出伪成功]** → Mitigation: 通过显式 prefetch 阶段把 query failure 单独上浮，SSR 阶段只负责渲染类失败。
- **[当前 chunk 不做预取限流，大量 island 页面可能放大 CMS 压力]** → Mitigation: Chunk 3 先接受简单并发预取，后续在 Chunk 7 中补充并发上限与 429 保护。
- **[report failure 字段仍然较少，首次排障信息不如最终形态丰富]** → Mitigation: 先保证最小结构化上下文可用，并在后续 hardening chunk 中补齐 block 级定位信息。

## Migration Plan

1. 在 `packages/page-builder-cms-rendering/src/runtime/` 下新增 `server-cms-client.ts`、`prefetch-cache.ts` 和 `cache-key.ts`，建立导出侧任务级 runtime 与查询复用能力。
2. 在 `packages/page-builder-cms-rendering/src/ssr/` 下新增 `prefetch-cms-islands.ts`、`render-cms-islands.ts` 和 `island-render-errors.ts`，复用共享扫描、组件和模板编译能力完成导出侧 islands 管线。
3. 在 [page-builder-static-export-service.ts](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/page-builder-static-export-service.ts) 中接入“CMS islands SSR -> 资源本地化”的顺序闭环，并保持现有导出 job phase 不变。
4. 扩展 [page-builder-static-export.ts](/Users/liu/Documents/work/learning/Proma/packages/shared/src/types/page-builder-static-export.ts) 的 failure 类型，容纳最小 CMS island failure 上下文。
5. 增补 shared package 和 app 层测试，覆盖重复查询去重、跨任务缓存隔离、岛屿失败上浮，以及“SSR 生成资源 URL 仍会被后续本地化”的集成场景。

**Rollback**
- 移除导出 service 中的 CMS islands 处理步骤，导出即可回到当前“仅资源本地化”的行为。
- 删除新增的 server runtime/SSR 模块不会影响 preview 路径，因为它们只服务于 static export。

## Open Questions

- 当前没有阻塞本 change 的开放问题。默认实现采用“任一 CMS island 失败即导出失败”“不新增 phase”“server runtime 保留原始 CMS 资源 URL”“app 层 adapter 注入 shared package”这组边界；更细粒度的严格度、并发控制和 richer report 字段延后到 Chunk 7。
