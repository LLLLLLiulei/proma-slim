## Why

当前 `page-builder` 中用户即使只想微调标题、段落或按钮文案，也必须回到对话流或重新生成页面，导致简单 copy 修改的反馈回路过长。既然 Builder 已经具备选中预览区块和桥接预览 DOM 的基础能力，就应该补齐一个更直接的“选中后就地改字并保存”的工作流，用于高频的小幅文案调整。

## What Changes

- 为 `page-builder` 新增预览区块内联文字编辑能力：用户选中区块后，可直接点击该区块内可安全编辑的简单文本内容进入编辑态。
- 在首版中仅支持静态 HTML 中能够稳定映射回源码的简单文本热点，并通过失焦自动保存将修改写回 `workspace-files/index.html`。
- 在已选区块内，链接文字和按钮文案进入编辑态时，优先拦截其原本点击行为，而不是继续执行跳转或提交等默认动作。
- 保持现有区块选择心智，但扩展已选区块的语义，使其同时作为“可编辑文本热点”的作用域，而不只是下一条对话消息的隐藏上下文。
- 首版明确不处理运行时 JS 动态生成文本、复杂富文本嵌套、CMS/数据源绑定内容和样式编辑。

## Capabilities

### New Capabilities
- `page-builder-inline-text-editing`: 定义 `page-builder` 预览中的简单文本热点识别、就地编辑、失焦自动保存，以及安全回写 `workspace-files` 的行为边界。

### Modified Capabilities
- `page-builder-preview-block-selection`: 已选区块需要从“仅服务于选区上下文”扩展为“选区 + 区块内文本编辑作用域”，并调整已选区块内点击行为与选区生命周期的协同关系。

## Impact

- Affected code:
  - `apps/app/resources/page-builder/page-builder-preview-bridge.js`
  - `apps/page-builder/src/renderer/components/builder/PreviewPane.tsx`
  - `apps/page-builder/src/renderer/pages/BuilderPage.tsx`
  - `apps/app/src/main/http/routes/workspaces.ts` 或相邻 `page-builder` HTTP 路由
  - new inline text save / HTML writeback service modules
- APIs:
  - new page-builder inline text save endpoint for persisting preview edits
  - preview bridge message contract additions for editable text hotspot discovery / editing state
- Systems:
  - page-builder preview bridge and selection lifecycle
  - `workspace-files/index.html` safe text writeback
  - preview revision refresh after saved edits
