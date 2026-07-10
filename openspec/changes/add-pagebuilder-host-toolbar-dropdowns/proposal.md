## Why

当前 PageBuilder 宿主工具栏扩展只支持扁平按钮。CMS 需要把“发布预览版 / 发布正式版 / 查看发布日志”等相关低频动作收纳到一个工具栏入口下，避免继续增加普通按钮导致预览工具栏拥挤。

本变更在保持现有安全边界和 postMessage 业务边界不变的前提下，为宿主工具栏扩展增加受控下拉按钮能力。

## What Changes

- 在现有 `toolbarExtensions.buttons` 内支持 `type: "dropdown"` 的宿主工具栏入口；未传 `type` 时继续按普通按钮处理。
- 为下拉按钮定义受控 `items` 列表，下拉项仅允许白名单 JSON 字段，例如 `id`、`label`、`tooltip`、`icon`、`disabled`、`hidden` 和 `requiresPreview`。
- PageBuilder 预览工具栏渲染下拉按钮和受控菜单项，点击可用菜单项后继续向同源 iframe 父页面发送 `toolbar-button-click` 消息，并新增可选 `itemId`。
- `ready` 消息增加下拉能力标记，例如 `toolbarDropdowns.v1`；现有 `toolbarExtensions.v1` 和普通按钮点击消息保持兼容。
- `toolbar-button-update` 只更新顶层按钮状态；如需调整下拉项，宿主通过 `toolbar-buttons-set` 替换整组按钮配置。
- 继续禁止宿主传入 React 组件、HTML、SVG、CSS、JavaScript 回调、外部 URL、任意 payload、token 或 Cookie。
- 不引入 PageBuilder 侧的 CMS 发布、送审、跳转或外部 API 业务逻辑；PageBuilder 仍只负责渲染受控 UI 和通知点击事件。
- 无 BREAKING 变更；既有普通宿主按钮配置、builder handoff、builder context 和父页面监听逻辑保持可用。

## Capabilities

### New Capabilities

- `page-builder-host-toolbar-dropdowns`: 定义 PageBuilder 宿主工具栏下拉按钮配置、归一化、渲染、点击通知、动态替换和安全边界。

### Modified Capabilities

- `page-builder-cms-integration`: 扩展 CMS builder handoff 和 builder context 契约，使 CMS 服务端能够为本次 builder 打开传入并接收归一化后的宿主工具栏下拉按钮配置，同时保持 preview handoff 不暴露工具栏扩展。

## Impact

- 影响共享类型和归一化逻辑：`packages/shared/src/types/page-builder-host-toolbar-extensions.ts` 及其测试。
- 影响 CMS 集成后端：builder handoff 请求校验、handoff/access session runtime record、builder context 响应和 HTTP route 测试。
- 影响 PageBuilder renderer：宿主工具栏消息读取、`BuilderPage` 点击消息拼装、`PreviewPane` 下拉菜单渲染和组件测试。
- 影响 CMS 对接文档：补充 dropdown 配置 schema、点击消息中的 `itemId`、能力标记和安全限制。
- 可能复用现有 Popover/Radix 基础组件或新增轻量下拉组件；不得引入宿主可控 DOM 或脚本执行能力。
