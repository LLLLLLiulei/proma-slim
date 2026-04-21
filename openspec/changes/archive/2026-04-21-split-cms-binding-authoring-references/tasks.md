## 1. Reference Restructure

- [x] 1.1 Update `apps/app/default-skills/cms-binding-apply/SKILL.md` so it routes readers through a lightweight decision/index reference first, then to `cms-catalog` or `cms-content` guidance based on `selection.selectionKind` / `authoringContext.component`, and to shared rules only for cross-component boundaries.
- [x] 1.2 Rewrite `apps/app/default-skills/cms-binding-apply/references/contract-examples.md` into a lightweight entry file that keeps only minimal payload/result examples plus explicit routing to the component-specific guidance files.
- [x] 1.3 Add a shared rules reference under `apps/app/default-skills/cms-binding-apply/references/` that centralizes slot inner content rules, HTML-first/Vue boundary rules, shared anti-patterns, and apply payload boundary notes.
- [x] 1.4 Add component-specific authoring references for `cms-catalog` and `cms-content` under `apps/app/default-skills/cms-binding-apply/references/`, covering applicable source modes, required props, slot scope, item-field semantics, and common recipes aligned to the canonical contract.

## 2. Contract Alignment And Tests

- [x] 2.1 Update `apps/app/src/main/lib/cms-binding-apply-skill.test.ts` so it checks the new layered reference structure, component-specific routing, and shared-rules split instead of assuming one mixed examples file contains everything.
- [x] 2.2 Add or adjust assertions so the `cms-catalog` guidance only exposes catalog-specific props/fields, the `cms-content` guidance only exposes content-specific props/fields, and shared anti-patterns remain outside the component-specific files.

## 3. Verification

- [x] 3.1 Run the relevant `cms-binding-apply` skill documentation tests and fix any expectation drift introduced by the reference split.
- [x] 3.2 Review the final docs against the target scenes: catalog selection, content selection, shared authoring boundaries, and malformed/clarification decision examples.
