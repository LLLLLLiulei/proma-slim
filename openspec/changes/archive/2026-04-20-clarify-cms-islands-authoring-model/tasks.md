## 1. Prompt And Skill Boundaries

- [x] 1.1 Update `apps/app/resources/templates/page-builder-workspace-claude.md` so it explicitly describes page-builder as `HTML-first + host-managed CMS islands`, forbids self-managed Vue runtime/bootstrap, and forbids page-wide Vue mount for CMS rendering.
- [x] 1.2 Update `apps/app/default-skills/page-builder-guided-generation/` docs and tests so ordinary create/iterate flow keeps non-CMS regions in plain HTML/CSS/JS and does not introduce Vue authoring outside existing `cms-*` source tags.
- [x] 1.3 Update `apps/app/default-skills/cms-binding-apply/` docs and tests so the ready/apply path only authors `cms-*` source tags plus slot templates, and rejects author-managed Vue runtime or page-wide Vue solutions.

## 2. Vue Authoring Guardrails

- [x] 2.1 Extend `packages/page-builder-cms-rendering` validation to diagnose author-managed Vue runtime/bootstrap patterns in page-builder author HTML, while keeping Vue template syntax reserved to `cms-*` slot templates.
- [x] 2.2 Thread the new Vue boundary diagnostics through page-builder HTML mutation and turn-end guardrail flows so invalid author HTML fails closed instead of becoming a validated manifest/preview baseline.
- [x] 2.3 Add or update tests around `page-builder-agent-html-guardrails-service`, `page-builder-workspace-html-service`, and CMS rendering validation so author-added Vue runtime, importmap/CDN usage, or page-wide mount patterns are rejected.

## 3. Verification

- [x] 3.1 Run the relevant page-builder prompt/skill doc tests and CMS validation/guardrail tests, then fix any expectation drift.
- [x] 3.2 Review the final behavior across the target scenes: ordinary page creation, ordinary iteration on pages with CMS regions, confirmed CMS apply, and invalid author attempts to self-manage Vue runtime.
