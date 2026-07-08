## 1. 共享契约与归一化

- [x] 1.1 新增宿主工具栏扩展按钮与宿主消息协议的共享类型、source 常量和导出入口。
- [x] 1.2 实现扩展按钮归一化与校验逻辑，覆盖按钮数量、重复 ID、字符串长度、枚举白名单和危险字段丢弃/拒绝。
- [x] 1.3 补充共享 contract 单元测试，验证空配置、合法配置、非法字段、重复 ID、超量按钮和长文案处理。

## 2. CMS Handoff 与 Builder Context

- [x] 2.1 扩展 CMS handoff 创建输入和 handoff/access session runtime record，保存归一化后的 `hostToolbarExtensions.buttons`。
- [x] 2.2 在 CMS handoff route 中读取并校验 `toolbarExtensions.buttons`，非法配置返回 `invalid_request` 且不写入 handoff。
- [x] 2.3 扩展 builder context 响应，返回 `hostToolbarExtensions: { buttons: [] }` 或 handoff 关联的归一化按钮列表。
- [x] 2.4 补充 CMS integration route/runtime 测试，覆盖合法按钮下发、非法按钮拒绝、preview handoff 不暴露按钮、builder context 不泄露敏感字段。

## 3. PageBuilder Renderer 宿主 Bridge

- [x] 3.1 更新 renderer API 类型，使 `CmsBuilderContext` 包含 `hostToolbarExtensions.buttons`。
- [x] 3.2 新增 PageBuilder 宿主 bridge 前端逻辑，发送 `ready` 和 `toolbar-button-click`，并只接受同源父页面的 `toolbar-buttons-set` / `toolbar-button-update` 消息。
- [x] 3.3 在 `BuilderPage` 中使用 builder context 初始化扩展按钮状态，并将按钮与点击回调传入 `PreviewPane`。
- [x] 3.4 补充 renderer 单元测试，覆盖 ready 消息、点击消息、同源校验、非法消息忽略、set/update 状态更新。

## 4. PreviewPane 工具栏渲染

- [x] 4.1 扩展 `PreviewPane` props，渲染归一化后的宿主扩展按钮并保持内置按钮顺序和隐藏逻辑不变。
- [x] 4.2 增加受控图标、variant、busy、disabled、hidden、requiresPreview 和长文案截断 UI 行为。
- [x] 4.3 补充 `PreviewPane` 测试，覆盖扩展按钮显示位置、点击回调、busy/disabled 不触发、无预览禁用和长文案不使用危险渲染。

## 5. 文档与验证

- [x] 5.1 更新 CMS 集成文档，说明同源 iframe 下创建 builder handoff 时传入扩展按钮、监听点击消息和回写状态的方式。
- [x] 5.2 运行并修复相关测试：共享类型测试、CMS integration 测试、`BuilderPage` 测试、`PreviewPane` 测试和 TypeScript typecheck。
- [x] 5.3 运行 OpenSpec 校验，确认 `add-pagebuilder-host-toolbar-extensions` 的 proposal、design、specs 和 tasks 状态完整。
