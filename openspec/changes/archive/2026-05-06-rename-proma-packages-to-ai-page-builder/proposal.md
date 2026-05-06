## Why

The repository package identity still uses the historical `proma` / `@proma/*` names while the current product and deployment surface are centered on AI Page Builder. Renaming the workspace packages to `ai-page-builder` / `@ai-page-builder/*` makes package metadata, workspace filters and developer commands match the current product identity before more package restructuring happens.

## What Changes

- **BREAKING** Rename the root private package from `proma` to `ai-page-builder`.
- **BREAKING** Rename all active workspace package names from the `@proma/*` scope to the `@ai-page-builder/*` scope:
  - `@proma/app` -> `@ai-page-builder/app`
  - `@proma/page-builder` -> `@ai-page-builder/page-builder`
  - `@proma/shared` -> `@ai-page-builder/shared`
  - `@proma/ui` -> `@ai-page-builder/ui`
  - `@proma/page-builder-cms-rendering` -> `@ai-page-builder/page-builder-cms-rendering`
  - `@proma/cms-vue-islands-demo` -> `@ai-page-builder/cms-vue-islands-demo`
- Update package dependencies, workspace filter scripts, TypeScript import specifiers, dynamic imports, `tsconfig` package paths, Docker build filters, README command examples and package identity tests to use the new scope.
- Update lockfiles after package identity changes.
- Keep runtime namespace compatibility out of scope: do not rename `PROMA_*` environment variables, `~/.proma` / `~/.proma-dev` config directories, `data-proma-*` DOM attributes, `__PROMA_*` globals, `proma:*` events/localStorage keys, or the internal `proma.bun.version` package metadata field in this change.
- Preserve archived OpenSpec/history documents unless they describe current active package identity; historical records may keep `proma` names for accuracy.

## Capabilities

### New Capabilities
- `workspace-package-identity`: Defines the active root and workspace package names, the package-scope rename boundary, and the compatibility rules for what this rename must not change.

### Modified Capabilities
- `app-workspace-identity`: Updates the current main application workspace identity requirement from `@proma/app` to `@ai-page-builder/app` while keeping `apps/app` and the existing internal `src/main` / `src/renderer` structure unchanged.

## Impact

- Affected files include root and workspace `package.json` files, `bun.lock`, `pnpm-lock.yaml`, TypeScript source imports, package path aliases, Dockerfiles, package-focused tests and current README command examples.
- The rename is a source-level package identity breaking change for any code or tooling importing `@proma/*` packages.
- Public HTTP APIs, Page Builder URLs, runtime data locations, environment variables, DOM protocol attributes, storage keys and persisted user/workspace data are not intended to change.
