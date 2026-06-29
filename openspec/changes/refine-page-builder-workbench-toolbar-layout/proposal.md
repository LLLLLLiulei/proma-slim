## Why

Builder 工作台当前的操作入口分布不够清晰：预览区操作以纯图标展示，`另存模板` 位于右侧标题栏，`对话 / 代码` 与项目名称挤在同一标题区域，嵌入式或定制化部署时也缺少按项隐藏这些入口的稳定配置能力。

本次变更通过重新组织预览区与右侧栏顶部工具区，并增加明确的运行时隐藏配置，使核心操作分组更直观，同时避免不同部署场景通过改代码或不稳定 CSS 覆盖来定制页面。

## What Changes

- 调整 Builder 工作台顶部操作布局：
  - 预览区顶部菜单栏保留 `PC / Mobile` 设备切换。
  - 将预览区操作按钮统一为“图标 + 文字”形式：`选择`、`刷新`、`新窗口打开`、`导出`、`另存模板`。
  - 将 `另存模板` 入口从右侧项目标题栏移动到预览区顶部菜单栏。
  - 将 `对话 / 代码` Tab 组移动到右侧栏顶部菜单栏最左侧。
  - 将项目名称与编辑入口移动到右侧栏顶部菜单栏最右侧。
- 增加运行时配置 `AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS`，用于控制每个工具栏项和项目名称的显示/隐藏。
- 隐藏配置使用扁平 key：`pcPreview`、`mobilePreview`、`select`、`export`、`refresh`、`saveTemplate`、`openInNewWindow`、`chatTab`、`codeTab`、`projectName`。
- 默认所有项目均展示；未知或非法 key 被忽略。
- 被隐藏的项目只从 UI 中移除，不删除底层能力、接口、对话框或现有业务逻辑。
- 明确定义设备切换、右侧 Tab、项目名称在部分或全部隐藏时的回退行为，避免出现空白工具栏或不可见状态仍影响用户操作。

## Capabilities

### New Capabilities
- `page-builder-workbench-toolbar-layout`: 定义 Builder 工作台预览工具栏、右侧栏顶部菜单栏、运行时隐藏配置及隐藏后的回退行为。

### Modified Capabilities
- 无。现有预览、导出、选区、另存模板、设备切换和代码 Tab 的业务能力保持不变，本次变更只新增统一的工作台工具栏布局与可见性配置契约。

## Impact

- 前端组件：`BuilderPage`、`PreviewPane`、`ProjectTitleBar`、`BuilderRightPanel` 及相关样式与状态联动。
- 运行时配置：生产静态网关需要读取 `AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS` 并注入到 `window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__`；渲染端需要提供规范化读取方法。
- 测试：补充运行时配置解析、工具栏隐藏、设备模式回退、右侧 Tab 回退、项目名称隐藏、另存模板入口迁移及现有按钮行为保持的测试。
- 不影响后端能力、权限模型、编辑锁语义、预览 iframe 加载方式或导出/另存模板 API。
