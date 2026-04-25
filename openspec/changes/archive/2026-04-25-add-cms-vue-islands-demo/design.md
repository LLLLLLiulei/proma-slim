## Context

当前仓库已经有一套围绕 `page-builder` 的预览、离线导出、CMS Browser、CMS skill 和工作区文件模型的正式能力，但 `CMS Vue Islands + SSR 静态化` 方案本身仍停留在设计文档阶段。直接把这条路线接入生产链路会同时卷入 preview bridge、工作区 revision、CMS 网关、导出报告和安全策略，验证成本高，且一旦方向判断有误，回滚代价也高。

本次 change 的目标不是把正式 `page-builder` 改造成 Vue islands 体系，而是在 `packages/` 下新增一个自包含 demo workspace package，先把最关键的链路跑通：同一份 HTML-first 作者模板，能在 preview 阶段通过浏览器端 Vue islands 渲染 mock CMS 数据，也能在 export 阶段通过服务端 SSR 固化为不依赖 Vue runtime 的静态 HTML。这个 demo 应当故意与现有 `apps/app` 和 `apps/page-builder` 的生产逻辑解耦，只保留与正式方案一致的边界和抽象。

## Goals / Non-Goals

**Goals:**
- 在 `packages/` 下提供一个可独立运行的 demo package，用普通 HTML 页面验证 `cms-catalog` / `cms-content` islands 写法。
- 使用同一套组件语义和运行时抽象，同时支撑 preview CSR islands 和 export SSR 两条链路。
- 提供 mock CMS 数据源和示例页面，使效果可稳定复现，不受外部 CMS 环境影响。
- 让开发者既可以在浏览器里直观看 preview 效果，也可以通过命令行生成 export 产物做结果对比。
- 保持 demo 的模块划分尽量贴近正式方案，便于后续将成熟部分迁移回正式实现。

**Non-Goals:**
- 不接入真实 `CmsGateway`、preview bridge、Builder block 选中或 manifest。
- 不实现固定内容 ID 模式、SSR preview 模式或完整错误诊断体系。
- 不把 demo 做成一个整页 Vue 应用，也不引入 `.vue` 作者文件体系。
- 不要求 demo 直接复用 `apps/app` / `apps/page-builder` 的生产 API 路径。
- 不把这次 change 视为正式产品行为变更；它只建立验证环境和 contract。

## Decisions

### Decision: 将验证环境实现为 `packages/` 下的自包含 workspace package，而不是挂到现有 apps 中

**Decision**
- 新增一个独立 demo package，例如 `packages/cms-vue-islands-demo`。
- 通过根工作区配置显式纳入 workspace，使其可以单独执行 `dev` / `export` 脚本。
- demo 不直接依赖现有 `apps/app` 或 `apps/page-builder` 的生产运行时。

**Rationale**
- 目标是验证方案可行性和体验，而不是在生产链路上做高风险试验。
- 独立 package 可以快速反复试验，也更容易在方向不合适时整体移除。
- 显式 workspace 接入比临时散落脚本更利于后续迁移和长期对比。

**Alternatives considered**
- 直接在 `apps/app` 里接一条实验 preview/export 路径：最贴近生产，但验证成本和耦合度过高。
- 写零散脚本做一次性验证：最快，但无法沉淀稳定 contract 和模块边界。

### Decision: 以 `demo-pages/*.html` 作为作者模板真相，而不是构建一个 Vue demo app

**Decision**
- demo 页面源码保持为普通 HTML 文件，直接写 `cms-catalog` / `cms-content` 标签和 slot 模板。
- `demo-pages` 是作者视角真相来源；preview 和 export 都从这些 HTML 文件出发。

**Rationale**
- 正式方案的关键前提是 HTML-first，而不是 Vue app-first。
- 如果 demo 变成一个常规 Vue 项目，就无法验证“在普通 HTML 中插入 islands”这件事本身。
- 让 preview 和 export 都消费同一份 HTML，有助于发现作者模板和最终产物之间的偏差。

**Alternatives considered**
- 用 `.vue` SFC 编写示例页面：开发体验更好，但会把问题偷换成另一个模型。
- 用字符串内联模板存 demo 页面：方便脚本验证，但不利于直观比对作者源码和产物。

### Decision: 用统一的 `CmsRuntimeClient` 抽象隔离浏览器 preview 与服务端 export

**Decision**
- 组件只依赖一个共享的 `CmsRuntimeClient` 接口。
- preview 侧提供 `browserCmsClient`，通过本地 mock CMS HTTP 接口取数。
- export 侧提供 `serverCmsClient`，直接从 mock 数据模块读取并返回归一化结果。

**Rationale**
- 这与正式方案的关键抽象保持一致，是 demo 最值得验证的部分之一。
- 共享接口可以让组件逻辑在两条链路上保持统一，避免 preview/export 分叉成两套实现。
- 通过 mock 数据而非真实 CMS，可以把验证重点放在渲染模型而不是外部环境。

**Alternatives considered**
- 让组件在浏览器和服务端直接写不同取数逻辑：实现快，但会削弱 demo 的证明力。
- preview/export 都走 HTTP mock 接口：更统一，但让 export 多一层不必要的 IO。

### Decision: preview 采用“注入运行时 + 逐岛挂载”，而不是整页 `createApp()`

**Decision**
- 本地 preview server 返回原始 HTML，并在响应中注入 Vue full build、bootstrap 脚本和 demo 配置。
- bootstrap 扫描 `cms-catalog, cms-content`，对每个 island 捕获 `outerHTML`，再创建独立小型 Vue app 挂载。

**Rationale**
- 这与正式方案的 HTML-first + islands 路线一致。
- 逐岛挂载能更准确验证普通 HTML 与 CMS islands 混排的场景。
- 避免整页 `createApp()` 把非 CMS 区域也纳入 Vue 生命周期，导致 demo 结论失真。

**Alternatives considered**
- 整页 `createApp()`：实现可能更直觉，但验证的是不同架构。
- 先把 HTML 预编译成 Vue 模板：偏离正式方案太远。

### Decision: export 采用“逐岛 SSR 替换回 HTML 文档”，并要求输出不依赖 Vue runtime

**Decision**
- export 命令扫描 `demo-pages/*.html` 中的 `cms-*` islands。
- 对每个 island 编译模板并用 `renderToString()` 执行 SSR，再将结果替换回原 HTML。
- 最终输出文件写入 `dist-demo/export`，并保证产物不再依赖浏览器端 Vue runtime 才能显示 CMS 数据。

**Rationale**
- 这正是正式方案最核心的发布模型。
- 逐岛 SSR 比整页 SSR 更能验证文档中的关键架构取舍。
- “最终静态 HTML 不依赖 Vue runtime” 是 demo 成败最重要的判断标准之一。

**Alternatives considered**
- 仅导出 preview 注入后的 HTML：无法证明 SSR 路线成立。
- 导出时保留客户端脚本继续拉 mock CMS：只能证明 CSR，不是静态化。

### Decision: 第一版 demo 只覆盖最小闭环，不接入 bridge、manifest 和真实 CMS 特性

**Decision**
- demo 只实现最小可验证闭环：示例页面、内置数据组件、mock 数据、preview、export、CLI。
- 明确排除 preview bridge、block 选中、manifest、固定内容 ID、真实 CMS 查询和复杂报错。

**Rationale**
- 这些能力会显著放大工作量，但不会增加对核心渲染模型的验证价值。
- 先验证“同一份作者模板是否能在 preview/export 两端成立”，比先做外围系统更有价值。
- 收敛范围有助于让 demo 尽快可运行，并保持回滚简单。

**Alternatives considered**
- 同时补上 bridge 和 manifest：更接近生产，但会稀释 demo 的验证目标。
- 只做 preview 或只做 export：验证不完整，无法对比两条链路是否消费同一模板真相。

## Risks / Trade-offs

- **[Demo 与正式系统过度解耦，导致验证结论无法迁移]** → Mitigation: 保持 `CmsRuntimeClient`、HTML-first 页面来源、逐岛挂载、逐岛 SSR 等核心抽象与正式方案一致。
- **[引入本地 Vue 依赖后 demo 包构建复杂度上升]** → Mitigation: 仅引入 preview/export 需要的最小依赖和脚本，不叠加额外打包层。
- **[preview CSR 与 export SSR 结果存在差异，导致演示结果混乱]** → Mitigation: 在 README 和 sample pages 中明确“export 结果为真相”，并保留作者源码、preview、export 三者对比。
- **[mock CMS 数据过于理想化，无法暴露真实边界]** → Mitigation: 至少覆盖导航、内容列表、无图内容、空结果等几类基础数据形态。
- **[demo 临时目录长期滞留，反而增加维护负担]** → Mitigation: 将其定义为实验 package，范围收敛，后续要么迁移核心模块，要么整体删除。

## Migration Plan

1. 新增 demo package 目录、workspace 配置和最小运行脚本。
2. 实现共享 `CmsRuntimeClient`、ViewModel 映射和内置数据组件。
3. 接入 mock CMS 数据源和本地 preview server。
4. 实现 preview HTML 注入与逐岛 Vue 挂载。
5. 实现 export 命令、模板编译和逐岛 SSR 替换。
6. 补充示例页面与 README，明确如何运行 preview/export 并观察结果。

**Rollback**
- 删除 demo package 目录及根工作区中的显式引用即可回滚。
- 由于不触碰现有生产 preview/export 链路，移除 demo 不会影响当前产品能力。

## Open Questions

- preview server 是否需要同时暴露作者源码和 export 结果的对照页面，还是先由 README 指导手动查看目录即可？
- demo 第一版是否需要把导出的 HTML 另存一份“无数据空态页面”，用来对比 CSR/SSR 差异？
