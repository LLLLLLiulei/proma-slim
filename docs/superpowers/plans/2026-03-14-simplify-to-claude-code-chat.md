# Simplify To Claude Code Chat Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current Electron desktop app into a Bun-backed web app that keeps only the Claude Code session flow, tool activity display, permission prompts, ask-user prompts, session management, and theme settings.

**Architecture:** Keep the existing monorepo and reuse the current session persistence and agent event shapes where that lowers risk. Replace Electron IPC with Bun REST + SSE on the backend, replace `window.electronAPI` with a typed browser API client on the frontend, then remove the unused Electron, chat, channel, workspace, Feishu, updater, and onboarding code once the web path is live.

**Tech Stack:** Bun, TypeScript, Vite, React 18, Jotai, Tailwind, Shadcn UI, `@anthropic-ai/claude-agent-sdk`

---

## Chunk 1: Backend Web Foundation

### Task 1: Add a web-first backend surface without deleting the old app yet

**Files:**
- Create: `apps/electron/src/main/http-server.ts`
- Create: `apps/electron/src/main/http-router.ts`
- Create: `apps/electron/src/main/sse-manager.ts`
- Create: `apps/electron/src/main/lib/web-agent-service.ts`
- Create: `apps/electron/src/main/lib/web-status-service.ts`
- Test: `apps/electron/src/main/http-router.test.ts`
- Modify: `apps/electron/package.json`
- Modify: `apps/electron/tsconfig.json`

- [ ] **Step 1: Write the failing backend router tests**

Add tests that cover:
- `GET /api/status`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:id/messages`
- `POST /api/sessions/:id/send` rejects parallel sends with `409`

- [ ] **Step 2: Run the backend router tests to verify they fail**

Run: `bun test apps/electron/src/main/http-router.test.ts`
Expected: FAIL because the HTTP router and SSE services do not exist yet.

- [ ] **Step 3: Implement the minimal Bun HTTP layer**

Build a router that:
- exposes session CRUD via `agent-session-manager`
- exposes `GET /api/status` using environment/CLI checks
- creates a per-session SSE stream manager
- delegates streaming work to a web-specific agent runner that does not depend on Electron `BrowserWindow`

- [ ] **Step 4: Run the backend router tests to verify they pass**

Run: `bun test apps/electron/src/main/http-router.test.ts`
Expected: PASS

- [ ] **Step 5: Run backend typecheck**

Run: `bun run --filter='@proma/electron' typecheck`
Expected: PASS or a narrowed list of errors only in not-yet-migrated frontend/Electron code.

## Chunk 2: Backend Claude Flow Simplification

### Task 2: Remove channel/workspace/team requirements from the surviving agent path

**Files:**
- Modify: `apps/electron/src/main/lib/adapters/claude-agent-adapter.ts`
- Create: `apps/electron/src/main/lib/web-agent-runner.ts`
- Modify: `apps/electron/src/main/lib/agent-permission-service.ts`
- Modify: `apps/electron/src/main/lib/agent-ask-user-service.ts`
- Modify: `apps/electron/src/main/lib/agent-event-bus.ts`
- Test: `apps/electron/src/main/lib/web-agent-runner.test.ts`

- [ ] **Step 1: Write the failing web agent runner tests**

Cover:
- API key comes from `process.env.ANTHROPIC_API_KEY`
- cwd defaults to `process.cwd()`
- no model is forced
- permission and ask-user events are pushed through SSE
- title updates are surfaced to the frontend

- [ ] **Step 2: Run the web agent runner tests to verify they fail**

Run: `bun test apps/electron/src/main/lib/web-agent-runner.test.ts`
Expected: FAIL because the simplified runner does not exist yet.

- [ ] **Step 3: Implement the minimal web agent runner**

Bypass or shrink `agent-orchestrator` rather than untangling every workspace/team dependency. Reuse:
- `agent-session-manager`
- `agent-permission-service`
- `agent-ask-user-service`
- existing `AgentEvent` translation from the Claude adapter

- [ ] **Step 4: Run the web agent runner tests to verify they pass**

Run: `bun test apps/electron/src/main/lib/web-agent-runner.test.ts`
Expected: PASS

- [ ] **Step 5: Run focused backend verification**

Run: `bun test apps/electron/src/main/http-router.test.ts apps/electron/src/main/lib/web-agent-runner.test.ts`
Expected: PASS

## Chunk 3: Frontend Cutover

### Task 3: Replace Electron IPC with REST + SSE for the preserved agent/session UI

**Files:**
- Create: `apps/electron/src/renderer/lib/api.ts`
- Create: `apps/electron/src/renderer/hooks/useAgentSSE.ts`
- Modify: `apps/electron/src/renderer/App.tsx`
- Modify: `apps/electron/src/renderer/main.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/MainContentPanel.tsx`
- Modify: `apps/electron/src/renderer/components/agent/AgentView.tsx`
- Modify: `apps/electron/src/renderer/components/agent/AgentHeader.tsx`
- Modify: `apps/electron/src/renderer/components/agent/PermissionBanner.tsx`
- Modify: `apps/electron/src/renderer/components/agent/AskUserBanner.tsx`
- Modify: `apps/electron/src/renderer/hooks/useGlobalAgentListeners.ts`
- Modify: `apps/electron/src/renderer/atoms/theme.ts`
- Test: `apps/electron/src/renderer/lib/api.test.ts`
- Test: `apps/electron/src/renderer/hooks/useAgentSSE.test.ts`

- [ ] **Step 1: Write the failing frontend API and SSE tests**

Cover:
- session list/load/create/delete/update requests
- POST SSE event parsing
- disconnect handling
- permission/ask-user response endpoints
- disabled input while a session is streaming

- [ ] **Step 2: Run the frontend tests to verify they fail**

Run: `bun test apps/electron/src/renderer/lib/api.test.ts apps/electron/src/renderer/hooks/useAgentSSE.test.ts`
Expected: FAIL because the browser API client and SSE hook do not exist yet.

- [ ] **Step 3: Implement the minimal preserved UI**

Keep:
- sidebar session list
- single agent conversation pane
- tool activity items
- permission banner
- ask-user banner
- appearance and general settings

Remove during the cutover:
- onboarding
- tutorial banner
- tabs and split views
- mode switching
- model/channel selectors
- workspace and file-browser controls
- updater wiring

- [ ] **Step 4: Run the frontend tests to verify they pass**

Run: `bun test apps/electron/src/renderer/lib/api.test.ts apps/electron/src/renderer/hooks/useAgentSSE.test.ts`
Expected: PASS

- [ ] **Step 5: Run renderer typecheck**

Run: `bun run --filter='@proma/electron' typecheck`
Expected: PASS or a narrowed list tied only to files queued for deletion in the next chunk.

## Chunk 4: Delete Dead Electron and Product Surface

### Task 4: Remove Electron, chat, channel, workspace, Feishu, updater, tutorial, and provider code after cutover

**Files:**
- Delete: `apps/electron/src/preload/**`
- Delete: `apps/electron/src/main/ipc.ts`
- Delete: `apps/electron/src/main/tray.ts`
- Delete: `apps/electron/src/main/menu.ts`
- Delete: `apps/electron/src/main/lib/chat-service.ts`
- Delete: `apps/electron/src/main/lib/conversation-manager.ts`
- Delete: `apps/electron/src/main/lib/channel-manager.ts`
- Delete: `apps/electron/src/main/lib/agent-workspace-manager.ts`
- Delete: `apps/electron/src/main/lib/agent-team-reader.ts`
- Delete: `apps/electron/src/main/lib/workspace-watcher.ts`
- Delete: `apps/electron/src/main/lib/feishu-*`
- Delete: `apps/electron/src/main/lib/tutorial-service.ts`
- Delete: `apps/electron/src/main/lib/memory-service.ts`
- Delete: `apps/electron/src/main/lib/system-prompt-manager.ts`
- Delete: `apps/electron/src/main/lib/github-release-service.ts`
- Delete: `apps/electron/src/main/lib/attachment-service.ts`
- Delete: `apps/electron/src/main/lib/document-parser.ts`
- Delete: `apps/electron/src/main/lib/updater/**`
- Delete: `apps/electron/src/renderer/components/chat/**`
- Delete: `apps/electron/src/renderer/components/onboarding/**`
- Delete: `apps/electron/src/renderer/components/tutorial/**`
- Delete: `apps/electron/src/renderer/components/file-browser/**`
- Delete: `apps/electron/src/renderer/components/tabs/**`
- Delete: `apps/electron/src/renderer/components/settings/ChannelSettings.tsx`
- Delete: `apps/electron/src/renderer/components/settings/ChannelForm.tsx`
- Delete: `apps/electron/src/renderer/components/settings/AgentSettings.tsx`
- Delete: `apps/electron/src/renderer/components/settings/McpServerForm.tsx`
- Delete: `apps/electron/src/renderer/components/settings/FeishuSettings.tsx`
- Delete: `apps/electron/src/renderer/components/settings/MemorySettings.tsx`
- Delete: `apps/electron/src/renderer/components/settings/PromptSettings.tsx`
- Delete: `apps/electron/src/renderer/atoms/chat-atoms.ts`
- Delete: `apps/electron/src/renderer/atoms/chat-tool-atoms.ts`
- Delete: `apps/electron/src/renderer/atoms/tab-atoms.ts`
- Delete: `apps/electron/src/renderer/atoms/app-mode.ts`
- Delete: `apps/electron/src/renderer/atoms/feishu-atoms.ts`
- Delete: `apps/electron/src/renderer/atoms/system-prompt-atoms.ts`
- Delete: `apps/electron/src/renderer/atoms/notifications.ts`
- Delete: `apps/electron/src/renderer/atoms/updater.ts`
- Delete: `packages/core/**`
- Modify: `package.json`
- Modify: `apps/electron/package.json`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: Delete dead modules and remove their imports**

Delete only after the web path is typechecked and wired.

- [ ] **Step 2: Run typecheck to verify the deletions are complete**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Run build verification**

Run: `bun run build`
Expected: PASS

## Chunk 5: Scripts, Docs, and Final Verification

### Task 5: Finalize the web-only developer experience

**Files:**
- Modify: `apps/electron/vite.config.ts`
- Modify: `apps/electron/package.json`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add the web-only dev/build/start scripts**

Support:
- `bun run dev` for Vite + Bun server
- `bun run build` for Vite dist plus backend bundle if needed
- `bun run start` for serving `dist/` and `/api`

- [ ] **Step 2: Verify the scripts**

Run:
- `bun run dev` (manual smoke)
- `bun run build`
- `bun run start`

Expected:
- Vite serves the frontend in development through `/api` proxy
- production serves `dist/` and API from Bun

- [ ] **Step 3: Update the README**

Document:
- Bun requirement
- Claude Code CLI requirement
- `ANTHROPIC_API_KEY`
- dev/build/start commands

- [ ] **Step 4: Run final verification**

Run:
- `bun test`
- `bun run typecheck`
- `bun run build`

Expected: all pass before claiming completion.
