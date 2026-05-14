import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION,
} from '@ai-page-builder/shared'
import {
  PAGE_BUILDER_EDIT_HOLDER_HEADER,
  PAGE_BUILDER_EDIT_LOCK_HEADER,
} from '../page-builder-edit-lock-auth'
import { getAgentSessionMessages, listAgentSessions, updateAgentSessionMeta } from '../../lib/agent-session-manager'
import { askUserService } from '../../lib/agent-ask-user-service'
import { permissionService } from '../../lib/agent-permission-service'
import { resetCmsIntegrationTestState } from './cms-integration'
import { getSharedCmsProjectBindingStore } from '../../lib/cms-integration/cms-project-binding-store'
import { listAgentWorkspaces } from '../../lib/workspace-service'
import { createHttpApp } from '../app'

const ORIGINAL_ENV = {
  PROMA_CONFIG_DIR: process.env.PROMA_CONFIG_DIR,
  AI_PAGE_BUILDER_INTEGRATION_MODE: process.env.AI_PAGE_BUILDER_INTEGRATION_MODE,
  AI_PAGE_BUILDER_INTEGRATION_SECRET: process.env.AI_PAGE_BUILDER_INTEGRATION_SECRET,
  AI_PAGE_BUILDER_CMS_BASE_URL: process.env.AI_PAGE_BUILDER_CMS_BASE_URL,
  AI_PAGE_BUILDER_BASE_PATH: process.env.AI_PAGE_BUILDER_BASE_PATH,
  AI_PAGE_BUILDER_PUBLIC_ORIGIN: process.env.AI_PAGE_BUILDER_PUBLIC_ORIGIN,
  PROMA_CMS_BASE_URL: process.env.PROMA_CMS_BASE_URL,
  PROMA_CMS_USERNAME: process.env.PROMA_CMS_USERNAME,
  PROMA_CMS_PASSWORD: process.env.PROMA_CMS_PASSWORD,
}
const originalFetch = globalThis.fetch

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key as keyof typeof ORIGINAL_ENV]
    } else {
      process.env[key as keyof typeof ORIGINAL_ENV] = value
    }
  }
}

function createApp() {
  return createHttpApp({ distDir: process.cwd(), isDev: true })
}

function enableCmsIntegration(configDir: string, overrides: Record<string, string | undefined> = {}) {
  process.env.PROMA_CONFIG_DIR = configDir
  process.env.AI_PAGE_BUILDER_INTEGRATION_MODE = 'cms'
  process.env.AI_PAGE_BUILDER_INTEGRATION_SECRET = 'integration-secret'
  process.env.AI_PAGE_BUILDER_CMS_BASE_URL = 'https://cms.example.com/manager'
  process.env.AI_PAGE_BUILDER_BASE_PATH = '/pagebuilder'
  process.env.AI_PAGE_BUILDER_PUBLIC_ORIGIN = 'https://builder.example.com'
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function createCmsTokenResponse(): Response {
  return jsonResponse({
    status: 1,
    message: '操作成功!',
    access_token: 'Bearer cms-token',
    expires_in: 18_000,
  })
}

function createLoginFetchMock() {
  return mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const cookie = new Headers(init?.headers).get('cookie') ?? ''
    if (cookie.includes('expired')) {
      return jsonResponse({ status: 1, data: { logined: false } })
    }

    return jsonResponse({
      status: 1,
      data: {
        logined: true,
        userName: 'cms-user',
        realName: 'CMS User',
      },
    })
  })
}

function createCmsAutoHandoffSelection(siteId: string) {
  return {
    version: PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION,
    siteId,
    targetSelection: {
      kind: 'block',
      selector: '#hero',
      parentBlockSelector: '#hero',
      editBoundary: 'block',
    },
    targetBlock: {
      selector: '#hero',
    },
    selectionKind: 'contents',
    sourceType: 'contents-by-catalog',
    selectionMode: 'by-catalog',
    catalogId: '100',
    snapshot: {
      catalog: {
        id: '100',
        name: '新闻',
        parentId: null,
        path: 'news/',
        contentType: 'Article',
        contentTypeName: '文章',
        hasChild: false,
        total: 12,
        children: [],
      },
    },
  }
}

async function createBoundCmsProject(app: ReturnType<typeof createApp>, input?: {
  externalRecordId?: string
  projectName?: string
  siteId?: string
}) {
  const response = await app.fetch(new Request('http://localhost/api/integrations/cms/projects', {
    method: 'POST',
    headers: {
      authorization: 'Bearer integration-secret',
      'content-type': 'application/json',
      'x-cms-cookie': 'JSESSIONID=abc',
    },
    body: JSON.stringify({
      externalRecordId: input?.externalRecordId ?? `cms-topic-${Date.now()}-${Math.random()}`,
      projectName: input?.projectName ?? 'CMS Topic',
      siteId: input?.siteId ?? '14',
    }),
  }))

  expect(response.status).toBe(201)
  const created = await response.json() as { projectId: string }
  const binding = getSharedCmsProjectBindingStore().findByProjectId(created.projectId)
  expect(binding).toBeTruthy()
  return { projectId: created.projectId, binding: binding! }
}

function createPreviewFiles(configDir: string, binding: { workspaceId: string }) {
  const workspace = listAgentWorkspaces().find((entry) => entry.id === binding.workspaceId)
  expect(workspace).toBeTruthy()
  const workspaceFilesDir = join(configDir, 'agent-workspaces', workspace!.slug, 'workspace-files')
  mkdirSync(join(workspaceFilesDir, 'assets'), { recursive: true })
  writeFileSync(
    join(workspaceFilesDir, 'index.html'),
    '<!doctype html><html><body><h1>CMS Preview</h1><script src="./assets/app.js"></script></body></html>',
    'utf-8',
  )
  writeFileSync(join(workspaceFilesDir, 'assets', 'app.js'), 'console.log("preview")', 'utf-8')
}

function rebindCmsProject(
  configDir: string,
  projectId: string,
  nextBinding: { workspaceId: string; primarySessionId: string },
) {
  const bindingPath = join(configDir, 'integrations', 'cms', 'projects.json')
  const index = JSON.parse(readFileSync(bindingPath, 'utf-8')) as {
    projects: Array<Record<string, unknown>>
  }
  const project = index.projects.find((entry) => entry.projectId === projectId)
  expect(project).toBeTruthy()
  project!.workspaceId = nextBinding.workspaceId
  project!.primarySessionId = nextBinding.primarySessionId
  project!.updatedAt = Date.now()
  writeFileSync(bindingPath, JSON.stringify(index, null, 2), 'utf-8')
}

async function createHandoff(app: ReturnType<typeof createApp>, projectId: string, body: Record<string, unknown>) {
  const response = await app.fetch(new Request(`http://localhost/api/integrations/cms/projects/${projectId}/handoffs`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer integration-secret',
      'content-type': 'application/json',
      'x-cms-cookie': 'JSESSIONID=abc',
    },
    body: JSON.stringify(body),
  }))

  return response
}

async function consumeOpenUrl(app: ReturnType<typeof createApp>, openUrl: string) {
  const openRequestUrl = new URL(openUrl)
  const appPath = openRequestUrl.pathname.replace(/^\/pagebuilder/, '')
  return app.fetch(new Request(`http://localhost${appPath}${openRequestUrl.search}`, {
    method: 'GET',
    headers: {
      'x-forwarded-proto': 'https',
    },
  }))
}

describe('cms integration routes', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-cms-routes-'))
    process.env.PROMA_CONFIG_DIR = configDir
  })

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true })
    restoreEnv()
    globalThis.fetch = originalFetch
    mock.restore()
    resetCmsIntegrationTestState()
  })

  test('GET /api/integrations/cms/status returns standalone mode by default', async () => {
    const app = createApp()

    const response = await app.fetch(new Request('http://localhost/api/integrations/cms/status'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ integrationMode: 'standalone', enabled: false })
  })

  test('GET /api/integrations/cms/status returns CMS mode without exposing config health', async () => {
    enableCmsIntegration(configDir, { AI_PAGE_BUILDER_CMS_BASE_URL: 'not a url' })
    const fetchMock = createLoginFetchMock()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createApp()

    const response = await app.fetch(new Request('http://localhost/api/integrations/cms/status', {
      headers: {
        authorization: 'Bearer wrong',
        'x-cms-cookie': 'JSESSIONID=secret-cookie',
      },
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      integrationMode: 'cms',
      enabled: true,
      supportedOpenModes: ['iframe', 'window'],
      basePath: '/pagebuilder',
    })
    expect(fetchMock).toHaveBeenCalledTimes(0)
  })

  test('POST /api/integrations/cms/projects rejects missing secret and missing cookie structurally', async () => {
    enableCmsIntegration(configDir)
    const fetchMock = createLoginFetchMock()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createApp()

    const unauthorized = await app.fetch(new Request('http://localhost/api/integrations/cms/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ externalRecordId: 'cms-topic-1', projectName: 'Topic', siteId: '14' }),
    }))
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.json()).toEqual({
      code: 'integration_unauthorized',
      error: 'PageBuilder 集成鉴权失败',
    })

    const missingCookie = await app.fetch(new Request('http://localhost/api/integrations/cms/projects', {
      method: 'POST',
      headers: {
        authorization: 'Bearer integration-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ externalRecordId: 'cms-topic-1', projectName: 'Topic', siteId: '14' }),
    }))
    expect(missingCookie.status).toBe(400)
    expect(await missingCookie.json()).toMatchObject({ code: 'invalid_request' })
    expect(fetchMock).toHaveBeenCalledTimes(0)
  })

  test('POST /api/integrations/cms/projects checks request secret before exposing baseUrl configuration errors', async () => {
    enableCmsIntegration(configDir, { AI_PAGE_BUILDER_CMS_BASE_URL: 'not a url' })
    const app = createApp()

    const response = await app.fetch(new Request('http://localhost/api/integrations/cms/projects', {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong-secret',
        'content-type': 'application/json',
        'x-cms-cookie': 'JSESSIONID=abc',
      },
      body: JSON.stringify({ externalRecordId: 'cms-topic-1', projectName: 'Topic', siteId: '14' }),
    }))

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'integration_unauthorized' })
  })

  test('POST /api/integrations/cms/projects rejects invalid baseUrl and prompt before creating resources', async () => {
    enableCmsIntegration(configDir, { AI_PAGE_BUILDER_CMS_BASE_URL: 'not a url' })
    const app = createApp()

    const invalidBaseUrl = await app.fetch(new Request('http://localhost/api/integrations/cms/projects', {
      method: 'POST',
      headers: {
        authorization: 'Bearer integration-secret',
        'content-type': 'application/json',
        'x-cms-cookie': 'JSESSIONID=abc',
      },
      body: JSON.stringify({ externalRecordId: 'cms-topic-1', projectName: 'Topic', siteId: '14' }),
    }))
    expect(invalidBaseUrl.status).toBe(502)
    expect(await invalidBaseUrl.json()).toMatchObject({ code: 'cms_login_unavailable' })

    enableCmsIntegration(configDir)
    const promptResponse = await app.fetch(new Request('http://localhost/api/integrations/cms/projects', {
      method: 'POST',
      headers: {
        authorization: 'Bearer integration-secret',
        'content-type': 'application/json',
        'x-cms-cookie': 'JSESSIONID=abc',
      },
      body: JSON.stringify({ externalRecordId: 'cms-topic-1', projectName: 'Topic', siteId: '14', prompt: 'build page' }),
    }))
    expect(promptResponse.status).toBe(400)
    expect(await promptResponse.json()).toMatchObject({ code: 'invalid_request' })
    expect(listAgentWorkspaces().filter((workspace) => workspace.template === 'page-builder')).toHaveLength(0)
  })

  test('POST /api/integrations/cms/projects creates empty page-builder project binding and supports authenticated idempotency', async () => {
    enableCmsIntegration(configDir)
    const fetchMock = createLoginFetchMock()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createApp()

    const createResponse = await app.fetch(new Request('http://localhost/api/integrations/cms/projects', {
      method: 'POST',
      headers: {
        authorization: 'Bearer integration-secret',
        'content-type': 'application/json',
        'x-cms-cookie': 'JSESSIONID=abc',
      },
      body: JSON.stringify({ externalRecordId: 'cms-topic-1', projectName: 'Topic', siteId: '14' }),
    }))

    expect(createResponse.status).toBe(201)
    const created = await createResponse.json() as { projectId: string; created: boolean }
    expect(created.created).toBe(true)
    expect(created.projectId).toStartWith('pbp_')

    const workspaces = listAgentWorkspaces().filter((workspace) => workspace.template === 'page-builder')
    expect(workspaces).toHaveLength(1)
    expect(workspaces[0]).toMatchObject({ name: 'Topic' })
    const sessions = listAgentSessions().filter((session) => session.workspaceId === workspaces[0]?.id)
    expect(sessions).toHaveLength(1)
    expect(getAgentSessionMessages(sessions[0]!.id)).toEqual([])
    expect(created.projectId).not.toBe(workspaces[0]!.id)
    expect(created.projectId).not.toBe(sessions[0]!.id)

    const bindingPath = join(configDir, 'integrations', 'cms', 'projects.json')
    const rawBinding = readFileSync(bindingPath, 'utf-8')
    expect(rawBinding).toContain('lastValidatedAt')
    expect(rawBinding).not.toContain('JSESSIONID')
    expect(rawBinding).not.toContain('integration-secret')

    const retryResponse = await app.fetch(new Request('http://localhost/api/integrations/cms/projects', {
      method: 'POST',
      headers: {
        authorization: 'Bearer integration-secret',
        'content-type': 'application/json',
        'x-cms-cookie': 'JSESSIONID=abc',
      },
      body: JSON.stringify({ externalRecordId: 'cms-topic-1', projectName: 'Renamed Topic', siteId: '14' }),
    }))
    expect(retryResponse.status).toBe(200)
    expect(await retryResponse.json()).toEqual({ projectId: created.projectId, created: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const expiredRetry = await app.fetch(new Request('http://localhost/api/integrations/cms/projects', {
      method: 'POST',
      headers: {
        authorization: 'Bearer integration-secret',
        'content-type': 'application/json',
        'x-cms-cookie': 'expired',
      },
      body: JSON.stringify({ externalRecordId: 'cms-topic-1', projectName: 'Topic', siteId: '14' }),
    }))
    expect(expiredRetry.status).toBe(401)
    const expiredPayload = await expiredRetry.json() as Record<string, unknown>
    expect(expiredPayload).toMatchObject({ code: 'cms_login_expired' })
    expect(expiredPayload.projectId).toBeUndefined()
  })

  test('standalone workspace/session/page-builder APIs keep their existing behavior', async () => {
    const app = createApp()

    const workspaceResponse = await app.fetch(new Request('http://localhost/api/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Standalone', template: 'page-builder' }),
    }))
    expect(workspaceResponse.status).toBe(201)
    const workspace = await workspaceResponse.json() as { id: string }

    const sessionResponse = await app.fetch(new Request('http://localhost/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId: workspace.id }),
    }))
    expect(sessionResponse.status).toBe(201)

    const projectsResponse = await app.fetch(new Request('http://localhost/api/page-builder/projects'))
    expect(projectsResponse.status).toBe(200)
    expect(await projectsResponse.json()).toEqual(expect.arrayContaining([expect.objectContaining({
      workspaceId: workspace.id,
    })]))
    expect(existsSync(join(configDir, 'integrations', 'cms', 'projects.json'))).toBe(false)
  })

  test('creates cms handoff openUrl and consumes it into a builder redirect with access cookie', async () => {
    enableCmsIntegration(configDir)
    const fetchMock = createLoginFetchMock()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createApp()

    const createProjectResponse = await app.fetch(new Request('http://localhost/api/integrations/cms/projects', {
      method: 'POST',
      headers: {
        authorization: 'Bearer integration-secret',
        'content-type': 'application/json',
        'x-cms-cookie': 'JSESSIONID=abc',
      },
      body: JSON.stringify({ externalRecordId: 'cms-topic-2', projectName: 'Topic 2', siteId: '14' }),
    }))
    const createdProject = await createProjectResponse.json() as { projectId: string }
    const binding = getSharedCmsProjectBindingStore().findByProjectId(createdProject.projectId)
    expect(binding).toBeTruthy()

    const createHandoffResponse = await app.fetch(new Request(`http://localhost/api/integrations/cms/projects/${createdProject.projectId}/handoffs`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer integration-secret',
        'content-type': 'application/json',
        'x-cms-cookie': 'JSESSIONID=abc',
      },
      body: JSON.stringify({}),
    }))

    expect(createHandoffResponse.status).toBe(200)
    const handoff = await createHandoffResponse.json() as {
      handoffId: string
      openUrl: string
      target: string
      openMode: string
      expiresAt: number
    }
    expect(handoff.target).toBe('builder')
    expect(handoff.openMode).toBe('window')
    expect(handoff.openUrl).toContain('https://builder.example.com/pagebuilder/api/integrations/cms/handoffs/')

    const openRequestUrl = new URL(handoff.openUrl)
    const appPath = openRequestUrl.pathname.replace(/^\/pagebuilder/, '')
    const openResponse = await app.fetch(new Request(`http://localhost${appPath}${openRequestUrl.search}`, {
      method: 'GET',
      headers: {
        'x-forwarded-proto': 'https',
      },
    }))
    expect(openResponse.status).toBe(302)
    expect(openResponse.headers.get('location')).toBe(`/pagebuilder/builder/${binding!.workspaceId}/${binding!.primarySessionId}`)
    expect(openResponse.headers.get('set-cookie')).toContain('ai_page_builder_access=')
    expect(openResponse.headers.get('set-cookie')).toContain('Path=/pagebuilder')
    expect(openResponse.headers.get('set-cookie')).toContain('HttpOnly')
    expect(openResponse.headers.get('set-cookie')).toContain('SameSite=Lax')
    expect(openResponse.headers.get('set-cookie')).toContain('Secure')
    expect(openResponse.headers.get('set-cookie')).not.toContain('Domain=')

    const repeatedOpenResponse = await consumeOpenUrl(app, handoff.openUrl)
    expect(repeatedOpenResponse.status).toBe(410)
    expect(await repeatedOpenResponse.json()).toMatchObject({ code: 'handoff_expired' })

    const thirdOpenResponse = await consumeOpenUrl(app, handoff.openUrl)
    expect(thirdOpenResponse.status).toBe(410)
    expect(await thirdOpenResponse.json()).toMatchObject({ code: 'handoff_expired' })
  })

  test('returns handoff_expired for an unknown handoff open request', async () => {
    enableCmsIntegration(configDir)
    const fetchMock = createLoginFetchMock()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createApp()

    const response = await app.fetch(new Request('http://localhost/api/integrations/cms/handoffs/missing-handoff/open', {
      headers: { 'x-forwarded-proto': 'https' },
    }))

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'handoff_expired' })
  })

  test('cms preview handoff protects preview access and exposes builder context with the shared access cookie', async () => {
    enableCmsIntegration(configDir)
    const fetchMock = createLoginFetchMock()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createApp()

    const primary = await createBoundCmsProject(app, {
      externalRecordId: 'cms-preview-1',
      projectName: 'CMS Preview 1',
    })
    createPreviewFiles(configDir, primary.binding)

    const secondary = await createBoundCmsProject(app, {
      externalRecordId: 'cms-preview-2',
      projectName: 'CMS Preview 2',
    })
    createPreviewFiles(configDir, secondary.binding)

    const previewHandoffResponse = await createHandoff(app, primary.projectId, { target: 'preview', openMode: 'iframe' })
    expect(previewHandoffResponse.status).toBe(200)
    const previewHandoff = await previewHandoffResponse.json() as { openUrl: string; target: string; openMode: string }
    expect(previewHandoff.target).toBe('preview')
    expect(previewHandoff.openMode).toBe('iframe')

    const openResponse = await consumeOpenUrl(app, previewHandoff.openUrl)
    expect(openResponse.status).toBe(302)
    expect(openResponse.headers.get('location')).toBe(`/pagebuilder/api/workspaces/${primary.binding.workspaceId}/preview/`)
    expect(openResponse.headers.get('location')).not.toContain('page-builder-bridge=1')
    const accessCookie = openResponse.headers.get('set-cookie')
    expect(accessCookie).toContain('ai_page_builder_access=')

    const unauthenticatedPreview = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/preview/`))
    expect(unauthenticatedPreview.status).toBe(401)
    expect(await unauthenticatedPreview.json()).toMatchObject({ code: 'builder_access_required' })

    const mismatchedPreview = await app.fetch(new Request(`http://localhost/api/workspaces/${secondary.binding.workspaceId}/preview/`, {
      headers: { cookie: accessCookie! },
    }))
    expect(mismatchedPreview.status).toBe(403)
    expect(await mismatchedPreview.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const previewResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/preview/`, {
      headers: { cookie: accessCookie! },
    }))
    expect(previewResponse.status).toBe(200)
    expect(previewResponse.headers.get('content-security-policy')).toBe("frame-ancestors 'self'")
    expect(previewResponse.headers.get('x-frame-options')).not.toBe('DENY')
    const previewHtml = await previewResponse.text()
    expect(previewHtml).toContain('<h1>CMS Preview</h1>')
    expect(previewHtml).not.toContain('page-builder-preview-bridge')

    const assetResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/preview/assets/app.js`, {
      headers: { cookie: accessCookie! },
    }))
    expect(assetResponse.status).toBe(200)
    expect(await assetResponse.text()).toContain('console.log("preview")')

    const contextResponse = await app.fetch(new Request(`http://localhost/api/integrations/cms/builder-context?workspaceId=${primary.binding.workspaceId}&sessionId=${primary.binding.primarySessionId}`, {
      headers: { cookie: accessCookie! },
    }))
    expect(contextResponse.status).toBe(200)
    const context = await contextResponse.json() as {
      projectId: string
      workspace: { id: string }
      session: { id: string }
      access: { expiresAt: number }
    }
    expect(context.projectId).toBe(primary.projectId)
    expect(context.workspace.id).toBe(primary.binding.workspaceId)
    expect(context.session.id).toBe(primary.binding.primarySessionId)
    expect(typeof context.access.expiresAt).toBe('number')

    const missingContext = await app.fetch(new Request(`http://localhost/api/integrations/cms/builder-context?workspaceId=${primary.binding.workspaceId}&sessionId=${primary.binding.primarySessionId}`))
    expect(missingContext.status).toBe(401)
    expect(await missingContext.json()).toMatchObject({ code: 'builder_access_required' })

    const mismatchedContext = await app.fetch(new Request(`http://localhost/api/integrations/cms/builder-context?workspaceId=${secondary.binding.workspaceId}&sessionId=${secondary.binding.primarySessionId}`, {
      headers: { cookie: accessCookie! },
    }))
    expect(mismatchedContext.status).toBe(403)
    expect(await mismatchedContext.json()).toMatchObject({ code: 'builder_access_mismatch' })
  })

  test('protects CMS mode session workspace and page-builder project APIs', async () => {
    enableCmsIntegration(configDir)
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()

    const primary = await createBoundCmsProject(app, {
      externalRecordId: 'cms-protected-api-1',
      projectName: 'CMS Protected API 1',
    })
    const secondary = await createBoundCmsProject(app, {
      externalRecordId: 'cms-protected-api-2',
      projectName: 'CMS Protected API 2',
    })

    const handoffResponse = await createHandoff(app, primary.projectId, { target: 'builder' })
    const handoff = await handoffResponse.json() as { openUrl: string }
    const accessCookie = (await consumeOpenUrl(app, handoff.openUrl)).headers.get('set-cookie')
    expect(accessCookie).toContain('ai_page_builder_access=')

    const sessionList = await app.fetch(new Request('http://localhost/api/sessions'))
    expect(sessionList.status).toBe(403)
    expect(await sessionList.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const sessionCreate = await app.fetch(new Request('http://localhost/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Bypass', workspaceId: primary.binding.workspaceId }),
    }))
    expect(sessionCreate.status).toBe(403)
    expect(await sessionCreate.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const missingMessages = await app.fetch(new Request(`http://localhost/api/sessions/${primary.binding.primarySessionId}/messages`))
    expect(missingMessages.status).toBe(401)
    expect(await missingMessages.json()).toMatchObject({ code: 'builder_access_required' })

    const missingAttachment = await app.fetch(new Request(`http://localhost/api/sessions/${primary.binding.primarySessionId}/attachments/missing/content`))
    expect(missingAttachment.status).toBe(401)
    expect(await missingAttachment.json()).toMatchObject({ code: 'builder_access_required' })

    const mismatchedMessages = await app.fetch(new Request(`http://localhost/api/sessions/${secondary.binding.primarySessionId}/messages`, {
      headers: { cookie: accessCookie! },
    }))
    expect(mismatchedMessages.status).toBe(403)
    expect(await mismatchedMessages.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const messages = await app.fetch(new Request(`http://localhost/api/sessions/${primary.binding.primarySessionId}/messages`, {
      headers: { cookie: accessCookie! },
    }))
    expect(messages.status).toBe(200)
    expect(messages.headers.get('set-cookie')).toContain('ai_page_builder_access=')

    const stopMissingOrigin = await app.fetch(new Request(`http://localhost/api/sessions/${primary.binding.primarySessionId}/stop`, {
      method: 'POST',
      headers: { cookie: accessCookie! },
    }))
    expect(stopMissingOrigin.status).toBe(403)
    expect(await stopMissingOrigin.json()).toMatchObject({ code: 'builder_access_origin_forbidden' })

    const stopWithOrigin = await app.fetch(new Request(`http://localhost/api/sessions/${primary.binding.primarySessionId}/stop`, {
      method: 'POST',
      headers: {
        cookie: accessCookie!,
        origin: 'https://builder.example.com',
      },
    }))
    expect(stopWithOrigin.status).toBe(204)
    expect(stopWithOrigin.headers.get('set-cookie')).toContain('ai_page_builder_access=')

    const activity = await app.fetch(new Request(`http://localhost/api/sessions/${primary.binding.primarySessionId}/activity`, {
      headers: { cookie: accessCookie! },
    }))
    expect(activity.status).toBe(200)
    expect(activity.headers.get('set-cookie')).toContain('ai_page_builder_access=')

    const sessionPatchMissingOrigin = await app.fetch(new Request(`http://localhost/api/sessions/${primary.binding.primarySessionId}`, {
      method: 'PATCH',
      headers: {
        cookie: accessCookie!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'Renamed Session' }),
    }))
    expect(sessionPatchMissingOrigin.status).toBe(403)
    expect(await sessionPatchMissingOrigin.json()).toMatchObject({ code: 'builder_access_origin_forbidden' })

    const sendMissingOrigin = await app.fetch(new Request(`http://localhost/api/sessions/${primary.binding.primarySessionId}/send`, {
      method: 'POST',
      headers: {
        cookie: accessCookie!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ userMessage: 'hello' }),
    }))
    expect(sendMissingOrigin.status).toBe(403)
    expect(await sendMissingOrigin.json()).toMatchObject({ code: 'builder_access_origin_forbidden' })

    const sessionDelete = await app.fetch(new Request(`http://localhost/api/sessions/${primary.binding.primarySessionId}`, {
      method: 'DELETE',
    }))
    expect(sessionDelete.status).toBe(403)
    expect(await sessionDelete.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const sessionMove = await app.fetch(new Request(`http://localhost/api/sessions/${primary.binding.primarySessionId}/move-workspace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId: secondary.binding.workspaceId }),
    }))
    expect(sessionMove.status).toBe(403)
    expect(await sessionMove.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const workspaceList = await app.fetch(new Request('http://localhost/api/workspaces'))
    expect(workspaceList.status).toBe(403)
    expect(await workspaceList.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const workspaceCreate = await app.fetch(new Request('http://localhost/api/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Bypass Workspace', template: 'page-builder' }),
    }))
    expect(workspaceCreate.status).toBe(403)
    expect(await workspaceCreate.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const missingCapabilities = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/capabilities`))
    expect(missingCapabilities.status).toBe(401)
    expect(await missingCapabilities.json()).toMatchObject({ code: 'builder_access_required' })

    const mismatchedCapabilities = await app.fetch(new Request(`http://localhost/api/workspaces/${secondary.binding.workspaceId}/capabilities`, {
      headers: { cookie: accessCookie! },
    }))
    expect(mismatchedCapabilities.status).toBe(403)
    expect(await mismatchedCapabilities.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const capabilities = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/capabilities`, {
      headers: { cookie: accessCookie! },
    }))
    expect(capabilities.status).toBe(200)
    expect(capabilities.headers.get('set-cookie')).toContain('ai_page_builder_access=')

    const directoryContext = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/directory-context`, {
      headers: { cookie: accessCookie! },
    }))
    expect(directoryContext.status).toBe(200)

    const previewState = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/preview-state`, {
      headers: { cookie: accessCookie! },
    }))
    expect(previewState.status).toBe(200)

    const fileSearch = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/file-search?q=index`, {
      headers: { cookie: accessCookie! },
    }))
    expect(fileSearch.status).toBe(200)

    const workspacePatchMissingOrigin = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}`, {
      method: 'PATCH',
      headers: {
        cookie: accessCookie!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Renamed' }),
    }))
    expect(workspacePatchMissingOrigin.status).toBe(403)
    expect(await workspacePatchMissingOrigin.json()).toMatchObject({ code: 'builder_access_origin_forbidden' })

    const workspacePatchWithoutEditLock = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}`, {
      method: 'PATCH',
      headers: {
        cookie: accessCookie!,
        origin: 'https://builder.example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Renamed' }),
    }))
    expect(workspacePatchWithoutEditLock.status).toBe(409)
    expect(await workspacePatchWithoutEditLock.json()).toMatchObject({ error: expect.stringContaining('编辑锁') })
    expect(workspacePatchWithoutEditLock.headers.get('set-cookie')).toBeNull()

    const workspaceDelete = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}`, {
      method: 'DELETE',
    }))
    expect(workspaceDelete.status).toBe(403)
    expect(await workspaceDelete.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const cmsTargetSnapshotMissingOrigin = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/page-builder/cms-target-snapshot`, {
      method: 'POST',
      headers: {
        cookie: accessCookie!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ targetSelection: { kind: 'block' } }),
    }))
    expect(cmsTargetSnapshotMissingOrigin.status).toBe(403)
    expect(await cmsTargetSnapshotMissingOrigin.json()).toMatchObject({ code: 'builder_access_origin_forbidden' })

    const exportJobMissingOrigin = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/page-builder/export-static-jobs`, {
      method: 'POST',
      headers: {
        cookie: accessCookie!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ downloadCmsRemoteAssets: true }),
    }))
    expect(exportJobMissingOrigin.status).toBe(403)
    expect(await exportJobMissingOrigin.json()).toMatchObject({ code: 'builder_access_origin_forbidden' })

    const exportJobStatusMissingAccess = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/page-builder/export-static-jobs/missing-job`))
    expect(exportJobStatusMissingAccess.status).toBe(401)
    expect(await exportJobStatusMissingAccess.json()).toMatchObject({ code: 'builder_access_required' })

    const exportJobDownloadMissingAccess = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/page-builder/export-static-jobs/missing-job/download`))
    expect(exportJobDownloadMissingAccess.status).toBe(401)
    expect(await exportJobDownloadMissingAccess.json()).toMatchObject({ code: 'builder_access_required' })

    const projects = await app.fetch(new Request('http://localhost/api/page-builder/projects'))
    expect(projects.status).toBe(403)
    expect(await projects.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const projectDelete = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${primary.binding.workspaceId}`, {
      method: 'DELETE',
    }))
    expect(projectDelete.status).toBe(403)
    expect(await projectDelete.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const editLockMissingOrigin = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${primary.binding.workspaceId}/edit-lock`, {
      method: 'POST',
      headers: {
        cookie: accessCookie!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ holderId: 'cms-holder' }),
    }))
    expect(editLockMissingOrigin.status).toBe(403)
    expect(await editLockMissingOrigin.json()).toMatchObject({ code: 'builder_access_origin_forbidden' })

    const editLock = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${primary.binding.workspaceId}/edit-lock`, {
      method: 'POST',
      headers: {
        cookie: accessCookie!,
        origin: 'https://builder.example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ holderId: 'cms-holder' }),
    }))
    expect(editLock.status).toBe(201)
    expect(editLock.headers.get('set-cookie')).toContain('ai_page_builder_access=')
    const lease = await editLock.json() as { lockId: string; holderId: string }

    const sendMismatchedWorkspace = await app.fetch(new Request(`http://localhost/api/sessions/${primary.binding.primarySessionId}/send`, {
      method: 'POST',
      headers: {
        cookie: accessCookie!,
        origin: 'https://builder.example.com',
        'content-type': 'application/json',
        [PAGE_BUILDER_EDIT_LOCK_HEADER]: lease.lockId,
        [PAGE_BUILDER_EDIT_HOLDER_HEADER]: lease.holderId,
      },
      body: JSON.stringify({
        userMessage: ' ',
        workspaceId: secondary.binding.workspaceId,
      }),
    }))
    expect(sendMismatchedWorkspace.status).toBe(403)
    expect(await sendMismatchedWorkspace.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const autoHandoffMismatchedSession = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/page-builder/cms-auto-handoff`, {
      method: 'POST',
      headers: {
        cookie: accessCookie!,
        origin: 'https://builder.example.com',
        'content-type': 'application/json',
        [PAGE_BUILDER_EDIT_LOCK_HEADER]: lease.lockId,
        [PAGE_BUILDER_EDIT_HOLDER_HEADER]: lease.holderId,
      },
      body: JSON.stringify({
        sessionId: secondary.binding.primarySessionId,
        selection: null,
      }),
    }))
    expect(autoHandoffMismatchedSession.status).toBe(403)
    expect(await autoHandoffMismatchedSession.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const autoHandoffMismatchedSite = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/page-builder/cms-auto-handoff`, {
      method: 'POST',
      headers: {
        cookie: accessCookie!,
        origin: 'https://builder.example.com',
        'content-type': 'application/json',
        [PAGE_BUILDER_EDIT_LOCK_HEADER]: lease.lockId,
        [PAGE_BUILDER_EDIT_HOLDER_HEADER]: lease.holderId,
      },
      body: JSON.stringify({
        sessionId: primary.binding.primarySessionId,
        selection: createCmsAutoHandoffSelection('99'),
      }),
    }))
    expect(autoHandoffMismatchedSite.status).toBe(403)
    expect(await autoHandoffMismatchedSite.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const editLockStatus = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${primary.binding.workspaceId}/edit-lock/${lease.lockId}`, {
      headers: {
        cookie: accessCookie!,
      },
    }))
    expect(editLockStatus.status).toBe(200)
    expect(editLockStatus.headers.get('set-cookie')).toContain('ai_page_builder_access=')

    const editLockRenewMissingOrigin = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${primary.binding.workspaceId}/edit-lock/${lease.lockId}/renew`, {
      method: 'POST',
      headers: {
        cookie: accessCookie!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ holderId: lease.holderId }),
    }))
    expect(editLockRenewMissingOrigin.status).toBe(403)
    expect(await editLockRenewMissingOrigin.json()).toMatchObject({ code: 'builder_access_origin_forbidden' })

    const cmsSites = await app.fetch(new Request('http://localhost/api/page-builder/cms/sites'))
    expect(cmsSites.status).toBe(403)
    expect(await cmsSites.json()).toMatchObject({ code: 'builder_access_mismatch' })

    for (const path of [
      '/api/page-builder/cms/catalogs',
      '/api/page-builder/cms/catalogs/100',
      '/api/page-builder/cms/contents?catalogId=100',
      '/api/page-builder/cms/assets?url=https%3A%2F%2Fcms.example.com%2Fasset.png',
    ]) {
      const response = await app.fetch(new Request(`http://localhost${path}`))
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ code: 'builder_access_mismatch' })
    }

    const bridgeScript = await app.fetch(new Request('http://localhost/api/page-builder/preview-bridge.js'))
    expect(bridgeScript.status).toBe(200)
    expect(await bridgeScript.text()).not.toContain('ai_page_builder_access')

    const renderingPreviewScript = await app.fetch(new Request('http://localhost/api/page-builder/cms-rendering-preview.js'))
    expect(renderingPreviewScript.status).toBe(200)
    expect(await renderingPreviewScript.text()).not.toContain('ai_page_builder_access')

    const renderingVueScript = await app.fetch(new Request('http://localhost/api/page-builder/cms-rendering-vue.js'))
    expect(renderingVueScript.status).toBe(200)
    expect(await renderingVueScript.text()).not.toContain('ai_page_builder_access')
  })

  test('scopes CMS browser data APIs to the builder workspace project binding', async () => {
    enableCmsIntegration(configDir)
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager/'
    process.env.PROMA_CMS_USERNAME = 'test-user'
    process.env.PROMA_CMS_PASSWORD = 'test-pass'

    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://cms.example.com/manager/ui/login') {
        return jsonResponse({
          status: 1,
          data: {
            logined: true,
            userName: 'cms-user',
            realName: 'CMS User',
          },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/token') {
        expect(init?.method).toBe('POST')
        return createCmsTokenResponse()
      }

      if (url === 'https://demo.zving.com/manager/preview/news/upload/resources/image/banner.jpg') {
        expect(new Headers(init?.headers).get('authorization')).toBeNull()
        return new Response('image-bytes', {
          headers: {
            'content-type': 'image/jpeg',
          },
        })
      }

      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer cms-token',
      })

      if (url === 'https://demo.zving.com/manager/api/sites') {
        return jsonResponse({
          status: 1,
          data: [
            { id: 14, name: '绑定站点', url: 'https://site14.example.com/' },
            { id: 99, name: '其他站点', url: 'https://site99.example.com/' },
          ],
        })
      }

      if (url === 'https://demo.zving.com/manager/api/catalogsTree?siteID=14') {
        return jsonResponse({
          status: 1,
          data: [],
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createApp()

    const primary = await createBoundCmsProject(app, {
      externalRecordId: 'cms-browser-scope-primary',
      projectName: 'CMS Browser Scope Primary',
      siteId: '14',
    })
    const secondary = await createBoundCmsProject(app, {
      externalRecordId: 'cms-browser-scope-secondary',
      projectName: 'CMS Browser Scope Secondary',
      siteId: '99',
    })
    const handoffResponse = await createHandoff(app, primary.projectId, { target: 'builder' })
    const handoff = await handoffResponse.json() as { openUrl: string }
    const accessCookie = (await consumeOpenUrl(app, handoff.openUrl)).headers.get('set-cookie')
    expect(accessCookie).toContain('ai_page_builder_access=')

    const countCmsGatewayCalls = () => fetchMock.mock.calls
      .filter(([input]) => String(input).startsWith('https://demo.zving.com/manager/api/'))
      .length

    const beforeMissingAccess = countCmsGatewayCalls()
    const missingAccess = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/page-builder/cms/sites`))
    expect(missingAccess.status).toBe(401)
    expect(await missingAccess.json()).toMatchObject({ code: 'builder_access_required' })
    expect(countCmsGatewayCalls()).toBe(beforeMissingAccess)

    const missingAssetAccess = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/page-builder/cms/assets?url=${encodeURIComponent('https://demo.zving.com/manager/preview/news/upload/resources/image/banner.jpg')}`))
    expect(missingAssetAccess.status).toBe(401)
    expect(await missingAssetAccess.json()).toMatchObject({ code: 'builder_access_required' })
    expect(countCmsGatewayCalls()).toBe(beforeMissingAccess)

    const beforeWorkspaceMismatch = countCmsGatewayCalls()
    const workspaceMismatch = await app.fetch(new Request(`http://localhost/api/workspaces/${secondary.binding.workspaceId}/page-builder/cms/sites`, {
      headers: { cookie: accessCookie! },
    }))
    expect(workspaceMismatch.status).toBe(403)
    expect(await workspaceMismatch.json()).toMatchObject({ code: 'builder_access_mismatch' })
    expect(countCmsGatewayCalls()).toBe(beforeWorkspaceMismatch)

    const assetWorkspaceMismatch = await app.fetch(new Request(`http://localhost/api/workspaces/${secondary.binding.workspaceId}/page-builder/cms/assets?url=${encodeURIComponent('https://demo.zving.com/manager/preview/news/upload/resources/image/banner.jpg')}`, {
      headers: { cookie: accessCookie! },
    }))
    expect(assetWorkspaceMismatch.status).toBe(403)
    expect(await assetWorkspaceMismatch.json()).toMatchObject({ code: 'builder_access_mismatch' })
    expect(countCmsGatewayCalls()).toBe(beforeWorkspaceMismatch)

    const beforeSiteMismatch = countCmsGatewayCalls()
    const siteMismatch = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/page-builder/cms/catalogs?siteId=99`, {
      headers: { cookie: accessCookie! },
    }))
    expect(siteMismatch.status).toBe(403)
    expect(await siteMismatch.json()).toMatchObject({ code: 'builder_access_mismatch' })
    expect(countCmsGatewayCalls()).toBe(beforeSiteMismatch)

    const sites = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/page-builder/cms/sites`, {
      headers: { cookie: accessCookie! },
    }))
    expect(sites.status).toBe(200)
    expect(sites.headers.get('cache-control')).toBe('no-store')
    expect(sites.headers.get('set-cookie')).toContain('ai_page_builder_access=')
    expect(await sites.json()).toEqual([
      expect.objectContaining({ id: '14', name: '绑定站点' }),
    ])

    const catalogs = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/page-builder/cms/catalogs`, {
      headers: { cookie: accessCookie! },
    }))
    expect(catalogs.status).toBe(200)
    expect(catalogs.headers.get('cache-control')).toBe('no-store')
    expect(await catalogs.json()).toEqual({ items: [], tree: [] })
    expect(fetchMock.mock.calls.some(([input]) => String(input) === 'https://demo.zving.com/manager/api/catalogsTree?siteID=14')).toBe(true)

    const asset = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/page-builder/cms/assets?url=${encodeURIComponent('https://demo.zving.com/manager/preview/news/upload/resources/image/banner.jpg')}`, {
      headers: { cookie: accessCookie! },
    }))
    expect(asset.status).toBe(200)
    expect(asset.headers.get('cache-control')).toBe('private, no-store')
    expect(asset.headers.get('content-type')).toBe('image/jpeg')
    expect(asset.headers.get('set-cookie')).toContain('ai_page_builder_access=')
    expect(await asset.text()).toBe('image-bytes')
  })

  test('rejects CMS mode permission and ask-user responses for another session requestId', async () => {
    enableCmsIntegration(configDir)
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()

    const primary = await createBoundCmsProject(app, {
      externalRecordId: 'cms-request-owner-1',
      projectName: 'CMS Request Owner 1',
    })
    const secondary = await createBoundCmsProject(app, {
      externalRecordId: 'cms-request-owner-2',
      projectName: 'CMS Request Owner 2',
    })
    const handoffResponse = await createHandoff(app, primary.projectId, { target: 'builder' })
    const handoff = await handoffResponse.json() as { openUrl: string }
    const accessCookie = (await consumeOpenUrl(app, handoff.openUrl)).headers.get('set-cookie')
    expect(accessCookie).toContain('ai_page_builder_access=')

    let permissionRequestId = ''
    const permissionPromise = permissionService.createCanUseTool(
      secondary.binding.primarySessionId,
      'supervised',
      (request) => {
        permissionRequestId = request.requestId
      },
    )('Write', { file_path: 'index.html' }, {
      signal: new AbortController().signal,
      toolUseID: 'tool-use-1',
    })

    expect(permissionRequestId).toBeTruthy()
    const permissionResponse = await app.fetch(new Request(`http://localhost/api/sessions/${primary.binding.primarySessionId}/permission-respond`, {
      method: 'POST',
      headers: {
        cookie: accessCookie!,
        origin: 'https://builder.example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requestId: permissionRequestId,
        behavior: 'allow',
        alwaysAllow: false,
      }),
    }))
    expect(permissionResponse.status).toBe(403)
    expect(await permissionResponse.json()).toMatchObject({ error: '当前响应请求不属于 URL 中的会话' })

    let askUserRequestId = ''
    const askUserPromise = askUserService.handleAskUserQuestion(
      secondary.binding.primarySessionId,
      {
        questions: [
          {
            question: '继续吗？',
            header: '确认',
            options: [{ label: '继续', description: '继续执行' }],
          },
        ],
      },
      new AbortController().signal,
      (request) => {
        askUserRequestId = request.requestId
      },
    )

    expect(askUserRequestId).toBeTruthy()
    const askUserResponse = await app.fetch(new Request(`http://localhost/api/sessions/${primary.binding.primarySessionId}/ask-user-respond`, {
      method: 'POST',
      headers: {
        cookie: accessCookie!,
        origin: 'https://builder.example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requestId: askUserRequestId,
        answers: { '0': '继续' },
      }),
    }))
    expect(askUserResponse.status).toBe(403)
    expect(await askUserResponse.json()).toMatchObject({ error: '当前响应请求不属于 URL 中的会话' })

    permissionService.clearSessionPending(secondary.binding.primarySessionId)
    askUserService.clearSessionPending(secondary.binding.primarySessionId)
    await Promise.all([permissionPromise, askUserPromise])
  })

  test('builder context returns minimal public fields without internal session metadata', async () => {
    enableCmsIntegration(configDir)
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()

    const created = await createBoundCmsProject(app, {
      externalRecordId: 'cms-context-minimal',
      projectName: 'CMS Context Minimal',
    })
    updateAgentSessionMeta(created.binding.primarySessionId, {
      channelId: 'internal-channel',
      sdkSessionId: 'sdk-session-secret',
      attachedDirectories: ['/Users/liu/private-docs'],
    })

    const handoffResponse = await createHandoff(app, created.projectId, { target: 'builder' })
    const handoff = await handoffResponse.json() as { openUrl: string }
    const accessCookie = (await consumeOpenUrl(app, handoff.openUrl)).headers.get('set-cookie')

    const contextResponse = await app.fetch(new Request(`http://localhost/api/integrations/cms/builder-context?workspaceId=${created.binding.workspaceId}&sessionId=${created.binding.primarySessionId}`, {
      headers: { cookie: accessCookie! },
    }))
    expect(contextResponse.status).toBe(200)
    const context = await contextResponse.json() as {
      workspace: Record<string, unknown>
      session: Record<string, unknown>
    }

    expect(context.workspace).toEqual({
      id: created.binding.workspaceId,
      name: 'CMS Context Minimal',
      slug: expect.any(String),
      template: 'page-builder',
    })
    expect(context.session).toEqual({
      id: created.binding.primarySessionId,
      title: '新 Agent 会话',
      workspaceId: created.binding.workspaceId,
    })
    expect(context.session.sdkSessionId).toBeUndefined()
    expect(context.session.channelId).toBeUndefined()
    expect(context.session.attachedDirectories).toBeUndefined()
  })

  test('rejects stale handoff and access sessions when project binding internals changed', async () => {
    enableCmsIntegration(configDir)
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()

    const primary = await createBoundCmsProject(app, {
      externalRecordId: 'cms-stale-binding-1',
      projectName: 'CMS Stale Binding 1',
    })
    const secondary = await createBoundCmsProject(app, {
      externalRecordId: 'cms-stale-binding-2',
      projectName: 'CMS Stale Binding 2',
    })

    const handoffResponse = await createHandoff(app, primary.projectId, { target: 'builder' })
    const handoff = await handoffResponse.json() as { openUrl: string }
    rebindCmsProject(configDir, primary.projectId, secondary.binding)

    const staleOpenResponse = await consumeOpenUrl(app, handoff.openUrl)
    expect(staleOpenResponse.status).toBe(404)
    expect(await staleOpenResponse.json()).toMatchObject({ code: 'project_not_found' })

    rebindCmsProject(configDir, primary.projectId, primary.binding)
    const freshHandoffResponse = await createHandoff(app, primary.projectId, { target: 'builder' })
    const freshHandoff = await freshHandoffResponse.json() as { openUrl: string }
    const accessCookie = (await consumeOpenUrl(app, freshHandoff.openUrl)).headers.get('set-cookie')
    rebindCmsProject(configDir, primary.projectId, secondary.binding)

    const staleContextResponse = await app.fetch(new Request(`http://localhost/api/integrations/cms/builder-context?workspaceId=${primary.binding.workspaceId}&sessionId=${primary.binding.primarySessionId}`, {
      headers: { cookie: accessCookie! },
    }))
    expect(staleContextResponse.status).toBe(404)
    expect(await staleContextResponse.json()).toMatchObject({ code: 'project_not_found' })
  })

  test('rejects preview handoff before preview assets exist and rejects unknown project handoffs', async () => {
    enableCmsIntegration(configDir)
    const fetchMock = createLoginFetchMock()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createApp()

    const created = await createBoundCmsProject(app, {
      externalRecordId: 'cms-preview-not-ready',
      projectName: 'CMS Preview Not Ready',
    })

    const previewNotReadyResponse = await createHandoff(app, created.projectId, { target: 'preview' })
    expect(previewNotReadyResponse.status).toBe(409)
    expect(await previewNotReadyResponse.json()).toMatchObject({ code: 'preview_not_ready' })

    const missingProjectResponse = await createHandoff(app, 'missing-project', {})
    expect(missingProjectResponse.status).toBe(404)
    expect(await missingProjectResponse.json()).toMatchObject({ code: 'project_not_found' })
  })

  test('rejects handoff creation when public origin is missing', async () => {
    enableCmsIntegration(configDir, { AI_PAGE_BUILDER_PUBLIC_ORIGIN: '   ' })
    const fetchMock = createLoginFetchMock()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createApp()

    const created = await createBoundCmsProject(app, {
      externalRecordId: 'cms-missing-origin',
      projectName: 'CMS Missing Origin',
    })

    const handoffResponse = await createHandoff(app, created.projectId, {})
    expect(handoffResponse.status).toBe(400)
    expect(await handoffResponse.json()).toMatchObject({ code: 'invalid_request' })
  })

  test('rejects malformed handoff JSON body instead of silently creating defaults', async () => {
    enableCmsIntegration(configDir)
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()

    const created = await createBoundCmsProject(app, {
      externalRecordId: 'cms-malformed-handoff',
      projectName: 'CMS Malformed Handoff',
    })

    const response = await app.fetch(new Request(`http://localhost/api/integrations/cms/projects/${created.projectId}/handoffs`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer integration-secret',
        'content-type': 'application/json',
        'x-cms-cookie': 'JSESSIONID=abc',
      },
      body: '{',
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'invalid_request' })
  })

  test('rejects builder context without a matching shared access session', async () => {
    enableCmsIntegration(configDir)
    const fetchMock = createLoginFetchMock()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createApp()

    const created = await createBoundCmsProject(app, {
      externalRecordId: 'cms-context-1',
      projectName: 'CMS Context 1',
    })

    const missingAccessResponse = await app.fetch(new Request(`http://localhost/api/integrations/cms/builder-context?workspaceId=${created.binding.workspaceId}&sessionId=${created.binding.primarySessionId}`))
    expect(missingAccessResponse.status).toBe(401)
    expect(await missingAccessResponse.json()).toMatchObject({ code: 'builder_access_required' })

    const other = await createBoundCmsProject(app, {
      externalRecordId: 'cms-context-2',
      projectName: 'CMS Context 2',
    })

    const previewHandoffResponse = await createHandoff(app, created.projectId, { target: 'builder' })
    const previewHandoff = await previewHandoffResponse.json() as { openUrl: string }
    const accessCookie = (await consumeOpenUrl(app, previewHandoff.openUrl)).headers.get('set-cookie')

    const missingInternalResponse = await app.fetch(new Request(`http://localhost/api/integrations/cms/builder-context?workspaceId=${other.binding.workspaceId}&sessionId=${other.binding.primarySessionId}`, {
      headers: { cookie: accessCookie! },
    }))
    expect(missingInternalResponse.status).toBe(403)
    expect(await missingInternalResponse.json()).toMatchObject({ code: 'builder_access_mismatch' })
  })
})
