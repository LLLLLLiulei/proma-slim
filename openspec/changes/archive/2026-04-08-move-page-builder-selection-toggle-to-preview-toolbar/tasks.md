## 1. Builder page entry migration

- [x] 1.1 在 `BuilderPage` 中隐藏对话输入区的可见区块选择入口，同时保留现有 `selectionActionState`、`clearSelection` 和消息装饰链路
- [x] 1.2 将预览工具栏所需的区块选择状态、禁用态和切换回调从 `BuilderPage` 传入 `PreviewPane`
- [x] 1.3 确认再次关闭选择模式时继续复用现有清理逻辑，能够同步清空已选区块及相关临时上下文

## 2. Preview toolbar selection control

- [x] 2.1 在 `PreviewPane` 的左侧工具栏控制组中新增图标化区块选择入口，并保留清晰的 `aria-label`、`title` 和 `aria-pressed`
- [x] 2.2 让新的区块选择入口正确映射 `idle`、`armed`、`selected` 三种视觉状态，并在 agent 处理中保持禁用
- [x] 2.3 确保再次点击已激活的区块选择入口时退出选择模式、清空当前选区，并且不影响现有 `PC / Mobile`、导出、刷新和新窗口等预览工具栏操作

## 3. Verification

- [x] 3.1 更新 `BuilderPage` 测试，验证对话输入区不再显示可见的区块选择入口，同时 `PreviewPane` 能接收到新的状态和切换回调
- [x] 3.2 更新 `PreviewPane` 测试，覆盖新区块选择按钮的渲染、激活态、禁用态和再次点击后的清空行为
- [x] 3.3 回归验证已选区块后的消息微调、预览刷新清选区和区块工具条相关测试，确认入口迁移未改变既有选择行为
