# CMS Ant Design Dialog Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace only the CMS dialog inner content area with Ant Design tree/list/pagination components and tighten the layout.

**Architecture:** Keep the existing Radix dialog and tabs shell. Replace the current custom tree and content list internals with Ant Design `Tree`, `List`, `Card`, `Pagination`, and status helpers, while extending the CMS browser state hook to support paginated content loading.

**Tech Stack:** React 18, TypeScript, Ant Design v5, existing Proma Radix dialog shell, Bun tests.

---

## Chunk 1: Dependencies and state contract

### Task 1: Add failing tests for paginated content browsing

**Files:**
- Modify: `apps/page-builder/src/renderer/components/builder/CmsBrowserDialog.test.tsx`
- Modify: `apps/page-builder/src/renderer/components/builder/useCmsBrowserState.ts`

- [ ] Add a failing test asserting the contents API is called with page index and page size changes.
- [ ] Run the focused test and confirm it fails for missing pagination state.
- [ ] Implement minimal pagination state in `useCmsBrowserState`.
- [ ] Re-run focused tests and confirm they pass.

### Task 2: Add Ant Design dependency and adapter test coverage

**Files:**
- Modify: `apps/page-builder/package.json`
- Modify: `apps/page-builder/src/renderer/components/builder/CmsCatalogTree.test.tsx`

- [ ] Add `antd` dependency.
- [ ] Add a failing test asserting the CMS tree wrapper now renders Ant Design `Tree` props instead of rc-tree-specific props.
- [ ] Run focused tests and confirm failure.
- [ ] Update wrapper to pass with Ant Design component contract.
- [ ] Re-run focused tests and confirm pass.

## Chunk 2: UI replacement

### Task 3: Replace the catalog tree internals

**Files:**
- Modify: `apps/page-builder/src/renderer/components/builder/CmsCatalogTree.tsx`
- Modify: `apps/page-builder/src/renderer/components/builder/CmsCatalogTree.test.tsx`

- [ ] Keep current input props but map them into Ant Design `TreeDataNode[]`.
- [ ] Use Ant Design `Tree` built-in switcher, selection, and compact block styling.
- [ ] Verify focused tests pass.

### Task 4: Replace the content list internals with compact Ant Design cards + pagination

**Files:**
- Modify: `apps/page-builder/src/renderer/components/builder/CmsContentList.tsx`
- Modify: `apps/page-builder/src/renderer/components/builder/CmsBrowserDialog.tsx`
- Modify: `apps/page-builder/src/renderer/components/builder/CmsBrowserDialog.test.tsx`

- [ ] Add failing tests for pagination controls and compact content rendering.
- [ ] Run focused tests and confirm failure.
- [ ] Implement Ant Design `List`/`Card`/`Pagination` based content area.
- [ ] Re-run focused tests and confirm pass.

## Chunk 3: Tighten layout and validate

### Task 5: Tighten dialog spacing while preserving shell

**Files:**
- Modify: `apps/page-builder/src/renderer/styles/page-builder.css`
- Modify: `apps/page-builder/src/renderer/components/builder/CmsBrowserDialog.tsx`

- [ ] Reduce inner paddings, narrow the left tree column, and ensure the pagination sits at the bottom.
- [ ] Keep styling scoped to CMS dialog content area.
- [ ] Verify tests remain green.

### Task 6: Final verification

**Files:**
- Test: `apps/page-builder/src/renderer/components/builder/CmsCatalogTree.test.tsx`
- Test: `apps/page-builder/src/renderer/components/builder/CmsBrowserDialog.test.tsx`
- Test: `apps/page-builder/src/renderer/pages/BuilderPage.test.tsx`

- [ ] Run focused bun tests.
- [ ] Run `bun run --filter='@proma/page-builder' typecheck`.
- [ ] Use Playwright against the live CMS dialog to confirm tree, compact cards, and pagination render correctly.
