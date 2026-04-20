# Downstream Integration Notes

This skill does not implement the write path by itself. It normalizes the decision boundary first against the canonical authoring contract, and when the outcome is `ready`, the same agent should call the formal `mcp__cms__apply_cms_binding` tool.
Use this file for host-side handoff and write-pipeline notes, not for the main skill prompt.

## Auto handoff prerequisite

The later auto handoff module must inject `cms-binding-apply` explicitly. Hidden prompt decoration alone is not enough if runtime skill extraction only reads the visible `userMessage`.

## Authoring snapshot prerequisite

The skill input should already include `targetSnapshot`, and `targetSnapshot.targetOuterHtml` is the authoritative authoring-source snapshot for the current target. The downstream write path should keep decisions scoped to that current authoring target instead of inferring structure from preview DOM descendants.

## HTML apply prerequisite

In the current page-builder workflow, a `ready` result should lead directly to a target-selection-scoped `mcp__cms__apply_cms_binding` call. The important boundary is that only `ready` with an explicit `selection.siteId` may proceed to this write tool; `needs-clarification` and `incompatible` must not be treated as direct write instructions.

If `selection.siteId` is missing, the flow must stop and report a malformed payload style error. Do not substitute `siteId = 1` for new writes.

If `selection.sourceType = contents-by-ids`, the downstream apply step must also preserve the single `selection.catalogId`; do not generate a fixed-content `cms-content` tag with bare `ids` only.

If `targetSelection.kind = cms-island`, downstream writes must resolve the target by the runtime locator in `targetSelection.htmlPath + sourceSelector + parentBlockSelector + component`. That locator is the formal source identity for the selected CMS source tag.
When rebuilding slot content, downstream writes must stay inside the canonical authoring contract: explicit slot scope, Vue template syntax, supported props only, supported item fields only, and no `<script>` / `<style>` inside CMS slot templates.
Downstream writes must also reject non-Vue inline event authoring such as `onclick`, `onerror`, or assignment-style `@click` expressions that rely on `window.location`, `document.querySelector`, or direct DOM mutation.

The downstream write must fail closed on stale, conflicting, or non-unique locators instead of guessing another block. It must not fall back to legacy `sourceId` or invent selector-based recovery from rendered descendants.

## Phase 1A boundary

- Only `replace-current`
- Only target-selection-scoped edits
- CMS islands remain `source-atomic`
- Only `nav`, `catalog-list`, and `content-list`
- No CMS rebrowsing through `AskUserQuestion`
- No page-wide rewrite
- No inventing new `cms-*` tags outside the controlled CMS selection flow
