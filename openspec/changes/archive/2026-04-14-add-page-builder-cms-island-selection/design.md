## Context

`page-builder` 当前把预览选择目标建模为普通 DOM / block selector。这个模型适用于静态 HTML 区块，但不适用于 `cms-catalog` / `cms-content` 这类“源代码中是单个 CMS 标签、预览中却渲染为一整块运行时 DOM”的组件。结果是预览层会把 CMS 渲染出的 `li`、`a`、`img`、`h3` 等子节点误当作独立选择目标，而 agent 端只能看到 block-scoped selector，无法知道用户实际上选中的是一个必须整体更新的源 CMS 组件。

当前实现还存在两个额外约束：

- CMS preview bootstrap 已经去掉了额外 wrapper，以避免破坏 `ul > li`、表格、Flex/Grid 等语义结构。
- 现有 CMS apply / delete / auto handoff contract 主要围绕 `targetBlock.selector` 工作，默认语义是“围绕整个 block 修改”，与“只更新选中的源 CMS 标签”不一致。

这次变更需要同时解决预览交互、agent 选择上下文和正式写入边界的一致性问题。

## Goals / Non-Goals

**Goals:**

- 将 `cms-catalog` / `cms-content` 渲染结果定义为一类独立的 `cms-island` 选择目标，而不是普通 block 的子节点。
- 在选择模式下，对 CMS island 展示整块虚线框与右上角组件名，并禁止对子节点继续下钻选择。
- 向 agent 与 CMS auto handoff 显式传递“这是 source-atomic CMS 组件”的结构化语义，避免模型把渲染子节点当作独立源码节点修改。
- 让删除与 CMS rebinding 精确作用于选中的源 CMS 标签本身，而不是误删 / 误替换整个 parent block。
- 保持普通 block 的现有选择、删除、内联编辑和图片替换能力不退化。

**Non-Goals:**

- 不在本 change 中重新设计 CMS 组件的 SSR / preview 渲染机制。
- 不引入新的 CMS 查询能力，如 fixed `contentIds` 运行时绑定、alias 查询或多组件编排。
- 不把普通静态区块统一改造成 selection-scoped component model；本 change 仅扩展 CMS island 目标。
- 不在本 change 中处理“一个选择同时跨越多个 CMS island”的复合编辑。

## Decisions

### 1. 引入统一的 `targetSelection` 模型，并把 `cms-island` 定义为 source-atomic 目标

系统将新增统一的 page-builder 选择目标模型：

- `kind: 'block' | 'cms-island'`
- `selector`: 当前动作真正要操作的源选择器
- `parentBlockSelector`: 所属 block selector
- `component`: `cms-catalog` / `cms-content`（仅 `cms-island`）
- `editBoundary`: `block` 或 `source-atomic`

该模型必须作为隐藏选择上下文、CMS 选择结果、自动 handoff 和正式 apply 的统一目标入口；普通静态区块也通过 `targetSelection.kind: block` 表达，而不是继续维持独立的 selector-only payload。对 `cms-island` 来说，`selector` 指向源 HTML 中原始的 CMS 标签，而不是预览里某个渲染后的 DOM 子节点。`parentBlockSelector` 保留布局上下文和兼容旧链路的锚点，但不再是 CMS 写入的唯一事实目标。序列化时，普通 block 必须输出 `editBoundary: block`，`cms-island` 必须输出 `editBoundary: source-atomic`。

选择这个方案，而不是继续只传 `targetBlock.selector`，是因为用户的真实意图是“选中 CMS 组件整体并整体修改”，而不是“选中 parent block 后自由改里面的预览 DOM”。

备选方案：

- 继续只传 `targetBlock.selector`
  - 拒绝原因：无法让 agent 知道选中的是源 CMS 标签整体，也无法在混合 block 中精确替换单个 CMS 标签。
- 让 agent 只看自然语言说明“这是 CMS”
  - 拒绝原因：运行时 contract 不稳定，后续工具无法基于自然语言做严格写入护栏。

### 2. Preview 侧通过 DOM metadata 建立 CMS island 边界，不重新引入 wrapper

CMS preview bootstrap 将在原始 CMS host 仍存在时，为每个 island 计算稳定的 source identity，并在渲染完成后把 island metadata 绑定到该 island 的渲染根节点集合上。preview bridge 将消费这些 metadata，把命中的任意 CMS 渲染子节点统一提升为对应的 `cms-island` 目标。

实现原则：

- 不重新引入额外包裹节点
- 不依赖运行时去猜测某个 `li` / `img` 属于哪个 CMS island
- 允许一个 CMS island 渲染成多个顶层 root，并使用联合包围盒作为虚线框边界

选择 DOM metadata，而不是 wrapper 或运行时 manifest 拉取，原因如下：

- wrapper 会再次破坏语义 DOM 和样式结构
- manifest 拉取更适合作为调试 / 校验资产，不适合作为第一优先的交互命中依据
- DOM metadata 可以直接驱动 `closest(...)` / root grouping，交互链路更稳定

### 3. Preview bridge 将 CMS island 作为不可下钻的整体选择单元

preview bridge 将从“单元素选择”升级为“selection target 选择”：

- hover / click 命中 CMS island 内任意子节点时，目标统一提升到同一 `cms-island`
- overlay 对 `cms-island` 使用虚线框，并在右上角显示真实组件名
- `cms-island` 选中后，不允许继续把内部 `li`、`a`、`img`、`span`、`h3` 等节点当成新的选择目标

普通 block 维持现有行为。

这样做的核心原因不是单纯视觉统一，而是保证“预览中的选择对象”和“源代码中的编辑对象”一致，避免后续 agent 误把运行时 DOM 当作可持久化的静态源码节点。

### 4. Agent-facing selection decoration 必须显式声明 `cms-island` 的 source-atomic 语义

发送给 agent 的隐藏选择上下文将从只注入裸 `selector` 升级为结构化的 selection metadata。对 CMS island，运行时必须明确告诉 agent：

- 这是 `cms-catalog` / `cms-content` 组件
- 当前选中的是该组件渲染出来的预览结果
- 源代码真正对应的是一个 CMS 标签边界
- 修改时必须整体更新该源 CMS 组件，而不是把渲染子节点当作独立源码节点增删改

同一套隐藏上下文 contract 也适用于普通静态区块：系统必须统一发送 `targetSelection`，其中 block 目标显式使用 `kind: block` 与 `editBoundary: block`，而不是让部分路径继续退回旧的 block-only 裸 selector 语义。

这个 decision 是本 change 的关键，因为用户最终目标不是“更好看地框起来”，而是“后续让 agent 调整时仍保持 CMS 组件边界不被破坏”。

### 5. 删除与 CMS rebinding 采用 selection-scoped 源标签操作语义

当当前目标是 `cms-island` 时：

- 删除：只删除源 HTML 中唯一命中的 CMS 标签本身
- 从 CMS 选择数据：只替换当前源 CMS 标签本身

系统不得因为该 CMS 标签位于某个 block 内，就自动删除或覆盖整个 parent block，也不得删除同 block 中的静态兄弟节点。

为了平滑迁移，设计上允许保留 `parentBlockSelector` 作为上下文字段，但实际写入语义以 `targetSelection.selector` 为准。

备选方案：

- 继续沿用 block-scoped 删除 / apply
  - 拒绝原因：会误伤 CMS island 周围的静态兄弟节点，和用户确认的目标相违背。

### 6. CMS island 不暴露 inline text editing 和 image replacement

已选 `cms-island` 不提供预览文字内联编辑，也不提供 replace-image 能力。原因是这些热点都要求“预览命中的节点能稳定映射回静态 HTML 中唯一的文本 / 图片节点”，而 CMS 渲染子节点本身不满足这个条件。

如果后续需要支持 CMS 模板级文本或图片编辑，应通过修改 CMS 组件的 slot template / props 来实现，而不是复用现有针对静态 HTML 的内联编辑与图片替换通道。

## Risks / Trade-offs

- [联合包围盒可能覆盖空白区域] → 对多 root CMS island 采用联合包围盒会比真实内容边界略大，但能保持“不加 wrapper”与“整块选择”的核心目标。
- [跨模块 contract 改动较多] → 通过新增 `targetSelection` 并保留 `parentBlockSelector` 作为辅助字段，降低迁移期间的接口震荡。
- [现有 block-scoped 工具需同步迁移] → 在 spec 中显式区分 block target 与 `cms-island` target，并要求写入路径以 `targetSelection.kind` 做分流，避免局部模块继续沿用旧语义。
- [混合 block / 多 island block 的命中更复杂] → 本设计只要求“每个 CMS island 都能独立命中并独立操作”，不额外支持跨 island 复合选择。

## Migration Plan

1. 定义新的 selection target contract，并让 preview bridge 先能上报 `cms-island` 目标。
2. 更新 Builder 页本地选择状态、隐藏消息装饰和 CMS dialog request context，开始消费 `targetSelection`。
3. 更新自动 handoff、apply skill contract 和 formal apply tool，使 CMS 写入改为 selection-scoped。
4. 更新删除、inline text editing、image replacement 等下游动作，对 `cms-island` 走专门分支。
5. 保留 `parentBlockSelector` 作为兼容上下文；后续若 block-only legacy 字段不再需要，可在单独 change 中继续收缩。

回滚策略：

- 如果 preview 侧 metadata 或 selection target 逻辑出现问题，可回退到 block-only selection，同时保持 source HTML 中的 CMS 标签不变。
- selection-scoped 写入必须在所有下游 contract 更新完成后启用；若 apply path 未准备好，不应半启用只改 preview 的部分写入语义。

## Open Questions

- 当前没有阻塞本 change 立项的开放问题。删除与 rebinding 的语义已经确认：两者都只作用于当前选中的源 CMS 标签本身。
