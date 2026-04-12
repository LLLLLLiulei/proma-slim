## Context

当前仓库已经在 `packages/cms-vue-islands-demo` 中验证了最关键的 CMS 渲染链路：同一份 HTML-first 作者模板可以在浏览器端通过 islands 方式消费 CMS 数据，也可以在导出阶段通过 SSR 固化为静态 HTML。但 demo 里的核心能力仍以实验代码形态存在，存在三类问题：

- 运行时契约和 demo mock 数据结构耦合过紧，例如 `CmsRuntimeClient` 直接返回 ViewModel，导致 `viewmodel` 层名义上存在、实际上没有承担真实边界。
- template 扫描逻辑仍散落在 preview/bootstrap 与 export/ssr 入口里，没有形成共享的 `scan-cms-islands` 基础设施。
- 核心依赖关系还没有对齐正式系统，例如 `pageIndex` 在 demo 中按正整数处理，而生产侧 `PageBuilderCmsContentQuery` 与 `CmsGateway` 使用 0-based 语义。

Chunk 1 的目标不是把 demo 文件整体迁移到新包，而是借助 demo 已验证的结构，建立一个能被后续 preview、static export、manifest 和 apply tool 共同依赖的共享核心包。这个核心包应当只提供纯运行时抽象、纯组件实现和纯模板基础设施，不引入 `apps/app` 或 `apps/page-builder` 的路径、HTTP 路由、Bridge、导出任务状态等业务语义。

## Goals / Non-Goals

**Goals:**
- 新增 `packages/page-builder-cms-rendering`，作为 page-builder CMS 渲染链路的共享核心包。
- 将运行时契约对齐到 `@proma/shared` 中的归一化 CMS 类型，而不是继续暴露 demo 专用 ViewModel 返回结构。
- 建立显式的 `viewmodel/catalog.ts` 与 `viewmodel/content.ts`，稳定组件对 slot 暴露的数据形态。
- 提炼共享的 `cms-catalog` / `cms-content` 组件、通用 `createCmsResourceComponent()`、slot 渲染辅助以及 query 归一化逻辑。
- 提供纯模板基础设施 `compile-island-template.ts` 和 `scan-cms-islands.ts`，为后续 preview 与 export 复用。
- 为核心包补充独立测试，覆盖组件行为、ViewModel、template 扫描与关键参数归一化语义。

**Non-Goals:**
- 不在本 change 中实现 `serverCmsClient`、请求级缓存、并发预取或 SSR 错误报告，这些属于后续 static export chunk。
- 不在本 change 中实现 preview bootstrap、HTML 注入、Bridge ready 协调或 asset route，这些属于后续 preview chunk。
- 不在本 change 中接入 manifest、validator、workspace HTML mutation pipeline 或 `apply_cms_binding` 工具。
- 不要求移除或修改现有 demo 包；demo 仍保留为参考来源和实验资产。
- 不在本 change 中改变 page-builder 现有对外 API 行为。

## Decisions

### Decision: 核心包的运行时契约直接对齐 `@proma/shared` 归一化 CMS 类型

**Decision**
- `runtime/cms-runtime-client.ts` 中的 `CmsRuntimeClient` 直接使用 `@proma/shared` 的 `PageBuilderCmsCatalogQuery`、`PageBuilderCmsContentQuery`、`PageBuilderCmsCatalogList` 和 `PageBuilderCmsContentList` 作为输入输出契约。
- 组件不再假设 client 已经返回 ViewModel；ViewModel 由核心包内部的 `mapCatalog()` / `mapContent()` 显式构建。

**Rationale**
- 这样能让核心包与 [page-builder-cms.ts](/Users/liu/Documents/work/learning/Proma/packages/shared/src/types/page-builder-cms.ts) 以及后续 `CmsGateway` 直接对齐，避免再次定义一套 demo 专属数据 contract。
- ViewModel 由组件层内部映射后，`viewmodel` 子模块才真正形成可维护边界，后续 CMS 字段变化也能局部吸收。
- 这能让浏览器端 client、服务端 client 和未来的缓存 client 共享同一接口，而不是各自产出不同形状的数据。

**Alternatives considered**
- 沿用 demo 做法，让 `CmsRuntimeClient` 直接返回 ViewModel：实现快，但会让 shared 类型和正式 CMS 网关长期分叉。
- 在组件内部直接消费 `CmsGateway` 原始字段：会让模板字段直接暴露到底层接口变化，稳定性差。

### Decision: `viewmodel` 层按整合方案一次补齐稳定字段，而不是复制 demo 最小字段集

**Decision**
- `viewmodel/catalog.ts` 的 `CmsCatalogItemViewModel` 保留 `children` 递归字段。
- `viewmodel/content.ts` 继续暴露 `id`、`catalogId`、`title`、`summary`、`publishUrl`、`listLogoUrl`、`addedAt`、`shape`、`assetCounts` 等稳定字段。
- catalog/content 组件统一通过 `mapCatalog()` / `mapContent()` 输出 slot scope。

**Rationale**
- 整合方案已经把 `children` 定义为 catalog 的稳定字段，Chunk 1 若只迁移 demo 的平铺字段，后续会再次改动共享类型和测试。
- 在核心层一次补齐稳定字段，比让 preview/export 再各自补字段更稳，也更利于 skill/validator 形成统一认知。

**Alternatives considered**
- 先只保留 demo 已用到的字段，后续再扩：短期简单，但会让 Chunk 1 产出的 contract 很快失效。
- 直接把 shared 类型暴露给 slot：耦合到底层归一化结构，不符合 ViewModel 隔离目标。

### Decision: 参数归一化逻辑在组件辅助层统一处理，并显式修正 `pageIndex` 为 0-based

**Decision**
- `components/helpers.ts` 统一负责 prop 到 query 的归一化。
- `take` / `pageSize` 采用正整数归一化，`pageIndex` 采用非负整数归一化，保留 `0` 的合法语义。
- `cms-catalog` 本地处理 `level`、`parentId`、`take`，而浏览器端 client 只发送生产路由真实支持的 query 字段。

**Rationale**
- 当前 demo 的 `toPositiveNumber()` 会吞掉 `pageIndex = 0`，这与生产侧 `CmsGateway` 的 0-based 页码不一致，必须在核心层纠正。
- 统一参数归一化能减少组件间重复逻辑，也让 preview 和 export 以后共享完全一致的查询语义。
- `level`、`parentId`、`take` 属于组件展示层策略，而非 CMS HTTP 代理的固有查询能力，放在组件层本地处理更稳定。

**Alternatives considered**
- 继续复用 demo 的 `toPositiveNumber()`：会把 0-based 页码 silently 改坏。
- 将所有 props 原样透传给 HTTP client：会把组件语义泄漏到路由层，并增加后端接口假设。

### Decision: `scan-cms-islands.ts` 作为核心包新增抽象，而不是维持 preview/export 各自扫描

**Decision**
- 在 `template/scan-cms-islands.ts` 中新增统一扫描逻辑，基于 DOM 解析识别 `cms-catalog`、`cms-content` 节点。
- 扫描结果至少包含：组件名、原始节点 `outerHTML`、归一化 props，以及对原始 DOM 节点或可重建定位信息的访问。
- `compile-island-template.ts` 保持为纯模板编译函数，与扫描逻辑分离。

**Rationale**
- demo 当前在 [preview bootstrap](/Users/liu/Documents/work/learning/Proma/packages/cms-vue-islands-demo/src/preview/browser/preview-bootstrap.ts) 与 [SSR render](/Users/liu/Documents/work/learning/Proma/packages/cms-vue-islands-demo/src/export/render-islands-ssr.ts) 中各自扫描 `cms-*`，这会让后续 preview、export、manifest 三条线继续重复实现。
- 将扫描提到核心包后，Chunk 2 的 preview、Chunk 3 的 static export 和 Chunk 4 的 manifest 才能建立在同一套语义之上。
- 扫描与编译分离后，后续危险模板检测、selector snapshot 和错误定位也有清晰落点。

**Alternatives considered**
- 暂不抽扫描逻辑，只在 preview/export 各自实现：短期最快，但会直接破坏“共享核心”的目标。
- 在 preview chunk 再新增扫描：会让 static export 和 manifest 继续等待或重复封装。

### Decision: 核心包的组件工厂延续 demo 的泛型结构，但改用强类型注入 key

**Decision**
- `createCmsResourceComponent()` 保留 demo 已验证的泛型工厂模式，由组件声明 props、错误文案和 `loadItems()` 逻辑。
- `CMS_RUNTIME_CLIENT_KEY` 升级为 Vue `InjectionKey<CmsRuntimeClient>`，使用 `Symbol` 表达。
- 共享导出 `CmsSlotError`、`CmsSlotScope<T>` 等基础类型，集中定义 slot contract。

**Rationale**
- demo 中的通用组件工厂已经证明能较好复用 catalog/content 的共同行为，是最值得直接沿用的抽象之一。
- 使用 `InjectionKey` 比字符串 key 更安全，避免共享包长期演化后出现注入命名冲突。
- 统一 slot contract 类型可以让后续 SSR、validator、skill 文档和测试都围绕同一套语义编写。

**Alternatives considered**
- 放弃工厂，分别实现两个组件：可读性略高，但会复制状态管理和 slot 分支逻辑。
- 保留字符串 key：对 demo 足够，但不适合作为共享包长期 contract。

### Decision: Chunk 1 的测试以 SSR 渲染和 DOM 扫描为主，不引入额外组件测试框架

**Decision**
- 使用 `bun:test` 作为测试入口。
- 组件行为测试通过 `createSSRApp` + `@vue/server-renderer` 验证 slot 输出、空态和错误态。
- `scan-cms-islands`、prop 归一化等纯逻辑测试通过 `linkedom` 和普通单测覆盖。
- 不在本 chunk 引入 `@vue/test-utils`。

**Rationale**
- 当前仓库和 demo 已经使用 Bun 运行测试，沿用现有测试执行方式成本最低。
- 共享核心包最关键的是 render contract 和 DOM/template 语义，SSR 渲染测试比浏览器交互测试更贴近后续 static export 场景。
- 引入额外测试框架会扩大依赖面，但对 Chunk 1 的价值有限。

**Alternatives considered**
- 引入 `@vue/test-utils` 做浏览器式组件测试：更接近 CSR 挂载，但对核心包当前目标并非必需。
- 只保留 demo 现有端到端测试：无法有效覆盖新增的 shared contract 与 helper 语义。

## Risks / Trade-offs

- **[核心包第一次落地就引入 Vue 运行时与模板编译依赖，workspace 依赖面扩大]** → Mitigation: 仅把 `vue`、`@vue/compiler-dom`、`@vue/server-renderer` 放入新包自身依赖，不提前扩散到 `apps/app` 或 `apps/page-builder`。
- **[shared contract 与 demo 现有实现不完全一致，迁移时会出现“看起来像回归”的测试调整]** → Mitigation: 明确这是提炼与对齐，不是逐文件搬运；以 `@proma/shared` 与整合方案为准更新测试期望。
- **[`scan-cms-islands` 抽象不足，后续 manifest/preview/export 仍需要二次封装]** → Mitigation: 在设计阶段就要求扫描结果至少包含组件名、outerHTML 和 props，避免只返回裸 DOM 节点。
- **[Chunk 1 范围继续膨胀到 preview 或 export 集成]** → Mitigation: 设计中明确排除 `serverCmsClient`、preview bootstrap/injector、SSR render 和任何 app 层接入文件。

## Migration Plan

1. 新增 `packages/page-builder-cms-rendering` package scaffold，并更新根 workspace 配置。
2. 在核心包中建立 `runtime`、`viewmodel`、`components`、`template` 四个子模块及统一 `index.ts` 导出。
3. 从 demo 提炼可复用实现，但按 shared contract 重写 `CmsRuntimeClient`、ViewModel 和参数归一化逻辑。
4. 为核心包补充单元测试，确认组件 slot contract、ViewModel 和 template 扫描/编译行为稳定。
5. 保持 demo 包继续可用，后续 preview/static export chunk 再逐步从 demo 和核心包双轨切换到核心包。

**Rollback**
- 删除 `packages/page-builder-cms-rendering` 及根 workspace 中的引用即可回滚。
- 因本 change 不修改 `apps/app`、`apps/page-builder` 的生产链路，回滚不会影响现有 page-builder 行为。

## Open Questions

- 当前不计划在 Chunk 1 中纳入 `getCatalogDetail()`；如果后续 preview 或 apply tool 证明核心组件层需要该能力，可在后续 change 中增补。
