## 1. Shared Handoff Contract

- [x] 1.1 Extend `PageBuilderCmsApplySkillInput` with an internal authoritative source context for `contents-by-catalog` without changing the external `PageBuilderCmsSelectionResult` protocol.
- [x] 1.2 Update the shared auto-handoff payload builder and related contract tests to preserve the original `selection` while serializing the new authoritative source context.

## 2. Authoritative Refresh Flow

- [x] 2.1 Implement `contents-by-catalog` authoritative refresh in the page-builder CMS auto-handoff service by resolving exact catalog metadata and a minimal contents probe from `siteId + catalogId`.
- [x] 2.2 Make the confirmed handoff fail closed when the authoritative catalog lookup or contents probe fails, instead of falling back to the tree snapshot.
- [x] 2.3 Add or update backend tests covering successful authoritative refresh, tree-snapshot/authority mismatch, and refresh failure behavior.

## 3. Apply Skill Semantics

- [x] 3.1 Update `cms-binding-apply` skill guidance and references so `contents-by-catalog` prioritizes authoritative source context over `selection.snapshot.catalog`.
- [x] 3.2 Update the skill guidance so a zero-result contents probe is treated as a valid empty-state-capable binding source rather than an automatic `incompatible` or `malformed-payload`.
- [x] 3.3 Add or update skill and contract tests to cover authoritative-source precedence and zero-content catalog handling.
- [x] 3.4 Update the skill/spec/examples so compatibility is judged by structure and contract only, not by whether CMS content semantics match the current placeholder module copy.

## 4. Final Verification

- [x] 4.1 Run the focused test suites for shared handoff payloads, CMS auto-handoff service behavior, and CMS binding skill docs/contracts.
- [x] 4.2 Manually verify that the change scope remains limited to `contents-by-catalog` confirmed handoff and does not alter the CMS browser tree protocol or broader browsing behavior.
