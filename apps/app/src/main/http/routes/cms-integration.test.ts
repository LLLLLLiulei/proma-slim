import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { strFromU8, unzipSync } from 'fflate'
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
import {
  getSharedCmsHandoffService,
  resetCmsIntegrationRuntimeState,
  setCmsIntegrationRuntimeStoresForTest,
} from '../../lib/cms-integration/cms-integration-runtime'
import { pageBuilderEditLockService } from '../../lib/page-builder-edit-lock-service'
import {
  InMemoryBuilderAccessSessionStore,
  InMemoryCmsHandoffStore,
  type BuilderAccessSessionStore,
  type CmsHandoffStore,
} from '../../lib/cms-integration/cms-runtime-store'
import type { CmsHandoffRecord } from '../../lib/cms-integration/cms-handoff-service'
import { getSharedCmsProjectBindingStore } from '../../lib/cms-integration/cms-project-binding-store'
import { createAgentWorkspace, listAgentWorkspaces } from '../../lib/workspace-service'
import { createHttpApp } from '../app'

const ORIGINAL_ENV = {
  PROMA_CONFIG_DIR: process.env.PROMA_CONFIG_DIR,
  NODE_ENV: process.env.NODE_ENV,
  AI_PAGE_BUILDER_INTEGRATION_MODE: process.env.AI_PAGE_BUILDER_INTEGRATION_MODE,
  AI_PAGE_BUILDER_INTEGRATION_SECRET: process.env.AI_PAGE_BUILDER_INTEGRATION_SECRET,
  AI_PAGE_BUILDER_CMS_BASE_URL: process.env.AI_PAGE_BUILDER_CMS_BASE_URL,
  AI_PAGE_BUILDER_BASE_PATH: process.env.AI_PAGE_BUILDER_BASE_PATH,
  AI_PAGE_BUILDER_PUBLIC_ORIGIN: process.env.AI_PAGE_BUILDER_PUBLIC_ORIGIN,
  AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS: process.env.AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS,
  AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN: process.env.AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN,
  AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS: process.env.AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS,
  AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS: process.env.AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS,
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
  process.env.AI_PAGE_BUILDER_ACCESS_SESSION_RENEW_THRESHOLD_MS = '28800000'
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

function expectWorkspaceScopedAccessCookie(setCookie: string | null) {
  expect(setCookie).toBeTruthy()
  expect(setCookie!.split('=', 1)[0]).toStartWith('ai_page_builder_access_')
}

function readSetCookiePair(setCookie: string | null): string {
  expect(setCookie).toBeTruthy()
  return setCookie!.split(';', 1)[0]!
}

class FailingConsumedHandoffStore extends InMemoryCmsHandoffStore {
  override async set(record: CmsHandoffRecord): Promise<void> {
    if (record.consumedAt !== undefined) {
      throw new Error('handoff consumed persist failed')
    }
    await super.set(record)
  }
}

class TrackingAccessSessionStore extends InMemoryBuilderAccessSessionStore {
  readonly deletedIds: string[] = []

  override async delete(accessId: string): Promise<void> {
    this.deletedIds.push(accessId)
    await super.delete(accessId)
  }
}

function readTextTree(rootDir: string): string {
  if (!existsSync(rootDir)) {
    return ''
  }

  let content = ''
  for (const entry of readdirSync(rootDir)) {
    const entryPath = join(rootDir, entry)
    const entryStat = statSync(entryPath)
    if (entryStat.isDirectory()) {
      content += `${readTextTree(entryPath)}\n`
      continue
    }

    if (entryStat.isFile()) {
      content += `${readFileSync(entryPath, 'utf-8')}\n`
    }
  }

  return content
}

async function exportCmsProject(app: ReturnType<typeof createApp>, projectId: string, options: {
  body?: unknown
  secret?: string
  cmsCookie?: string
  includeContentType?: boolean
} = {}) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${options.secret ?? 'integration-secret'}`,
    'x-cms-cookie': options.cmsCookie ?? 'JSESSIONID=abc',
  }
  if (options.includeContentType ?? options.body !== undefined) {
    headers['content-type'] = 'application/json'
  }

  return app.fetch(new Request(`http://localhost/api/integrations/cms/projects/${projectId}/export`, {
    method: 'POST',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  }))
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

  afterEach(async () => {
    await resetCmsIntegrationTestState()
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

  test('POST /api/integrations/cms/projects/:projectId/export returns a static ZIP without builder access session', async () => {
    enableCmsIntegration(configDir)
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()
    const { projectId, binding } = await createBoundCmsProject(app, {
      externalRecordId: 'cms-sync-export-success',
      projectName: 'CMS Sync Export',
    })
    createPreviewFiles(configDir, binding)

    const response = await exportCmsProject(app, projectId)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/zip')
    expect(response.headers.get('content-disposition')).toContain('attachment;')
    expect(response.headers.get('set-cookie')).toBeNull()
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
    expect(strFromU8(entries['index.html']!)).toContain('<h1>CMS Preview</h1>')
    const report = JSON.parse(strFromU8(entries['export-report.json']!)) as {
      entryFile: string
      summary: { failureCount: number }
    }
    expect(report.entryFile).toBe('index.html')
    expect(report.summary.failureCount).toBe(0)
  })

  test('POST /api/integrations/cms/projects/:projectId/export rejects standalone, auth, login, project, and payload failures structurally', async () => {
    const standaloneApp = createApp()
    const standalone = await exportCmsProject(standaloneApp, 'missing-project')
    expect(standalone.status).toBe(401)
    expect(await standalone.json()).toMatchObject({ code: 'integration_unauthorized' })

    enableCmsIntegration(configDir)
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()
    const { projectId } = await createBoundCmsProject(app, {
      externalRecordId: 'cms-sync-export-rejections',
    })

    const badSecret = await exportCmsProject(app, projectId, { secret: 'wrong' })
    expect(badSecret.status).toBe(401)
    expect(await badSecret.json()).toMatchObject({ code: 'integration_unauthorized' })

    const missingCookie = await app.fetch(new Request(`http://localhost/api/integrations/cms/projects/${projectId}/export`, {
      method: 'POST',
      headers: { authorization: 'Bearer integration-secret' },
    }))
    expect(missingCookie.status).toBe(400)
    expect(await missingCookie.json()).toMatchObject({ code: 'invalid_request' })

    const expiredCookie = await exportCmsProject(app, projectId, { cmsCookie: 'expired' })
    expect(expiredCookie.status).toBe(401)
    expect(await expiredCookie.json()).toMatchObject({ code: 'cms_login_expired' })

    const missingProject = await exportCmsProject(app, 'missing-project')
    expect(missingProject.status).toBe(404)
    expect(await missingProject.json()).toMatchObject({ code: 'project_not_found' })

    const invalidOption = await exportCmsProject(app, projectId, {
      body: { downloadCmsRemoteAssets: 'no' },
    })
    expect(invalidOption.status).toBe(400)
    expect(await invalidOption.json()).toMatchObject({ code: 'invalid_request' })

    const nullOption = await exportCmsProject(app, projectId, {
      body: { downloadCmsRemoteAssets: null },
    })
    expect(nullOption.status).toBe(400)
    expect(await nullOption.json()).toMatchObject({ code: 'invalid_request' })

    const stale = await createBoundCmsProject(app, {
      externalRecordId: 'cms-sync-export-stale-binding',
    })
    rebindCmsProject(configDir, stale.projectId, {
      workspaceId: 'missing-workspace',
      primarySessionId: 'missing-session',
    })
    const missingInternals = await exportCmsProject(app, stale.projectId)
    expect(missingInternals.status).toBe(404)
    expect(await missingInternals.json()).toMatchObject({ code: 'project_not_found' })

    globalThis.fetch = mock(async () => jsonResponse({ status: 0 }, 500)) as unknown as typeof fetch
    const loginUnavailable = await exportCmsProject(app, projectId)
    expect(loginUnavailable.status).toBe(502)
    expect(await loginUnavailable.json()).toMatchObject({ code: 'cms_login_unavailable' })
  })

  test('POST /api/integrations/cms/projects/:projectId/export passes explicit CMS remote asset option to export core', async () => {
    enableCmsIntegration(configDir)
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()
    const { projectId, binding } = await createBoundCmsProject(app, {
      externalRecordId: 'cms-sync-export-option',
    })
    createPreviewFiles(configDir, binding)
    const {
      pageBuilderStaticExportService,
    } = await import('../../lib/page-builder-static-export-service')
    const originalExport = pageBuilderStaticExportService.exportWorkspaceStaticPackage.bind(pageBuilderStaticExportService)
    const calls: Array<{ workspaceId: string; downloadCmsRemoteAssets: boolean | undefined }> = []
    const packagePath = join(configDir, 'captured-sync-export.zip')
    writeFileSync(packagePath, new Uint8Array([80, 75, 5, 6, ...new Array(18).fill(0)]))

    pageBuilderStaticExportService.exportWorkspaceStaticPackage = (async (workspace, options) => {
      calls.push({
        workspaceId: workspace.id,
        downloadCmsRemoteAssets: options?.downloadCmsRemoteAssets,
      })
      return {
        fileName: 'captured.zip',
        fallbackFileName: 'captured.zip',
        filePath: packagePath,
        reportPath: join(configDir, 'captured-report.json'),
        reportSummary: {
          localizedResourceCount: 0,
          retainedExternalLinkCount: 0,
          warningCount: 0,
          unsupportedRuntimeDependencyCount: 0,
          failureCount: 0,
          hasWarnings: false,
        },
      }
    }) as typeof pageBuilderStaticExportService.exportWorkspaceStaticPackage

    try {
      const response = await exportCmsProject(app, projectId, {
        body: { downloadCmsRemoteAssets: false },
      })
      expect(response.status).toBe(200)
      expect(calls).toEqual([{
        workspaceId: binding.workspaceId,
        downloadCmsRemoteAssets: false,
      }])
    } finally {
      pageBuilderStaticExportService.exportWorkspaceStaticPackage = originalExport
    }
  })

  test('POST /api/integrations/cms/projects/:projectId/export ignores editing state but keeps export safety checks', async () => {
    enableCmsIntegration(configDir)
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()
    const { projectId, binding } = await createBoundCmsProject(app, {
      externalRecordId: 'cms-sync-export-busy',
    })

    const missingIndex = await exportCmsProject(app, projectId)
    expect(missingIndex.status).toBe(409)
    expect(await missingIndex.json()).toMatchObject({ code: 'project_busy' })

    createPreviewFiles(configDir, binding)
    pageBuilderEditLockService.acquire(binding.workspaceId, { holderId: 'test-holder' })

    const locked = await exportCmsProject(app, projectId)
    expect(locked.status).toBe(200)
    expect(locked.headers.get('content-type')).toContain('application/zip')

    const activeAgentProject = await createBoundCmsProject(app, {
      externalRecordId: 'cms-sync-export-active-agent',
    })
    createPreviewFiles(configDir, activeAgentProject.binding)
    const { PageBuilderEditLockConflictError } = await import('../../lib/page-builder-edit-lock-service')
    const originalAssertProjectAvailable = pageBuilderEditLockService.assertProjectAvailable.bind(pageBuilderEditLockService)
    pageBuilderEditLockService.assertProjectAvailable = ((workspaceId) => {
      if (workspaceId === activeAgentProject.binding.workspaceId) {
        throw new PageBuilderEditLockConflictError(
          'agent-busy',
          { status: 'locked', reason: 'agent' },
          '该项目正在构建中，请稍后再试',
        )
      }
      return originalAssertProjectAvailable(workspaceId)
    }) as typeof pageBuilderEditLockService.assertProjectAvailable

    try {
      const activeAgent = await exportCmsProject(app, activeAgentProject.projectId)
      expect(activeAgent.status).toBe(200)
      expect(activeAgent.headers.get('content-type')).toContain('application/zip')
    } finally {
      pageBuilderEditLockService.assertProjectAvailable = originalAssertProjectAvailable
    }

    const activeExportProject = await createBoundCmsProject(app, {
      externalRecordId: 'cms-sync-export-active-export',
    })
    createPreviewFiles(configDir, activeExportProject.binding)
    const {
      PageBuilderStaticExportServiceError,
      pageBuilderStaticExportService,
    } = await import('../../lib/page-builder-static-export-service')
    const originalExportWorkspaceStaticPackage = pageBuilderStaticExportService.exportWorkspaceStaticPackage.bind(pageBuilderStaticExportService)
    pageBuilderStaticExportService.exportWorkspaceStaticPackage = ((workspace, options) => {
      if (workspace.id === activeExportProject.binding.workspaceId) {
        return Promise.reject(new PageBuilderStaticExportServiceError('export-active', '当前项目正在导出中，请稍后再试'))
      }
      return originalExportWorkspaceStaticPackage(workspace, options)
    }) as typeof pageBuilderStaticExportService.exportWorkspaceStaticPackage

    try {
      const activeExport = await exportCmsProject(app, activeExportProject.projectId)
      expect(activeExport.status).toBe(409)
      expect(await activeExport.json()).toMatchObject({ code: 'project_busy' })
    } finally {
      pageBuilderStaticExportService.exportWorkspaceStaticPackage = originalExportWorkspaceStaticPackage
    }
  })

  test('POST /api/integrations/cms/projects/:projectId/export maps export failures and explicit soft timeout', async () => {
    enableCmsIntegration(configDir)
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()
    const { projectId, binding } = await createBoundCmsProject(app, {
      externalRecordId: 'cms-sync-export-failure',
    })
    createPreviewFiles(configDir, binding)
    const {
      PageBuilderStaticExportServiceError,
      pageBuilderStaticExportService,
    } = await import('../../lib/page-builder-static-export-service')
    const originalExport = pageBuilderStaticExportService.exportWorkspaceStaticPackage.bind(pageBuilderStaticExportService)

    pageBuilderStaticExportService.exportWorkspaceStaticPackage = (async () => {
      throw new PageBuilderStaticExportServiceError('export-failed', 'upstream failed')
    }) as typeof pageBuilderStaticExportService.exportWorkspaceStaticPackage

    try {
      const failed = await exportCmsProject(app, projectId)
      expect(failed.status).toBe(502)
      expect(await failed.json()).toMatchObject({ code: 'export_upstream_failed' })
    } finally {
      pageBuilderStaticExportService.exportWorkspaceStaticPackage = originalExport
    }

    process.env.AI_PAGE_BUILDER_SYNC_EXPORT_TIMEOUT_MS = '1'
    let releaseExport!: () => void
    const timeoutPackagePath = join(configDir, 'timeout-sync-export.zip')
    writeFileSync(timeoutPackagePath, new Uint8Array([80, 75, 5, 6, ...new Array(18).fill(0)]))
    pageBuilderStaticExportService.exportWorkspaceStaticPackage = (async () => {
      await new Promise<void>((resolve) => {
        releaseExport = resolve
      })
      return {
        fileName: 'timeout.zip',
        fallbackFileName: 'timeout.zip',
        filePath: timeoutPackagePath,
        reportPath: join(configDir, 'timeout-report.json'),
        reportSummary: {
          localizedResourceCount: 0,
          retainedExternalLinkCount: 0,
          warningCount: 0,
          unsupportedRuntimeDependencyCount: 0,
          failureCount: 0,
          hasWarnings: false,
        },
      }
    }) as typeof pageBuilderStaticExportService.exportWorkspaceStaticPackage

    try {
      const timedOut = await exportCmsProject(app, projectId)
      expect(timedOut.status).toBe(504)
      expect(await timedOut.json()).toMatchObject({ code: 'export_timeout' })
      releaseExport()
      await Promise.resolve()
    } finally {
      pageBuilderStaticExportService.exportWorkspaceStaticPackage = originalExport
    }
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
    expectWorkspaceScopedAccessCookie(openResponse.headers.get('set-cookie'))
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

  test('keeps cms builder handoff scoped to the primary session even when project edit state is recoverable', async () => {
    enableCmsIntegration(configDir)
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()

    const createdProject = await createBoundCmsProject(app, {
      externalRecordId: 'cms-topic-active-session',
      projectName: 'Topic Active Session',
    })
    const originalBinding = getSharedCmsProjectBindingStore().findByProjectId(createdProject.projectId)
    expect(originalBinding).toBeTruthy()

    const originalGetEditState = pageBuilderEditLockService.getEditState.bind(pageBuilderEditLockService)
    pageBuilderEditLockService.getEditState = ((workspaceId: string) => (
      workspaceId === originalBinding!.workspaceId
        ? { status: 'locked', reason: 'agent', activeSessionId: 'active-session-from-edit-state' }
        : originalGetEditState(workspaceId)
    )) as typeof pageBuilderEditLockService.getEditState

    try {
      const handoffResponse = await app.fetch(new Request(`http://localhost/api/integrations/cms/projects/${createdProject.projectId}/handoffs`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer integration-secret',
          'content-type': 'application/json',
          'x-cms-cookie': 'JSESSIONID=abc',
        },
        body: JSON.stringify({}),
      }))

      expect(handoffResponse.status).toBe(200)
      const handoff = await handoffResponse.json() as { openUrl: string }

      const openResponse = await consumeOpenUrl(app, handoff.openUrl)
      expect(openResponse.status).toBe(302)
      expect(openResponse.headers.get('location')).toBe(`/pagebuilder/builder/${originalBinding!.workspaceId}/${originalBinding!.primarySessionId}`)
      expectWorkspaceScopedAccessCookie(openResponse.headers.get('set-cookie'))
      expect(openResponse.headers.get('set-cookie')).toContain('Path=/pagebuilder')

      const activeContextResponse = await app.fetch(new Request(
        `http://localhost/api/integrations/cms/builder-context?workspaceId=${originalBinding!.workspaceId}&sessionId=${originalBinding!.primarySessionId}`,
        {
          headers: {
            cookie: openResponse.headers.get('set-cookie') ?? '',
          },
        },
      ))
      expect(activeContextResponse.status).toBe(200)
      expect(await activeContextResponse.json()).toMatchObject({
        workspace: { id: originalBinding!.workspaceId },
        session: { id: originalBinding!.primarySessionId },
      })
    } finally {
      pageBuilderEditLockService.getEditState = originalGetEditState as typeof pageBuilderEditLockService.getEditState
    }
  })

  test('persists handoff and access session across runtime service recreation', async () => {
    enableCmsIntegration(configDir)
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()

    const created = await createBoundCmsProject(app, {
      externalRecordId: 'cms-runtime-persist',
      projectName: 'CMS Runtime Persist',
    })
    const handoffResponse = await createHandoff(app, created.projectId, { target: 'builder' })
    const handoff = await handoffResponse.json() as { openUrl: string }

    await resetCmsIntegrationRuntimeState({ clearStore: false })
    const openResponse = await consumeOpenUrl(app, handoff.openUrl)
    expect(openResponse.status).toBe(302)
    const accessCookie = openResponse.headers.get('set-cookie')
    expectWorkspaceScopedAccessCookie(accessCookie)

    await resetCmsIntegrationRuntimeState({ clearStore: false })
    const contextResponse = await app.fetch(new Request(
      `http://localhost/api/integrations/cms/builder-context?workspaceId=${created.binding.workspaceId}&sessionId=${created.binding.primarySessionId}`,
      { headers: { cookie: accessCookie! } },
    ))
    expect(contextResponse.status).toBe(200)
    expect(await contextResponse.json()).toMatchObject({
      projectId: created.projectId,
      workspace: { id: created.binding.workspaceId },
      session: { id: created.binding.primarySessionId },
    })

    await resetCmsIntegrationRuntimeState({ clearStore: false })
    const repeatedOpenResponse = await consumeOpenUrl(app, handoff.openUrl)
    expect(repeatedOpenResponse.status).toBe(410)
    expect(await repeatedOpenResponse.json()).toMatchObject({ code: 'handoff_expired' })
  })

  test('concurrent open requests for the same handoff only issue one access cookie', async () => {
    enableCmsIntegration(configDir)
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()

    const created = await createBoundCmsProject(app, {
      externalRecordId: 'cms-concurrent-open',
      projectName: 'CMS Concurrent Open',
    })
    const handoffResponse = await createHandoff(app, created.projectId, { target: 'builder' })
    const handoff = await handoffResponse.json() as { openUrl: string }

    const results = await Promise.all([
      consumeOpenUrl(app, handoff.openUrl),
      consumeOpenUrl(app, handoff.openUrl),
      consumeOpenUrl(app, handoff.openUrl),
    ])
    const successful = results.filter((response) => response.status === 302)
    const rejected = results.filter((response) => response.status === 410)

    expect(successful).toHaveLength(1)
    expect(rejected).toHaveLength(2)
    expectWorkspaceScopedAccessCookie(successful[0]!.headers.get('set-cookie'))
    for (const response of rejected) {
      expect(response.headers.get('set-cookie')).toBeNull()
      expect(await response.json()).toMatchObject({ code: 'handoff_expired' })
    }
  })

  test('does not return access cookie and cleans up access session when handoff consumed persistence fails', async () => {
    enableCmsIntegration(configDir)
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()

    const created = await createBoundCmsProject(app, {
      externalRecordId: 'cms-consumed-write-failure',
      projectName: 'CMS Consumed Write Failure',
    })
    const handoffResponse = await createHandoff(app, created.projectId, { target: 'builder' })
    const handoff = await handoffResponse.json() as { handoffId: string; openUrl: string }
    const persistedHandoff = await getSharedCmsHandoffService().peek(handoff.handoffId)
    expect(persistedHandoff).toBeTruthy()

    const failingHandoffStore = new FailingConsumedHandoffStore()
    await failingHandoffStore.set(persistedHandoff!)
    const accessSessionStore = new TrackingAccessSessionStore()
    setCmsIntegrationRuntimeStoresForTest({
      handoffStore: failingHandoffStore,
      accessSessionStore,
    })

    const openResponse = await consumeOpenUrl(app, handoff.openUrl)
    expect(openResponse.status).toBe(500)
    expect(openResponse.headers.get('set-cookie')).toBeNull()
    expect(accessSessionStore.deletedIds).toHaveLength(1)
    expect(await accessSessionStore.get(accessSessionStore.deletedIds[0]!)).toBeNull()
    const failedPersistedHandoff = await failingHandoffStore.get(handoff.handoffId)
    expect(failedPersistedHandoff).toMatchObject({
      handoffId: handoff.handoffId,
    })
    expect(failedPersistedHandoff?.consumedAt).toBeUndefined()
  })

  test('persists access token in runtime files without raw CMS or server secrets', async () => {
    enableCmsIntegration(configDir)
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()

    const created = await createBoundCmsProject(app, {
      externalRecordId: 'cms-sensitive-file-check',
      projectName: 'CMS Sensitive File Check',
    })
    const handoffResponse = await createHandoff(app, created.projectId, { target: 'builder' })
    const handoff = await handoffResponse.json() as { openUrl: string }
    const openResponse = await consumeOpenUrl(app, handoff.openUrl)
    expect(openResponse.status).toBe(302)
    const accessCookiePair = readSetCookiePair(openResponse.headers.get('set-cookie'))
    const accessToken = accessCookiePair.slice(accessCookiePair.indexOf('=') + 1)
    expect(accessToken).toBeTruthy()

    const runtimeDir = join(configDir, 'integrations', 'cms', 'runtime')
    expect(existsSync(runtimeDir)).toBe(true)
    const runtimeFiles = readTextTree(runtimeDir)
    expect(runtimeFiles).toContain(accessToken)
    expect(runtimeFiles).toContain(created.projectId)
    expect(runtimeFiles).toContain(created.binding.workspaceId)
    expect(runtimeFiles).toContain(created.binding.primarySessionId)
    expect(runtimeFiles).not.toContain('JSESSIONID')
    expect(runtimeFiles).not.toContain('integration-secret')
    expect(runtimeFiles).not.toContain('Authorization')
  })

  test('keeps multiple CMS handoff access sessions valid in the same browser cookie jar', async () => {
    enableCmsIntegration(configDir)
    const fetchMock = createLoginFetchMock()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = createApp()

    const first = await createBoundCmsProject(app, {
      externalRecordId: 'cms-multi-access-1',
      projectName: 'CMS Multi Access 1',
    })
    const second = await createBoundCmsProject(app, {
      externalRecordId: 'cms-multi-access-2',
      projectName: 'CMS Multi Access 2',
    })

    const firstHandoffResponse = await createHandoff(app, first.projectId, { target: 'builder' })
    const secondHandoffResponse = await createHandoff(app, second.projectId, { target: 'builder' })
    expect(firstHandoffResponse.status).toBe(200)
    expect(secondHandoffResponse.status).toBe(200)
    const firstHandoff = await firstHandoffResponse.json() as { openUrl: string }
    const secondHandoff = await secondHandoffResponse.json() as { openUrl: string }

    const firstOpen = await consumeOpenUrl(app, firstHandoff.openUrl)
    const secondOpen = await consumeOpenUrl(app, secondHandoff.openUrl)
    expect(firstOpen.status).toBe(302)
    expect(secondOpen.status).toBe(302)
    const firstCookiePair = readSetCookiePair(firstOpen.headers.get('set-cookie'))
    const secondCookiePair = readSetCookiePair(secondOpen.headers.get('set-cookie'))
    expect(firstCookiePair.split('=', 1)[0]).not.toBe(secondCookiePair.split('=', 1)[0])
    const browserCookieHeader = `${firstCookiePair}; ${secondCookiePair}`

    const firstContext = await app.fetch(new Request(
      `http://localhost/api/integrations/cms/builder-context?workspaceId=${first.binding.workspaceId}&sessionId=${first.binding.primarySessionId}`,
      { headers: { cookie: browserCookieHeader } },
    ))
    expect(firstContext.status).toBe(200)
    expect(await firstContext.json()).toMatchObject({
      workspace: { id: first.binding.workspaceId },
      session: { id: first.binding.primarySessionId },
    })

    const secondContext = await app.fetch(new Request(
      `http://localhost/api/integrations/cms/builder-context?workspaceId=${second.binding.workspaceId}&sessionId=${second.binding.primarySessionId}`,
      { headers: { cookie: browserCookieHeader } },
    ))
    expect(secondContext.status).toBe(200)
    expect(await secondContext.json()).toMatchObject({
      workspace: { id: second.binding.workspaceId },
      session: { id: second.binding.primarySessionId },
    })
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
    enableCmsIntegration(configDir, {
      AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN: 'http://server:8888',
    })
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
    expectWorkspaceScopedAccessCookie(accessCookie)

    const unauthenticatedPreview = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/preview/`))
    expect(unauthenticatedPreview.status).toBe(401)
    expect(await unauthenticatedPreview.json()).toMatchObject({ code: 'builder_access_required' })

    const internalPreview = await app.fetch(new Request(`http://server:8888/api/workspaces/${primary.binding.workspaceId}/preview/`))
    expect(internalPreview.status).toBe(200)
    expect(internalPreview.headers.get('set-cookie')).toBeNull()
    expect(await internalPreview.text()).toContain('<h1>CMS Preview</h1>')

    const internalPreviewAsset = await app.fetch(new Request(`http://server:8888/api/workspaces/${primary.binding.workspaceId}/preview/assets/app.js`))
    expect(internalPreviewAsset.status).toBe(200)
    expect(internalPreviewAsset.headers.get('set-cookie')).toBeNull()
    expect(await internalPreviewAsset.text()).toContain('console.log("preview")')

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

  test('does not treat internal origin as access for non-preview protected APIs', async () => {
    enableCmsIntegration(configDir, {
      AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN: 'http://server:8888',
    })
    globalThis.fetch = createLoginFetchMock() as unknown as typeof fetch
    const app = createApp()

    const created = await createBoundCmsProject(app, {
      externalRecordId: 'cms-internal-origin-non-preview',
      projectName: 'CMS Internal Origin Non Preview',
    })

    const protectedRequests = [
      new Request(`http://server:8888/api/sessions/${created.binding.primarySessionId}/messages`),
      new Request(`http://server:8888/api/sessions/${created.binding.primarySessionId}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'test' }),
      }),
      new Request(`http://server:8888/api/workspaces/${created.binding.workspaceId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed' }),
      }),
      new Request(`http://server:8888/api/workspaces/${created.binding.workspaceId}/page-builder/cms-auto-handoff`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      new Request(`http://server:8888/api/workspaces/${created.binding.workspaceId}/page-builder/export-static-jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      new Request(`http://server:8888/api/integrations/cms/builder-context?workspaceId=${created.binding.workspaceId}&sessionId=${created.binding.primarySessionId}`),
    ]

    for (const request of protectedRequests) {
      const response = await app.fetch(request)
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({ code: 'builder_access_required' })
      expect(response.headers.get('set-cookie')).toBeNull()
    }
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
    expectWorkspaceScopedAccessCookie(accessCookie)

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
    expectWorkspaceScopedAccessCookie(messages.headers.get('set-cookie'))

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
    expectWorkspaceScopedAccessCookie(stopWithOrigin.headers.get('set-cookie'))

    const activity = await app.fetch(new Request(`http://localhost/api/sessions/${primary.binding.primarySessionId}/activity`, {
      headers: { cookie: accessCookie! },
    }))
    expect(activity.status).toBe(200)
    expectWorkspaceScopedAccessCookie(activity.headers.get('set-cookie'))

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
    expectWorkspaceScopedAccessCookie(capabilities.headers.get('set-cookie'))

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
    expectWorkspaceScopedAccessCookie(editLock.headers.get('set-cookie'))
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
    expectWorkspaceScopedAccessCookie(editLockStatus.headers.get('set-cookie'))

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

    const bridgeScript = await app.fetch(new Request('http://localhost/api/page-builder/preview-bridge.js', {
      headers: {
        origin: 'null',
      },
    }))
    expect(bridgeScript.status).toBe(200)
    expect(bridgeScript.headers.get('access-control-allow-origin')).toBe('*')
    expect(await bridgeScript.text()).not.toContain('ai_page_builder_access')

    const renderingPreviewScript = await app.fetch(new Request('http://localhost/api/page-builder/cms-rendering-preview.js', {
      headers: {
        origin: 'null',
      },
    }))
    expect(renderingPreviewScript.status).toBe(200)
    expect(renderingPreviewScript.headers.get('access-control-allow-origin')).toBe('*')
    expect(await renderingPreviewScript.text()).not.toContain('ai_page_builder_access')

    const renderingVueScript = await app.fetch(new Request('http://localhost/api/page-builder/cms-rendering-vue.js', {
      headers: {
        origin: 'null',
      },
    }))
    expect(renderingVueScript.status).toBe(200)
    expect(renderingVueScript.headers.get('access-control-allow-origin')).toBe('*')
    expect(await renderingVueScript.text()).not.toContain('ai_page_builder_access')
  })

  test('allows standalone home history and direct builder APIs only for explicit development CMS opt-in', async () => {
    enableCmsIntegration(configDir, {
      NODE_ENV: 'development',
      AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS: 'true',
    })
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager/'
    process.env.PROMA_CMS_USERNAME = 'test-user'
    process.env.PROMA_CMS_PASSWORD = 'test-pass'
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://cms.example.com/manager/ui/login') {
        return createLoginFetchMock()(input, init)
      }

      if (url === 'https://demo.zving.com/manager/api/token') {
        return createCmsTokenResponse()
      }

      if (url === 'https://demo.zving.com/manager/api/sites') {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer cms-token')
        expect(new Headers(init?.headers).get('cookie')).toBeNull()
        return jsonResponse({
          status: 1,
          data: [
            { id: '14', name: '开发站点', url: 'https://demo.zving.com/site/' },
          ],
        })
      }

      if (url === 'https://demo.zving.com/manager/api/catalogsTree?siteID=14') {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer cms-token')
        expect(new Headers(init?.headers).get('cookie')).toBeNull()
        return jsonResponse({
          status: 1,
          data: [],
        })
      }

      throw new Error(`unexpected request: ${url}`)
    }) as unknown as typeof fetch
    const app = createApp()

    const created = await createBoundCmsProject(app, {
      externalRecordId: 'cms-dev-standalone-entry',
      projectName: 'CMS Dev Standalone Entry',
    })

    const status = await app.fetch(new Request('http://localhost/api/integrations/cms/status'))
    expect(status.status).toBe(200)
    expect(await status.json()).toMatchObject({
      integrationMode: 'cms',
      enabled: true,
      devStandaloneEntryEnabled: true,
    })

    const projects = await app.fetch(new Request('http://localhost/api/page-builder/projects'))
    expect(projects.status).toBe(200)
    expect(await projects.json()).toEqual(expect.arrayContaining([expect.objectContaining({
      workspaceId: created.binding.workspaceId,
      latestSessionId: created.binding.primarySessionId,
    })]))

    const workspaces = await app.fetch(new Request('http://localhost/api/workspaces'))
    expect(workspaces.status).toBe(200)
    expect(await workspaces.json()).toEqual(expect.arrayContaining([expect.objectContaining({
      id: created.binding.workspaceId,
    })]))

    const sessions = await app.fetch(new Request('http://localhost/api/sessions'))
    expect(sessions.status).toBe(200)
    expect(await sessions.json()).toEqual(expect.arrayContaining([expect.objectContaining({
      id: created.binding.primarySessionId,
      workspaceId: created.binding.workspaceId,
    })]))

    const messages = await app.fetch(new Request(`http://localhost/api/sessions/${created.binding.primarySessionId}/messages`))
    expect(messages.status).toBe(200)
    expect(await messages.json()).toEqual(getAgentSessionMessages(created.binding.primarySessionId))

    const activity = await app.fetch(new Request(`http://localhost/api/sessions/${created.binding.primarySessionId}/activity`))
    expect(activity.status).toBe(200)
    expect(await activity.json()).toEqual({ active: false })

    const localWorkspaceResponse = await app.fetch(new Request('http://localhost/api/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Local Dev Project', template: 'page-builder' }),
    }))
    expect(localWorkspaceResponse.status).toBe(201)
    const localWorkspace = await localWorkspaceResponse.json() as { id: string; template?: string }
    expect(localWorkspace.template).toBe('page-builder')

    const localSessionResponse = await app.fetch(new Request('http://localhost/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Local Dev Session', workspaceId: localWorkspace.id }),
    }))
    expect(localSessionResponse.status).toBe(201)

    const localCmsSites = await app.fetch(new Request(`http://localhost/api/workspaces/${localWorkspace.id}/page-builder/cms/sites`))
    expect(localCmsSites.status).toBe(200)
    expect(await localCmsSites.json()).toEqual([
      expect.objectContaining({ id: '14', name: '开发站点' }),
    ])

    const localCmsCatalogs = await app.fetch(new Request(`http://localhost/api/workspaces/${localWorkspace.id}/page-builder/cms/catalogs?siteId=14`))
    expect(localCmsCatalogs.status).toBe(200)
    expect(await localCmsCatalogs.json()).toEqual({
      items: [],
      tree: [],
    })

    const deleteLocalProject = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${localWorkspace.id}`, {
      method: 'DELETE',
    }))
    expect(deleteLocalProject.status).toBe(204)

    const missingAccessContext = await app.fetch(new Request(`http://localhost/api/integrations/cms/builder-context?workspaceId=${created.binding.workspaceId}&sessionId=${created.binding.primarySessionId}`))
    expect(missingAccessContext.status).toBe(401)
    expect(await missingAccessContext.json()).toMatchObject({ code: 'builder_access_required' })
  })

  test('ignores standalone entry opt-in outside development CMS mode', async () => {
    enableCmsIntegration(configDir, {
      NODE_ENV: 'production',
      AI_PAGE_BUILDER_DEV_ALLOW_STANDALONE_ENTRY_IN_CMS: 'true',
    })
    const app = createApp()

    const status = await app.fetch(new Request('http://localhost/api/integrations/cms/status'))
    expect(status.status).toBe(200)
    expect(await status.json()).not.toHaveProperty('devStandaloneEntryEnabled')

    const projects = await app.fetch(new Request('http://localhost/api/page-builder/projects'))
    expect(projects.status).toBe(403)
    expect(await projects.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const workspaces = await app.fetch(new Request('http://localhost/api/workspaces'))
    expect(workspaces.status).toBe(403)
    expect(await workspaces.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const sessions = await app.fetch(new Request('http://localhost/api/sessions'))
    expect(sessions.status).toBe(403)
    expect(await sessions.json()).toMatchObject({ code: 'builder_access_mismatch' })
  })

  test('scopes CMS browser data APIs to the builder workspace project binding', async () => {
    enableCmsIntegration(configDir, {
      AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN: 'http://server:8888',
    })
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
          data: [
            {
              id: 101,
              name: '新闻',
              parentId: 0,
              siteID: 14,
              path: 'news/',
              children: [],
            },
          ],
        })
      }

      if (url === 'https://demo.zving.com/manager/api/catalogs?siteID=14&level=All&pageIndex=0&pageSize=500') {
        return jsonResponse({
          status: 1,
          total: 1,
          data: [
            {
              id: 101,
              name: '新闻',
              parentId: 0,
              siteID: 14,
              path: 'news/',
            },
          ],
        })
      }

      if (url === 'https://demo.zving.com/manager/api/catalogs/101/contents?siteID=14&pageIndex=0&pageSize=20&loadextend=true') {
        return jsonResponse({
          status: 1,
          data: {
            pageIndex: 0,
            pageSize: 20,
            total: 1,
            data: [
              {
                id: 501,
                catalogID: 101,
                title: '新闻内容',
                summary: 'CMS 内容摘要',
              },
            ],
          },
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
    expectWorkspaceScopedAccessCookie(accessCookie)

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

    const internalSites = await app.fetch(new Request(`http://server:8888/api/workspaces/${primary.binding.workspaceId}/page-builder/cms/sites`))
    expect(internalSites.status).toBe(200)
    expect(internalSites.headers.get('cache-control')).toBe('no-store')
    expect(internalSites.headers.get('set-cookie')).toBeNull()
    expect(await internalSites.json()).toEqual([
      expect.objectContaining({ id: '14', name: '绑定站点' }),
    ])

    const internalCatalogs = await app.fetch(new Request(`http://server:8888/api/workspaces/${primary.binding.workspaceId}/page-builder/cms/catalogs`))
    expect(internalCatalogs.status).toBe(200)
    expect(internalCatalogs.headers.get('cache-control')).toBe('no-store')
    expect(internalCatalogs.headers.get('set-cookie')).toBeNull()
    const internalCatalogsBody = await internalCatalogs.json() as { items: Array<{ id: string }>; tree: Array<{ id: string }> }
    expect(internalCatalogsBody.items).toEqual([expect.objectContaining({ id: '101' })])
    expect(internalCatalogsBody.tree).toEqual([expect.objectContaining({ id: '101' })])

    const internalCatalogDetail = await app.fetch(new Request(`http://server:8888/api/workspaces/${primary.binding.workspaceId}/page-builder/cms/catalogs/101`))
    expect(internalCatalogDetail.status).toBe(200)
    expect(internalCatalogDetail.headers.get('cache-control')).toBe('no-store')
    expect(internalCatalogDetail.headers.get('set-cookie')).toBeNull()
    expect(await internalCatalogDetail.json()).toMatchObject({ id: '101', name: '新闻' })

    const internalContents = await app.fetch(new Request(`http://server:8888/api/workspaces/${primary.binding.workspaceId}/page-builder/cms/contents?catalogId=101`))
    expect(internalContents.status).toBe(200)
    expect(internalContents.headers.get('cache-control')).toBe('no-store')
    expect(internalContents.headers.get('set-cookie')).toBeNull()
    expect(await internalContents.json()).toMatchObject({
      items: [
        expect.objectContaining({ id: '501', title: '新闻内容' }),
      ],
    })

    const internalAsset = await app.fetch(new Request(`http://server:8888/api/workspaces/${primary.binding.workspaceId}/page-builder/cms/assets?url=${encodeURIComponent('https://demo.zving.com/manager/preview/news/upload/resources/image/banner.jpg')}`))
    expect(internalAsset.status).toBe(200)
    expect(internalAsset.headers.get('cache-control')).toBe('private, no-store')
    expect(internalAsset.headers.get('content-type')).toBe('image/jpeg')
    expect(internalAsset.headers.get('set-cookie')).toBeNull()
    expect(await internalAsset.text()).toBe('image-bytes')

    const unboundWorkspace = createAgentWorkspace('Unbound CMS Workspace', { template: 'page-builder' })
    const beforeMissingBinding = countCmsGatewayCalls()
    const missingInternalBinding = await app.fetch(new Request(`http://server:8888/api/workspaces/${unboundWorkspace.id}/page-builder/cms/sites`))
    expect(missingInternalBinding.status).toBe(404)
    expect(await missingInternalBinding.json()).toMatchObject({ code: 'project_not_found' })
    expect(countCmsGatewayCalls()).toBe(beforeMissingBinding)

    const beforeInternalSiteMismatch = countCmsGatewayCalls()
    const internalSiteMismatch = await app.fetch(new Request(`http://server:8888/api/workspaces/${primary.binding.workspaceId}/page-builder/cms/catalogs?siteId=99`))
    expect(internalSiteMismatch.status).toBe(403)
    expect(await internalSiteMismatch.json()).toMatchObject({ code: 'builder_access_mismatch' })
    expect(countCmsGatewayCalls()).toBe(beforeInternalSiteMismatch)

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
    expectWorkspaceScopedAccessCookie(sites.headers.get('set-cookie'))
    expect(await sites.json()).toEqual([
      expect.objectContaining({ id: '14', name: '绑定站点' }),
    ])

    const catalogs = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/page-builder/cms/catalogs`, {
      headers: { cookie: accessCookie! },
    }))
    expect(catalogs.status).toBe(200)
    expect(catalogs.headers.get('cache-control')).toBe('no-store')
    const catalogsBody = await catalogs.json() as { items: Array<{ id: string }>; tree: Array<{ id: string }> }
    expect(catalogsBody.items).toEqual([expect.objectContaining({ id: '101' })])
    expect(catalogsBody.tree).toEqual([expect.objectContaining({ id: '101' })])
    expect(fetchMock.mock.calls.some(([input]) => String(input) === 'https://demo.zving.com/manager/api/catalogsTree?siteID=14')).toBe(true)

    const asset = await app.fetch(new Request(`http://localhost/api/workspaces/${primary.binding.workspaceId}/page-builder/cms/assets?url=${encodeURIComponent('https://demo.zving.com/manager/preview/news/upload/resources/image/banner.jpg')}`, {
      headers: { cookie: accessCookie! },
    }))
    expect(asset.status).toBe(200)
    expect(asset.headers.get('cache-control')).toBe('private, no-store')
    expect(asset.headers.get('content-type')).toBe('image/jpeg')
    expectWorkspaceScopedAccessCookie(asset.headers.get('set-cookie'))
    expect(await asset.text()).toBe('image-bytes')

    rebindCmsProject(configDir, primary.projectId, {
      workspaceId: primary.binding.workspaceId,
      primarySessionId: 'missing-session',
    })
    const beforeMissingInternalResource = countCmsGatewayCalls()
    const missingInternalResource = await app.fetch(new Request(`http://server:8888/api/workspaces/${primary.binding.workspaceId}/page-builder/cms/sites`))
    expect(missingInternalResource.status).toBe(404)
    expect(await missingInternalResource.json()).toMatchObject({ code: 'project_not_found' })
    expect(countCmsGatewayCalls()).toBe(beforeMissingInternalResource)
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
    expectWorkspaceScopedAccessCookie(accessCookie)

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
