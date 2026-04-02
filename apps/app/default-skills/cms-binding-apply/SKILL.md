---
name: cms-binding-apply
description: Use when a page-builder workflow already has a confirmed CMS selection and target block, and the agent must decide whether the data can replace the current block, whether short clarification is required, or whether the request is incompatible with Phase 1A.
---

# CMS Binding Apply

## Overview

Use this skill after CMS browsing is already complete. Consume the structured page-builder CMS selection payload, decide whether Phase 1A can safely apply it to the current block, and keep the result inside the controlled contract defined by `ready`, `needs-clarification`, and `incompatible`.

## When to Use

Use this skill when all of the following are true:

- The user already confirmed CMS catalogs or fixed content items.
- The workflow already knows the target block selector.
- The next step is deciding whether the current block can be updated with `replace-current`.

Do not use this skill when:

- The user still needs to browse or pick CMS data.
- The task is generic page generation unrelated to CMS binding.
- The flow needs append, merge, whole-page rewrite, or multi-block orchestration.

## Required Input

The incoming payload must already be structured. Expect:

- `selection`
- `targetBlock`
- `entryPoint`
- `applyIntent`
- `workspacePolicy`

Read [references/contract-examples.md](references/contract-examples.md) for the exact shapes and examples.

If `blockTypeHint` is missing, do not fail immediately. Use a conservative fallback:

- `catalogs` favor `nav`
- `contents` favor `content-list`
- if the block intent is still ambiguous after that fallback, return `needs-clarification`

## Decision Rules

1. Validate the contract first.
   Reject payloads that do not match the Phase 1A contract or that request anything other than `replace-current`. Missing core fields such as `selection` or `targetBlock` must return `incompatible` with `reasonCode: malformed-payload`.
2. Infer the block intent conservatively.
   Only two target block kinds are supported in Phase 1A: `nav` and `content-list`.
3. Match selection to supported mappings.
   Catalog selections may resolve to `nav`. Fixed content selections may resolve to `content-list`.
4. Return one of three outcomes only.
   - `ready`: enough information, supported block kind, safe to continue
   - `needs-clarification`: one critical ambiguity remains and can be resolved with a short structured question
   - `incompatible`: unsupported block kind, mismatched selection, page reflow, unsupported runtime, or unsupported strategy

## Execution Flow In The Current Workspace

After classifying the request, continue in the same turn instead of stopping at an abstract contract summary:

1. If the result is `incompatible`, explain the blocking reason plainly and stop.
2. If the result is `needs-clarification`, ask exactly one short structured question through `AskUserQuestion`, then wait for the answer.
3. If the result is `ready`, continue with the existing workspace editing flow. Do not reply that the skill is only a template or that a later module is still missing.
4. When continuing from `ready`, inspect the current block as needed, then update the preview source files directly.

For Phase 1A, prefer this write target order:

- First choice: `workspace-files/index.html`
- Secondary choice: other files under `workspace-files/` only when the current block cannot be updated safely inside `index.html`

After the edits are complete:

- summarize what was changed in plain language
- keep the explanation scoped to the current target block
- do not claim success before the file edits are actually finished

## Clarification Guardrails

- Use short, structured clarification only.
- Ask only when one critical ambiguity blocks a safe decision.
- Do not re-run CMS browsing through `AskUserQuestion`.
- Do not ask broad creative questions once the CMS selection is already fixed.

## Apply Guardrails

- Keep Phase 1A scoped to the current `targetBlock.selector`.
- Treat `replace-current` as the only supported strategy.
- Do not propose whole-page rewrites.
- Do not propose cross-block edits.

## References

- [references/contract-examples.md](references/contract-examples.md)
- [references/downstream-integration.md](references/downstream-integration.md)
