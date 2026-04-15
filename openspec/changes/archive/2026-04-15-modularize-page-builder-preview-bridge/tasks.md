## 1. Preview Bridge Runtime Source Structure

- [x] 1.1 Create a dedicated preview bridge runtime source directory and entrypoint for the modularized bridge implementation.
- [x] 1.2 Split the existing bridge logic into focused modules for bootstrap, protocol, selection, CMS island targeting, overlays, inline editing, and shared runtime state.
- [x] 1.3 Recompose the modular source through a single bridge entry while preserving the current preview bridge runtime behavior.

## 2. Single-Asset Bridge Delivery

- [x] 2.1 Update `page-builder-preview-bridge.ts` to build/read the modular bridge entry as a single preview bridge asset instead of directly reading the monolithic resource file.
- [x] 2.2 Preserve the existing `/api/page-builder/preview-bridge.js` asset contract, source token replacement, and asset versioning semantics after the modularization.
- [x] 2.3 Keep preview HTML injection behavior unchanged in the page-builder routes and workspace preview flow while switching the bridge asset source.

## 3. Verification and Cleanup

- [x] 3.1 Replace brittle bundled-script string assertions with focused runtime behavior tests for the modular bridge responsibilities.
- [x] 3.2 Keep or add bridge asset smoke tests that verify single-asset readability, token injection, and version changes when bridge source content changes.
- [x] 3.3 Remove or retire the old monolithic bridge source path once the modular source and single-asset delivery path are fully in use.
