## Why

`page-builder` 的 Builder 对话目前只能发送纯文本，用户无法直接提供截图、参考图、PDF 或文档作为网页需求输入，这会迫使用户手工转述视觉和素材上下文，明显拉低构建效率。当前系统也缺少一套与工作区生命周期一致的附件约定，因此需要先明确 page-builder 场景下的附件能力边界和持久化契约，再进入实现。

## What Changes

- 为 `page-builder` 的 Builder 页对话框增加附件能力，支持点击选择文件、粘贴文件和拖拽文件，并在发送前展示待发送附件。
- 为已发送的 Builder 会话消息增加结构化附件展示能力，使历史消息可以展示图片预览或文件卡片。
- 将 page-builder 附件与所属工作区和会话绑定，要求附件随工作区运行时一起管理与清理，而不是继续依赖旧的全局附件目录约定。
- 使 Builder 会话在发送附件后能够将这些附件作为当前工作区上下文的一部分暴露给 Agent，用于网页生成和后续迭代。
- 保持 `page-builder` 首页启动入口不变；本阶段不为首页首条需求输入框增加附件功能。

## Capabilities

### New Capabilities
- `page-builder-attachments`: 定义 Builder 页对话框的附件输入、会话消息附件展示、工作区级附件持久化、Agent 附件可访问性，以及附件清理生命周期。

### Modified Capabilities
- None.

## Impact

- 影响 `apps/page-builder` 的 Builder 页对话交互与相关测试，但首页布局和启动流程保持不变。
- 影响 `apps/app` 的共享 Agent 类型、发送接口、消息渲染与工作区运行时，以支持 page-builder 会话使用结构化附件。
- 需要新增面向会话附件的 HTTP 上传与读取能力，并扩展工作区级清理逻辑，确保附件文件不会脱离工作区生命周期。
