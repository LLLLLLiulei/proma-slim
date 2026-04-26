## Why

`page-builder` 当前已经支持在预览区选中 block 或 `cms-island`，并会在发送下一条消息时把该目标作为隐藏上下文注入给 agent，但右侧对话区不会向用户展示当前到底选中了什么目标。用户在发送前无法从对话侧确认当前作用目标，也无法直接从对话侧取消当前选中状态。

## What Changes

- 在 `page-builder` Builder 页右侧对话输入框上方增加当前已选目标的高亮可见提示，使用户在发送前可以确认当前目标。
- 该提示只展示预览区当前选中框上显示的标签文案，不展示 `selector`、`sourceSelector`、`path` 等原始定位信息。
- 将预览桥接层生成的 `displayLabel` 透传到宿主侧，用作右侧提示的唯一显示文案来源。
- 在提示尾部增加一个图标按钮，允许用户直接取消当前选中。
- 使该提示与现有选区生命周期保持一致：选中后显示，取消选区、发送成功、预览失效或重载后清除。
- 保持现有隐藏 `targetSelection` 注入链路不变，不把该提示写入消息列表正文。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `page-builder-preview-block-selection`: 扩展已选目标的可见反馈要求，使右侧对话输入区展示与预览区一致的当前选中标签，并提供取消选中的快捷操作。

## Impact

- Affected specs: `openspec/specs/page-builder-preview-block-selection/spec.md`
- Affected code: `apps/page-builder/src/renderer/pages/BuilderPage.tsx`, `apps/page-builder/src/renderer/components/builder/PreviewPane.tsx`, `apps/page-builder/src/renderer/lib/preview-selection.ts`, `apps/app/src/main/lib/page-builder-preview-bridge/protocol.ts`, `packages/shared/src/types/page-builder-preview-selection.ts`
- Affected tests: `apps/page-builder/src/renderer/pages/BuilderPage.test.tsx`, `apps/page-builder/src/renderer/components/builder/PreviewPane.test.tsx`, `apps/app/src/main/lib/page-builder-preview-bridge.test.ts`
- No backend API or persistence changes are expected.
