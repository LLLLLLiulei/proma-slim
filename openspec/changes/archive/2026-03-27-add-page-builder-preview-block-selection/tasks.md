## 1. Shared chat extension

- [x] 1.1 为共享 `AgentView` 增加 page-builder 可选的输入区动作扩展点，使 Builder 页可在不重写消息列表和输入框的前提下挂入“从页面中选择”按钮
- [x] 1.2 为共享 `AgentView` 增加发送成功后的宿主回调，并保持默认调用方在未传入扩展参数时行为完全不变
- [x] 1.3 补充 `AgentView` 与 Builder 嵌入相关测试，覆盖扩展点渲染、消息装饰调用和发送成功/失败时的回调行为

## 2. Builder selection flow

- [x] 2.1 在 `BuilderPage` 中实现页面区块选择模式状态，统一管理选区开关、当前 `selector`、一次性消息注入与发送成功后的清理逻辑
- [x] 2.2 扩展 `PreviewPane` 以支持与 iframe 的选择事件通信，并在手动刷新或预览重建时主动清空当前 hover/选中状态
- [x] 2.3 补充 Builder 页渲染测试，覆盖进入选区模式、仅保留最近一次选择、发送失败保留选区和预览重载后清空选区等行为

## 3. Preview bridge and selector extraction

- [x] 3.1 在 `workspace-preview-service` 中为 `template: 'page-builder'` 的 HTML 预览响应注入轻量 bridge loader，同时保持 CSS、JS、图片等静态资源继续原样透传
- [x] 3.2 实现预览页内的 bridge 脚本与样式，支持 hover 高亮、点击选中高亮、阻止选区模式下的默认跳转，并将生成的 `selector` 通过 `postMessage` 回传父页面
- [x] 3.3 补充后端测试，覆盖 page-builder HTML 注入生效、非 page-builder 工作区不注入、以及预览静态资源响应不受影响

## 4. Verification

- [x] 4.1 增加针对 page-builder 选区消息装饰链路的验证，确保发送给 Agent 的隐藏上下文仅包含当前用户消息与选中的 `selector`
- [x] 4.2 增加针对预览 hover/选中高亮交互的集成验证，确保未进入选区模式时不会错误触发高亮
- [x] 4.3 完成一轮 Builder 页手动回归，验证“从页面中选择”入口、选区高亮、发送成功自动清除、发送失败保留和预览刷新后失效的完整链路
