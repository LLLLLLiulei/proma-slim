## Why

当前 page-builder 已经具备 CMS rendering 的 preview、static export、manifest 和 validator 基础设施，但作者态仍缺少正式的 `apply_cms_binding` 执行入口。现有 `cms-binding-apply` skill 仍以“ready 后继续直接编辑 workspace 文件”为边界，既无法稳定复用统一 HTML mutation pipeline，也没有把 block-id 管理、manifest 重建和 validator 串成单一的工具合同。

## What Changes

- 新增 app 层 `apply_cms_binding` 工具，在当前已实现的 `cms-catalog` / `cms-content` 运行时能力范围内执行 block 级 HTML 写入。
- 让 `apply_cms_binding` 在写入目标 block 时自动维护 `data-proma-block-id`，并统一复用现有 workspace HTML mutation pipeline 触发 manifest 重建、validator 执行和 preview state 刷新。
- 更新 `cms` runtime SDK tool surface，使 page-builder 会话在保留宿主管理边界的前提下，同时暴露只读 CMS 查询工具和受控的 apply 工具。
- 对齐 `cms-binding-apply` skill 与共享 apply contract：`ready` 后必须调用正式工具而不是直接改文件，并且只承诺当前运行时已经支持的语义组件与 props 映射。
- 明确将尚未打通的扩展能力继续留在后续阶段，不在本 change 中承诺 `catalogIds`、固定 `contentIds`、alias 查询或其他未完成的运行时能力。

## Capabilities

### New Capabilities
- `page-builder-cms-rendering-apply-tool`: 定义 block 级 `apply_cms_binding` 工具的输入输出、HTML 写入边界、block-id 维护和与统一 mutation pipeline 的衔接行为。

### Modified Capabilities
- `page-builder-cms-sdk-tools`: 将 page-builder CMS runtime tool surface 从“仅只读查询”扩展为“只读查询 + 受控 apply 工具”，同时保持宿主管理的运行边界。
- `page-builder-cms-apply-skill`: 将 `ready` 路径收敛为调用正式 `apply_cms_binding` 工具，并将支持范围对齐到当前已实现的 CMS rendering 运行时能力。

## Impact

- Affected code:
  - `apps/app/src/main/lib/page-builder-cms-rendering-tools.ts`
  - `apps/app/src/main/lib/cms-sdk-tools.ts`
  - `packages/shared/src/types/page-builder-cms-apply.ts`
  - `apps/app/default-skills/cms-binding-apply/SKILL.md`
  - related tests for CMS tool registration, apply contract, and workspace HTML mutation integration
- Affected systems:
  - page-builder 作者态 CMS 绑定入口
  - runtime `cms` MCP tool surface
  - workspace HTML mutation pipeline reuse path
  - skill-driven CMS auto-apply workflow
