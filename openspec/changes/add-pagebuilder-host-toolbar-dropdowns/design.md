## Context

PageBuilder Builder 页左侧预览区顶部工具栏已经支持内置动作和宿主扩展按钮。宿主扩展按钮通过 CMS builder handoff / builder context 下发初始配置，通过同源 iframe `postMessage` 通知父页面点击事件，并允许父页面通过 `toolbar-buttons-set` 或 `toolbar-button-update` 更新按钮状态。

当前扩展按钮是扁平列表。此前设计为了避免工具栏过高，限制最多 5 个扩展按钮，并未引入菜单组件。现在 CMS 侧需要把同一业务域下的多个动作收纳到一个入口中，例如“发布预览版 / 发布正式版 / 查看发布日志”，因此需要在不破坏安全边界的前提下增加下拉按钮。

## Goals / Non-Goals

**Goals:**

- 在现有 `toolbarExtensions.buttons` 内支持受控下拉按钮，不新增独立 `dropdowns` 配置入口。
- 普通按钮保持兼容；未声明 `type` 的既有按钮继续按普通按钮处理。
- 下拉项点击后继续走现有宿主消息协议，并通过可选 `itemId` 告知父页面具体菜单项。
- 下拉按钮和菜单项均遵循白名单字段、长度限制、ID 限制、数量限制和敏感信息保护边界。
- 主要支持同源 iframe 场景，保持 PageBuilder 只渲染受控 UI、只发送点击通知，不执行宿主业务逻辑。

**Non-Goals:**

- 不支持宿主传入 React 组件、HTML、SVG、CSS style、JavaScript 回调、外部跳转 URL、任意 payload、token 或 Cookie。
- 不让 PageBuilder 直接执行 CMS 发布、送审、跳转、打开 URL 或外部 API 调用。
- 不承诺跨源 iframe 或新窗口模式下的完整父页面消息闭环。
- 不在第一版支持单个下拉项的增量 patch；调整下拉项列表通过 `toolbar-buttons-set` 替换整组按钮完成。
- 不改变 PageBuilder 内置工具栏按钮的展示顺序和业务行为。

## Decisions

### 1. 在 `toolbarExtensions.buttons` 内使用 `type: "dropdown"`

下拉按钮本质上仍是工具栏上的一个宿主扩展入口，因此继续放在 `toolbarExtensions.buttons` 数组中。配置模型采用联合类型：`type` 缺省或为 `"button"` 时是普通按钮；`type: "dropdown"` 时要求存在受控 `items` 列表。

备选方案是新增 `toolbarExtensions.dropdowns`。该方案会产生两套排序、隐藏、数量限制和动态更新逻辑，也会让 CMS 侧难以统一控制按钮与下拉按钮的展示顺序，因此不采用。

### 2. 下拉项只支持最小白名单字段

顶层下拉按钮复用普通按钮的 `id`、`label`、`tooltip`、`icon`、`variant`、`disabled`、`busy`、`hidden`、`requiresPreview` 和 `order`。下拉项只支持 `id`、`label`、`tooltip`、`icon`、`disabled`、`hidden` 和 `requiresPreview`。

下拉项不支持 `variant`、`busy`、`order` 或任意业务 payload。菜单项排序由输入顺序决定，避免让下拉菜单配置复杂化。若后续确实需要分组、分隔线或 item busy 状态，应作为后续能力单独设计。

### 3. 继续使用协议版本 1，并增加能力标记

本变更不改变现有消息类型，只在 `ready.capabilities` 增加 `toolbarDropdowns.v1`，并在 `toolbar-button-click` 消息中增加可选 `itemId`。普通按钮点击消息保持原结构；下拉项点击消息使用同一个 `buttonId` 加 `itemId`。

备选方案是升级协议版本到 2。由于本变更是向后兼容扩展，且旧 CMS 可继续忽略未知能力和未知可选字段，升级主版本会增加 CMS 侧分支处理成本，因此不采用。

### 4. `toolbar-button-update` 只更新顶层入口

父页面仍可通过 `toolbar-button-update` 更新顶层下拉按钮的 `label`、`tooltip`、`disabled`、`busy` 和 `hidden`。下拉项列表和 item 状态不做单项 patch；需要变更时通过 `toolbar-buttons-set` 替换当前整组按钮。

这样可以避免复杂的 `buttonId + itemId` patch 协议、局部状态合并和菜单打开过程中的竞态。对于 CMS 侧，“发布中”等状态通常适合体现在顶层下拉按钮上；细粒度 item 状态可通过整组替换完成。

### 5. PreviewPane 渲染受控下拉菜单

`PreviewPane` 继续负责 UI 渲染，`BuilderPage` 继续负责 workspace/session/context 与跨窗口消息。渲染层新增宿主下拉按钮组件，放在现有内置动作之后，与普通扩展按钮同组。

下拉触发器禁用条件与普通按钮一致：顶层 `disabled`、`busy` 或 `requiresPreview && !previewUrl` 时不可打开。菜单项还要叠加 item 自身的 `disabled`、`hidden`、`requiresPreview`。点击可用菜单项后关闭菜单并调用同一个 host click 回调。

UI 实现可复用现有 Radix Popover 基础组件或新增轻量菜单组件，但菜单内容必须由 PageBuilder 自己渲染，不能接受宿主 DOM、样式或脚本。

### 6. CMS 集成只在 builder handoff 中保留下拉配置

CMS 服务端只能在 `target: "builder"` handoff 中传入工具栏扩展按钮和下拉按钮。`target: "preview"` handoff 即使携带该字段，也不得让预览页暴露工具栏扩展。

builder handoff 采用严格校验：下拉按钮缺少合法 items、下拉项 ID 重复、字段类型错误、未知 icon 或超过数量上限时应返回 `400 invalid_request`，并且不得写入可消费 handoff。父页面动态 `toolbar-buttons-set` 采用宽松归一化，非法下拉项会被丢弃。

## Risks / Trade-offs

- [Risk] 下拉菜单遮挡预览内容或在窄屏下定位不佳。 → Mitigation: 菜单使用受控最大宽度、文本截断、合理 z-index，并补充组件测试覆盖基础渲染和禁用行为。
- [Risk] CMS 误以为 PageBuilder 会执行菜单项业务。 → Mitigation: 文档明确 PageBuilder 只发送 `buttonId/itemId`，CMS 父页面必须监听消息并自行执行权限校验和业务动作。
- [Risk] 新窗口模式下点击消息无人处理。 → Mitigation: 文档继续强调宿主工具栏扩展主要面向同源 iframe；新窗口模式可渲染但不承诺业务闭环。
- [Risk] 下拉项 patch 协议过早复杂化。 → Mitigation: 第一版不支持 item patch，动态变更 item 统一通过 `toolbar-buttons-set` 替换整组配置。
- [Risk] 宿主配置携带敏感字段。 → Mitigation: 共享归一化和 CMS route 严格白名单，持久化和 builder context 只保留非敏感展示字段与 ID。

## Migration Plan

1. 扩展共享类型、归一化函数和测试，支持普通按钮与下拉按钮联合类型。
2. 扩展 CMS handoff route、runtime record、builder context 测试，确保合法下拉配置可保存和返回，非法或敏感字段不落盘。
3. 扩展 PageBuilder 宿主消息类型和 `BuilderPage` 点击消息，支持可选 `itemId` 与 `toolbarDropdowns.v1` 能力标记。
4. 扩展 `PreviewPane` 渲染下拉按钮和菜单项，并补充组件测试。
5. 更新 CMS 对接文档，说明 dropdown 配置、点击消息、动态替换方式和安全限制。

回滚策略：下拉配置是向后兼容扩展；如需回滚，可让 CMS 停止传 `type: "dropdown"`，普通按钮路径不受影响。服务端归一化可以在回滚后忽略未知 `type/items` 字段或拒绝新配置，不影响已有普通按钮。

## Open Questions

- 暂无阻塞问题。第一版不支持下拉项增量 patch、分组、分隔线和 item busy 状态；如业务后续需要，再单独扩展。
