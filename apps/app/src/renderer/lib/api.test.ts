import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { PageBuilderCmsSelectionResult, PageBuilderProjectSummary, PageBuilderTargetSelection } from '@proma/shared'

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

  test('getSessionActivity requests the session activity endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/sessions/session-1/activity')
      expect(init?.method).toBeUndefined()
      return jsonResponse({ active: false })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const activity = await api.getSessionActivity('session-1')

    expect(activity).toEqual({ active: false })
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

  test('createPageBuilderCmsAutoHandoff posts the confirmed selection to the workspace auto handoff endpoint', async () => {
    const targetSelection: PageBuilderTargetSelection = {
      kind: 'cms-island',
      htmlPath: 'index.html',
      sourceSelector: '#latest-news > cms-content:nth-of-type(1)',
      parentBlockSelector: '#latest-news',
      component: 'cms-content',
      editBoundary: 'source-atomic',
    }
    const selection: PageBuilderCmsSelectionResult = {
      version: 6,
      siteId: '14',
      targetSelection,
      targetBlock: {
        selector: '#latest-news',
      },
      selectionKind: 'contents',
      sourceType: 'contents-by-catalog',
      selectionMode: 'by-catalog',
      catalogId: 'news',
      snapshot: {
        catalog: {
          id: 'news',
          name: '新闻',
          parentId: null,
          path: '/news',
          contentType: 'article',
          contentTypeName: '文章',
          hasChild: false,
          total: 12,
          children: [],
        },
      },
    }
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/workspaces/workspace-1/page-builder/cms-auto-handoff')
      expect(init?.method).toBe('POST')
      expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
      expect(JSON.parse(String(init?.body))).toEqual({
        sessionId: 'session-1',
        selection,
        uiEntryPoint: 'block-toolbar',
      })
      return jsonResponse({
        requestId: 'handoff-1',
        userMessage: '请根据刚确认的 CMS 选择结果，判断如何应用到当前目标。',
        composedUserMessage: '<cms_binding_apply_input>{"version":8,"handoffId":"handoff-1"}</cms_binding_apply_input>',
        mentionedSkills: ['cms-binding-apply'],
        mentionedMcpServers: ['cms'],
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const handoff = await api.createPageBuilderCmsAutoHandoff('workspace-1', {
      sessionId: 'session-1',
      selection,
      uiEntryPoint: 'block-toolbar',
    })

    expect(handoff.requestId).toBe('handoff-1')
    expect(handoff.composedUserMessage).toContain('handoff-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('replacePageBuilderImage forwards multipart payloads without forcing JSON headers', async () => {
    const replacement = new File(['new-image'], 'replacement.png', { type: 'image/png' })
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/workspaces/workspace-1/page-builder/image')
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeInstanceOf(FormData)
      expect(new Headers(init?.headers).get('content-type')).toBeNull()

      const formData = init?.body as FormData
      expect(formData.get('payload')).toBe(JSON.stringify({
        selector: '#hero-image',
        imageTargetDescriptor: {
          version: 1,
          tagName: 'img',
          childPath: [],
        },
      }))
      const file = formData.get('file')
      expect(file).toBeInstanceOf(File)
      expect((file as File).name).toBe(replacement.name)
      expect((file as File).type).toBe(replacement.type)

      return jsonResponse({
        hasPreview: true,
        entryUrl: '/api/workspaces/workspace-1/preview/',
        revision: 'rev-2',
        hasCmsRendering: false,
        requiresSameOrigin: false,
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const previewState = await (api as unknown as {
      replacePageBuilderImage: (
        workspaceId: string,
        payload: {
          selector: string
          imageTargetDescriptor: {
            version: number
            tagName: string
            childPath: number[]
          }
          file: File
        },
      ) => Promise<{ revision: string | null }>
    }).replacePageBuilderImage('workspace-1', {
      selector: '#hero-image',
      imageTargetDescriptor: {
        version: 1,
        tagName: 'img',
        childPath: [],
      },
      file: replacement,
    })

    expect(previewState.revision).toBe('rev-2')
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

  test('listPageBuilderCmsCatalogs requests the page-builder cms catalogs endpoint with query params', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/page-builder/cms/catalogs?siteId=14&contentType=Image&searchKeyword=%E9%A6%96%E9%A1%B5')
      return jsonResponse({
        items: [],
        tree: [],
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const result = await api.listPageBuilderCmsCatalogs({
      siteId: '14',
      contentType: 'Image',
      searchKeyword: '首页',
    })

    expect(result).toEqual({
      items: [],
      tree: [],
    })
  })

  test('listPageBuilderCmsCatalogs serializes ordered fixed ids', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/page-builder/cms/catalogs?siteId=14&ids=102%2C999%2C101')
      return jsonResponse({
        items: [],
        tree: [],
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    await api.listPageBuilderCmsCatalogs({
      siteId: '14',
      ids: ['102', '999', '101'],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('listPageBuilderCmsSites requests the page-builder cms sites endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/page-builder/cms/sites')
      return jsonResponse([
        {
          id: '1',
          name: '主站',
          url: 'https://demo.zving.com',
          parentId: null,
          branchInnerCode: '0001',
        },
      ])
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const result = await api.listPageBuilderCmsSites()

    expect(result).toEqual([
      {
        id: '1',
        name: '主站',
        url: 'https://demo.zving.com',
        parentId: null,
        branchInnerCode: '0001',
      },
    ])
  })

  test('listPageBuilderCmsContents requests the page-builder cms contents endpoint with query params', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/page-builder/cms/contents?siteId=14&catalogId=101&pageIndex=1&pageSize=10&keyword=banner')
      return jsonResponse({
        pageIndex: 1,
        pageSize: 10,
        total: 0,
        totalPages: 1,
        items: [],
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const result = await api.listPageBuilderCmsContents({
      siteId: '14',
      catalogId: '101',
      pageIndex: 1,
      pageSize: 10,
      keyword: 'banner',
    })

    expect(result).toEqual({
      pageIndex: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
      items: [],
    })
  })

  test('listPageBuilderCmsContents serializes ordered fixed ids', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/page-builder/cms/contents?siteId=14&catalogId=101&ids=502%2C999%2C501')
      return jsonResponse({
        pageIndex: 0,
        pageSize: 2,
        total: 0,
        totalPages: 1,
        items: [],
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    await api.listPageBuilderCmsContents({
      siteId: '14',
      catalogId: '101',
      ids: ['502', '999', '501'],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('getPageBuilderCmsCatalogDetail requests the page-builder cms catalog detail endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/page-builder/cms/catalogs/17765?siteId=14')
      return jsonResponse({
        id: '17765',
        innerCode: '002676000004',
        statusCode: 20,
        statusLabel: '启用',
        name: '文章',
        alias: 'lbt_wz',
        contentType: 'Article',
        contentTypeName: '文章',
        description: '栏目描述',
        logoUrl: 'https://demo.zving.com/zcmstest/assets/images/addpicture.png',
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const result = await api.getPageBuilderCmsCatalogDetail('17765', '14')

    expect(result).toEqual({
      id: '17765',
      innerCode: '002676000004',
      statusCode: 20,
      statusLabel: '启用',
      name: '文章',
      alias: 'lbt_wz',
      contentType: 'Article',
      contentTypeName: '文章',
      description: '栏目描述',
      logoUrl: 'https://demo.zving.com/zcmstest/assets/images/addpicture.png',
    })
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
        hasCmsRendering: true,
        requiresSameOrigin: true,
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const state = await api.getWorkspacePreviewState('workspace-1')

    expect(state).toEqual({
      hasPreview: true,
      entryUrl: '/api/workspaces/workspace-1/preview/',
      revision: 'rev-1',
      hasCmsRendering: true,
      requiresSameOrigin: true,
    })
  })

  test('savePageBuilderInlineText posts the inline text payload to the workspace page-builder endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/workspaces/workspace-1/page-builder/inline-text')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        selector: '#hero',
        textTargetDescriptor: {
          version: 1,
          tagName: 'h1',
          childPath: [0],
        },
        nextText: '新标题',
      })
      return jsonResponse({
        hasPreview: true,
        entryUrl: '/api/workspaces/workspace-1/preview/',
        revision: 'rev-2',
        hasCmsRendering: false,
        requiresSameOrigin: false,
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const state = await api.savePageBuilderInlineText('workspace-1', {
      selector: '#hero',
      textTargetDescriptor: {
        version: 1,
        tagName: 'h1',
        childPath: [0],
      },
      nextText: '新标题',
    })

    expect(state).toEqual({
      hasPreview: true,
      entryUrl: '/api/workspaces/workspace-1/preview/',
      revision: 'rev-2',
      hasCmsRendering: false,
      requiresSameOrigin: false,
    })
  })

  test('deletePageBuilderBlock posts the selected block selector to the workspace page-builder endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/workspaces/workspace-1/page-builder/block-delete')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        selector: '#hero',
      })
      return jsonResponse({
        hasPreview: true,
        entryUrl: '/api/workspaces/workspace-1/preview/',
        revision: 'rev-3',
        hasCmsRendering: false,
        requiresSameOrigin: false,
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const state = await api.deletePageBuilderBlock('workspace-1', {
      selector: '#hero',
    })

    expect(state).toEqual({
      hasPreview: true,
      entryUrl: '/api/workspaces/workspace-1/preview/',
      revision: 'rev-3',
      hasCmsRendering: false,
      requiresSameOrigin: false,
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

  test('createPageBuilderStaticExportJob POSTs the export creation endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/workspaces/workspace-1/page-builder/export-static-jobs')
      expect(init?.method).toBe('POST')
      return jsonResponse({
        jobId: 'job-1',
        status: 'running',
        phase: 'copying',
        createdAt: '2026-04-07T10:00:00.000Z',
        updatedAt: '2026-04-07T10:00:00.000Z',
        expiresAt: '2026-04-07T11:00:00.000Z',
        downloadUrl: null,
        errorMessage: null,
        failure: null,
        reportSummary: null,
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const result = await (api as unknown as {
      createPageBuilderStaticExportJob: (workspaceId: string) => Promise<{ jobId: string; phase: string }>
    }).createPageBuilderStaticExportJob('workspace-1')

    expect(result).toEqual(expect.objectContaining({
      jobId: 'job-1',
      phase: 'copying',
    }))
  })

  test('getPageBuilderStaticExportJob requests the export status endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/workspaces/workspace-1/page-builder/export-static-jobs/job-1')
      return jsonResponse({
        jobId: 'job-1',
        status: 'completed',
        phase: 'completed',
        createdAt: '2026-04-07T10:00:00.000Z',
        updatedAt: '2026-04-07T10:00:02.000Z',
        expiresAt: '2026-04-07T11:00:00.000Z',
        downloadUrl: '/api/workspaces/workspace-1/page-builder/export-static-jobs/job-1/download',
        errorMessage: null,
        failure: null,
        reportSummary: {
          localizedResourceCount: 3,
          retainedExternalLinkCount: 0,
          warningCount: 0,
          unsupportedRuntimeDependencyCount: 0,
          failureCount: 0,
          hasWarnings: false,
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const result = await (api as unknown as {
      getPageBuilderStaticExportJob: (workspaceId: string, jobId: string) => Promise<{ status: string; downloadUrl: string | null }>
    }).getPageBuilderStaticExportJob('workspace-1', 'job-1')

    expect(result).toEqual(expect.objectContaining({
      status: 'completed',
      downloadUrl: '/api/workspaces/workspace-1/page-builder/export-static-jobs/job-1/download',
    }))
  })

  test('getPageBuilderStaticExportDownloadUrl builds the direct download endpoint without issuing a fetch', async () => {
    const fetchMock = mock(async () => {
      throw new Error('should not fetch')
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const url = (api as unknown as {
      getPageBuilderStaticExportDownloadUrl: (workspaceId: string, jobId: string) => string
    }).getPageBuilderStaticExportDownloadUrl('workspace-1', 'job-1')

    expect(url).toBe('/api/workspaces/workspace-1/page-builder/export-static-jobs/job-1/download')
    expect(fetchMock).toHaveBeenCalledTimes(0)
  })
})
