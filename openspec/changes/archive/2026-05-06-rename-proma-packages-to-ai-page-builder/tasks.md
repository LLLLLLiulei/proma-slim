## 1. Package metadata and workspace routing

- [x] 1.1 Rename the root private package from `proma` to `ai-page-builder`
- [x] 1.2 Rename `apps/app` package from `@proma/app` to `@ai-page-builder/app`
- [x] 1.3 Rename `apps/page-builder` package from `@proma/page-builder` to `@ai-page-builder/page-builder`
- [x] 1.4 Rename package workspaces under `packages/*` from `@proma/*` to `@ai-page-builder/*`
- [x] 1.5 Update workspace dependency keys in all active `package.json` files to the `@ai-page-builder/*` scope
- [x] 1.6 Update root workspace scripts to filter `@ai-page-builder/app` and `@ai-page-builder/page-builder`
- [x] 1.7 Update package descriptions or current package metadata that explicitly says `Proma` / `proma`, without changing runtime namespace fields such as `proma.bun.version`

## 2. Source imports and package path aliases

- [x] 2.1 Replace active static TypeScript/JavaScript imports from `@proma/shared` with `@ai-page-builder/shared`
- [x] 2.2 Replace active imports from `@proma/ui` with `@ai-page-builder/ui`
- [x] 2.3 Replace active imports from `@proma/page-builder-cms-rendering` and its subpaths with `@ai-page-builder/page-builder-cms-rendering`
- [x] 2.4 Replace dynamic imports and TypeScript import types that reference `@proma/*`
- [x] 2.5 Update `apps/app/tsconfig.json` package aliases to the `@ai-page-builder/page-builder-cms-rendering` scope
- [x] 2.6 Verify active source no longer imports workspace packages through `@proma/*`

## 3. Tooling, docs and tests

- [x] 3.1 Update Page Builder Dockerfiles to use `@ai-page-builder/*` Bun workspace filters
- [x] 3.2 Update current tracked command examples that use active `@proma/*` workspace filters
- [x] 3.3 Update package identity tests in `package.test.ts` and `apps/app/package.test.ts`
- [x] 3.4 Update tracked current-state package identity references that use active `@proma/*` package specifiers; do not rewrite archive/history docs or runtime namespace references such as `PROMA_*`, `~/.proma`, `data-proma-*`, `__PROMA_*`, or `proma:*`
- [x] 3.5 Regenerate or update `bun.lock` after package identity changes
- [x] 3.6 Regenerate or update `pnpm-lock.yaml` after package identity changes if it remains in the repo

## 4. Compatibility guardrails

- [x] 4.1 Confirm `PROMA_*` environment variable names remain unchanged
- [x] 4.2 Confirm `~/.proma`, `~/.proma-dev` and workspace-local `.proma` data paths remain unchanged
- [x] 4.3 Confirm `data-proma-*`, `__PROMA_*`, `proma:*` and `proma:page-builder-edit-lock:*` protocol/storage names remain unchanged
- [x] 4.4 Confirm `apps/app/package.json` keeps the internal `proma.bun.version` metadata field and `apps/app/scripts/download-bun.ts` remains compatible

## 5. Verification

- [x] 5.1 Run `bun run typecheck`
- [x] 5.2 Run package identity tests or `bun test package.test.ts apps/app/package.test.ts`
- [x] 5.3 Run or document lockfile/package-manager verification after dependency rename
- [x] 5.4 Run `openspec validate rename-proma-packages-to-ai-page-builder --strict`
- [x] 5.5 Run `rg '@proma/'` and verify remaining matches are limited to archive/history contexts explicitly excluded by this change
- [x] 5.6 Review final diff to confirm the change is package identity only and does not modify runtime behavior or persisted data namespace
