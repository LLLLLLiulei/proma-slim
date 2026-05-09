## Why

`apps/app/src/main/lib` now contains a large number of Page Builder, CMS, preview and editing services mixed with generic Agent, workspace and platform utilities. This flat layout makes ownership hard to see, increases accidental coupling, and slows down future work toward a cleaner Agent platform plus Page Builder application boundary.

## What Changes

- Reorganize Page Builder server-side files into a dedicated `apps/app/src/main/modules/page-builder/` module tree.
- Move related tests with their source files so local test ownership remains clear.
- Group Page Builder server concerns by responsibility: HTTP adapters, project/edit-lock services, workspace bootstrap/template/html services, preview/bridge services, editing services, CMS integration, Agent runtime helpers, image-search runtime tools, and static export.
- Update imports and tests to use the new file locations.
- Remove incidental `.DS_Store` files from `apps/app/src/main` and `apps/app/src/main/lib` if present.
- Preserve all existing HTTP API paths, runtime behavior, storage paths, package boundaries and public contracts.
- Do not introduce a new package, do not split `apps/app/src/main/http/routes/workspaces.ts` into Page Builder subroutes in this change, and do not abstract Page Builder integration out of `agent-orchestrator.ts` yet.

## Capabilities

### New Capabilities
- `page-builder-server-module-organization`: Defines how Page Builder backend implementation files are organized inside the current app server and what behavioral boundaries this organization-only change must preserve.

### Modified Capabilities
- `lean-agent-codebase`: Extends the current codebase cleanup boundary to cover organizing reachable Page Builder server files instead of leaving them flat in the generic main-process library folder.

## Impact

- Affected code is limited to server-side file placement and import paths under `apps/app/src/main`, plus colocated tests.
- Existing endpoints under `/api/page-builder` and `/api/workspaces/:workspaceId/page-builder/*` remain unchanged.
- Existing Page Builder workspace files, config directories, CMS settings, preview bridge protocol strings, runtime MCP behavior and Agent session behavior remain unchanged.
- The change should be validated with TypeScript typecheck and focused server tests for Page Builder routes, workspace routes, CMS tools, preview, editing services, static export and Agent workspace runtime integration.
