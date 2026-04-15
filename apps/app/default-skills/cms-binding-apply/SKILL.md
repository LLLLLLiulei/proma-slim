---
name: cms-binding-apply
description: Use when a page-builder workflow already has a confirmed CMS selection and target selection, and the agent must decide whether the data can replace the current target, whether short clarification is required, or whether the request is incompatible with Phase 1A.
---

# CMS Binding Apply

## Overview

Use this skill after CMS browsing is already complete. Consume the structured page-builder CMS selection payload, decide whether Phase 1A can safely apply it to the current block, and keep the result inside the controlled contract defined by `ready`, `needs-clarification`, and `incompatible`.

## When to Use

Use this skill when all of the following are true:

- The user already confirmed CMS catalogs or fixed content items.
- The workflow already knows the target block selector.
- The next step is deciding whether the current block can be updated with `replace-current` and, if so, invoking the formal CMS apply tool.

Do not use this skill when:

- The user still needs to browse or pick CMS data.
- The task is generic page generation unrelated to CMS binding.
- The flow needs append, merge, whole-page rewrite, or multi-block orchestration.

## Required Input

The incoming payload must already be structured. Expect:

- `selection`
- `targetSelection`
- `targetBlock`
- `entryPoint`
- `applyIntent`
- `workspacePolicy`

Read [references/contract-examples.md](references/contract-examples.md) for the exact shapes and examples.

If `selection.siteId` is missing or blank, stop immediately and treat the payload as malformed. Do not guess `siteId = 1`, and do not recover it from `cms-settings.json` or any host-side static config.

If `blockTypeHint` is missing, do not fail immediately. Use a conservative fallback:

- `catalogs` favor `nav`
- `contents` favor `content-list`
- if the block intent is still ambiguous after that fallback, return `needs-clarification`

## Decision Rules

1. Validate the contract first.
   Reject payloads that do not match the Phase 1A contract or that request anything other than `replace-current`. Missing core fields such as `selection`, `selection.siteId`, or `targetBlock` must return `incompatible` with `reasonCode: malformed-payload`.
2. Infer the block intent conservatively.
   Only two target block kinds are supported in Phase 1A: `nav` and `content-list`.
3. Match selection to supported mappings.
   Catalog selections may resolve to `nav`, or when a single catalog can back a list query, to `content-list`. Fixed content selections remain incompatible in the current runtime because `contentIds` bindings are not implemented.
4. Return one of three outcomes only.
   - `ready`: enough information, supported block kind, safe to continue
   - `needs-clarification`: one critical ambiguity remains and can be resolved with a short structured question
   - `incompatible`: unsupported block kind, mismatched selection, page reflow, unsupported runtime, or unsupported strategy

## Execution Flow In The Current Workspace

After classifying the request, continue in the same turn instead of stopping at an abstract contract summary:

1. If the result is `incompatible`, explain the blocking reason plainly and stop.
2. If the result is `needs-clarification`, ask exactly one short structured question through `AskUserQuestion`, then wait for the answer.
3. If the result is `ready`, call `mcp__cms__apply_cms_binding` in the same turn. Do not reply that the skill is only a template or that a later module is still missing.
4. When continuing from `ready`, pass the current `targetSelection` as an object instead of a JSON string, the compatibility `targetBlock.selector`, and the supported binding/query props required by the formal tool. For new or rebound CMS tags, always include `source.siteId = selection.siteId`. `templateBody`, `emptyTemplate`, and `errorTemplate` must contain slot inner content only, not an outer `<template v-slot:...>` wrapper or an outer `cms-*` tag. Do not edit workspace files directly.

This skill is also the creation boundary for new CMS source tags:

- Only the confirmed CMS browser selection flow may create a new `cms-catalog` / `cms-content` or rebind an existing one.
- Ordinary page generation or ordinary page iteration must not invent new `cms-*` tags on their own.
- If the current page already contains CMS tags, ordinary iteration may adjust slot templates, internal structure, and styles, but must not silently change query props such as `site-id`, `catalog-id`, `page-size`, or similar binding fields.

After the edits are complete:

- summarize what was changed in plain language
- keep the explanation scoped to the current target block
- do not claim success before `mcp__cms__apply_cms_binding` actually succeeds

## CMS Authoring Shape

When the request is `ready`, prefer `cms-catalog` / `cms-content` as the source root of the dynamic region instead of leaving the main dynamic shell outside the CMS tag.

- Treat `templateBody`, `emptyTemplate`, and `errorTemplate` as the place for the complete dynamic region structure of each state.
- Pass slot inner content only in those fields. Do not wrap them again with `<template v-slot:default>`, `<template v-slot:empty>`, `<template v-slot:error>`, or shorthand `#default/#empty/#error`.
- Keep major HTML containers inside the slot whenever they belong directly to the CMS data.
- Put structures such as `ul`, `nav`, `section`, `article`, grid wrappers, empty states, and error states inside the relevant slot template instead of only passing item-level fragments.
- The generated CMS component exposes the unified slot scope `{ items, loading, error, empty }`; template fragments may rely on that scope directly.
- Leave only true page-level static shells outside the CMS component.

## Clarification Guardrails

- Use short, structured clarification only.
- Ask only when one critical ambiguity blocks a safe decision.
- Do not re-run CMS browsing through `AskUserQuestion`.
- Do not ask broad creative questions once the CMS selection is already fixed.

## Apply Guardrails

- Keep Phase 1A scoped to the current `targetSelection.selector`.
- If `targetSelection.kind === 'cms-island'`, treat it as `source-atomic` and replace the whole source CMS tag instead of editing inside rendered child nodes.
- Still pass the explicit `targetSelection` object whenever the workflow already has it. If it is accidentally omitted and `targetBlock.selector` already points to a `cms-catalog` / `cms-content`, the formal tool will infer `source-atomic` replacement, but that is only a safety net.
- When building the apply payload, prefer `cms-catalog` / `cms-content` as the source root and keep major HTML containers inside the slot.
- Newly written or rebound `cms-*` tags must explicitly include `site-id`, and that value must equal `selection.siteId`.
- If `selection.siteId` is missing, stop with a malformed-payload style error instead of inventing a fallback.
- Treat `replace-current` as the only supported strategy.
- Treat fixed `contentIds`, alias queries, and other unsupported runtime fields as `incompatible`.
- Do not propose whole-page rewrites.
- Do not propose cross-block edits.

## References

- [references/contract-examples.md](references/contract-examples.md)
- [references/downstream-integration.md](references/downstream-integration.md)
