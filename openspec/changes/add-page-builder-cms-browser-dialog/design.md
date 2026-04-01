## Context

`page-builder` 当前已经具备两块与本次变更直接相关的基础能力：

- Builder 页右侧对话区已经通过 `AgentView` 的 `composerLeadingActions` 插槽承载“选择进行编辑”这类上下文动作入口
- 宿主侧已经具备 `CmsGateway`、CMS 鉴权配置解析和只读 CMS SDK tools，能够稳定返回归一化栏目与内容数据

但这两块能力之间仍缺少一个面向最终用户的可视化浏览层。当前用户无法在 Builder 工作台中直接查看 CMS 栏目树或栏目下的内容列表，只能依赖 Agent 间接使用工具。上一轮 CMS SDK tools 变更也明确将 picker/modal 排除在范围之外，因此这次需要单独补齐一个只读浏览弹框。

本次设计还受到几个现有约束：

- `page-builder` renderer 通过 `@` alias 直接复用 `apps/app/src/renderer` 下的 UI primitives 和 `api` client，而不是维护一套完全独立的 renderer 基础设施
- `apps/app/src/main/http/routes/page-builder.ts` 当前只暴露项目列表和预览桥脚本，尚未提供面向页面构建器 UI 的 CMS 浏览路由
- `CmsGateway` 的归一化类型目前只存在于 main 侧实现文件中，若 renderer 要通过 HTTP 消费这些结果，需要明确一套跨层共享的类型契约
- 预览选区当前只提供 `selector`，并不包含 block 类型、数据 schema 或内容约束信息，因此本次不适合把 CMS 浏览结果与页面区块选择逻辑耦合

本次变更的目标不是做内容填充、确认选择或 block 绑定，而是先把“Builder 工作台中可视化浏览 CMS 栏目和内容”这一层打通。

## Goals / Non-Goals

**Goals:**
- 在 Builder 页右侧 Agent/composer 操作区新增一个常驻的“浏览 CMS”入口
- 提供一个只读 CMS 浏览弹框，包含 `栏目` 与 `内容` 两个页签
- 在 `内容` 页签中展示左侧栏目树和右侧内容列表，并支持切换栏目后加载对应内容
- 通过 `page-builder` 自己的 HTTP 路由复用宿主侧 `CmsGateway`，而不是让 renderer 直接访问 CMS
- 为 renderer 和 main 建立稳定的共享类型契约，避免 CMS 浏览数据结构在跨层时失真
- 将新增依赖控制在最小范围，并尽量贴合当前 Radix + Tailwind 的界面模式

**Non-Goals:**
- 不处理“确认选择内容”后的任何业务动作
- 不做页面区域填充、block 绑定持久化或内容回写
- 不将 CMS 浏览入口与当前页面区块选择模式做联动或过滤
- 不在本次加入搜索、筛选、批量操作或复杂表格功能
- 不让 renderer 直接调用 Agent runtime custom tools，也不让浏览 UI 复用 Agent 对话工具调用链

## Decisions

### 1. 将入口放在 Builder 页的 composer action 区域，并与选区入口并列显示

Builder 页已经通过 `AgentView` 的 `composerLeadingActions` 插槽承载“选择进行编辑”按钮，因此本次继续沿用这条入口路径，在同一动作区域中新增一个“浏览 CMS”按钮。实现上，`BuilderPage` 将从“单个按钮 ReactNode”提升为一个小型 actions 容器，同时维护本地 `isCmsBrowserOpen` 状态。

原因：

- 用户当前的工作上下文就在右侧对话区，把 CMS 浏览入口放在同一动作带里最符合工作流
- 这不会打断现有 `ProjectTitleBar`、预览区或页面布局结构
- 首版只是浏览，不依赖选中的 block，因此不需要把入口绑定到预览区交互状态

备选方案：

- 放到 Builder 顶部标题区：可见性高，但会把“对话相关动作”和“项目元信息”混在一起
- 放到预览区工具栏：会误导用户以为该能力依赖左侧预览或当前选区
- 只有选中 block 后才显示：当前没有足够的 block 元数据支撑智能过滤，首版会增加认知成本

### 2. 弹框壳层使用 Radix Dialog/Tabs，栏目树使用 `@rc-component/tree`，内容列表自行绘制

弹框壳层和页签继续沿用当前仓库已经普遍采用的 Radix Primitive 路线，新增：

- `@radix-ui/react-dialog`
- `@radix-ui/react-tabs`

栏目树采用更成熟的 `@rc-component/tree`。右侧内容区域则不引入额外表格库，而是直接渲染紧凑列表行，使用现有 Tailwind 样式与 `ScrollArea` 组合实现。

原因：

- Dialog/Tabs 与现有 `button`、`alert-dialog`、`scroll-area` 的组件风格一致，接入成本最低
- 用户已经明确偏向更成熟的树组件，`@rc-component/tree` 在行为能力和稳定性上更符合要求
- 内容列表首版只是浏览，不涉及复杂排序、列配置或批量选择，表格库会明显过度设计

备选方案：

- 使用 `headless-tree`：样式更自由，但成熟度不如 `@rc-component/tree`
- 自己手写树组件：可控但风险高，容易在展开、键盘操作和节点状态管理上重复造轮子
- 为内容列表引入 `@tanstack/react-table`：未来扩展性强，但对当前只读浏览范围来说成本过高

### 3. 复用 `apps/app` 的 renderer UI 层，新增通用 `dialog` / `tabs` 封装，而不是在 `page-builder` 重新搭一套 UI primitives

`page-builder` 的 Vite alias 已经把 `@` 指向 `apps/app/src/renderer`，当前 `BuilderPage` 也直接复用了 `Button` 等基础组件。因此本次继续在这层补充通用 `dialog.tsx`、`tabs.tsx` 封装，然后在 `page-builder` 中使用这些 primitives 组合出 CMS 浏览弹框。

原因：

- 现有 `page-builder` 已明确选择共享 app renderer 的基础 UI，而不是复制一份本地 `components/ui`
- 将通用组件放在共享层更符合当前 alias 和依赖关系
- Dialog/Tabs 本身并不是 CMS 专属组件，后续其他 Builder 功能也可复用

备选方案：

- 只在 `page-builder` 本地创建临时封装：短期可行，但会进一步分叉基础 UI 层
- 直接在业务组件里裸用 Radix primitives：实现更快，但会让样式和语义分散在业务文件中

### 4. 新增 `page-builder` 专用 CMS 浏览 HTTP 路由，由 renderer 通过共享 `api` client 访问

CMS 浏览弹框不会直接调用 Agent runtime custom tools，而是走标准的 HTTP UI 读链路。具体上新增两类路由：

- `GET /api/page-builder/cms/catalogs`
- `GET /api/page-builder/cms/contents`

这两个路由位于 `apps/app/src/main/http/routes/page-builder.ts`，内部继续复用 `CmsGateway` 完成 CMS 请求、归一化与错误翻译。renderer 侧则在现有 `apps/app/src/renderer/lib/api.ts` 中新增对应方法，由 `BuilderPage` 或专用 hook 调用。

原因：

- custom tools 适合 Agent 运行时，不适合给浏览器 UI 直接消费
- HTTP route 可以自然承接 UI 侧的 loading、empty、error 状态，并复用现有请求错误处理模式
- 这样能保持 CMS 凭据、Cookie 和上游地址完全留在宿主侧

备选方案：

- renderer 直接调用 CMS：会暴露内部地址和鉴权语义，也会引入 CORS 与安全边界问题
- renderer 通过 Agent 发一轮 tool 调用再回显：链路太绕，不适合稳定 UI 状态管理
- 在 main 侧额外实现一套非 `CmsGateway` 的 CMS client：会重复鉴权和归一化逻辑

### 5. 将 CMS 浏览相关请求 / 响应类型提升到 `@proma/shared`

当前 `CmsGateway` 的 `NormalizedCmsCatalog`、`NormalizedCmsContentSummary`、`NormalizedCmsCatalogList`、`NormalizedCmsContentList` 仅存在于 main 实现文件中。为了让 renderer 的 API client 和业务组件安全消费这些数据，本次会把浏览弹框需要的 query/result 类型抽到 `packages/shared`，形成稳定的 HTTP 合约。

建议新增一组共享类型，例如：

- `PageBuilderCmsCatalogQuery`
- `PageBuilderCmsContentQuery`
- `PageBuilderCmsCatalog`
- `PageBuilderCmsCatalogList`
- `PageBuilderCmsContentSummary`
- `PageBuilderCmsContentList`

main 侧 route 和 renderer 侧 `api` client 共同依赖这套类型，`CmsGateway` 内部再映射到相同结构。

原因：

- 避免 main / renderer 各自声明一套近似结构并逐渐漂移
- 让后续 specs、测试和前端组件能基于同一份 contract 演进
- 这也符合当前项目对 `PageBuilderProjectSummary` 等跨层数据结构的处理方式

备选方案：

- 在 renderer 里复制一套本地类型：短期快，但很容易和 main 侧实际返回形状脱节
- 让 renderer 直接依赖 main 文件类型：会破坏分层边界，构建链路也不成立

### 6. 弹框数据采用“按需加载 + 会话内缓存”策略，而不是 Builder 页首屏预取

CMS 浏览数据不参与 Builder 首屏渲染，因此在进入 Builder 时不做预取。弹框首次打开时请求栏目树，并在当前页面会话内缓存栏目结果；内容列表仅在进入 `内容` 页签且已有选中栏目时请求。栏目切换后按当前栏目重新读取内容列表。

推荐状态模型：

- `isOpen`
- `activeTab`
- `selectedCatalogId`
- `expandedCatalogKeys`
- `catalogsState`
- `contentsState`

其中 `catalogsState` 和 `contentsState` 各自维护 `idle/loading/error/ready`，互不阻塞。

原因：

- CMS 数据并不是每次进入 Builder 都会马上用到，首屏预取只会增加噪音和等待
- 按需加载可以把失败范围收敛在弹框内部，而不污染整个 Builder 页
- 会话内缓存可以降低反复打开弹框时的重复请求成本

备选方案：

- Builder 首屏预取全部 CMS 数据：会放大 Builder 初始化成本，且大多数情况下属于浪费
- 每次切换弹框都全量重载：实现简单，但用户体验不稳定，且会增加上游压力

### 7. `内容` 页签默认复用当前选中的栏目；若尚未选择栏目，则自动选中栏目树中的第一个可用节点

两个页签共用一份 `selectedCatalogId` 状态。在 `栏目` 页签点击树节点后，切到 `内容` 页签时直接显示该栏目下的内容。如果用户还没有手动选择过栏目，则系统在拿到栏目树后自动选择第一个可用栏目，保证 `内容` 页签不会进入“左边有树、右边无任何上下文”的悬空状态。

原因：

- 共享选中状态可减少两个页签之间的心智切换
- 自动初始化一个栏目可避免内容页初始空白过重
- 这比为首版增加“请先选栏目”的额外一步更顺手

备选方案：

- 两个页签各自维护独立选中项：实现复杂，而且用户切换页签时容易丢失上下文
- `内容` 页签始终要求手动先选栏目：交互更显式，但首版使用成本更高

### 8. 内容列表首版仅展示稳定字段，不承诺时间、状态或选择行为

右侧内容列表的每一行只依赖当前已经稳定存在于归一化结果中的字段：

- `title`
- `summary`
- `shape`
- `assetCounts`
- `publishUrl`（存在时作为外链或辅助信息）

不会在首版中依赖尚未稳定归一化的发布时间、审核状态、封面缩略图或选择确认状态。内容列表也不会引入 checkbox、选中态或底部确认区。

原因：

- 当前 `CmsGateway` 归一化结果已经能稳定提供上述字段，足够支撑浏览目标
- 提前承诺更多业务字段会迫使后端归一化 contract 扩张，偏离本次只读浏览范围
- 这也能让后续“内容选择并填充”变更保持独立

备选方案：

- 直接复刻 CMS 原页面字段：会把上游异构字段未经收敛地传到 UI 层
- 首版就加入选中态与确认按钮：和当前 proposal 明确范围冲突

### 9. 本次不将 CMS 浏览弹框与页面区块选择模式联动

虽然入口位于与“选择进行编辑”相同的动作区，但 CMS 浏览弹框的打开、切页、栏目选择和内容列表加载都独立于 `selectionActionState`。当前预览桥只返回 `selector`，没有 block schema 或内容约束信息，因此本次不尝试做“根据已选区块过滤 CMS 内容”或“打开弹框后自动回填目标区域”的行为。

原因：

- 当前数据不足以支撑可靠的 block-aware 内容过滤
- 把浏览弹框做成独立能力，可以先验证 CMS 浏览 UI 和 HTTP 链路本身是否稳定
- 避免把本次变更范围和后续“内容填充”变更耦合在一起

备选方案：

- 打开弹框前必须先选中页面区域：会强行耦合两个尚未建立契约的流程
- 按 `selector` 猜测 block 类型：脆弱且难以测试

## Risks / Trade-offs

- [`@rc-component/tree` 不是纯 headless 组件，样式接管成本高于 headless 方案] → 在 `CmsCatalogTree` 外层包一层受控渲染和本地样式，尽量不要让默认样式主导 Builder 视觉
- [CMS 浏览相关类型从 main 侧抽到 `@proma/shared` 时，若命名或字段边界不清晰，后续容易再漂移] → 仅抽出 UI 真正消费的 query/result contract，不把内部实现细节一起暴露
- [内容列表首版不提供搜索和分页控件，在大栏目下浏览效率有限] → 保留分页元数据和 query 类型，为后续独立变更扩展搜索/分页 UI 留出口
- [弹框首次打开时才加载栏目，会引入一次可感知等待] → 将栏目结果缓存到当前 Builder 会话内，后续重复打开直接复用
- [CMS 配置缺失或登录态失效时，用户只能在弹框中看到错误态] → 让 route 返回明确、脱敏的错误信息，并在弹框内提供重试入口

## Migration Plan

1. 在 `packages/shared` 中新增 page-builder CMS 浏览相关的 query/result 类型并导出。
2. 在 `apps/app/src/main/http/routes/page-builder.ts` 中新增 CMS 栏目与内容列表读取接口，复用 `CmsGateway` 和现有 CMS 配置解析。
3. 在 `apps/app/src/renderer/lib/api.ts` 中新增对应的 page-builder CMS API 方法。
4. 在共享 renderer UI 层补充 `dialog` / `tabs` primitives，并在 `apps/page-builder/package.json` 中加入所需依赖。
5. 在 `page-builder` 侧新增 `CmsBrowserDialog`、`CmsCatalogTree`、`CmsContentList` 及其状态 hook，并接入 `BuilderPage` 的 composer action 区域。
6. 为路由、状态流和核心交互补充测试，重点覆盖栏目加载、内容加载、错误态和弹框开关。
7. 若需回滚，可移除 Builder 页入口按钮并下线 `/api/page-builder/cms/*` 路由；宿主侧 `CmsGateway` 可继续保留供 Agent SDK tools 使用。

## Open Questions

- 是否需要在本次实现中顺手提供内容列表分页控件，还是仅保留分页 contract、把分页 UI 留到后续变更处理？
