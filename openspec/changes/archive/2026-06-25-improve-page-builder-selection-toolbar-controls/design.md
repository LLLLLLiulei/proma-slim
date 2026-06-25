## Context

当前 Builder 页的选区链路由预览 iframe 内的 preview bridge 负责命中 DOM、绘制 hover/selected overlay，并通过 `postMessage` 把 `targetSelection`、rect、displayLabel 和能力信息上报给父页面。父页面 `PreviewPane` 根据上报结果展示锚定区块工具条，`BuilderPage` 将选中目标注入下一条 Agent 消息。

现有命中策略偏向“点击到什么就选什么”，在卡片列表、图文网格、CMS 渲染列表等场景下容易选中内层卡片或子元素。父页面无法可靠直接访问 iframe 内 DOM，因此“选择上一级”必须由 preview bridge 在 iframe 内基于当前选中目标执行，再把新的选区结果回传父页面。

## Goals / Non-Goals

**Goals:**

- 在已选目标的浮动工具条中提供 `选择上一级` 和 `取消选择` 两个就地操作。
- 让普通 block 可以从当前选中元素逐级提升到最近可选父元素，并刷新 selector、rect、label 与能力信息。
- 让 `cms-island` 的 `选择上一级` 提升为其 `parentBlockSelector` 对应的普通 block，保持 CMS 渲染子节点不可下钻的 source-atomic 语义。
- 确保取消选择同时清空 iframe overlay、父页面选区状态、右侧当前选中提示和下一条消息隐藏上下文。
- 保持现有 `PageBuilderTargetSelection` 类型和后端写入 API 不变。

**Non-Goals:**

- 不引入多选、框选、面包屑层级导航或完整 DOM 层级面板。
- 不改变默认点击命中策略，不把普通点击改成默认优先选择外层区块。
- 不允许选择 `body` / `html` / `head` 或脚本样式等非内容边界。
- 不把 `cms-island` 渲染子节点变成普通 block 目标，也不改变 CMS source-atomic 写入边界。
- 不修改 Agent 消息格式之外的后端 mutation API、CMS apply API、删除 API 或图片替换 API。

## Decisions

1. **使用 parent message 驱动 iframe 内的父级选择。**
   - 决策：在 `PageBuilderPreviewParentMessage` 中新增 `selection-parent`，由 `PreviewPane` 工具条按钮发送给 iframe。preview bridge 收到后基于当前 `state.selectedTarget` 解析父级目标，再复用现有 overlay 和 selected 回传链路。
   - 理由：父页面不能可靠访问 iframe DOM；让 bridge 执行可以复用当前 selector 生成、rect 计算、label 解析和能力探测。
   - 替代方案：父页面根据 selector 计算父级。拒绝，因为跨 iframe、sandbox、CMS runtime DOM 和滚动坐标都不可靠。

2. **普通 block 的上一级选择只提升到最近可选父元素。**
   - 决策：从 `selectedTarget.primaryElement.parentElement` 开始向上查找，跳过 overlay 和 blocked tags，找到可生成唯一 selector 且可见的父元素后创建新的 `block` target。到达 `body` 以下顶层元素后继续点击 `选择上一级` 不再改变选区。
   - 理由：用户可以逐次点击提升粒度，避免一次性跳到过大的整页区域，也避免把 `body/html` 作为 Agent 写入目标。

3. **CMS island 的上一级选择提升到 parent block。**
   - 决策：当当前目标是 `cms-island`，bridge 使用该目标的 `parentBlockSelector` 查询源所属普通 block，并将其作为 `kind: block` 的选区回传；如果 selector 无法唯一解析，则保持当前 CMS island 选择并不产生错误。
   - 理由：CMS island 本身是 source-atomic 目标，不能把渲染子节点当作普通源码节点；但用户确实可能想从 CMS 局部区域提升到包裹它的整个模块。

4. **取消选择复用现有 clear 协议并由父页面同步清理。**
   - 决策：工具条中的 `取消选择` 在父页面调用现有 `clearSelection`，同时向 iframe 发送 `selection-clear`。iframe 清除 hover、selected、inline editing 和 overlay；父页面清除 composer notice 和 messageDecorator。
   - 理由：现有退出选区模式和预览刷新已经依赖该清理语义，复用可降低状态分叉。

5. **工具条根据当前选区和交互锁动态启用动作。**
   - 决策：`选择上一级`、`取消选择` 与现有 CMS / 替图 / 删除动作共用 `actionsDisabled`。当当前目标无法提升父级时，`选择上一级` 显示为 disabled 或点击无效，但不得抛错或清空当前选区。
   - 理由：Agent 运行中、编辑锁失效或预览重载期间不能产生新的选区状态；禁用比静默失败更清晰。

## Risks / Trade-offs

- **Risk: 父级 selector 不稳定或不唯一。** → Mitigation: 复用 bridge 现有 `resolveSelector` 和唯一性检查；无法解析时保持当前选区，不伪造目标。
- **Risk: 用户连续上提后选中过大的顶层容器。** → Mitigation: 不允许选中 `body/html`，并在右侧继续显示当前选中 label；后续可另起变更增加层级面包屑或视觉范围提示。
- **Risk: CMS island parent block 查询失败。** → Mitigation: 保持当前 `cms-island` 选区和 overlay，不改变隐藏上下文，不报错打断用户。
- **Risk: 取消选择只清父页面或只清 iframe 导致状态不一致。** → Mitigation: 父页面清理本地状态并发送 `selection-clear`，bridge 收到后清理 overlay；现有 reset 消息仍作为兜底。
- **Risk: 工具条变宽导致锚定位置溢出。** → Mitigation: 更新工具条宽度估算，继续使用现有 clamp 逻辑限制在预览 viewport 内。

## Migration Plan

- 扩展共享 parent message 类型和 preview bridge protocol，新增 `selection-parent` 命令。
- 在 bridge selection runtime 中新增父级目标解析能力，并保持普通 block 与 `cms-island` 的不同边界。
- 更新 `PreviewPane` 和 `PageBuilderBlockActionBar`，展示并触发 `选择上一级` / `取消选择`。
- 更新 `BuilderPage` 清理逻辑，确保工具条取消选择与右侧 composer notice 行为一致。
- 增加 targeted tests 覆盖 bridge 父级选择、工具条按钮、取消选择、CMS island 上提和禁用态。
- 回滚时可移除新增按钮和 `selection-parent` 分支，现有点击选择、CMS、删除、替图路径不需要数据迁移。

## Open Questions

无当前阻塞问题。后续如果需要更强的层级选择体验，可另起变更设计“选区层级面包屑”或“按住快捷键直接选择外层容器”。
