# Downstream Integration Notes

This skill does not implement the write path by itself. It normalizes the decision boundary first against the canonical authoring contract, and when the outcome is `ready`, the same agent should first call `mcp__cms__decide_cms_binding` and only then call the formal `mcp__cms__apply_cms_binding` tool.
Use this file for host-side handoff and write-pipeline notes, not for the main skill prompt.

## Auto handoff prerequisite

The later auto handoff module must inject `cms-binding-apply` explicitly. Hidden prompt decoration alone is not enough if runtime skill extraction only reads the visible `userMessage`.
That same host-managed handoff must also pre-register the structured CMS context behind the current `handoffId`, so the downstream decision tool can reload it without trusting the model to restate raw apply inputs.
For `contents-by-catalog`, that structured context should include authoritative source context refreshed from the CMS authority surface instead of trusting the earlier tree snapshot alone.

## Authoring snapshot prerequisite

The skill input should already include `targetSnapshot`, and `targetSnapshot.targetOuterHtml` is the authoritative authoring-source snapshot for the current target. The downstream write path should keep decisions scoped to that current authoring target instead of inferring structure from preview DOM descendants.

## HTML apply prerequisite

In the current page-builder workflow, a `ready` result must first materialize a persisted decision through `mcp__cms__decide_cms_binding`. Only a `ready` outcome with an explicit `selection.siteId` and a returned `decisionId` may proceed to `mcp__cms__apply_cms_binding`; `needs-clarification` and `incompatible` must not be treated as direct write instructions.

`mcp__cms__apply_cms_binding` must now consume `decisionId` plus template fields only. It must load target/source identity from the persisted apply plan instead of trusting raw caller binding fields.

If the caller sends `decision` as a JSON string, the runtime may normalize legacy payloads for compatibility. That recovery path is only a fallback: the caller should still retry with an object-shaped `decision` payload instead of keeping the stringified form.

If `selection.siteId` is missing, the flow must stop and report a malformed payload style error. Do not substitute `siteId = 1` for new writes.

If `selection.sourceType = contents-by-ids`, the downstream apply step must also preserve the single `selection.catalogId`; do not generate a fixed-content `cms-content` tag with bare `ids` only.

If `targetSelection.kind = cms-island`, downstream writes must resolve the target by the runtime locator in `targetSelection.htmlPath + sourceSelector + parentBlockSelector + component`. That locator is the formal source identity for the selected CMS source tag.
When rebuilding slot content, downstream writes must stay inside the canonical authoring contract: explicit slot scope, Vue template syntax, supported props only, supported item fields only, and no `<script>` / `<style>` inside CMS slot templates.
The write path must keep page-builder authoring HTML-first: only the selected `cms-*` source tag and its slot templates use Vue authoring. The host preview/export pipeline owns Vue runtime and bootstrap injection.
Downstream writes must reject author-managed Vue runtime/importmap/bootstrap and reject page-wide `createApp` / `mount` solutions instead of treating them as valid CMS apply output.
Downstream writes must also reject non-Vue inline event authoring such as `onclick`, `onerror`, or assignment-style `@click` expressions that rely on `window.location`, `document.querySelector`, or direct DOM mutation.

The downstream write must fail closed on missing, stale, conflicting, replayed, or non-unique decisions instead of guessing another block. It must not fall back to legacy `sourceId` or invent selector-based recovery from rendered descendants.

## Phase 1A boundary

- Only `replace-current`
- Only target-selection-scoped edits
- CMS islands remain `source-atomic`
- Only `nav`, `catalog-list`, and `content-list`
- No CMS rebrowsing through `AskUserQuestion`
- No page-wide rewrite
- No inventing new `cms-*` tags outside the controlled CMS selection flow
