## 1. Shared Contracts And Preview Identity

- [x] 1.1 Extend shared `PageBuilderCmsIslandTargetSelection` and related contract examples to carry stable CMS `sourceId` while preserving selector fallback for legacy pages
- [x] 1.2 Update CMS preview bootstrap, manifest scanning, and preview bridge runtime to annotate, propagate, and resolve CMS island `sourceId`
- [x] 1.3 Update builder-side preview selection serialization, CMS selection results, and CMS auto handoff payload builders to preserve the new CMS target identity and source-first guardrail fields

## 2. Source-Scoped Authoring Guardrails

- [x] 2.1 Add source-id aware CMS target resolution utilities for supported page-builder HTML mutation paths, with selector fallback only for legacy pages
- [x] 2.2 Update `apply_cms_binding` and other `targetSelection`-aware CMS/block mutation flows to fail closed on stale, conflicting, or non-unique CMS targets instead of guessing fallback blocks
- [x] 2.3 Reject `<script>` and `<style>` inside CMS template fields at the CMS apply tool boundary
- [x] 2.4 Make the unified page-builder HTML mutation pipeline treat blocking CMS validation errors, including `DANGEROUS_TAG` and duplicate CMS source identities, as failed mutations with rollback

## 3. Guidance, Compatibility, And Verification

- [x] 3.1 Align ordinary selected-target message decoration and CMS auto handoff instructions so both explicitly forbid rendered-child writes, sibling block mutation, sibling CMS insertion, and dangerous CMS slot tags
- [x] 3.2 Update page-builder workspace guidance, CMS apply skill docs, and contract references to describe source-first CMS editing and legacy selector fallback behavior
- [x] 3.3 Add or update tests for stable `sourceId` propagation, legacy fallback, conflicting CMS identity rejection, dangerous-tag rejection, and mutation rollback behavior
