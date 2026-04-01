# Page Builder CMS SDK Tools Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable `page-builder` sessions to use host-managed in-process Claude Agent SDK CMS tools backed by the internal CMS APIs.

**Architecture:** Keep existing workspace-persisted external MCP behavior intact, then add a separate runtime-only SDK MCP merge path for `page-builder` queries. Introduce a host `CmsGateway` for config, auth, and response normalization, and switch runtime-tool queries from raw string prompts to a single streamed `SDKUserMessage`.

**Tech Stack:** TypeScript, Bun test, Claude Agent SDK 0.2.76, Hono/Node main-process runtime

---

### Task 1: Extend Query Input Types

**Files:**
- Modify: `packages/shared/src/types/agent-provider.ts`
- Modify: `apps/app/src/main/lib/adapters/claude-agent-adapter.ts`
- Test: `apps/app/src/main/lib/adapters/claude-agent-adapter.test.ts`

- [ ] **Step 1: Write the failing adapter test for streamed prompt + runtime MCP config**
- [ ] **Step 2: Run the targeted adapter test and verify it fails for missing prompt/MCP pass-through**
- [ ] **Step 3: Extend provider and adapter query types to support streamed `SDKUserMessage` input and SDK MCP config**
- [ ] **Step 4: Re-run the targeted adapter test and verify it passes**

### Task 2: Add Runtime CMS MCP Merge Path

**Files:**
- Modify: `apps/app/src/main/lib/agent-orchestrator.ts`
- Modify: `apps/app/src/main/lib/agent-orchestrator.workspace.test.ts`

- [ ] **Step 1: Write failing orchestrator tests for runtime SDK MCP merge, streamed prompt mode, and dynamic allowlist**
- [ ] **Step 2: Run the targeted orchestrator tests and verify they fail**
- [ ] **Step 3: Implement runtime SDK MCP merge, single-message streamed prompt wrapping, and query-level allowlist merge**
- [ ] **Step 4: Re-run the targeted orchestrator tests and verify they pass**

### Task 3: Implement CMS Gateway and Runtime Tools

**Files:**
- Create: `apps/app/src/main/lib/page-builder-cms-config.ts`
- Create: `apps/app/src/main/lib/cms-gateway.ts`
- Create: `apps/app/src/main/lib/cms-sdk-tools.ts`
- Test: `apps/app/src/main/lib/cms-gateway.test.ts`

- [ ] **Step 1: Write failing gateway tests for config resolution, auth header/cookie handling, error sanitization, and normalization**
- [ ] **Step 2: Run the targeted gateway tests and verify they fail**
- [ ] **Step 3: Implement config resolution from env, gateway HTTP calls, normalization helpers, and `createSdkMcpServer()` tool builder**
- [ ] **Step 4: Re-run the targeted gateway tests and verify they pass**

### Task 4: Integrate and Regressions

**Files:**
- Modify: `openspec/changes/add-page-builder-cms-sdk-tools/tasks.md`
- Test: `apps/app/src/main/lib/adapters/claude-agent-adapter.test.ts`
- Test: `apps/app/src/main/lib/agent-orchestrator.workspace.test.ts`
- Test: `apps/app/src/main/lib/cms-gateway.test.ts`

- [ ] **Step 1: Run the focused Bun test set for adapter, orchestrator, and CMS gateway**
- [ ] **Step 2: Fix any regressions without widening scope**
- [ ] **Step 3: Mark completed OpenSpec tasks in `tasks.md`**
