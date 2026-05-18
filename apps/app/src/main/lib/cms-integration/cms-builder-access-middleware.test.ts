import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import {
  createCmsBuilderAccessMiddleware,
} from './cms-builder-access-middleware'
import {
  getSharedBuilderAccessSessionService,
  resetCmsIntegrationRuntimeState,
} from './cms-integration-runtime'
import {
  CmsIntegrationError,
  toCmsIntegrationErrorResponse,
} from './cms-integration-errors'
import type { HttpAppEnv } from '../../http/types'

const ORIGINAL_ENV = {
  AI_PAGE_BUILDER_INTEGRATION_MODE: process.env.AI_PAGE_BUILDER_INTEGRATION_MODE,
  AI_PAGE_BUILDER_PUBLIC_ORIGIN: process.env.AI_PAGE_BUILDER_PUBLIC_ORIGIN,
  AI_PAGE_BUILDER_BASE_PATH: process.env.AI_PAGE_BUILDER_BASE_PATH,
  AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN: process.env.AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN,
  AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS: process.env.AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS,
}

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key as keyof typeof ORIGINAL_ENV]
    } else {
      process.env[key as keyof typeof ORIGINAL_ENV] = value
    }
  }
}

function enableCmsMode(overrides: Record<string, string | undefined> = {}) {
  process.env.AI_PAGE_BUILDER_INTEGRATION_MODE = 'cms'
  process.env.AI_PAGE_BUILDER_PUBLIC_ORIGIN = 'https://builder.example.com'
  process.env.AI_PAGE_BUILDER_BASE_PATH = '/pagebuilder'
  process.env.AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS = '2000'

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

function createAccessCookie(input?: { workspaceId?: string; sessionId?: string }) {
  const ttlMs = Number(process.env.AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS ?? '2000')
  return getSharedBuilderAccessSessionService(Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 2000).create({
    projectId: 'pbp_1',
    workspaceId: input?.workspaceId ?? 'workspace-1',
    sessionId: input?.sessionId ?? 'session-1',
    basePath: '/pagebuilder',
    isSecure: true,
    userSummary: { userName: 'cms-user' },
  }).cookie
}

function readSetCookiePair(setCookie: string): string {
  return setCookie.split(';', 1)[0]!
}

function expectWorkspaceScopedAccessCookie(setCookie: string | null) {
  expect(setCookie).toBeTruthy()
  expect(setCookie!.split('=', 1)[0]).toStartWith('ai_page_builder_access_')
}

function createTestApp(options?: { requireOrigin?: boolean; sessionScoped?: boolean }) {
  const app = new Hono<HttpAppEnv>()
  app.onError((error) => {
    if (error instanceof CmsIntegrationError) {
      return toCmsIntegrationErrorResponse(error)
    }
    throw error
  })
  app.use('/workspaces/:workspaceId/*', createCmsBuilderAccessMiddleware({
    workspaceId: (c) => c.req.param('workspaceId'),
    sessionId: options?.sessionScoped ? () => 'session-1' : undefined,
    requireOrigin: options?.requireOrigin ?? false,
  }))
  app.get('/workspaces/:workspaceId/read', (c) => c.json({
    workspaceId: c.var.cmsBuilderAccess?.workspaceId ?? null,
    sessionId: c.var.cmsBuilderAccess?.sessionId ?? null,
    projectId: c.var.cmsBuilderAccess?.projectId ?? null,
    userName: c.var.cmsBuilderAccess?.userSummary?.userName ?? null,
  }))
  app.post('/workspaces/:workspaceId/write', (c) => c.json({ ok: true }))
  app.post('/workspaces/:workspaceId/fail', (c) => c.json({ error: 'business failed' }, 409))
  return app
}

function createInternalPreviewTestApp() {
  const app = new Hono<HttpAppEnv>()
  app.onError((error) => {
    if (error instanceof CmsIntegrationError) {
      return toCmsIntegrationErrorResponse(error)
    }
    throw error
  })
  app.use('/api/workspaces/:workspaceId/*', createCmsBuilderAccessMiddleware({
    workspaceId: (c) => c.req.param('workspaceId'),
    requireOrigin: (c) => c.req.method !== 'GET',
  }))
  app.get('/api/workspaces/:workspaceId/preview/', (c) => c.json({
    accessMounted: Boolean(c.var.cmsBuilderAccess),
    internalReadonlyAccess: c.var.cmsBuilderInternalReadonlyAccess === true,
  }))
  app.post('/api/workspaces/:workspaceId/preview/', (c) => c.json({ ok: true }))
  return app
}

describe('cms builder access middleware', () => {
  beforeEach(() => {
    enableCmsMode()
  })

  afterEach(() => {
    restoreEnv()
    resetCmsIntegrationRuntimeState()
  })

  test('passes through without access cookie outside CMS mode', async () => {
    process.env.AI_PAGE_BUILDER_INTEGRATION_MODE = 'standalone'
    const app = createTestApp()

    const response = await app.fetch(new Request('http://localhost/workspaces/workspace-1/read'))

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  test('requires a matching access cookie and mounts the access context', async () => {
    const app = createTestApp({ sessionScoped: true })
    const accessCookie = createAccessCookie()

    const missing = await app.fetch(new Request('http://localhost/workspaces/workspace-1/read'))
    expect(missing.status).toBe(401)
    expect(await missing.json()).toMatchObject({ code: 'builder_access_required' })

    const mismatched = await app.fetch(new Request('http://localhost/workspaces/other-workspace/read', {
      headers: { cookie: accessCookie },
    }))
    expect(mismatched.status).toBe(403)
    expect(await mismatched.json()).toMatchObject({ code: 'builder_access_mismatch' })

    const matched = await app.fetch(new Request('http://localhost/workspaces/workspace-1/read', {
      headers: { cookie: accessCookie },
    }))
    expect(matched.status).toBe(200)
    expect(await matched.json()).toEqual({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      projectId: 'pbp_1',
      userName: 'cms-user',
    })
    expectWorkspaceScopedAccessCookie(matched.headers.get('set-cookie'))
    expect(matched.headers.get('set-cookie')).toContain('Path=/pagebuilder')
    expect(matched.headers.get('set-cookie')).toContain('Secure')
  })

  test('bypasses access cookie only for internal readonly preview GET requests', async () => {
    enableCmsMode({
      AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN: 'http://server:8888',
    })
    const app = createInternalPreviewTestApp()

    const internalPreview = await app.fetch(new Request('http://server:8888/api/workspaces/workspace-1/preview/'))
    expect(internalPreview.status).toBe(200)
    expect(await internalPreview.json()).toEqual({
      accessMounted: false,
      internalReadonlyAccess: true,
    })
    expect(internalPreview.headers.get('set-cookie')).toBeNull()

    const externalPreview = await app.fetch(new Request('https://builder.example.com/api/workspaces/workspace-1/preview/'))
    expect(externalPreview.status).toBe(401)
    expect(await externalPreview.json()).toMatchObject({ code: 'builder_access_required' })

    const internalPost = await app.fetch(new Request('http://server:8888/api/workspaces/workspace-1/preview/', {
      method: 'POST',
    }))
    expect(internalPost.status).toBe(401)
    expect(await internalPost.json()).toMatchObject({ code: 'builder_access_required' })

    const proxiedInternalPreview = await app.fetch(new Request('http://server:8888/api/workspaces/workspace-1/preview/', {
      headers: {
        'x-forwarded-host': 'localhost.var123.cn',
        'x-forwarded-proto': 'http',
      },
    }))
    expect(proxiedInternalPreview.status).toBe(401)
    expect(await proxiedInternalPreview.json()).toMatchObject({ code: 'builder_access_required' })
  })

  test('accepts multiple workspace-scoped access cookies in the same browser', async () => {
    const app = createTestApp({ sessionScoped: true })
    const firstCookie = createAccessCookie({ workspaceId: 'workspace-1', sessionId: 'session-1' })
    const secondCookie = createAccessCookie({ workspaceId: 'workspace-2', sessionId: 'session-1' })
    const browserCookieHeader = `${readSetCookiePair(firstCookie)}; ${readSetCookiePair(secondCookie)}`

    const first = await app.fetch(new Request('http://localhost/workspaces/workspace-1/read', {
      headers: { cookie: browserCookieHeader },
    }))
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })

    const second = await app.fetch(new Request('http://localhost/workspaces/workspace-2/read', {
      headers: { cookie: browserCookieHeader },
    }))
    expect(second.status).toBe(200)
    expect(await second.json()).toMatchObject({
      workspaceId: 'workspace-2',
      sessionId: 'session-1',
    })
  })

  test('rejects invalid expired and session-mismatched access cookies', async () => {
    const app = createTestApp({ sessionScoped: true })
    const sessionMismatchedCookie = createAccessCookie({ sessionId: 'other-session' })

    const invalidSignature = await app.fetch(new Request('http://localhost/workspaces/workspace-1/read', {
      headers: { cookie: 'ai_page_builder_access=bad.signature' },
    }))
    expect(invalidSignature.status).toBe(401)
    expect(await invalidSignature.json()).toMatchObject({ code: 'builder_access_required' })

    const sessionMismatched = await app.fetch(new Request('http://localhost/workspaces/workspace-1/read', {
      headers: { cookie: sessionMismatchedCookie },
    }))
    expect(sessionMismatched.status).toBe(403)
    expect(await sessionMismatched.json()).toMatchObject({ code: 'builder_access_mismatch' })

    resetCmsIntegrationRuntimeState()
    enableCmsMode({ AI_PAGE_BUILDER_ACCESS_SESSION_TTL_MS: '1' })
    const expiredCookie = createAccessCookie()
    await new Promise((resolve) => setTimeout(resolve, 5))

    const expired = await createTestApp({ sessionScoped: true }).fetch(new Request('http://localhost/workspaces/workspace-1/read', {
      headers: { cookie: expiredCookie },
    }))
    expect(expired.status).toBe(401)
    expect(await expired.json()).toMatchObject({ code: 'builder_access_required' })
    expect(expired.headers.get('set-cookie')).toBeNull()
  })

  test('checks Origin or Referer only for configured state-changing APIs', async () => {
    const app = createTestApp({ requireOrigin: true })
    const accessCookie = createAccessCookie()

    const missingOrigin = await app.fetch(new Request('http://localhost/workspaces/workspace-1/write', {
      method: 'POST',
      headers: { cookie: accessCookie },
    }))
    expect(missingOrigin.status).toBe(403)
    expect(await missingOrigin.json()).toMatchObject({ code: 'builder_access_origin_forbidden' })
    expect(missingOrigin.headers.get('set-cookie')).toBeNull()

    const wrongOrigin = await app.fetch(new Request('http://localhost/workspaces/workspace-1/write', {
      method: 'POST',
      headers: {
        cookie: accessCookie,
        origin: 'https://evil.example.com',
      },
    }))
    expect(wrongOrigin.status).toBe(403)
    expect(await wrongOrigin.json()).toMatchObject({ code: 'builder_access_origin_forbidden' })

    const refererAllowed = await app.fetch(new Request('http://localhost/workspaces/workspace-1/write', {
      method: 'POST',
      headers: {
        cookie: accessCookie,
        referer: 'https://builder.example.com/pagebuilder/builder/workspace-1/session-1',
      },
    }))
    expect(refererAllowed.status).toBe(200)
    expectWorkspaceScopedAccessCookie(refererAllowed.headers.get('set-cookie'))
  })

  test('fails closed for state changes when public origin is missing', async () => {
    enableCmsMode({ AI_PAGE_BUILDER_PUBLIC_ORIGIN: undefined })
    const app = createTestApp({ requireOrigin: true })
    const accessCookie = createAccessCookie()

    const response = await app.fetch(new Request('http://localhost/workspaces/workspace-1/write', {
      method: 'POST',
      headers: {
        cookie: accessCookie,
        origin: 'https://builder.example.com',
      },
    }))

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'builder_access_origin_forbidden' })
  })

  test('fails closed for state changes when public origin is invalid', async () => {
    enableCmsMode({ AI_PAGE_BUILDER_PUBLIC_ORIGIN: 'https://builder.example.com/pagebuilder' })
    const app = createTestApp({ requireOrigin: true })
    const accessCookie = createAccessCookie()

    const response = await app.fetch(new Request('http://localhost/workspaces/workspace-1/write', {
      method: 'POST',
      headers: {
        cookie: accessCookie,
        origin: 'https://builder.example.com',
      },
    }))

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'builder_access_origin_forbidden' })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  test('does not renew access sessions when downstream business logic fails', async () => {
    const app = createTestApp({ requireOrigin: true })
    const accessCookie = createAccessCookie()

    const response = await app.fetch(new Request('http://localhost/workspaces/workspace-1/fail', {
      method: 'POST',
      headers: {
        cookie: accessCookie,
        origin: 'https://builder.example.com',
      },
    }))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'business failed' })
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
