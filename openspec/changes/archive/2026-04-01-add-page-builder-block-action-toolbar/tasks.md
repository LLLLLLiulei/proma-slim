## 1. Preview bridge protocol

- [x] 1.1 扩展共享 preview bridge 类型，为 `selected` 消息增加锚定工具条所需的 `rect` 几何信息结构
- [x] 1.2 更新 `page-builder-preview-bridge.js`，在初次选中区块时发送 `selector + rect`
- [x] 1.3 更新 `page-builder-preview-bridge.js`，在已选区块因滚动、resize 或布局变化移动时同步新的 `rect`，并在元素失效时发送 `reset`

## 2. Preview pane block toolbar

- [x] 2.1 在 `PreviewPane` 中新增接收区块级 CMS 操作请求的回调接口，并保持现有 `onSelectionEvent` 链路不变
- [x] 2.2 在 `PreviewPane` 中增加 overlay host 和本地锚定状态，根据 bridge 返回的 `rect` 渲染和隐藏区块工具条
- [x] 2.3 新增 `PageBuilderBlockActionBar` 组件，在工具条中提供 `从 CMS 选择数据` 按钮并将点击回传给父层
- [x] 2.4 在 `PreviewPane` 中实现工具条的基础定位规则，包括下方优先、边界裁剪和空间不足时的上下翻转

## 3. Builder page entry migration

- [x] 3.1 从 `BuilderPage` 的 composer 动作区移除独立的 `浏览 CMS` 按钮，同时保留现有区块选择入口
- [x] 3.2 将“打开 CMS 弹框”回调从 `BuilderPage` 传入 `PreviewPane`，并复用现有 `CmsBrowserDialog` 开关状态
- [x] 3.3 确认通过区块工具条打开 CMS 弹框时保留当前已选区块状态，且不引入自动应用或额外消息发送逻辑

## 4. Verification

- [x] 4.1 更新 `BuilderPage` 测试，移除 composer 侧 `浏览 CMS` 断言并补充区块工具条打开 `CmsBrowserDialog` 的断言
- [x] 4.2 更新 `PreviewPane` 测试，覆盖工具条显示、跟随选中区块更新、隐藏和按钮点击回调行为
- [x] 4.3 补充或更新 preview bridge / shared type 测试，验证扩展后的 `selected + rect` 协议和失效重置行为
