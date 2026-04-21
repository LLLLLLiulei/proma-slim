---
name: cms-binding-apply
description: Use when a page-builder workflow already has a confirmed CMS selection and target selection, and the next step is deciding whether Phase 1A can safely apply it to the current block.
---

# CMS Binding Apply

## Overview

Use this skill after CMS browsing is already complete. Consume the structured page-builder CMS selection payload, the canonical CMS authoring contract digest, and the current authoring target snapshot, then decide whether Phase 1A can safely apply it to the current block. Keep the result inside the controlled contract defined by `ready`, `needs-clarification`, and `incompatible`.

## When to Use

Use this skill when all of the following are true:

- The user already confirmed CMS catalogs or fixed content items.
- The workflow already knows the target selection and target block context.
- The next step is deciding whether the current block can be updated with `replace-current` and, if so, invoking the formal CMS apply tool.

Do not use this skill when:

- The user still needs to browse or pick CMS data.
- The task is generic page generation unrelated to CMS binding.
- The flow needs append, merge, whole-page rewrite, or multi-block orchestration.

## Input Preconditions

The incoming payload must already be structured. Expect:

- `handoffId`
- `selection`
- `targetSelection`
- `targetBlock`
- `authoringContext`
- `targetSnapshot`
- `authoringRevision`
- `entryPoint`
- `applyIntent`
- `workspacePolicy`

Read [references/contract-examples.md](references/contract-examples.md) first for the decision contract, payload shapes, and minimal outcome examples.

- If `selection.selectionKind = catalogs` or `authoringContext.component = cms-catalog`, then read [references/cms-catalog-authoring.md](references/cms-catalog-authoring.md).
- If `selection.selectionKind = contents` or `authoringContext.component = cms-content`, then read [references/cms-content-authoring.md](references/cms-content-authoring.md).
- Read [references/shared-authoring-rules.md](references/shared-authoring-rules.md) when you need shared slot boundaries, HTML-first / Vue rules, apply payload boundaries, or cross-component anti-patterns.
- Use [references/downstream-integration.md](references/downstream-integration.md) for host-side handoff and write-pipeline notes only.

Treat `authoringContext.itemFieldMeta` as the semantic field reference for slot authoring.

- `itemFields` is only the raw field-name whitelist.
- `itemFieldMeta` tells you each field's type, whether it is optional, what it means, and how it should usually be used.
- When a field is marked optional in `itemFieldMeta`, guard it before rendering image, URL, or metadata UI.

If `selection.siteId` is missing or blank, stop immediately and treat the payload as malformed. Do not guess `siteId = 1`, and do not recover it from `cms-settings.json` or any host-side static config.

If `blockTypeHint` is missing, do not fail immediately. Use a conservative fallback:

- `contents` favor `content-list`
- `catalogs` may resolve to `nav` or `catalog-list`
- if the block intent is still ambiguous after that fallback, return `needs-clarification` with one short structured question

## Decision Algorithm

1. Validate the Phase 1A input first.
   Reject payloads that do not match the Phase 1A contract or that request anything other than `replace-current`. Missing core fields such as `selection`, `selection.siteId`, or `targetBlock` must return `incompatible` with `reasonCode: malformed-payload`.
2. Infer the block intent conservatively.
   Only three target block kinds are supported in Phase 1A: `nav`, `catalog-list`, and `content-list`.
3. Match the selection to the supported mappings.
   `catalogs-by-parent` / `catalogs-by-ids` may resolve to `nav` or `catalog-list`. `contents-by-catalog` / `contents-by-ids` resolve to `content-list`. If a catalog source lacks a stable `nav` vs `catalog-list` intent, return `needs-clarification` instead of guessing.
4. Return one of three outcomes only.
   - `ready`: enough information, supported block kind, safe to continue
   - `needs-clarification`: one critical ambiguity remains and can be resolved with one short structured question
   - `incompatible`: unsupported block kind, mismatched selection, page reflow, unsupported runtime, malformed payload, or unsupported strategy

When `sourceType = contents-by-ids`, treat it as a single-catalog fixed content set and preserve both `selection.catalogId` and ordered `selection.contentIds`.

## Ready Checklist

When the result is `ready`, continue in the same turn instead of stopping at an abstract contract summary:

- Call `mcp__cms__decide_cms_binding` in the same turn with the current `handoffId` and the structured `ready` decision.
- Pass `decision` as a nested object. Do not JSON-stringify `decision`; if you currently have JSON text, parse it into an object before calling `mcp__cms__decide_cms_binding`.
- Only when `mcp__cms__decide_cms_binding` returns `status = ready` plus a `decisionId`, call `mcp__cms__apply_cms_binding` in the same turn.
- If `mcp__cms__decide_cms_binding` fails, stop, correct the payload, and retry the tool call. Do not edit `workspace-files/index.html`, and do not handwrite `cms-catalog` / `cms-content` as a fallback bypass.
- Pass only `decisionId`, `templateBody`, `emptyTemplate`, and `errorTemplate` into `mcp__cms__apply_cms_binding`. Do not try to resend `targetSelection`, `siteId`, `source`, or other raw binding identity fields.
- Do not reply that the skill is only a template, and do not edit workspace files directly.
- Keep page-builder authoring HTML-first. `cms-catalog` / `cms-content` are host-managed source tags; this flow should author the selected source tag plus its slot templates, not a page-wide Vue app.
- Inspect the current target block in the workspace source. Preserve the existing outer shell, classes, and major layout structure whenever they are still compatible with the selected CMS data.
- Treat the task as an in-place replacement of the selected target. Do not append a sibling `cms-catalog` / `cms-content` beside the current block.
- If preserving the current structure is not safely compatible with the selected CMS data, return `needs-clarification` and ask one short `AskUserQuestion` instead of inventing a generic list, card grid, or navigation shell.
- If `targetSelection.kind === cms-island`, preserve its runtime locator exactly as provided. `targetSelection.htmlPath + sourceSelector + parentBlockSelector + component` is the formal source target identity; keep that tuple unchanged and treat the target as `source-atomic`.
- For new or rebound CMS tags, always include `source.siteId = selection.siteId`.
- For fixed content ids, always include both `source.catalogId = selection.catalogId` and `source.ids = selection.contentIds`.
- Do not infer `source.pageSize` from the CMS browser pagination state. The browser page size is only for browsing, not a page binding default.
- For `contents-by-catalog`, omit `source.pageSize` unless the user explicitly requested a count or the current target already has a `page-size` that must be preserved.
- For `contents-by-ids`, never pass `source.pageSize`.
- For `catalog-nav`, never pass `source.pageSize`; use `source.take` instead when an explicit catalog count is needed.
- `templateBody`, `emptyTemplate`, and `errorTemplate` must contain slot inner content only, not an outer `<template v-slot:...>` wrapper or an outer `cms-*` tag.
- Prefer `cms-catalog` / `cms-content` as the source root of the dynamic region, and keep major HTML containers inside the slot.
- Treat `templateBody`, `emptyTemplate`, and `errorTemplate` as the place for the complete dynamic region structure of each state.
- The generated CMS component exposes the unified slot scope `{ items, loading, error, empty }`; declare the slot scope explicitly as a subset of that shape.
- Keep Vue authoring inside the current `cms-*` source tag only. Do not add `v-*`, `@*`, `:` bindings, or `{{ ... }}` to surrounding non-CMS shell HTML.
- Do not author Vue runtime/importmap/bootstrap assets, and do not use `createApp`, `Vue.createApp`, or page-wide `mount` to make the whole page a single Vue root.
- Stay inside the canonical authoring contract: use supported fields such as `item.path`, `item.publishUrl`, and `item.listLogoUrl`; guard optional fields from `itemFieldMeta`; and use a stable `:key`, normally `:key="item.id"`.
- Do not write raw HTML inline event attributes, imperative DOM mutation, or `<script>` / `<style>` inside CMS slot content.

## Clarification Boundary

- Use one short structured clarification only.
- Ask only when one critical ambiguity blocks a safe decision.
- Do not re-run CMS browsing through `AskUserQuestion`.
- Do not ask broad creative questions once the CMS selection is already fixed.

## Phase 1A Boundaries

- Keep Phase 1A scoped to the current target selection.
- Treat `replace-current` as the only supported strategy.
- Do not propose whole-page rewrites.
- Do not propose self-managed Vue runtime or page-wide Vue mount as the way to render CMS data.
- Do not propose cross-block edits.
- Only the confirmed CMS browser selection flow may create a new `cms-catalog` / `cms-content` or rebind an existing one.
- Ordinary page generation or ordinary page iteration must not invent new `cms-*` tags on their own.
- If the current page already contains CMS tags, ordinary iteration may adjust slot templates, internal structure, and styles, but must not silently change query props such as `site-id`, `catalog-id`, `page-size`, or similar binding fields.

## References

- [references/contract-examples.md](references/contract-examples.md)
- [references/shared-authoring-rules.md](references/shared-authoring-rules.md)
- [references/cms-catalog-authoring.md](references/cms-catalog-authoring.md)
- [references/cms-content-authoring.md](references/cms-content-authoring.md)
- [references/downstream-integration.md](references/downstream-integration.md)
