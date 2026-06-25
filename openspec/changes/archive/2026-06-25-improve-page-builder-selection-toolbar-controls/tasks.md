## 1. 类型与协议

- [x] 1.1 在 `packages/shared/src/types/page-builder-preview-selection.ts` 中扩展 preview parent message 类型，新增 `selection-parent` 命令，并保持 `selection-clear` 等既有命令兼容。
- [x] 1.2 更新 `apps/app/src/main/lib/page-builder-preview-bridge/protocol.ts` 的消息分发逻辑，使 bridge 能识别并路由 `selection-parent`。
- [x] 1.3 为新增命令补充 focused type/protocol 测试，覆盖未知命令不受影响和既有 clear/reset 行为不回归。

## 2. Preview Bridge 选区状态机

- [x] 2.1 在 `apps/app/src/main/lib/page-builder-preview-bridge/selection.ts` 中实现普通 block 的父级可选目标解析，从当前 `selectedTarget.primaryElement.parentElement` 开始查找可见、唯一 selector、非禁止标签的最近父元素。
- [x] 2.2 在 bridge 中实现 `cms-island` 的父级提升逻辑，使用当前目标的 `parentBlockSelector` 解析所属普通 block，并在解析失败时保持当前选区。
- [x] 2.3 确保父级提升前结束活动中的内联文字编辑，并在成功提升后刷新 selected overlay、hover overlay、rect、display label、能力信息和 `targetSelection`。
- [x] 2.4 确保已经到达最外层可选区域、父级 selector 不唯一、无当前选区、交互锁定或预览未就绪时，`selection-parent` 不清空当前有效选区且不抛错。
- [x] 2.5 在 `apps/app/src/main/lib/page-builder-preview-bridge.test.ts` 或邻近测试中补充普通 block 父级提升、最外层 no-op、selector 不唯一 no-op、CMS island 提升到 parent block、CMS parent 解析失败 no-op 和内联编辑清理测试。

## 3. Builder 前端工具条

- [x] 3.1 更新 `apps/page-builder/src/renderer/components/builder/PageBuilderBlockActionBar.tsx`，在已选目标工具条中新增 `选择上一级` 和 `取消选择` 按钮，并延续现有视觉样式、紧凑布局和 viewport clamp 约束。
- [x] 3.2 更新 `apps/page-builder/src/renderer/components/builder/PreviewPane.tsx`，将 `选择上一级` 映射为向 preview iframe 发送 `selection-parent`，将 `取消选择` 映射为父页面清理选区并发送 `selection-clear`。
- [x] 3.3 确保两个新增按钮与现有工具条动作共用 `actionsDisabled`，在 Agent 处理中、编辑锁失效或交互锁定时不可触发。
- [x] 3.4 确保父级提升成功后工具条基于新选区的 label、rect 和 capabilities 重新锚定并刷新，取消选择后工具条立即隐藏。
- [x] 3.5 在 `apps/page-builder/src/renderer/components/builder/PreviewPane.test.tsx` 中补充新增按钮渲染、disabled 状态、发送 `selection-parent`、触发 `selection-clear` 和锚定更新测试。

## 4. Builder 页面选区清理链路

- [x] 4.1 更新 `apps/page-builder/src/renderer/pages/BuilderPage.tsx` 的清理回调，确保工具条取消选择会清除 `selectedTargetSelection`、右侧 `当前选中：` 提示、messageDecorator 和隐藏 `targetSelection`。
- [x] 4.2 确保取消选择同时覆盖普通 block 与 `cms-island`，且不会影响未选区消息、CMS 浏览弹框、删除确认和图片替换流程。
- [x] 4.3 在 `apps/page-builder/src/renderer/pages/BuilderPage.test.tsx` 中补充工具条取消选择后 composer notice 隐藏、下一条消息不携带旧 target、发送失败保留选区不回归等测试。

## 5. 回归验证

- [x] 5.1 运行 `bun test apps/app/src/main/lib/page-builder-preview-bridge.test.ts apps/page-builder/src/renderer/components/builder/PreviewPane.test.tsx apps/page-builder/src/renderer/pages/BuilderPage.test.tsx` 或等价 focused 测试，并修复失败。
- [ ] 5.2 运行 `bun test`，确认区块选择、CMS island、删除、图片替换和当前选中提示相关测试不回归。（已运行；当前全量套件因既有跨文件 mock 污染失败，相关 focused 测试与失败文件单独运行通过。）
- [x] 5.3 运行 `bun run typecheck`，确认新增消息类型、React props 和 preview bridge 编译通过。
- [x] 5.4 运行 `openspec validate improve-page-builder-selection-toolbar-controls --type change --strict`，确认 OpenSpec 变更通过严格校验。
