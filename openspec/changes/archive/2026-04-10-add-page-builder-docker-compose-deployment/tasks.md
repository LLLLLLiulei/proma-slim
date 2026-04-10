## 1. Compose And Image Assets

- [x] 1.1 Add page builder deployment assets under `build/`, including `build/docker-compose.yml`, `build/.env.example`, and Dockerfiles that can be invoked directly from the `build/` directory
- [x] 1.2 Add a multi-stage Dockerfile for the `server` service that builds `@proma/app` from the workspace root and produces a Bun-based runtime image with Git available
- [x] 1.3 Add a multi-stage Dockerfile for the `web` service that builds `apps/page-builder` from the workspace root and produces a Bun-based runtime image

## 2. Page Builder Web Runtime

- [x] 2.1 Add a production Bun web entry for `web` that serves `apps/page-builder/dist` static files and falls back to the page builder SPA entry for builder routes
- [x] 2.2 Implement transparent `/api` proxying in the `web` runtime so REST and streamed session responses are forwarded to the internal `server` service without losing streaming semantics
- [x] 2.3 Wire the `web` container start command, exposed port `3333`, and upstream `http://server:8888` so the compose stack provides a single public page builder entrypoint

## 3. App Runtime And Persistence Wiring

- [x] 3.1 Wire the compose stack so the `server` service uses Docker-visible `AI_PAGE_BUILDER_*` variables that map to runtime `PROMA_CONFIG_DIR` and `PROMA_CLAUDE_HOME` paths rooted in `/home/bun/.ai-page-builder`
- [x] 3.2 Mount host `~/.ai-page-builder` into the `server` service and ensure the deployment defaults preserve page builder workspaces, sessions, exports, and CMS settings across container recreation
- [x] 3.3 Ensure the deployment assets expose required Anthropic runtime variables through external environment configuration rather than committed secret values

## 4. Verification And Documentation

- [x] 4.1 Add or update automated tests for the new production web runtime behavior, covering SPA fallback and `/api` proxy expectations in `apps/page-builder/src/server/prod-server.test.ts`
- [x] 4.2 Validate the compose-based startup path from `build/` and document the expected commands, exposed URL `http://127.0.0.1:3333`, and persistence behavior
- [x] 4.3 Perform an end-to-end smoke check that the deployed page builder can load, call `/api/status`, and retain state when containers are restarted against the same host `~/.ai-page-builder`
