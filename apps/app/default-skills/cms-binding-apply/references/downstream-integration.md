# Downstream Integration Notes

This skill does not implement the write path by itself. It normalizes the decision boundary first, and when the outcome is `ready`, the same agent should call the formal `mcp__cms__apply_cms_binding` tool.

## Auto handoff prerequisite

The later auto handoff module must inject `cms-binding-apply` explicitly. Hidden prompt decoration alone is not enough if runtime skill extraction only reads the visible `userMessage`.

## Block snapshot prerequisite

If the selector and block hint are not enough to decide safely, the later snapshot tooling should enrich the skill input with block metadata or a constrained block snapshot. The skill should still keep the decision scoped to the current block.

## HTML apply prerequisite

In the current page-builder workflow, a `ready` result should lead directly to a target-selection-scoped `mcp__cms__apply_cms_binding` call. The important boundary is that only `ready` with an explicit `selection.siteId` may proceed to this write tool; `needs-clarification` and `incompatible` must not be treated as direct write instructions.

If `selection.siteId` is missing, the flow must stop and report a malformed payload style error. Do not substitute `siteId = 1` for new writes.

If `selection.sourceType = contents-by-ids`, the downstream apply step must also preserve the single `selection.catalogId`; do not generate a fixed-content `cms-content` tag with bare `ids` only.

If `targetSelection.kind = cms-island` and `targetSelection.sourceId` is present, downstream writes must resolve the target by `sourceId` first. `targetSelection.selector` remains compatibility context and a legacy fallback only when `sourceId` is absent.

If a legacy page still has no `sourceId`, selector fallback must stay fail-closed: the downstream write may target only the already-selected CMS source tag and must stop on stale, conflicting, or non-unique matches instead of guessing another block.

## Phase 1A boundary

- Only `replace-current`
- Only target-selection-scoped edits
- CMS islands remain `source-atomic`
- Only `nav`, `catalog-list`, and `content-list`
- No CMS rebrowsing through `AskUserQuestion`
- No page-wide rewrite
- No inventing new `cms-*` tags outside the controlled CMS selection flow
