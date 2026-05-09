import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getAgentSessionMessages, listAgentSessions } from '../../lib/agent-session-manager'
import { listAgentWorkspaces } from '../../lib/workspace-service'
import { createHttpApp } from '../app'

const ORIGINAL_ENV = {
  PROMA_CONFIG_DIR: process.env.PROMA_CONFIG_DIR,
  AI_PAGE_BUILDER_INTEGRATION_MODE: process.env.AI_PAGE_BUILDER_INTEGRATION_MODE,
  AI_PAGE_BUILDER_INTEGRATION_SECRET: process.env.AI_PAGE_BUILDER_INTEGRATION_SECRET,
  AI_PAGE_BUILDER_CMS_BASE_URL: process.env.AI_PAGE_BUILDER_CMS_BASE_URL,
  AI_PAGE_BUILDER_BASE_PATH: process.env.AI_PAGE_BUILDER_BASE_PATH,
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
})
