## Context

Chunk 1 已经把 `packages/page-builder-cms-rendering` 提炼为共享核心包，提供了 `CmsRuntimeClient`、`cms-catalog` / `cms-content`、`compile-island-template()` 和 `scan-cms-islands()`。当前缺口不在组件或模板能力本身，而在 page-builder 预览链路还没有把这些共享能力接进来。

现有预览链路的关键现状如下：

- [workspace-preview-service.ts](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/workspace-preview-service.ts) 已经负责工作区预览响应、CMS 资源 URL 重写和可选的 preview bridge 注入，但还不会检测 `cms-*` 并注入 CMS rendering 资产。
- [page-builder-preview-bridge.js](/Users/liu/Documents/work/learning/Proma/apps/app/resources/page-builder/page-builder-preview-bridge.js) 会在页面就绪后立即启动 `MutationObserver` 并循环发送 `ready`，这会把 CMS islands 挂载过程中的中间态 DOM 暴露给选区桥接层。
- renderer 侧的 preview state 仍只有 `hasPreview`、`entryUrl` 和 `revision`，`PreviewPane` 无法基于显式后端元数据决定是否追加 `allow-same-origin`。
- Demo 已经证明浏览器侧 islands 挂载可行，但正式链路必须复用核心包中的组件和扫描工具，不能继续复制 demo 组件或让前端直接猜测 HTML。

这使得 Chunk 2 成为一个典型的跨模块集成 change：它横跨共享 package、主进程 preview service、HTTP 路由、preview bridge 和 renderer 状态流，且需要在不破坏普通非 CMS 页面预览的前提下引入新的 HTML 变换与 iframe 行为。

## Goals / Non-Goals

**Goals:**
- 将 `packages/page-builder-cms-rendering` 的共享能力接入 page-builder 预览链路，使包含 `cms-catalog` / `cms-content` 的页面能通过真实 CMS 代理接口完成 CSR islands 渲染。
- 在主进程 preview service 中建立稳定的 HTML 变换顺序：CMS 资源 URL 重写 -> CMS rendering 注入 -> preview bridge 注入。
- 为 renderer 暴露显式 preview 元数据，包括页面是否包含 CMS rendering 和是否需要 `allow-same-origin`。
- 让 preview bridge 在存在 CMS islands 时等待 `proma:cms-rendering-ready` 后再启动选区观察，避免桥接层观察到中间态 DOM。
- 保持普通页面预览行为不变，使没有 `cms-*` 的页面继续沿用现有 preview 路径和受限 sandbox。

**Non-Goals:**
- 不在本 change 中实现 islands SSR、导出级缓存、结构化导出错误报告或资源本地化顺序约束，这些属于 static export chunk。
- 不在本 change 中引入 manifest、validator、统一 HTML mutation pipeline 或 `apply_cms_binding` 工具。
- 不在本 change 中为 island 挂载失败实现复杂的页面内错误 UI；Phase 1 仅要求不阻塞整页 ready。
- 不修改用户工作区中的源 HTML 文件；所有 preview 注入都只发生在响应时变换。

## Decisions

### Decision: CMS rendering 继续复用现有 workspace preview service 作为唯一 HTML 变换入口

**Decision**
- 不新增独立 preview server，也不在 renderer 侧二次读取 HTML 进行注入。
- [workspace-preview-service.ts](/Users/liu/Documents/work/learning/Proma/apps/app/src/main/lib/workspace-preview-service.ts) 继续作为预览 HTML 的唯一运行时变换入口。
- 对 HTML 的处理顺序固定为：
  1. CMS 资源 URL 重写
  2. CMS rendering 检测与资产注入
  3. page-builder preview bridge 注入

**Rationale**
- 当前 preview service 已经统一承载工作区 HTML 的读出和桥接脚本注入，是最自然的集成位置。
- 先完成 CMS 资源 URL 重写，再注入 CMS rendering 资产，能保证作者模板中已有的 CMS 资源引用先被代理化。
- bridge 放在最后注入，可以避免 bridge 在 HTML 仍处于 CMS 注入前态时提前决策。

**Alternatives considered**
- 新增独立 CMS preview server：会复制现有工作区预览入口和缓存规避逻辑，收益不足。
- 在 renderer 侧通过 fetch 再次拉取 HTML 并自行判断：会把 DOM 检测和安全策略判断下沉到前端，增加不一致风险。
- 先注入 bridge 再注入 CMS rendering：bridge 可能比 islands 更早观察 DOM，破坏稳定性。

### Decision: preview state 由主进程显式暴露 CMS 元数据，前端只消费而不猜测

**Decision**
- 扩展 `WorkspacePreviewState`，在现有 `hasPreview`、`entryUrl`、`revision` 基础上新增：
  - `hasCmsRendering`
  - `requiresSameOrigin`
- 上述字段由主进程在读取 `workspace-files/index.html` 时通过 DOM 级 CMS island 检测得出。
- renderer 侧的 `api.ts`、`preview-state.ts`、`preview-state-cache.ts`、`BuilderPage.tsx` 与 `PreviewPane.tsx` 全部围绕这一显式 contract 传递，不再自行扫描 HTML。

**Rationale**
- 旧设计里提到按 HTML 内容动态决定 `allow-same-origin`，但实际前端拿不到源 HTML，也不应通过正则猜测。
- `hasCmsRendering` 表示页面事实，`requiresSameOrigin` 表示 iframe 策略，把事实与策略拆开后更稳定。
- 由后端统一检测可以避免注释、示例文本或未来模板变化导致误判。

**Alternatives considered**
- 让 `PreviewPane` 基于 `previewUrl` 或 HTML 正则自行推断：误判概率高，且与“DOM 检测而非正则”的整合方案冲突。
- 只返回 `hasCmsRendering`，由前端推导 sandbox：短期可行，但会把安全策略判断重新分散到前端。

### Decision: CMS rendering preview 资产通过 page-builder 本地路由交付，并保持“Vue full build + bootstrap 双资产”模式

**Decision**
- 新增 page-builder 路由对外暴露 CMS rendering preview bootstrap 资产，并提供本地托管的 Vue full build 资产入口。
- 预览响应中注入运行时配置对象，例如 `workspaceId`、CMS 代理基路径、asset URL 和是否包含 CMS rendering。
- 保持“Vue full build + preview bootstrap 双资产”模式，而不是把 Vue 运行时打进 bootstrap 单资产。
- 资产 URL 采用版本化查询参数，行为上与现有 `preview-bridge.js` 对齐。

**Rationale**
- 现有 bridge 已经通过本地宿主路由交付，CMS rendering 资产沿用同一模式最自然，也便于测试和版本失效控制。
- 计划中已经明确要求保留双资产模式；这样更接近最终生产形态，也便于后续按需替换 Vue 资产来源。
- 通过运行时配置注入 CMS 代理基路径，可直接复用现有 `/api/page-builder/cms/*` 路由，而不把业务路径写死到共享组件里。

**Alternatives considered**
- 将 Vue 打包进 bootstrap：实现更简单，但偏离既定交付模式，也会让资产更新和调试更粗糙。
- 使用第三方 CDN：与“本地托管”要求冲突，也会引入额外部署和离线依赖。
- 将资产放到通用 `/static/vendor/*`：可行，但相较当前仓库中 `page-builder` 自有 asset route 模式一致性更差。

### Decision: 浏览器 bootstrap 以“top-level islands + 独立 app + 总体 ready”模型工作

**Decision**
- `packages/page-builder-cms-rendering/src/preview/cms-rendering-preview-bootstrap.ts` 复用核心包中的：
  - `scan-cms-islands()`
  - `compile-island-template()`
  - `CmsCatalog` / `CmsContent`
  - `createBrowserCmsClient()`
- bootstrap 只扫描 top-level `cms-catalog` / `cms-content`，为每个 island 创建独立 Vue app，替换原始节点为占位容器后挂载。
- bootstrap 在所有 island 的首次挂载“完成或失败”后，统一派发 `proma:cms-rendering-ready`。
- 任一 island 挂载失败只记录错误并继续推进 `pendingCount`，不得阻塞整页 ready。

**Rationale**
- top-level island 扫描语义已经在 Chunk 1 固化，preview 与后续 export 必须复用同一语义。
- 独立 app 挂载符合 islands 模型，也最接近 demo 已验证的路径。
- “完成或失败都递减”是防止 bridge 永久等待的关键保护措施。

**Alternatives considered**
- 为整页创建单一 Vue app：会把普通 HTML 误置于 Vue 上下文中，偏离 HTML-first 约束。
- 重新实现一套 preview 专用组件：会绕开共享核心包，导致 preview/export/tooling 再次分叉。
- 等待所有 island 成功后才派发 ready：一旦某个 island 抛错就可能造成 bridge 永久卡死。

### Decision: preview bridge 保持外部资源模式，但在 CMS 页面按 ready 事件延迟初始化

**Decision**
- bridge 资源仍通过 [page-builder-preview-bridge.js](/Users/liu/Documents/work/learning/Proma/apps/app/resources/page-builder/page-builder-preview-bridge.js) 外部脚本注入。
- bridge 在普通页面中保持尽快初始化的行为。
- 当页面存在 CMS rendering 时，bridge 在启动 `MutationObserver`、选区同步和循环 `ready` 通知之前，必须等待 `proma:cms-rendering-ready`。
- 区块识别继续基于稳定外层容器的 `data-proma-block-id` / 选择器语义，而不是依赖 `cms-*` 标签本身。

**Rationale**
- 这样可以在不改写用户 HTML 的前提下继续复用现有 block selection 能力。
- 将“是否等待”作为 bridge 初始化策略，而不是让 bridge 自己扫描 CMS DOM，有助于减少重复逻辑。
- CMS islands 挂载后原始 `cms-*` 标签会被替换，bridge 只能基于 block 容器做稳定识别。

**Alternatives considered**
- 始终等待 ready 事件：会给普通页面引入不必要的初始化延迟，还要求所有页面都带上额外协议信号。
- 让 bridge 通过 DOM 扫描自行判断是否存在 CMS islands：会重复检测逻辑并增加时序竞态。
- 让 bootstrap 直接替 bridge 向父窗口发送 `ready`：会让 CMS rendering preview 与 bridge 过度耦合。

## Risks / Trade-offs

- **[启用 `allow-same-origin` 会扩大 CMS 页面 iframe 的权限面]** → Mitigation: 仅在主进程检测到真实 CMS rendering 时返回 `requiresSameOrigin = true`，普通页面保持当前受限 sandbox。
- **[preview 资产引入新的构建与版本控制链路，可能出现脚本缓存不一致]** → Mitigation: 资产路由采用版本化 URL，并沿用 bridge 现有的“读取最新脚本内容并计算版本”模式。
- **[bridge 与 bootstrap 的事件时序处理不当会导致选区功能永久等待或过早启动]** → Mitigation: 规范 bridge 的等待条件，并要求 bootstrap 对单个 island 失败也递减 ready 计数。
- **[Chunk 2 范围容易膨胀到 SSR、manifest 或 apply tool]** → Mitigation: design 中明确把导出、验证、写后管线和作者工具排除在本 change 之外。
- **[旧整合文档仍残留 `cms-vue` 术语，可能造成实现命名漂移]** → Mitigation: 本 change 统一对外术语为 `cms-rendering`，包括 ready 事件和全局 preview 配置对象命名。

## Migration Plan

1. 在 `packages/page-builder-cms-rendering/src/preview/` 下新增 usage detection、injector 和 browser bootstrap 三个模块，并建立可由宿主读取的 preview 资产产物。
2. 在 `apps/app/src/main/http/routes/page-builder.ts` 中暴露 CMS rendering preview 资产和 Vue 运行时资产路由。
3. 在 `workspace-preview-service.ts` 中接入 CMS rendering 检测、注入与扩展后的 preview state 计算。
4. 在 `api.ts`、`preview-state.ts`、`preview-state-cache.ts`、`BuilderPage.tsx` 和 `PreviewPane.tsx` 中透传新的 preview 元数据，并按 metadata 控制 iframe sandbox。
5. 更新 bridge 资源与其测试，使其在 CMS 页面等待 `proma:cms-rendering-ready` 后再初始化。
6. 增补 preview service、preview route、bridge 和 renderer 的单元/集成测试，确认普通页面与 CMS 页面两条路径都稳定。

**Rollback**
- 删除 CMS rendering preview 注入和对应 asset route，`workspace-preview-service.ts` 退回“CMS 资源 URL 重写 + bridge 注入”的现有行为即可。
- 若 bridge 的延迟初始化引发回归，可先保留 preview 资产注入但让 bridge 回到立即启动模式，作为局部回滚。

## Open Questions

- 当前没有阻塞本 change 的开放问题。默认实现将统一使用 `cms-rendering` 命名，并通过 `page-builder` 本地路由交付 preview 资产；若后续部署环境需要切换静态资产路径，可在实现层增加可覆盖配置，而不改变本 change 的对外 contract。
