## Why

外部 CMS 或业务系统通过 iframe 打开 PageBuilder 构建页时，需要把“发布、送审、返回列表”等宿主业务动作放到 PageBuilder 左侧预览工具栏中，减少用户在宿主页面和 PageBuilder iframe 之间来回切换。当前工具栏只支持内置按钮隐藏，不支持宿主以受控方式声明扩展按钮或接收按钮点击事件。

## What Changes

- 新增 PageBuilder 宿主工具栏扩展能力，允许 iframe 宿主为 Builder 左侧预览区顶部工具栏声明受控扩展按钮。
- 新增 PageBuilder 与 iframe 父页面之间的宿主扩展消息协议，用于通知 ready、转发扩展按钮点击，以及接收按钮状态更新。
- 扩展 CMS builder handoff / builder context，使 CMS 服务端可以在创建 builder handoff 时下发本次打开允许展示的初始扩展按钮。
- 限制扩展按钮为安全的 JSON 配置字段，禁止外部传入 JS、HTML、SVG、CSS 或自动跳转 URL。
- 保持同源 iframe 集成假设，不在本变更中引入跨域 iframe、第三方 Cookie 或任意 `frame-ancestors` allowlist 支持。

## Capabilities

### New Capabilities

- `page-builder-host-toolbar-extensions`: 定义 PageBuilder Builder 左侧预览工具栏的宿主扩展按钮配置、渲染、点击通知、状态更新和安全边界。

### Modified Capabilities

- `page-builder-cms-integration`: 扩展 CMS builder handoff 和 builder context 契约，使 CMS 服务端能够为本次 builder 打开传入宿主工具栏扩展按钮，并确保这些配置不泄露敏感信息。

## Impact

- 影响 PageBuilder 前端：`BuilderPage`、`PreviewPane`、运行时配置读取、宿主 iframe `postMessage` 处理和相关测试。
- 影响共享类型：新增宿主工具栏扩展按钮、消息协议和归一化约束类型。
- 影响 CMS 集成后端：handoff 创建请求、handoff/access session runtime record、builder context 响应和 HTTP route 测试。
- 影响文档与部署说明：补充同源 iframe 下宿主扩展按钮的集成方式和约束。
- 不引入新的外部运行时依赖。
