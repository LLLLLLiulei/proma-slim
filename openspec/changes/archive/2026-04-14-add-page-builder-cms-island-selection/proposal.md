## Why

`page-builder` 目前只能把预览中的普通 DOM / block 作为选择目标，无法把 `cms-catalog` / `cms-content` 渲染出来的结果识别为一个稳定的整体。这样会让用户在预览中误选 CMS 渲染子节点，也会让 agent 误把运行时渲染结果当成静态源码节点处理，进而破坏源 HTML 中 CMS 标签的整体边界。

## What Changes

- **BREAKING** Introduce a dedicated `cms-island` selection target and upgrade page-builder selection / CMS apply contracts from block-only semantics to source-atomic target semantics for CMS components.
- Update preview selection so CMS rendered regions are highlighted and selected as a whole with a dashed boundary and component label, without allowing child-node drill-down.
- Update downstream page-builder actions so CMS-targeted delete and CMS rebinding operate on the selected source CMS tag instead of automatically replacing the entire parent block.
- Update agent-facing selection decoration, CMS handoff payloads, and apply-skill/tool contracts so the runtime explicitly tells the agent that the selected CMS region must be updated as one source component rather than as arbitrary rendered children.

## Capabilities

### New Capabilities
- `page-builder-cms-island-selection`: Define `cms-island` as a first-class page-builder selection target that bridges preview-rendered CMS output back to its source HTML CMS tag with atomic edit boundaries.

### Modified Capabilities
- `page-builder-preview-block-selection`: Extend preview selection to recognize CMS rendered regions as atomic selection targets with dashed overlays, component labels, and structured selection metadata.
- `page-builder-block-toolbar`: Bind toolbar actions to CMS island targets and suppress block-only affordances that are unsafe for runtime-rendered CMS children.
- `page-builder-block-deletion`: Change deletion semantics so selected CMS islands remove only the source CMS tag instead of the entire parent block.
- `page-builder-inline-text-editing`: Prevent inline text editing from activating inside selected CMS islands because rendered CMS children do not map to stable static HTML text nodes.
- `page-builder-image-replacement`: Prevent image replacement from activating on selected CMS islands when the visible images come from runtime CMS output rather than stable source `<img>` nodes.
- `page-builder-cms-selection-contract`: Preserve CMS island targeting metadata through CMS browser request and confirmation payloads instead of reducing the target to a block-only selector.
- `page-builder-cms-auto-agent-handoff`: Include CMS island source-atomic edit boundaries in automatic handoff payloads so the agent understands the selected region must be updated as a whole CMS component.
- `page-builder-cms-apply-skill`: Update the skill contract so Phase 1A decisions consume selection-scoped CMS island context rather than only block-scoped target information.
- `page-builder-cms-rendering-apply-tool`: Extend the formal CMS apply tool from block-only replacement to selection-scoped CMS component replacement when the target is a source CMS island.

## Impact

- Affected systems: preview bridge, CMS rendering preview bootstrap, page-builder selection state, toolbar actions, deletion flow, CMS browser request context, automatic agent handoff, CMS apply skill contract, and formal CMS apply tool.
- Affected code: `apps/page-builder` preview selection / toolbar flows, `apps/app` preview bridge and CMS handoff services, `packages/shared` selection and CMS contract types, and `packages/page-builder-cms-rendering` preview metadata plumbing.
- APIs / contracts: `PageBuilderPreviewSelectionEvent`, page-builder hidden selection decoration, CMS selection request/result payloads, `PageBuilderCmsApplySkillInput`, and `mcp__cms__apply_cms_binding` target semantics.
