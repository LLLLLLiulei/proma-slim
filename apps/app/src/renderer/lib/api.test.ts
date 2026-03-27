import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { PageBuilderProjectSummary } from '@proma/shared'

const originalFetch = globalThis.fetch

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers ?? {}),
    },
    ...init,
  })
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('renderer api wrappers', () => {
  test('getSettings requests /api/settings and parses persisted workspace settings', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/settings')
      return jsonResponse({
        themeMode: 'light',
        agentWorkspaceId: 'workspace-1',
        notificationsEnabled: true,
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const settings = await api.getSettings()

    expect(settings.agentWorkspaceId).toBe('workspace-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('updateSettings PATCHes /api/settings with agentWorkspaceId updates', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/settings')
      expect(init?.method).toBe('PATCH')
      expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
      expect(JSON.parse(String(init?.body))).toEqual({ agentWorkspaceId: 'workspace-2' })
      return jsonResponse({
        themeMode: 'light',
        agentWorkspaceId: 'workspace-2',
        notificationsEnabled: true,
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const settings = await api.updateSettings({ agentWorkspaceId: 'workspace-2' })

    expect(settings.agentWorkspaceId).toBe('workspace-2')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('getStatus requests /api/status and parses the JSON payload', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/status')
      expect(init?.method).toBeUndefined()
      return jsonResponse({ ok: true, apiKeyConfigured: true, sdkCliAvailable: true })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const status = await api.getStatus()

    expect(status).toEqual({ ok: true, apiKeyConfigured: true, sdkCliAvailable: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('updateSessionTitle PATCHes the session title endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/sessions/session-1')
      expect(init?.method).toBe('PATCH')
      expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
      expect(JSON.parse(String(init?.body))).toEqual({ title: 'Renamed session' })
      return jsonResponse({
        id: 'session-1',
        title: 'Renamed session',
        createdAt: 1,
        updatedAt: 2,
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const session = await api.updateSessionTitle('session-1', 'Renamed session')

    expect(session.title).toBe('Renamed session')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('sendMessage opens the POST SSE endpoint without consuming the stream', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })

    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/sessions/session-1/send')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({ userMessage: 'Hello from the browser' })
      return new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const response = await api.sendMessage('session-1', { userMessage: 'Hello from the browser' })

    expect(response.body).not.toBeNull()
    expect(response.headers.get('content-type')).toContain('text/event-stream')
  })

  test('sendMessage forwards multipart payloads without forcing JSON headers', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })

    const attachment = new File(['binary-preview'], 'reference.png', { type: 'image/png' })

    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/sessions/session-1/send')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeInstanceOf(FormData)

      const formData = init?.body as FormData
      expect(formData.get('payload')).toBe(JSON.stringify({ userMessage: 'Use this screenshot', workspaceId: 'workspace-1' }))
      expect(formData.getAll('attachments')).toHaveLength(1)
      const forwardedAttachment = formData.getAll('attachments')[0] as File
      expect(forwardedAttachment.name).toBe(attachment.name)
      expect(forwardedAttachment.type).toBe(attachment.type)
      expect(forwardedAttachment.size).toBe(attachment.size)
      expect(new Headers(init?.headers).get('content-type')).toBeNull()

      return new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const response = await api.sendMessage('session-1', {
      userMessage: 'Use this screenshot',
      workspaceId: 'workspace-1',
      attachmentFiles: [attachment],
    })

    expect(response.body).not.toBeNull()
    expect(response.headers.get('content-type')).toContain('text/event-stream')
  })

  test('listWorkspaces requests /api/workspaces', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/workspaces')
      return jsonResponse([{ id: 'workspace-1', name: '默认工作区', slug: 'default', createdAt: 1, updatedAt: 1 }])
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const workspaces = await api.listWorkspaces()

    expect(workspaces).toHaveLength(1)
    expect(workspaces[0]?.slug).toBe('default')
  })

  test('createWorkspace posts the workspace name', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/workspaces')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({ name: 'Proma Docs' })
      return jsonResponse({ id: 'workspace-1', name: 'Proma Docs', slug: 'proma-docs', createdAt: 1, updatedAt: 2 })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const workspace = await api.createWorkspace('Proma Docs')

    expect(workspace.slug).toBe('proma-docs')
  })

  test('createWorkspace forwards the page-builder template when requested', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/workspaces')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        name: '未命名项目',
        template: 'page-builder',
      })
      return jsonResponse({ id: 'workspace-1', name: '未命名项目', slug: 'page-builder', createdAt: 1, updatedAt: 2 })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const workspace = await api.createWorkspace('未命名项目', { template: 'page-builder' })

    expect(workspace.slug).toBe('page-builder')
  })

  test('updateWorkspace PATCHes the workspace endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/workspaces/workspace-1')
      expect(init?.method).toBe('PATCH')
      expect(JSON.parse(String(init?.body))).toEqual({ name: 'Renamed Workspace' })
      return jsonResponse({ id: 'workspace-1', name: 'Renamed Workspace', slug: 'default', createdAt: 1, updatedAt: 2 })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const workspace = await api.updateWorkspace('workspace-1', { name: 'Renamed Workspace' })

    expect(workspace.name).toBe('Renamed Workspace')
  })

  test('deleteWorkspace sends DELETE to the workspace endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/workspaces/workspace-1')
      expect(init?.method).toBe('DELETE')
      return new Response(null, { status: 204 })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    await api.deleteWorkspace('workspace-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('listPageBuilderProjects requests the page-builder history endpoint', async () => {
    const project: PageBuilderProjectSummary = {
      workspaceId: 'workspace-1',
      workspaceName: 'History Project',
      workspaceSlug: 'history-project',
      createdAt: 1,
      lastActiveAt: 2,
      latestSessionId: 'session-1',
      previewUrl: '/api/workspaces/workspace-1/preview/',
    }
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/page-builder/projects')
      return jsonResponse([project])
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const projects = await api.listPageBuilderProjects()

    expect(projects).toEqual([project])
  })

  test('deletePageBuilderProject sends DELETE to the page-builder project endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/page-builder/projects/workspace-1')
      expect(init?.method).toBe('DELETE')
      return new Response(null, { status: 204 })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    await api.deletePageBuilderProject('workspace-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('getWorkspaceCapabilities requests the capabilities endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/workspaces/workspace-1/capabilities')
      return jsonResponse({ skills: [{ slug: 'docs', name: 'Docs', enabled: true }], mcpServers: [] })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const capabilities = await api.getWorkspaceCapabilities('workspace-1')

    expect(capabilities.skills[0]?.slug).toBe('docs')
  })

  test('getWorkspaceContext requests the directory-context endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/workspaces/workspace-1/directory-context')
      return jsonResponse({
        workspaceId: 'workspace-1',
        workspaceName: 'Proma Docs',
        workspaceSlug: 'proma-docs',
        workspacePath: '/tmp/proma-docs',
        workspaceFilesPath: '/tmp/proma-docs/workspace-files',
        skillsPath: '/tmp/proma-docs/skills',
        mcpConfigPath: '/tmp/proma-docs/mcp.json',
        memoryFilePath: '/tmp/proma-docs/memory/MEMORY.md',
        attachedDirectories: ['/tmp/external-docs'],
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const context = await api.getWorkspaceContext('workspace-1')

    expect(context.workspaceSlug).toBe('proma-docs')
    expect(context.attachedDirectories).toEqual(['/tmp/external-docs'])
  })

  test('searchWorkspaceFiles requests the workspace file-search endpoint with query params', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/workspaces/workspace-1/file-search?q=claude&limit=6')
      return jsonResponse({
        entries: [{ name: 'claude.md', path: 'docs/claude.md', type: 'file' }],
        total: 1,
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const result = await api.searchWorkspaceFiles('workspace-1', 'claude', 6)

    expect(result.entries[0]?.path).toBe('docs/claude.md')
    expect(result.total).toBe(1)
  })

  test('searchWorkspaceFiles appends extra directory filters when provided', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        '/api/workspaces/workspace-1/file-search?q=guide&limit=4&dir=%2Ftmp%2Fworkspace-files&dir=%2Ftmp%2Fexternal-docs',
      )
      return jsonResponse({
        entries: [{ name: 'guide.md', path: 'guide.md', type: 'file' }],
        total: 1,
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const result = await api.searchWorkspaceFiles(
      'workspace-1',
      'guide',
      4,
      ['/tmp/workspace-files', '/tmp/external-docs'],
    )

    expect(result.entries[0]?.path).toBe('guide.md')
    expect(result.total).toBe(1)
  })

  test('getWorkspacePreviewState requests the preview-state endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/workspaces/workspace-1/preview-state')
      return jsonResponse({
        hasPreview: true,
        entryUrl: '/api/workspaces/workspace-1/preview/',
        revision: 'rev-1',
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const state = await api.getWorkspacePreviewState('workspace-1')

    expect(state).toEqual({
      hasPreview: true,
      entryUrl: '/api/workspaces/workspace-1/preview/',
      revision: 'rev-1',
    })
  })

  test('createSession sends workspaceId in the request body when provided', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/sessions')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        title: 'Workspace session',
        workspaceId: 'workspace-1',
      })
      return jsonResponse({
        id: 'session-1',
        title: 'Workspace session',
        workspaceId: 'workspace-1',
        createdAt: 1,
        updatedAt: 2,
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const session = await api.createSession('Workspace session', 'workspace-1')

    expect(session.workspaceId).toBe('workspace-1')
  })

  test('moveSessionToWorkspace posts to the move-workspace endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/sessions/session-1/move-workspace')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({ workspaceId: 'workspace-2' })
      return jsonResponse({
        id: 'session-1',
        title: 'Moved session',
        workspaceId: 'workspace-2',
        createdAt: 1,
        updatedAt: 2,
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const session = await api.moveSessionToWorkspace('session-1', 'workspace-2')

    expect(session.workspaceId).toBe('workspace-2')
  })
})
