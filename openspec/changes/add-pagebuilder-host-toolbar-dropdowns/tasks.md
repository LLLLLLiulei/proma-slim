## 1. 共享契约与归一化

- [x] 1.1 扩展宿主工具栏共享类型，支持普通按钮与 `type: "dropdown"` 下拉按钮联合类型，并新增下拉项类型、下拉项数量上限和必要导出。
- [x] 1.2 扩展宿主工具栏归一化与严格校验逻辑，覆盖 `type` 默认值、下拉 `items`、下拉项字段白名单、数量限制、ID 格式和重复 ID 处理。
- [x] 1.3 补充共享类型测试，覆盖普通按钮兼容、合法下拉按钮归一化、非法下拉项拒绝/丢弃、敏感字段不透传和数量上限。

## 2. CMS 集成后端

- [x] 2.1 扩展 CMS handoff / Builder Access Session runtime 记录类型，使归一化后的下拉按钮和下拉项可随 builder handoff 保存并进入 builder context。
- [x] 2.2 补充 CMS handoff route 测试，覆盖合法下拉按钮保存、非法下拉配置返回 `400 invalid_request`、敏感字段不落盘和 preview handoff 忽略工具栏扩展。
- [x] 2.3 补充 builder context 测试，覆盖返回归一化下拉按钮、无扩展时返回空列表、访问校验失败时不返回 `hostToolbarExtensions`。

## 3. 前端宿主消息协议

- [x] 3.1 扩展宿主桥消息类型，使 `ready.capabilities` 包含下拉能力标记，并使 `toolbar-button-click` 支持可选 `itemId`。
- [x] 3.2 调整 `BuilderPage` 宿主工具栏状态和点击回调，普通按钮点击保持原消息结构，下拉项点击发送 `buttonId` 和 `itemId`。
- [x] 3.3 补充 `BuilderPage` 测试，覆盖 ready 能力标记、下拉项点击消息不包含敏感信息、非同源父页面消息仍被忽略、`toolbar-buttons-set` 可替换包含下拉按钮的集合。

## 4. PreviewPane 下拉 UI

- [x] 4.1 在预览工具栏宿主扩展区域新增受控下拉按钮渲染，复用现有按钮视觉风格，并确保下拉菜单由 PageBuilder 自己渲染。
- [x] 4.2 实现顶层下拉按钮和下拉项的 `disabled`、`busy`、`hidden`、`requiresPreview` 行为；点击可用下拉项后关闭菜单并触发宿主点击回调。
- [x] 4.3 补充 `PreviewPane` 测试，覆盖下拉按钮展示位置、菜单项渲染、隐藏项不展示、禁用项不触发、无预览时 `requiresPreview` 禁用、普通按钮行为不回归。
- [x] 4.4 检查窄屏和长文案样式，确保下拉触发器和菜单项文本截断，不覆盖相邻按钮或预览内容。

## 5. 文档与验证

- [x] 5.1 更新 CMS 集成 API 文档，补充 dropdown 配置 schema、点击消息 `itemId`、`toolbarDropdowns.v1` 能力标记、动态替换方式和安全限制。
- [x] 5.2 运行聚焦测试：共享工具栏类型测试、CMS 集成 route 测试、`BuilderPage` 测试和 `PreviewPane` 测试。
- [x] 5.3 运行 `bun run typecheck` 和必要的 OpenSpec 校验，确认变更文档、类型和实现一致。
