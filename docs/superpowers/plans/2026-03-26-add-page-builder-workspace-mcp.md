# Add Page Builder Workspace MCP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically persist the default Playwright and sequential-thinking MCP servers for new `page-builder` workspaces and pass workspace MCP config to Claude Agent SDK with stable stdio startup options.

**Architecture:** Keep `mcp.json` as the only persisted source of truth. Add a focused page-builder workspace bootstrap module that owns default MCP definitions and idempotent merge behavior, then refine `agent-orchestrator` so it converts persisted workspace MCP entries into SDK `mcpServers` with merged `PATH`, `startup_timeout_sec`, and `required: false`.

**Tech Stack:** Bun, TypeScript, Bun test, Claude Agent SDK.

---

## Chunk 1: Lock The Behavior In Tests

### Task 1: Add failing tests for page-builder workspace MCP bootstrap

**Files:**
- Create: `apps/app/src/main/lib/page-builder-workspace-bootstrap.test.ts`
- Modify: `apps/app/src/main/lib/workspace-service.test.ts`
- Modify later: `apps/app/src/main/lib/page-builder-workspace-bootstrap.ts`

- [ ] Add a workspace creation test showing new `page-builder` workspaces persist default `playwright` and `server-sequential-thinking` MCP entries.
- [ ] Add a unit test showing repeated page-builder bootstrap does not overwrite an existing same-name MCP config and only fills missing defaults.
- [ ] Run `bun test apps/app/src/main/lib/workspace-service.test.ts apps/app/src/main/lib/page-builder-workspace-bootstrap.test.ts` and confirm the new assertions fail before production edits.

### Task 2: Add failing tests for workspace MCP runtime mapping

**Files:**
- Modify: `apps/app/src/main/lib/agent-orchestrator.workspace.test.ts`
- Modify later: `apps/app/src/main/lib/agent-orchestrator.ts`

- [ ] Add a test showing stdio MCP entries passed to the adapter include merged `PATH`, `startup_timeout_sec`, and `required: false`.
- [ ] Add a test showing http/sse workspace MCP entries remain workspace-scoped and are passed as non-required services.
- [ ] Run `bun test apps/app/src/main/lib/agent-orchestrator.workspace.test.ts` and confirm the new assertions fail before production edits.

## Chunk 2: Implement Workspace Bootstrap

### Task 3: Introduce a dedicated page-builder MCP bootstrap module

**Files:**
- Create: `apps/app/src/main/lib/page-builder-workspace-bootstrap.ts`
- Modify: `apps/app/src/main/lib/workspace-service.ts`
- Modify: `apps/app/src/main/lib/workspace-template-service.ts` only if bootstrap reuse needs a narrower exported helper

- [ ] Define the default page-builder MCP server entries in one focused module.
- [ ] Implement idempotent merge logic that preserves existing same-name server configs and only fills missing defaults.
- [ ] Wire `createAgentWorkspace(..., { template: 'page-builder' })` to run the bootstrap so `CLAUDE.md` and `mcp.json` are prepared together.

## Chunk 3: Implement Runtime Mapping

### Task 4: Refine orchestrator MCP-to-SDK mapping

**Files:**
- Modify: `apps/app/src/main/lib/agent-orchestrator.ts`

- [ ] Keep loading only enabled workspace-persisted MCP entries.
- [ ] For stdio entries, merge `PATH` into `env`, map `timeout` to `startup_timeout_sec`, and set `required: false`.
- [ ] For http/sse entries, preserve `url` and `headers` while also setting `required: false`.

## Chunk 4: Verify And Close The Change

### Task 5: Run focused verification and update tracking

**Files:**
- Modify: `openspec/changes/add-page-builder-workspace-mcp/tasks.md`

- [ ] Run `bun test apps/app/src/main/lib/workspace-service.test.ts apps/app/src/main/lib/page-builder-workspace-bootstrap.test.ts apps/app/src/main/lib/agent-orchestrator.workspace.test.ts`.
- [ ] Mark the corresponding OpenSpec tasks complete once the code and tests are green.
- [ ] Request code review on the resulting diff before reporting completion.
