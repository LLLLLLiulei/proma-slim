## 1. Shared Contract And Browser Selection

- [x] 1.1 Update `packages/shared/src/types/page-builder-cms*.ts` and related contract typechecks to represent `catalogs-by-parent`, `catalogs-by-ids`, `contents-by-catalog`, and `contents-by-ids`, plus the expanded `nav | catalog-list | content-list` block semantics.
- [x] 1.2 Update `apps/page-builder/src/renderer/components/builder/CmsBrowserDialog.tsx` and related state/helpers so confirm actions map selected vs checked state into the new source modes and block invalid `catalogs-by-parent` confirmation when the current catalog has no direct children.
- [x] 1.3 Refresh browser dialog and shared contract tests to cover the new payload shapes, priority rules, and disabled-confirm behavior.

## 2. Auto Handoff And CMS Apply Skill

- [x] 2.1 Update `apps/page-builder/src/renderer/lib/cms-auto-agent-handoff.ts` and shared apply input types so auto handoff preserves the new `sourceType` payload fields without collapsing them back to old UI semantics.
- [x] 2.2 Update `apps/app/default-skills/cms-binding-apply/*` and any host-side helpers so the skill decides readiness from source mode plus target block intent, supports `catalog-list`, and uses only one short clarification when `nav` vs `catalog-list` is ambiguous.
- [x] 2.3 Refresh handoff and skill tests to cover the new source modes, fixed-ids readiness, and short-clarification path.

## 3. Formal Apply Tool And Shared Rendering Core

- [x] 3.1 Extend `apps/app/src/main/lib/page-builder-cms-rendering-tools.ts` so `apply_cms_binding` can generate `cms-catalog` parent / ids modes and `cms-content` catalog / ids modes while continuing to require explicit `site-id`.
- [x] 3.2 Extend `packages/page-builder-cms-rendering/src/components/*`, shared runtime query types, template scanners, and validator logic to accept `ids`, enforce mutually exclusive source props, and keep fixed-ids ordering stable.
- [x] 3.3 Refresh apply tool, rendering core, manifest scan, template, and validator tests for the new authoring props and source-mode rules.

## 4. Host Exact-Id Read Path

- [x] 4.1 Implement host-managed exact-id reads in `apps/app/src/main/lib/cms-gateway.ts`, related routes, and runtime adapters for fixed catalog ids and fixed content ids without falling back to full catalog-tree or full content-list loading.
- [x] 4.2 Ensure exact-id reads preserve input order, default-drop invalid ids, return empty when all ids are invalid, and incorporate ordered ids into relevant cache keys.
- [x] 4.3 Add gateway, route, browser-client, and server-client tests covering exact-id reads, non-full-load behavior, and invalid-id degradation semantics.

## 5. Preview And Static Export Integration

- [x] 5.1 Update preview-side CMS runtime integration so browser preview can request fixed ids through host-managed exact-id paths and surface the same ordering / drop-invalid behavior as the shared core contract.
- [x] 5.2 Update static export prefetch and SSR flow so fixed-ids islands use exact-id reads, preserve ordering, and render empty state when all requested ids are invalid.
- [x] 5.3 Refresh preview, export, and end-to-end CMS rendering tests to cover the new fixed-ids and by-parent/by-catalog modes across authoring, preview, and staticized output.
