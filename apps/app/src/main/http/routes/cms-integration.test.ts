import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getAgentSessionMessages, listAgentSessions, updateAgentSessionMeta } from '../../lib/agent-session-manager'
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
