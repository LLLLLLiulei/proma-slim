## Why

`page-builder` 当前虽然已经提供了从首页输入需求到 Builder 对话区继续生成网页的路径，但默认仍是自由对话模式。对无代码基础的普通用户来说，这种模式很难稳定收集页面目标、受众、内容重点、风格与设备侧重，也无法可靠驱动 `taste-skill`（实际 skill 名为 `design-taste-frontend`）与 `redesign-skill`（实际 skill 名为 `redesign-existing-projects`）产出接近最终效果的专题页，因此需要把首轮对话升级为引导式专题页生成流程。

## What Changes

- 新增一个面向 `page-builder` 的主控 skill，将首轮专题页生成定义为“动态提问、必要澄清、汇总确认、整页生成”的引导式流程，而不是完全自由对话。
- 规定主控 skill 在收集需求、处理歧义、做最终确认时优先使用 `AskUserQuestion`，并以通俗选项加自定义回答的方式面向普通用户提问。
- 规定确认后优先一次性生成接近最终效果的单页专题页，并由主控 skill 显式驱动 `design-taste-frontend`，仅在需要提质时再驱动 `redesign-existing-projects`。
- 规定当前预览页非空时，整页重生成为覆盖式写入前必须再向用户确认；页面生成完成后，后续修改继续由同一主控 skill 进入轻量迭代模式，而不是重新走完整问答。

## Capabilities

### New Capabilities
- `page-builder-guided-generation`: 定义 `page-builder` 的引导式专题页生成能力，包括动态需求收集、`AskUserQuestion` 澄清与确认、非空页面覆盖确认，以及单页专题页的一次性生成编排。

### Modified Capabilities
- `page-builder-app`: 调整 `page-builder` 首页首条需求进入 Builder 后的默认对话行为，使其自动进入引导式专题页生成模式，并在页面生成后继续围绕当前预览结果进行迭代。

## Impact

- `apps/app/default-skills/` 下新增 `page-builder` 主控 skill，并与现有 `taste-skill` / `design-taste-frontend`、`redesign-skill` / `redesign-existing-projects` 协同工作
- `apps/app/resources/templates/page-builder-workspace-claude*.md` 的 page-builder 工作区提示约束
- `apps/app/src/main/lib/agent-prompt-builder.ts`、工作区 skill 注入与相关 Agent 编排逻辑
- `apps/page-builder/src/renderer/pages/` 与右侧对话入口的首轮自动引导、后续迭代与覆盖确认体验
