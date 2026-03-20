## 1. HTTP application setup

- [x] 1.1 Add `hono` to `apps/electron/package.json` and prepare the new `apps/electron/src/main/http/` module layout
- [x] 1.2 Extract shared HTTP response and error helpers into reusable modules for JSON, 204, and known HTTP failure mapping
- [x] 1.3 Create the shared Hono app entry that wires global error handling and separates `/api/*` handling from static asset fallback

## 2. Route and middleware migration

- [x] 2.1 Migrate status, settings, and user-profile endpoints into dedicated Hono route modules while preserving existing methods and payloads
- [x] 2.2 Add shared middleware for workspace and session resource loading so route handlers stop duplicating existence checks
- [x] 2.3 Migrate workspace REST endpoints into a dedicated Hono route module without changing current CRUD, capability, or directory-context behavior
- [x] 2.4 Migrate session REST endpoints for list/create/delete/update/messages/move/stop/permission/ask-user into a dedicated Hono route module without changing current behavior

## 3. SSE and server bootstrap integration

- [x] 3.1 Migrate `POST /api/sessions/:id/send` into the Hono session route module while reusing the existing SSE manager and agent runtime flow
- [x] 3.2 Update `createHttpServer()` to serve the Hono app through `Bun.serve({ fetch })` and keep existing port, timeout, and top-level error behavior
- [x] 3.3 Remove or fully retire the old single-file router implementation so the main process has one canonical HTTP entrypoint

## 4. Verification and cleanup

- [x] 4.1 Rewrite backend HTTP tests to target the shared Hono app entry and preserve coverage for workspace/session success and failure paths
- [x] 4.2 Add regression coverage for unknown `/api/*` routes, production static fallback behavior, and the SSE send endpoint compatibility path
- [x] 4.3 Run `bun test` and `bun run --filter='@proma/electron' typecheck`, then fix any migration regressions before closing the change
