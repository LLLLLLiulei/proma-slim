## Why

当前 `page-builder` 的预览工具条已经能围绕已选区块承载 CMS 入口和文本微调能力，但图片仍然只能回到对话流里描述修改，导致“替换一张现有图片”这种高频操作路径过长。既然 Builder 已经具备区块选中、桥接预览 DOM 和安全回写 `workspace-files` 的基础能力，就应该补齐一个直接的图片替换工作流，让用户在选中图片区块后即可上传并完成替换。

## What Changes

- 为 `page-builder` 新增图片区块替换能力：当用户选中的区块支持图片替换时，在该区块下方工具条中展示 `替换图片` 按钮。
- 点击 `替换图片` 后，系统打开本地文件选择弹框，并限制只能选择图片文件；用户确认后，系统将文件上传到后端并完成当前预览页面中的图片替换。
- 首版将图片区块识别限定为“当前选中元素本身是 `<img>`”或“当前选中区块内仅存在唯一可替换 `<img>`”的场景，避免多图区块的目标歧义。
- 系统将上传后的图片写入当前工作区 `workspace-files` 可预览资源目录，并同步更新对应 HTML 中目标图片的引用，使预览刷新后显示新图片。
- 首版明确不处理多图区块二次选择、CSS `background-image`、`picture/source` 响应式资源集、客户端裁剪压缩或旧资源清理。

## Capabilities

### New Capabilities
- `page-builder-image-replacement`: 定义 `page-builder` 预览中图片目标识别、图片文件选择、上传持久化、HTML 图片引用回写，以及替换后的预览刷新行为边界。

### Modified Capabilities
- `page-builder-block-toolbar`: 已选区块工具条需要从固定单一动作扩展为基于当前选区能力按需展示操作，并在支持图片替换的区块上补充 `替换图片` 入口。

## Impact

- Affected code:
  - `apps/app/resources/page-builder/page-builder-preview-bridge.js`
  - `apps/page-builder/src/renderer/components/builder/PageBuilderBlockActionBar.tsx`
  - `apps/page-builder/src/renderer/components/builder/PreviewPane.tsx`
  - `apps/page-builder/src/renderer/pages/BuilderPage.tsx`
  - `apps/app/src/renderer/lib/api.ts`
  - `apps/app/src/main/http/routes/workspaces.ts` 或相邻 `page-builder` 路由
  - new image upload / HTML image writeback service modules
- APIs:
  - new page-builder image replacement upload endpoint
  - preview bridge message contract additions for block capabilities and image target metadata
- Systems:
  - page-builder block toolbar action model
  - `workspace-files/assets` image asset persistence
  - HTML `<img>` source writeback and preview revision refresh
