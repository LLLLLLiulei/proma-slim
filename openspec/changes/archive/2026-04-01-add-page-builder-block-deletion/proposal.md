## Why

当前 Builder 左侧预览已经支持“选中区块后在下方工具条执行局部操作”，但删除按钮仍是占位态，用户无法对已经明确选中的页面区块执行直接删除。随着 CMS 选择、内联文本编辑和图片替换都已经走通，“删除当前选中区块”成为同一类直接操作里缺失最明显的一环，也需要通过二次确认来控制误删风险。

## What Changes

- 为 `page-builder` Builder 页新增“删除当前选中区块”能力，点击工具条中的 `删除` 后先弹出二次确认，再执行删除。
- 让删除操作沿用现有 `selector -> HTML 回写 -> preview revision 刷新` 链路，直接从 `workspace-files/index.html` 中移除当前选中的 DOM 元素。
- 删除成功后刷新预览、清空当前选区并提示成功；删除失败时保留当前选区并给出错误反馈。
- 保持当前选区语义不变：第一版删除目标就是“当前已选中的元素本身”，不自动上提父级语义块，也不额外做资源回收。

## Capabilities

### New Capabilities
- `page-builder-block-deletion`: 定义当前已选区块的删除语义、确认流程、HTML 回写、失败处理与预览刷新行为。

### Modified Capabilities
- `page-builder-block-toolbar`: 扩展区块工具条中的删除动作，使其从禁用占位态变为可触发确认和删除流程的破坏性操作。

## Impact

- 受影响前端：`PageBuilderBlockActionBar`、`PreviewPane`、`BuilderPage` 以及删除确认弹框状态管理。
- 受影响 renderer API：新增 page-builder 删除区块请求封装。
- 受影响主进程：新增基于 `selector` 的 HTML 删除服务与对应的 workspace 路由。
- 受影响测试：工具条交互、确认流程、删除成功/失败反馈、HTML 回写与 preview revision 刷新测试。
