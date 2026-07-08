## Context

PageBuilder Builder 页左侧预览区顶部工具栏当前集中在 `PreviewPane` 中，已支持 PC/Mobile 预览切换、选择区块、刷新、新窗口打开、导出静态包和另存模板等内置动作，并通过 `hiddenToolbarItems` 支持隐藏内置项。CMS 集成模式下，外部系统通过 handoff openUrl 以同源 iframe 或新窗口打开 Builder，Builder 再通过 `builder-context` 获取受控项目上下文。

本变更要解决的是 iframe 宿主需要在 PageBuilder 工具栏中放置宿主业务动作的问题，例如发布、送审、返回列表。该能力必须保持 PageBuilder 对工具栏 UI、安全字段和消息协议的控制，不能让宿主直接注入 DOM、脚本或样式。

## Goals / Non-Goals

**Goals:**

- 支持宿主为 Builder 左侧预览区顶部工具栏声明受控扩展按钮。
- 支持 PageBuilder 向 iframe 父页面通知扩展按钮点击事件。
- 支持 iframe 父页面在同源前提下更新扩展按钮的 `busy`、`disabled`、`hidden` 等状态。
- 支持 CMS 服务端在创建 builder handoff 时下发本次打开的初始扩展按钮，并通过 builder context 暴露给 PageBuilder renderer。
- 保持按钮配置为白名单 JSON 字段，避免外部注入脚本、HTML、SVG、CSS 或任意跳转逻辑。

**Non-Goals:**

- 不支持跨域 iframe 嵌入、第三方 Cookie、`SameSite=None` 或任意 `frame-ancestors` allowlist。
- 不让 PageBuilder 直接执行发布、送审、返回等宿主业务逻辑。
- 不支持宿主传入 React 组件、HTML、SVG 字符串、CSS style 对象或 JavaScript 回调。
- 不改变现有 PageBuilder 内置工具栏按钮的行为。
- 不复用内部 preview bridge 协议作为外层宿主协议。

## Decisions

### 1. 使用独立宿主扩展协议，不复用 preview bridge

PageBuilder 当前已有一套父页面与内部预览 iframe 通信的 preview bridge 协议，用于选区、内联编辑和区块工具条。宿主扩展按钮属于外层宿主页面与 PageBuilder iframe 的通信，不应复用 preview bridge 的 `source` 和消息类型。

本变更新增独立 source 常量，例如：

- `page-builder-host-bridge`: PageBuilder iframe 发给父页面。
- `page-builder-host-parent`: 父页面发给 PageBuilder iframe。

这样可以避免三方关系混淆：外部宿主页面、PageBuilder Builder 页、Builder 内部预览页。

备选方案是复用 preview bridge 的消息管道。该方案会把外层宿主事件和内层预览选区事件混在同一个协议中，后续排查来源和权限边界更困难，因此不采用。

### 2. 初始按钮优先来自 CMS builder handoff / builder context

在 CMS 集成模式下，初始扩展按钮应由 CMS 服务端创建 builder handoff 时传入，并随 handoff/access session 的受控上下文进入 builder context。这样按钮配置与本次打开动作绑定，且由服务端完成权限判断。

Builder renderer 在成功获取 builder context 后，将 context 中的扩展按钮作为初始状态传给 `PreviewPane`。若父页面随后通过宿主协议发送按钮集合或状态 patch，前端以内存状态更新当前工具栏，不额外持久化。

备选方案是完全依赖父页面 `postMessage` 动态注册。该方案更灵活，但首屏按钮会晚于 Builder 加载出现，且 iframe 刷新后必须重新注册。保留动态注册/更新作为补充能力，但初始配置优先走 handoff/context。

### 3. 扩展按钮只是一种通知入口

扩展按钮点击后，PageBuilder 只向父页面发送 `toolbar-button-click` 事件，携带 `buttonId`、`workspaceId`、`sessionId`、`projectId` 和必要的非敏感页面状态。父页面收到事件后执行发布、送审、返回等业务动作，并可再发消息更新按钮状态。

PageBuilder 不调用外部 URL，不执行宿主脚本，也不根据按钮 ID 推断业务动作。这样可以让 PageBuilder 保持通用构建器边界，避免把 CMS 业务流程写入工具栏组件。

### 4. 按钮配置使用共享归一化函数

新增共享类型和归一化函数，供后端读取 handoff 请求体、builder context 响应、前端接收 parent message 时复用。按钮字段采用白名单：

- `id`: 稳定按钮 ID。
- `label`: 可见文字。
- `tooltip`: 可选提示。
- `icon`: 白名单图标 key。
- `variant`: 受控按钮样式。
- `disabled`、`busy`、`hidden`、`requiresPreview`: 状态字段。
- `order`: 排序权重。

归一化应限制按钮数量、字符串长度、重复 ID 和未知枚举值。非法按钮在后端请求中应被拒绝或在前端动态消息中被丢弃并反馈错误；不能原样信任。

### 5. PreviewPane 负责渲染，BuilderPage 负责状态与消息

`PreviewPane` 只接收归一化后的按钮数组和点击回调，并在现有右侧 action group 末尾渲染扩展按钮。`BuilderPage` 负责维护按钮状态、处理宿主消息、拼装点击事件上下文，并把点击事件发给父页面。

这保持了现有组件职责：`PreviewPane` 管 UI，`BuilderPage` 管 workspace/session/context 与跨窗口通信。

### 6. 第一阶段采用数量与文字约束控制溢出

第一阶段不引入新的菜单组件。系统最多接受 5 个扩展按钮，并限制 label 长度；工具栏沿用现有 flex-wrap 布局，同时按钮文案需要截断，避免长文本撑破工具栏。后续如果业务需要更多按钮，再引入“更多”菜单或专用 overflow 组件。

## Risks / Trade-offs

- [宿主按钮过多导致工具栏变高] → 限制最多 5 个按钮、限制 label 长度，并在测试中覆盖长文案不会溢出。
- [父页面未监听点击事件导致用户无反馈] → PageBuilder 只保证发送事件；宿主负责业务反馈。文档必须明确宿主需要监听 `toolbar-button-click` 并按需回写 `busy/disabled`。
- [动态 postMessage 被错误来源伪造] → 本变更只支持同源 iframe，PageBuilder 仅接受 `event.source === window.parent` 且 `event.origin === window.location.origin` 的消息。
- [配置进入持久化 runtime store 后泄露业务信息] → 按钮配置只允许非敏感展示字段和按钮 ID，不允许携带 token、Cookie、URL、任意 payload；builder context 继续禁止返回敏感凭据。
- [新增按钮影响内置动作测试] → `PreviewPane` 测试应覆盖扩展按钮渲染顺序、点击回调、busy/disabled 状态，以及内置按钮隐藏逻辑不变。

## Migration Plan

1. 新增共享类型与归一化逻辑，默认无扩展按钮。
2. 扩展 CMS handoff 输入、handoff/access session record 和 builder context 响应；未提供按钮时保持现有响应兼容。
3. 扩展 PageBuilder renderer，从 builder context 读取初始按钮，并处理父页面消息。
4. 扩展 `PreviewPane` 渲染扩展按钮。
5. 补充单元测试、HTTP route 测试和必要文档。

回滚时可以忽略或丢弃 `toolbarExtensions` 字段；由于默认值为空，不应影响既有 handoff、builder context 或工具栏内置动作。

## Open Questions

- 第一阶段是否需要在宿主 ready 消息中包含更完整的 preview 状态，例如当前 preview revision。默认只发送非敏感的 `hasPreview` 和 `previewUrl`。
- 是否需要为宿主按钮点击增加可选 `requestId`，方便父页面与 PageBuilder 之间做严格 ack 关联。第一阶段可先通过 `buttonId` 和宿主自有状态管理完成。
