# CMS Catalog Detail Panel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a read-only CMS catalog detail panel on the right side of the catalog tab while keeping left-side catalog multi-select behavior.

**Architecture:** Extend the existing page-builder CMS pipeline with a dedicated catalog-detail type and route, then load and cache detail data in renderer state. The catalog tab keeps checkbox selection for confirmation, while a separate highlighted catalog drives the read-only detail panel.

**Tech Stack:** Bun, TypeScript, Hono, React, Ant Design, existing page-builder CMS gateway/state modules

---

## Chunk 1: Shared and Main

### Task 1: Add catalog detail types and failing tests
- [ ] Add `PageBuilderCmsCatalogDetail` to `packages/shared/src/types/page-builder-cms.ts`
- [ ] Add/adjust exports so app and renderer can consume the new type
- [ ] Add failing `CmsGateway` tests for normalized catalog detail
- [ ] Add failing route tests for `GET /api/page-builder/cms/catalogs/:catalogId`

### Task 2: Implement catalog detail gateway and route
- [ ] Add `CmsGateway.getCatalogDetail(catalogId)` in `apps/app/src/main/lib/cms-gateway.ts`
- [ ] Normalize `ID / innerCode / status / name / alias / contentType / info / logoSrc/logoFile`
- [ ] Reuse CMS asset URL resolution for logo
- [ ] Add page-builder route handler in `apps/app/src/main/http/routes/page-builder.ts`
- [ ] Re-run focused main tests until green

## Chunk 2: Renderer State and UI

### Task 3: Add renderer API/state support
- [ ] Add `getPageBuilderCmsCatalogDetail(catalogId)` to `apps/app/src/renderer/lib/api.ts`
- [ ] Extend `useCmsBrowserState` with detail async state and cache
- [ ] Keep current selected/highlighted catalog shared between catalog tab and content tab

### Task 4: Render the read-only detail panel
- [ ] Add failing renderer tests for catalog detail fetch/render
- [ ] Update `CmsCatalogTree` so check mode still supports selected/highlighted node
- [ ] Update `CmsBrowserDialog` catalog tab to a left-tree/right-detail layout
- [ ] Render only: catalog ID, inner code, status, name, alias, content type, description, logo
- [ ] Use existing asset proxy for logo display

## Chunk 3: Verification

### Task 5: Validate and polish
- [ ] Run focused renderer tests
- [ ] Run page-builder typecheck
- [ ] Run main-side tests for CMS routes/gateway
- [ ] Use Playwright to verify the new read-only detail panel with real CMS data
