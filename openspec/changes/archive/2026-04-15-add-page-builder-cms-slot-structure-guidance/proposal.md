## Why

当前 page-builder 已经支持 `cms-catalog` / `cms-content` 的预览、选择、重绑和静态导出，但作者态源码仍缺少一条稳定的结构组织约定。若把动态区域的 `ul`、`section`、`article` 等主要 HTML 壳子留在 CMS 组件外部，预览中的整块内容边界、源码中的 CMS 原子边界，以及后续 agent 理解到的更新边界就会继续错位。

## What Changes

- 为 page-builder 中与 CMS 相关的生成与自动应用路径补充统一的作者态结构指导：`cms-catalog` / `cms-content` 应尽量作为动态区域的顶层节点，相关 HTML 壳子应尽可能收敛到 `default / empty / error` slot 中。
- 更新相关 skill 与 apply tool 的提示词、推荐示例和输出约束，使系统默认产出“CMS 组件包裹整块动态区域”的源码结构，而不是把动态区域壳子散落在组件外部。
- 为 CMS rendering validator 增加非阻断性的结构诊断：当作者 HTML 将与 CMS 数据直接相关的主要容器长期放在 CMS 组件外部时，输出 warning，引导后续修正，但不拦截保存或渲染。
- 明确这是一条软约束，旧页面与特殊布局仍可继续运行；本 change 不做自动重写旧页面，也不把该问题升级为 error。

## Capabilities

### New Capabilities

### Modified Capabilities
- `page-builder-cms-apply-skill`: 更新 CMS 自动应用 skill 的作者态结构约束与示例，使其默认生成“CMS 组件作为动态区域顶层、主要 HTML 壳子收敛到 slot 内”的结果。
- `page-builder-guided-generation`: 更新普通页面生成链路在产出 CMS 相关 HTML 时的结构指导与示例，避免生成源码边界与预览边界长期错位的 CMS 组织方式。
- `page-builder-cms-rendering-apply-tool`: 更新正式 `apply_cms_binding` 工具的输出约束与示例，使 `templateBody`、`emptyTemplate` 和 `errorTemplate` 承载完整的动态区域结构，而不是只承载零散子节点。
- `page-builder-cms-rendering-manifest-validation`: 增加 page-builder 作者态 CMS 结构的 warning 级诊断，提示“相关 HTML 应尽量组织到 CMS slot 中”这一软约束。

## Impact

- Affected code:
  - `apps/app/default-skills/cms-binding-apply/SKILL.md`
  - page-builder 相关默认 skill / prompt 注入入口
  - `apps/app/src/main/lib/page-builder-cms-rendering-tools.ts`
  - `apps/app/src/main/lib/cms-sdk-tools.ts`
  - `packages/page-builder-cms-rendering/src/validation/cms-rendering-validator.ts`
  - related tests for skill guidance, apply tool output, and validator diagnostics
- Affected systems:
  - CMS 自动应用路径
  - page-builder 引导式页面生成路径
  - page-builder 作者态 CMS validator 诊断链路
  - agent 对 CMS 区块“整体更新”边界的默认理解
