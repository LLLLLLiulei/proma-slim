import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createAgentSession, getAgentSessionMeta, updateAgentSessionMeta } from './lib/agent-session-manager'
import { createHttpRouter, createAgentStreamCallbacks, persistGeneratedSessionTitle } from './http-router'
import { sseManager } from './sse-manager'
import { createAgentWorkspace, ensureDefaultWorkspace } from './lib/workspace-service'

const decoder = new TextDecoder()

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

function createRouter() {
  return createHttpRouter({
    distDir: process.cwd(),
    isDev: true,
  })
}

describe('createAgentStreamCallbacks', () => {
  test('onError emits an error event and closes the SSE stream', async () => {
    const sessionId = 'session-error-close'
    const response = sseManager.createResponse(sessionId)
    const reader = response.body?.getReader()

    expect(reader).not.toBeNull()

    const connectedChunk = await reader!.read()
    expect(connectedChunk.done).toBe(false)
    expect(decoder.decode(connectedChunk.value)).toContain(': connected')

    const callbacks = createAgentStreamCallbacks(sessionId)
    callbacks.onError('missing api key')

    const errorChunk = await reader!.read()
    expect(errorChunk.done).toBe(false)

    const errorFrame = decoder.decode(errorChunk.value)
    expect(errorFrame).toContain('event: error')
    expect(errorFrame).toContain('"message":"missing api key"')

    const closedChunk = await reader!.read()
    expect(closedChunk.done).toBe(true)
  })
})

describe('persistGeneratedSessionTitle', () => {
  test('persists a generated title for default-titled sessions before streaming starts', async () => {
    const session = createAgentSession()

    await persistGeneratedSessionTitle(session.id, '只回复 TITLE_123456')

    expect(getAgentSessionMeta(session.id)?.title).toBe('只回复 TITLE_123456')
  })

  test('does not overwrite a customized session title', async () => {
    const session = createAgentSession('手动命名的会话')

    await persistGeneratedSessionTitle(session.id, '只回复 TITLE_654321')

    expect(getAgentSessionMeta(session.id)?.title).toBe('手动命名的会话')
  })
})

describe('workspace api routes', () => {
  test('GET /api/workspaces returns the current workspace list', async () => {
    const router = createRouter()
    ensureDefaultWorkspace()

    const response = await router.handle(new Request('http://localhost/api/workspaces'))

    expect(response.status).toBe(200)
    const workspaces = await response.json() as Array<{ slug: string }>
    expect(workspaces.some((workspace) => workspace.slug === 'default')).toBe(true)
  })

  test('POST /api/workspaces creates and returns a new workspace', async () => {
    const router = createRouter()

    const response = await router.handle(new Request('http://localhost/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'Proma Docs' }),
      headers: {
        'content-type': 'application/json',
      },
    }))

    expect(response.status).toBe(201)
    const workspace = await response.json() as { name: string; slug: string }
    expect(workspace.name).toBe('Proma Docs')
    expect(workspace.slug).toBe('proma-docs')
  })

  test('PATCH /api/workspaces/:id renames the workspace and keeps its slug stable', async () => {
    const router = createRouter()
    const workspace = createAgentWorkspace('Proma Docs')

    const response = await router.handle(new Request(`http://localhost/api/workspaces/${workspace.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed Docs' }),
      headers: {
        'content-type': 'application/json',
      },
    }))

    expect(response.status).toBe(200)
    const updated = await response.json() as { name: string; slug: string }
    expect(updated.name).toBe('Renamed Docs')
    expect(updated.slug).toBe('proma-docs')
  })

  test('DELETE /api/workspaces/:id rejects deleting the default workspace with a user-facing error', async () => {
    const router = createRouter()
    const workspace = ensureDefaultWorkspace()

    const response = await router.handle(new Request(`http://localhost/api/workspaces/${workspace.id}`, {
      method: 'DELETE',
    }))

    expect(response.status).toBe(409)
    const payload = await response.json() as { error: string }
    expect(payload.error).toBe('默认工作区不可删除')
  })

  test('DELETE /api/workspaces/:id rejects deleting workspaces that still own sessions', async () => {
    const router = createRouter()
    const workspace = createAgentWorkspace('Occupied Docs')
    createAgentSession('已有会话', undefined, workspace.id)

    const response = await router.handle(new Request(`http://localhost/api/workspaces/${workspace.id}`, {
      method: 'DELETE',
    }))

    expect(response.status).toBe(409)
    const payload = await response.json() as { error: string }
    expect(payload.error).toBe('请先迁移或删除该工作区下的会话后再删除工作区')
  })

  test('DELETE /api/workspaces/:id removes the workspace metadata', async () => {
    const router = createRouter()
    const workspace = createAgentWorkspace('Scratch Docs')

    const response = await router.handle(new Request(`http://localhost/api/workspaces/${workspace.id}`, {
      method: 'DELETE',
    }))

    expect(response.status).toBe(204)

    const listResponse = await router.handle(new Request('http://localhost/api/workspaces'))
    const workspaces = await listResponse.json() as Array<{ id: string }>
    expect(workspaces.some((entry) => entry.id === workspace.id)).toBe(false)
  })

  test('GET /api/workspaces/:id/capabilities returns workspace scoped skills and MCP summaries', async () => {
    const router = createRouter()
    const workspace = createAgentWorkspace('Capability Docs')

    const response = await router.handle(new Request(`http://localhost/api/workspaces/${workspace.id}/capabilities`))

    expect(response.status).toBe(200)
    const capabilities = await response.json() as { skills: Array<{ slug: string }>; mcpServers: unknown[] }
    expect(capabilities.skills.length).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(capabilities.mcpServers)).toBe(true)
  })

  test('GET /api/workspaces/:id/directory-context returns stable workspace paths', async () => {
    const router = createRouter()
    const workspace = createAgentWorkspace('Context Docs')

    const response = await router.handle(new Request(`http://localhost/api/workspaces/${workspace.id}/directory-context`))

    expect(response.status).toBe(200)
    const context = await response.json() as { workspaceSlug: string; workspaceFilesPath: string }
    expect(context.workspaceSlug).toBe('context-docs')
    expect(context.workspaceFilesPath).toContain('/workspace-files')
  })

  test('GET /api/workspaces/:id/file-search searches workspace files and attached directories', async () => {
    const router = createRouter()
    const workspace = createAgentWorkspace('Search Docs')
    const workspaceRoot = join(homedir(), '.proma', 'agent-workspaces', workspace.slug)
    const externalDir = join(homedir(), '.proma', 'external-docs')
    mkdirSync(join(workspaceRoot, 'docs'), { recursive: true })
    mkdirSync(externalDir, { recursive: true })
    writeFileSync(join(workspaceRoot, 'docs', 'claude.md'), '# Claude', 'utf-8')
    writeFileSync(join(externalDir, 'guide.md'), '# Guide', 'utf-8')

    const configPath = join(workspaceRoot, 'config.json')
    writeFileSync(configPath, JSON.stringify({ attachedDirectories: [externalDir] }, null, 2), 'utf-8')

    const response = await router.handle(new Request(`http://localhost/api/workspaces/${workspace.id}/file-search?q=gui&limit=5`))

    expect(response.status).toBe(200)
    const result = await response.json() as { entries: Array<{ path: string }>; total: number }
    expect(result.total).toBeGreaterThan(0)
    expect(result.entries.some((entry) => entry.path === 'guide.md')).toBe(true)
  })

  test('GET /api/workspaces/:id/file-search includes explicit extra directories from the query string', async () => {
    const router = createRouter()
    const workspace = createAgentWorkspace('Search Overrides')
    const externalDir = join(homedir(), '.proma', 'session-docs')
    mkdirSync(externalDir, { recursive: true })
    writeFileSync(join(externalDir, 'session-guide.md'), '# Session Guide', 'utf-8')

    const params = new URLSearchParams({
      q: 'session',
      limit: '5',
    })
    params.append('dir', externalDir)

    const response = await router.handle(new Request(
      `http://localhost/api/workspaces/${workspace.id}/file-search?${params.toString()}`,
    ))

    expect(response.status).toBe(200)
    const result = await response.json() as { entries: Array<{ path: string }>; total: number }
    expect(result.total).toBeGreaterThan(0)
    expect(result.entries.some((entry) => entry.path === 'session-guide.md')).toBe(true)
  })

  test('POST /api/sessions persists workspaceId from the request body', async () => {
    const router = createRouter()
    const workspace = createAgentWorkspace('Docs Runtime')

    const response = await router.handle(new Request('http://localhost/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: 'Workspace session', workspaceId: workspace.id }),
      headers: {
        'content-type': 'application/json',
      },
    }))

    expect(response.status).toBe(201)
    const session = await response.json() as { id: string; workspaceId?: string }
    expect(session.workspaceId).toBe(workspace.id)
    expect(getAgentSessionMeta(session.id)?.workspaceId).toBe(workspace.id)
  })

  test('POST /api/sessions/:id/move-workspace migrates the session and clears sdkSessionId', async () => {
    const router = createRouter()
    const sourceWorkspace = ensureDefaultWorkspace()
    const targetWorkspace = createAgentWorkspace('Migrated Docs')
    const session = createAgentSession('可迁移会话', undefined, sourceWorkspace.id)
    updateAgentSessionMeta(session.id, { sdkSessionId: 'sdk-session-1' })

    const response = await router.handle(new Request(`http://localhost/api/sessions/${session.id}/move-workspace`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId: targetWorkspace.id }),
      headers: {
        'content-type': 'application/json',
      },
    }))

    expect(response.status).toBe(200)
    const moved = await response.json() as { workspaceId?: string; sdkSessionId?: string }
    expect(moved.workspaceId).toBe(targetWorkspace.id)
    expect(moved.sdkSessionId).toBeUndefined()
    expect(getAgentSessionMeta(session.id)?.workspaceId).toBe(targetWorkspace.id)
    expect(getAgentSessionMeta(session.id)?.sdkSessionId).toBeUndefined()
  })
})
