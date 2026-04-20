## 1. Root Prompt Layering

- [x] 1.1 Rewrite `apps/app/resources/templates/page-builder-workspace-claude.md` so it keeps only workspace output rules, end-user interaction hard boundaries, scene routing, and CMS global boundaries.
- [x] 1.2 Update any template assertions that currently require `CLAUDE.md` to repeat guided-generation or CMS apply internals, and replace them with responsibility-layer checks.

## 2. Guided Generation Refactor

- [x] 2.1 Refactor `apps/app/default-skills/page-builder-guided-generation/SKILL.md` so it focuses on ordinary end-user briefing, must-ask/conditional-ask/confirmation flow, lightweight iteration, and source-atomic handling of existing CMS source tags.
- [x] 2.2 Update `apps/app/default-skills/page-builder-guided-generation/references/briefing-thresholds.md` so its must-ask, conditional-ask, final confirmation, and overwrite-confirmation language matches the streamlined guided-generation contract.
- [x] 2.3 Remove or shrink default CMS guidance in `page-builder-guided-generation` references so ordinary flow no longer teaches new `cms-*` authoring and instead routes new CMS binding intent to the controlled CMS flow.
- [x] 2.4 Update guided-generation doc tests to validate stop-asking thresholds, ordinary-flow ownership, source-atomic existing CMS handling, and CMS pre-selection boundaries without requiring duplicated wording in the root template.

## 3. CMS Apply Skill Refactor

- [x] 3.1 Refactor `apps/app/default-skills/cms-binding-apply/SKILL.md` into a clearer Phase 1A decision algorithm with explicit input checks, `ready / needs-clarification / incompatible`, a `ready` apply checklist, and a same-turn `mcp__cms__apply_cms_binding` path.
- [x] 3.2 Reorganize `cms-binding-apply` references so long examples, anti-patterns, and downstream integration notes stay in reference files, while the main skill prompt stays focused on the current-turn decision path.
- [x] 3.3 Update cms apply doc tests to check preserve-shell/in-place replace behavior, one-short-clarification behavior, main-skill-vs-reference responsibility split, and the exclusive controlled path for new or rebound `cms-*` tags.

## 4. Validation

- [x] 4.1 Run the relevant page-builder prompt and skill documentation tests after the refactor and fix any expectation drift.
- [x] 4.2 Review the final prompt surfaces against the four target scenes: ordinary page creation, ordinary iteration, CMS pre-selection intent, and confirmed CMS apply.
