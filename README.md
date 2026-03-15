# Proma

Proma is a browser-based minimal Claude Code chat app.

The app keeps a simple two-pane workflow: a session list on the left and a streaming chat view on the right. The frontend runs in the browser, the backend runs on Bun, and the two communicate over REST plus SSE for live agent output.

## What It Is

- Minimal Claude Code chat UI in the browser
- Bun backend + Vite frontend under `apps/electron`
- Streaming assistant responses over SSE
- Persistent local sessions stored under `~/.proma/`
- Local-first runtime with no separate database

## Architecture

The simplified app lives in `apps/electron`:

- `apps/electron/src/main` contains the Bun HTTP server and API routes
- `apps/electron/src/renderer` contains the Vite + React frontend
- Development mode uses Vite for the browser UI and a Bun server for `/api`
- Production mode serves the built frontend from `apps/electron/dist` through the Bun server

At a high level:

- Browser UI: React + Vite
- Backend: Bun HTTP server
- Transport: REST for session actions, SSE for streaming output
- Agent runtime: `@anthropic-ai/claude-agent-sdk`

## Requirements

- Bun
- `ANTHROPIC_API_KEY` set in the shell before starting the app

Example:

```bash
export ANTHROPIC_API_KEY="your-key-here"
```

Without `ANTHROPIC_API_KEY`, the backend status check will report the app as unavailable for sending messages.

## Getting Started

Install dependencies from the repository root:

```bash
bun install
```

Run the app from the repository root:

```bash
bun run dev
```

This root command delegates to the `@proma/electron` workspace and starts:

- the Vite dev server for the browser UI
- the Bun backend server for API and streaming routes

By default in development:

- Vite runs on `http://localhost:5173`
- the Bun backend listens on port `3000`
- Vite proxies `/api` requests to the Bun backend, so the frontend can call `/api/*` without cross-origin setup

## Build

Build the frontend from the repository root:

```bash
bun run build
```

This runs the `@proma/electron` build script and outputs the frontend bundle to:

```text
apps/electron/dist
```

## Production Start

Start the production server from the repository root:

```bash
bun run start
```

In production, the Bun server serves:

- `/api/*` for REST and SSE endpoints
- the compiled frontend from `apps/electron/dist` for browser requests

That means the frontend and backend are served from the same app process in production.

## Session Persistence

Proma persists session data locally under `~/.proma/`.

Important paths:

- `~/.proma/agent-sessions/` — per-session message history and session files
- `~/.proma/agent-sessions.json` — session metadata index

This allows conversations to survive restarts without requiring an external database.

## API Behavior

The simplified app uses:

- REST endpoints for session creation, listing, deletion, title updates, settings, and user profile updates
- SSE for streaming message output from the backend to the browser

In development, `/api` is proxied by Vite.
In production, the Bun server handles both static asset delivery and `/api` requests directly.

## Root Commands

All of the following commands are intended to be run from the repository root:

```bash
bun run dev
bun run build
bun run start
```

## Repository Notes

Although the runnable web app is under `apps/electron`, the root workspace scripts are the supported entry points for development and production.

If you need to inspect the package-level scripts directly, see:

- `package.json`
- `apps/electron/package.json`

## License

[MIT](./LICENSE)
