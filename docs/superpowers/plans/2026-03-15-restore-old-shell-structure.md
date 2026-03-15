# Restore Old Shell Structure Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the app to a layout that is visually close to the old Proma shell shown in the user screenshot while keeping the current minimal Agent-only backend intact.

**Architecture:** Rebuild an old-style renderer shell on top of the current simplified data flow. The left sidebar regains the legacy visual hierarchy (mode switch, workspace block, pinned/recent session grouping, footer), while the right side regains the rounded main panel with a single-tab strip. Removed backend features stay as UI-compatible placeholders instead of reviving deleted systems.

**Tech Stack:** React, Jotai, Tailwind CSS, existing renderer components, current REST/SSE Agent session API.

---

## Chunk 1: Shell State And Data Mapping

### Task 1: Define the restored shell contract

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/MainContentPanel.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`
- Create: `apps/electron/src/renderer/atoms/app-mode.ts`
- Create: `apps/electron/src/renderer/components/app-shell/ModeSwitcher.tsx`

- [ ] Reintroduce a UI-only `appModeAtom` with `chat | agent`, defaulting to `agent`.
- [ ] Reintroduce a minimal `ModeSwitcher` that matches the old segmented control look.
- [ ] Keep `chat` mode as a compatibility placeholder instead of wiring deleted chat systems back in.
- [ ] Preserve current `activeViewAtom` for settings vs conversations.

### Task 2: Map current session data into old-style grouping

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`

- [ ] Group sessions into `置顶会话 / 今天 / 昨天 / 更早`.
- [ ] Use persisted `pinned` when available and fall back to local UI pin state for new sessions.
- [ ] Keep rename/delete/create actions connected to current REST API.

## Chunk 2: Restore Old Sidebar Structure

### Task 3: Rebuild the sidebar visual hierarchy

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`
- Modify: `apps/electron/src/renderer/styles/globals.css`

- [ ] Restore top segmented mode switch and utility icon area.
- [ ] Restore the workspace card area with a default workspace row and disabled `新建工作区` affordance.
- [ ] Restore a legacy-feeling `新会话` action row.
- [ ] Restore grouped session sections and hover actions.
- [ ] Restore footer summary and settings entry in an old-style layout.

## Chunk 3: Restore Old Main Panel Structure

### Task 4: Wrap the main content in an old-style panel and tab strip

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`
- Modify: `apps/electron/src/renderer/components/app-shell/MainContentPanel.tsx`
- Modify: `apps/electron/src/renderer/components/agent/AgentHeader.tsx`

- [ ] Restore the old padded shell and glassy rounded main panel.
- [ ] Add a lightweight single-tab header that mirrors the old tab bar feel using the active session title.
- [ ] Preserve current settings panel routing.
- [ ] Keep Agent content as the only real conversation surface.

### Task 5: Add chat compatibility placeholder

**Files:**
- Modify: `apps/electron/src/renderer/components/app-shell/MainContentPanel.tsx`

- [ ] When `chat` mode is selected, render a clear placeholder explaining that this build only supports Agent execution.
- [ ] Keep the placeholder visually consistent with the restored shell.

## Chunk 4: Verification

### Task 6: Verify renderer structure and behavior

**Files:**
- Create or modify tests only if needed for the shell state/layout logic.

- [ ] Run targeted tests for touched renderer files.
- [ ] Run `cd apps/electron && bun run typecheck`.
- [ ] Run `cd apps/electron && bun run build`.
- [ ] Use Playwright against the local app to verify the restored shell is visible, session grouping renders, settings entry works, and Agent mode still opens a live session.
