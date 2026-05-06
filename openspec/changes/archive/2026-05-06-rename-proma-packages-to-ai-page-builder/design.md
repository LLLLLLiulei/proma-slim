## Context

Current package identity is split from the current product identity:

- Root `package.json` is named `proma`.
- Active workspace packages use the `@proma/*` scope.
- Root scripts and Dockerfiles use Bun workspace filters such as `@proma/app` and `@proma/page-builder`.
- TypeScript source and tests import active workspace packages through `@proma/shared`, `@proma/ui` and `@proma/page-builder-cms-rendering`.
- `apps/app/tsconfig.json` defines package path aliases for `@proma/page-builder-cms-rendering` subpaths.
- `bun.lock` and `pnpm-lock.yaml` record the old package names.

The intended change is package identity only. The repo still contains runtime namespace names such as `PROMA_CONFIG_DIR`, `~/.proma`, `data-proma-*`, `__PROMA_*`, and `proma:*`. Those names are persisted or protocol-level compatibility surfaces and are intentionally not part of this package rename.

## Goals / Non-Goals

**Goals:**

- Rename the root private package to `ai-page-builder`.
- Rename every active workspace package from `@proma/*` to `@ai-page-builder/*`.
- Update code, tests and build tooling so workspace resolution, imports, typecheck, tests and Docker build filters use the new package identity.
- Update current developer-facing package metadata and command examples where they refer to active package names.
- Preserve runtime behavior, public URLs and persisted data compatibility.

**Non-Goals:**

- Do not rename directories such as `apps/app`, `apps/page-builder` or `packages/shared`.
- Do not rename environment variables such as `PROMA_CONFIG_DIR`, `PROMA_CLAUDE_HOME` or `PROMA_CMS_*`.
- Do not rename config/data directories such as `~/.proma`, `~/.proma-dev`, workspace-local `.proma` directories or existing generated manifests.
- Do not rename DOM attributes, browser globals, event names or storage keys such as `data-proma-*`, `__PROMA_*`, `proma:*` or `proma:page-builder-edit-lock:*`.
- Do not rename the internal `apps/app/package.json` metadata key `proma.bun.version`; it remains an internal tool config consumed by `apps/app/scripts/download-bun.ts`.
- Do not rewrite archived OpenSpec history solely for old names.

## Decisions

### Decision: Rename package scope in one atomic change

All active workspace package names and all active imports should move from `@proma/*` to `@ai-page-builder/*` together.

Rationale:

- Mixed scopes create brittle workspace state: some packages would resolve through the new identity while source imports still require the old identity.
- Bun workspace filters and lockfiles are package-name based, so partial renames are easy to miss.
- This is a source-level breaking package identity change; keeping it atomic makes validation and rollback clear.

Alternative considered: keep compatibility aliases under both scopes. This was rejected for this phase because there is no package publishing layer here, the workspace is private, and aliases would add maintenance surface without preserving runtime user data.

### Decision: Keep runtime namespace names unchanged

Only package identity changes. Runtime namespace names stay as-is.

Rationale:

- `PROMA_*` and `~/.proma` are user/deployment compatibility surfaces.
- `data-proma-*`, `__PROMA_*` and `proma:*` are page-builder/CMS rendering protocols and may exist in saved HTML, manifests or browser state.
- Renaming those requires explicit migration and backward-compatibility design, which is not necessary for npm/workspace package identity.

Alternative considered: full brand rename. This was rejected for this change because it would combine package rename with persisted data migration and page protocol migration.

### Decision: Keep directories unchanged

`apps/app`, `apps/page-builder` and `packages/*` directory names remain unchanged.

Rationale:

- Directory moves would be a structural refactor and would interact with ongoing architecture restructuring decisions.
- Current scripts, Vite roots, Docker contexts and OpenSpec specs already depend on these paths.
- Package names can be updated without changing runtime entry paths.

### Decision: Update current specs and tests, preserve historical archives

The active `app-workspace-identity` spec must reflect `@ai-page-builder/app`. Current tests and package examples must also use the new scope. Archived changes may keep historical `@proma/*` references.

Rationale:

- Active specs define current expected behavior.
- Archive materials record historical decisions and should not be mass-edited unless they create active validation failures.

Implementation scope for documentation updates:

- Update tracked current-state package identity references that use active package specifiers such as `@proma/app`, `@proma/shared`, `@proma/ui`, `@proma/page-builder` or `@proma/page-builder-cms-rendering`.
- Update current command examples that use Bun workspace filters with active `@proma/*` package names.
- Do not rewrite archive/history documents solely because they mention `Proma`, `proma` or `@proma/*`.
- Do not rewrite runtime namespace documentation for `PROMA_*`, `~/.proma`, `~/.proma-dev`, workspace-local `.proma`, `data-proma-*`, `__PROMA_*` or `proma:*`; those names intentionally remain compatible runtime surfaces in this change.

## Risks / Trade-offs

- [Risk] A missed `@proma/*` import or workspace filter will fail typecheck/build after package names change. → Mitigation: use `rg '@proma/'`, run `bun run typecheck`, `bun test` or targeted package tests, and inspect lockfile changes.
- [Risk] Lockfiles can retain stale old package names. → Mitigation: regenerate/update lockfiles after package changes and verify no active lockfile entry references active `@proma/*` workspace packages.
- [Risk] Over-broad replacement could accidentally rename runtime protocol names such as `data-proma-*`. → Mitigation: restrict replacements to package specifiers, package metadata, build filters, tsconfig path aliases and current docs/tests; explicitly verify runtime namespace strings remain unchanged.
- [Risk] External scripts that call `bun run --filter='@proma/app'` will break. → Mitigation: document this as the intentional breaking package identity rename and update repo-owned scripts/docs.

## Migration Plan

1. Update root and workspace `package.json` names, workspace dependencies, root scripts and package descriptions where package metadata references the old active identity.
2. Replace active TypeScript import specifiers and dynamic imports from `@proma/*` to `@ai-page-builder/*`.
3. Update `apps/app/tsconfig.json` path aliases for `@ai-page-builder/page-builder-cms-rendering` and its subpaths.
4. Update Dockerfile Bun filters, current package-filter command examples and current package identity tests.
5. Regenerate/update `bun.lock` and `pnpm-lock.yaml`.
6. Validate with typecheck, tests relevant to package identity, OpenSpec validation and a final `@proma/` active-package-reference search. Remaining `@proma/` matches are acceptable only in explicitly excluded archive/history contexts.

Rollback is straightforward at source level: revert the package identity commit. No runtime data migration is performed by this change.
