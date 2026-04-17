## Context

当前 page-builder 的 CMS 选择链路已经打通了站点选择、目标选择上下文、自动 handoff、正式 `apply_cms_binding` 与 shared rendering runtime，但“选择结果”仍然主要反映 UI 勾选状态，而不是可直接执行的数据来源语义。

现状的主要错位有四个：

1. 栏目页签只能稳定表达“固定栏目集合”，无法表达“当前父栏目下的子栏目集合”。
2. 内容页签虽然已经依赖左侧当前栏目浏览内容，但确认结果只能输出固定 `contentIds`，不能表达“当前栏目下的内容列表”。
3. 正式 apply tool 与 runtime 只支持查询式 props，不支持 fixed-ids 模式。
4. agent 当前仍然把“栏目 = nav”“固定内容 = incompatible”当作主要判定规则，无法根据当前被选区块决定导航条、栏目图文列表或内容图文列表。

这次变更是一次横跨 shared types、renderer、宿主读取链路、正式 apply tool、preview / export / validator 的 cross-cutting contract 升级，因此需要在实现前先把来源模式、组件 props、取数边界与降级语义写死。

## Goals / Non-Goals

**Goals:**
- 将 CMS 选择结果升级为四类可执行来源模式：
  - `catalogs-by-parent`
  - `catalogs-by-ids`
  - `contents-by-catalog`
  - `contents-by-ids`
- 让浏览弹框、auto handoff、skill、apply tool、preview、static export 与 validator 围绕同一来源模型工作。
- 继续沿用 `cms-catalog` / `cms-content` 两个作者态组件，不新增新的 `cms-*` 标签。
- 为 fixed-ids 模式提供受控取数路径，并明确禁止通过全量栏目树或整站内容列表退化实现。
- 将“数据来源语义”和“区块呈现语义”拆开：来源模式由 CMS 选择结果决定，`nav` / `catalog-list` / `content-list` 由当前目标区块决定。
- 明确 fixed-ids 的失效策略：部分失效默认丢弃并保序，全部失效进入 empty。

**Non-Goals:**
- 不在本 change 中引入新的自由查询 DSL，例如任意组合筛选条件、排序规则、latest-N 查询语言或 alias 查询。
- 不在本 change 中引入新的作者态组件名称；仍然只使用 `cms-catalog` 与 `cms-content`。
- 不在本 change 中支持递归后代栏目集合；`catalogs-by-parent` 只表示“当前父栏目下的直接子栏目”。
- 不在本 change 中扩大到轮播、多区块联动、append / merge 或整页重排策略。
- 不要求上游 CMS 必须提供 batch API；宿主可以使用等价的 host-managed 精确读取实现。

## Decisions

### 1. 选择结果改为“来源模式优先”，不再让下游从 UI 状态猜业务语义

本次 change 采用四类 `sourceType` 作为中心模型：

- `catalogs-by-parent`
- `catalogs-by-ids`
- `contents-by-catalog`
- `contents-by-ids`

对应的 durable payload 分别是：

- `catalogs-by-parent` -> `parentCatalogId`
- `catalogs-by-ids` -> ordered `catalogIds`
- `contents-by-catalog` -> `catalogId`
- `contents-by-ids` -> `catalogId + ordered contentIds`

`snapshot` 只保留与当前来源模式直接相关的对象：

- `snapshot.parentCatalog`
- `snapshot.catalogs`
- `snapshot.catalog`
- `snapshot.contents`

这样做的原因是：

- 下游不需要再根据 “在哪个 tab”“数组是不是空”“当前高亮了谁” 来猜真实含义。
- 自动 handoff 和 skill 可以稳定消费来源模式，而不是依赖 prompt 描述。
- future changes 可以围绕来源模式扩展，而不是持续扩充 UI 分支。

备选方案：

- 继续沿用 `catalogs` / `contents-fixed`，让 skill 再结合 UI 状态推断动态查询语义。
  放弃原因：信息不稳定，且会让 preview / export / apply tool 的输入持续分叉。

### 2. “仅高亮当前栏目”和“勾选固定项”表达不同来源，且固定项优先

浏览弹框确认逻辑统一采用如下规则：

- 栏目页签：
  - 有勾选栏目 -> `catalogs-by-ids`
  - 无勾选栏目 + 当前高亮栏目 -> `catalogs-by-parent`
- 内容页签：
  - 有勾选内容 -> `contents-by-ids`
  - 无勾选内容 + 当前高亮栏目 -> `contents-by-catalog`

额外约束：

- `catalogs-by-parent` 只针对“直接子栏目”。
- 当当前栏目没有直接子栏目时，禁止按 `catalogs-by-parent` 确认。

这样做的原因是：

- 可以复用现有的“左侧高亮 / 右侧勾选”UI，不必新增另一层模式切换。
- “固定集合”和“当前栏目驱动的动态集合”在 UI 上的触发动作不同，天然可区分。
- 固定项优先规则简单、稳定，避免出现一个确认结果同时表达两种来源。

备选方案：

- 增加显式模式开关，例如“按当前栏目”/“按勾选项”。
  放弃原因：会增加 UI 与状态复杂度，而当前已有的 selected/checked 区分已经足够表达。

### 3. 数据来源语义与区块呈现语义分离

本次 change 明确把“选了什么数据”和“要渲染成什么块”拆开：

- CMS 选择结果只表达数据来源。
- 当前目标区块表达渲染语义：
  - `nav`
  - `catalog-list`
  - `content-list`

`cms-binding-apply` skill 必须先结合目标区块语义决定本次呈现类别，再选择要生成 `cms-catalog` 还是 `cms-content`。

对应规则：

- `catalogs-by-parent` / `catalogs-by-ids`
  - 可映射到 `nav`
  - 也可映射到 `catalog-list`
- `contents-by-catalog` / `contents-by-ids`
  - 映射到 `content-list`

当栏目来源对应的目标区块无法稳定判断是 `nav` 还是 `catalog-list` 时，skill 只允许发起一次短澄清。

这样做的原因是：

- 同一批栏目数据既可能是顶部导航，也可能是栏目卡片列表，不能由 CMS 选择器硬编码。
- 内容固定 ids 也不应该再因为“不是动态 catalog query”就被直接判为 incompatible。

备选方案：

- 继续把 `catalogs` 强绑定成 `nav`，把 `contents-fixed` 视为 incompatible。
  放弃原因：与用户真实使用方式不符，也会导致明明能渲染的区块被无谓拒绝。

### 4. 继续沿用 `cms-catalog` / `cms-content`，通过 `ids` 扩展 fixed-ids 来源

本次不新增新的 `cms-*` 标签，而是扩展现有组件：

- `cms-catalog`
  - 查询式：`level="children" + parent-id="..."`
  - fixed-ids：`ids="101,102,103"`
- `cms-content`
  - 查询式：`catalog-id="101"`
  - fixed-ids：`catalog-id="101" + ids="501,502,503"`

`ids` 是作者态显式属性，要求：

- 使用稳定顺序序列化
- 不与冲突的查询 props 混用
- `cms-content` 必须始终显式写出 `catalog-id`
- `cms-content` 在 fixed-ids 模式下额外写出 `ids`

这里保留当前正式 apply tool 的大体形态，不额外引入新的组件族。`apply_cms_binding` 生成的 slot 模板仍然只承载 slot 内部内容，主要动态容器继续放在 slot 中。

这样做的原因是：

- 避免引入第三、第四个 `cms-*` 标签，减少作者态学习成本。
- 与现有 preview / export / manifest / validator 架构最一致。
- 组件级来源模式切换比新增标签更容易被 mutation pipeline 与 manifest 复用。

备选方案：

- 新增 `cms-catalogs` / `cms-contents` 或 `cms-fixed-content` 一类新组件。
  放弃原因：会把同一数据族拆成多个作者态标签，增加扫描、校验、SSR 与使用心智复杂度。

### 5. fixed-ids 必须走宿主管理的精确取数路径，禁止全量加载回退

fixed-ids 模式的核心约束是：

- 宿主读取链路只读取被请求的 ids
- 对于固定内容 ids，宿主读取链路必须以单一 `catalogId` 为上下文
- 允许 batch API、单条 detail 并发或等价 host-managed 实现
- 明确禁止：
  - 加载整棵栏目树后本地过滤
  - 加载整站内容列表后本地过滤

这条约束同时适用于：

- preview
- static export
- shared runtime client
- 宿主 gateway / host read path

这样做的原因是：

- fixed-ids 的语义本来就是“精确对象集合”，不应该退化成全量扫描。
- 大站点的栏目树和内容列表规模不可控，全量加载会让 preview/export 成本失真。
- 一旦允许全量回退，fixed-ids 的 contract 就会在实现阶段被悄悄破坏。

备选方案：

- 栏目 fixed-ids 先通过全量栏目树过滤实现，后续再优化。
  放弃原因：这会把临时实现固化成长期行为，并且直接违背这次 change 的性能边界。

### 6. fixed-ids 的默认降级策略是“部分丢弃、全部 empty”

宿主 exact-id 读取与组件运行时统一采用如下语义：

- 按输入 `ids` 顺序处理
- 部分 id 失效时丢弃失效项
- 保留其余有效项，顺序不变
- 全部 id 失效时进入 `empty`
- 不因为部分失效把整块升级为 `error`

这里推荐实现侧使用 `Promise.allSettled` 或等价语义，而不是任何单条失败即整体失败的聚合方式。

这样做的原因是：

- fixed-ids 主要对应人工精选集合，个别数据失效不应拖垮整个区块。
- 用户已经明确要求默认丢弃失效项。
- “全部失效 = empty” 更符合页面体验，而不是把数据缺失误判为系统故障。

备选方案：

- 任一 id 失效就进入 error。
  放弃原因：对编辑体验过于脆弱，也不符合用户预期。

### 7. validator / manifest 把 `ids` 视为第一类来源属性

作者态管线必须和运行时来源模型一致：

- manifest props 保留 `siteId` 与 ordered `ids`
- validator 接受 `ids`
- `cms-content` 的来源约束更新为：
  - `catalog-id` 与 `ids` 二选一
- `cms-catalog` 的来源约束更新为：
  - `ids` 不得与 `level` / `parent-id` / `content-type` / `search-keyword` / `take` 混用

这样做的原因是：

- 如果 manifest / validator 不理解 `ids`，apply 和 runtime 即便支持，也会在派生与诊断链路里失真。
- 这类错误必须在作者态尽早暴露，而不是拖到 preview / export 才发现。

备选方案：

- 只在 runtime 层接受 `ids`，manifest / validator 暂时忽略。
  放弃原因：会让写后派生结果与真正运行行为脱节。

## Risks / Trade-offs

- [Change 触及 shared types、UI、skill、apply tool、runtime、preview、export，多模块同时演进] → 通过 `sourceType` 作为单一中心模型，把变更收敛为一条统一 contract 升级，而不是各层各自发明新字段。
- [当前 `apply_cms_binding` 的 `kind` 命名仍偏旧，`catalog-nav` 在语义上会同时服务 `nav` 和 `catalog-list`] → 本次先保持正式 tool surface 稳定，把“区块呈现语义”放到 skill 决策层；后续若需要再单独清理命名。
- [宿主 fixed-ids 读取路径可能受上游 API 能力限制] → 规格只要求“受控取数、禁止全量回退”；栏目 fixed-ids 可以用 batch 或并发单条读取完成，内容 fixed-ids 可以在单一 `catalogId` 下分页读取后本地过滤保序。
- [fixed-ids 默认丢弃失效项会让部分数据缺失不再显性失败] → 保留日志或诊断摘要用于排查，但页面渲染语义仍然保持非阻断。
- [从 `nav | content-list` 扩到 `nav | catalog-list | content-list` 后，老的 blockTypeHint / 测试契约需要同步更新] → 将区块语义扩展视为本 change 的一部分，在 shared types、skill contract 和相关测试中统一升级。

## Migration Plan

1. 升级 shared CMS selection / apply contract，增加新的 `sourceType` 与 durable payload 字段，并同步更新 browser dialog 的确认逻辑。
2. 更新 auto handoff 与 `cms-binding-apply` skill，使其优先依据新的来源模式和目标区块语义做决策。
3. 扩展 `apply_cms_binding` 与 shared rendering core，使 `cms-catalog` / `cms-content` 支持 `ids` 来源，并补齐 manifest / validator / preview / export 对 `ids` 的理解。
4. 在宿主管理的 CMS 读取链路中实现 fixed-ids 精确取数能力，并在 preview / export / runtime 中统一复用。
5. 补全覆盖 source modes、失效项丢弃、无子栏目禁止确认、短澄清路径与 exact-id 非全量读取的测试。

回滚策略：

- 如果新来源模式在实现中出现问题，可以停止生成和消费新的 `sourceType`，回退到旧的 selection contract 与查询式绑定逻辑。
- 旧页面作者态不依赖 `ids` 属性，因此保留向后兼容；移除 fixed-ids 生成路径即可恢复旧行为。

## Open Questions

- 当前没有阻塞本 change 的开放问题。实现时只需要在宿主读取层根据实际可用的上游 CMS 接口，在“栏目 fixed-ids 精确读取”和“内容 fixed-ids 单栏目分页过滤”之间选择合适实现方案，但这不影响本次 contract 与能力边界。
