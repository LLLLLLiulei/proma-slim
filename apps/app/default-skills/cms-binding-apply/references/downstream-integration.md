# Downstream Integration Notes

This skill does not execute the later runtime steps by itself. It only normalizes the decision boundary for them.

## Auto handoff prerequisite

The later auto handoff module must inject `cms-binding-apply` explicitly. Hidden prompt decoration alone is not enough if runtime skill extraction only reads the visible `userMessage`.

## Block snapshot prerequisite

If the selector and block hint are not enough to decide safely, the later snapshot tooling should enrich the skill input with block metadata or a constrained block snapshot. The skill should still keep the decision scoped to the current block.

## HTML apply prerequisite

The later local HTML apply module should consume only `ready` decisions. It should not try to interpret `needs-clarification` or `incompatible` as direct write instructions.

## Phase 1A boundary

- Only `replace-current`
- Only block-scoped edits
- Only `nav` and `content-list`
- No CMS rebrowsing through `AskUserQuestion`
- No page-wide rewrite
