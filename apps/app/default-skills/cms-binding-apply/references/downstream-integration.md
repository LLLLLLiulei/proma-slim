# Downstream Integration Notes

This skill does not add a separate runtime executor by itself. It normalizes the decision boundary first, and then the same agent should continue with the existing workspace editing flow when the outcome is `ready`.

## Auto handoff prerequisite

The later auto handoff module must inject `cms-binding-apply` explicitly. Hidden prompt decoration alone is not enough if runtime skill extraction only reads the visible `userMessage`.

## Block snapshot prerequisite

If the selector and block hint are not enough to decide safely, the later snapshot tooling should enrich the skill input with block metadata or a constrained block snapshot. The skill should still keep the decision scoped to the current block.

## HTML apply prerequisite

In the current page-builder workflow, a `ready` result should lead directly to block-scoped edits in the existing workspace files. The important boundary is that only `ready` may proceed to file changes; `needs-clarification` and `incompatible` must not be treated as direct write instructions.

## Phase 1A boundary

- Only `replace-current`
- Only block-scoped edits
- Only `nav` and `content-list`
- No CMS rebrowsing through `AskUserQuestion`
- No page-wide rewrite
