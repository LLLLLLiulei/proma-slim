## Why

当前 Builder 的区块选择主入口仍位于右侧对话输入区，而用户实际进行“选区”操作的视觉焦点在左侧预览面板，入口位置与操作对象分离，增加了理解和使用成本。现在需要把选择入口迁移到预览工具栏，让用户在预览上下文内直接进入、退出和取消区块选择，同时保留现有选中区块与消息微调链路。

## What Changes

- 将 `page-builder` Builder 页中的区块选择主入口从右侧对话输入区隐藏，保留底层状态机与消息装饰逻辑，但不再把该按钮作为用户可见的主要入口。
- 在左侧预览面板工具栏中新增一个区块选择入口，作为 `PC / Mobile` 设备切换旁的项目级预览交互控制。
- 区块选择入口改为图标化高亮交互：首次点击进入选择模式并高亮，再次点击退出选择模式、自动取消当前已选区块，并使页面恢复不可选择状态。
- 保持现有区块选择状态机、预览桥接、区块 hover/selected 高亮、区块工具条以及“选中区块后通过对话进行微调”的消息注入行为不变。
- 保持 agent 处理中禁用选择入口、预览刷新后自动清空选区等既有保护行为不变。

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `page-builder-preview-block-selection`: 调整区块选择主入口的位置、可见形态与退出方式，将用户可见入口从对话输入区迁移到预览工具栏，同时保留既有选区状态机与消息上下文绑定行为。
- `page-builder-block-toolbar`: 调整区块工具条对“先进入选区流程再选中区块”的前置约束描述，使其与新的预览工具栏入口保持一致，而不再引用对话输入区中的旧入口文案。

## Impact

- 影响 `apps/page-builder/src/renderer/pages/BuilderPage.tsx` 中区块选择入口的承载位置、对话区动作透出方式，以及选择状态对 `PreviewPane` 的传递方式。
- 影响 `apps/page-builder/src/renderer/components/builder/PreviewPane.tsx` 的预览工具栏结构，需要新增选择入口并展示 idle、armed、selected 三种交互状态。
- 影响相关 Builder 页与 PreviewPane 测试，用于验证入口迁移、显隐、高亮、禁用与取消选区行为。
