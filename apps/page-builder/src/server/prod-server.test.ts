import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createPageBuilderProdApp,
  createPageBuilderProdFetchHandler,
  resolvePageBuilderProdAppOrigin,
  resolvePageBuilderProdHiddenToolbarItems,
  resolvePageBuilderProdPublicBasePath,
} from './prod-server'

function createTempDistDir(): string {
  const distDir = mkdtempSync(join(tmpdir(), 'proma-page-builder-dist-'))
  mkdirSync(join(distDir, 'assets'), { recursive: true })
  writeFileSync(join(distDir, 'index.html'), '<!doctype html><html><body>page-builder</body></html>', 'utf-8')
  writeFileSync(join(distDir, 'assets', 'app.js'), 'console.log("page-builder")', 'utf-8')
  return distDir
}

const tempDirs: string[] = []

async function listenHttpServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ origin: string, close: () => Promise<void> }> {
  const server = createServer(handler)
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    }),
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('page-builder production server', () => {
  test('prefers docker runtime app origin env while keeping legacy fallback', () => {
    expect(resolvePageBuilderProdAppOrigin({
      AI_PAGE_BUILDER_SERVER_ORIGIN: 'http://server:8888',
      PROMA_APP_ORIGIN: 'http://legacy:8888',
    })).toBe('http://server:8888')

    expect(resolvePageBuilderProdAppOrigin({
      PROMA_APP_ORIGIN: 'http://legacy:8888',
    })).toBe('http://legacy:8888')
  })

  test('resolves docker runtime public base path env', () => {
    expect(resolvePageBuilderProdPublicBasePath({
      AI_PAGE_BUILDER_BASE_PATH: 'pagebuilder',
    })).toBe('/pagebuilder')

    expect(resolvePageBuilderProdPublicBasePath({})).toBe('')
  })


  test('resolves hidden toolbar items env as a normalized key list', () => {
    expect(resolvePageBuilderProdHiddenToolbarItems({
      AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS: ' export, saveTemplate,unknown,export ',
    })).toEqual(['export', 'saveTemplate'])

    expect(resolvePageBuilderProdHiddenToolbarItems({})).toEqual([])
  })

  test('serves static assets from dist', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)

    const handler = createPageBuilderProdFetchHandler({
      distDir,
      appOrigin: 'http://app:3000',
    })

    const response = await handler(new Request('http://localhost/assets/app.js'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('javascript')
    expect(await response.text()).toContain('console.log("page-builder")')
  })

  test('creates a Hono app that serves through the production handler', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)

    const app = createPageBuilderProdApp({
      distDir,
      appOrigin: 'http://app:3000',
    })

    const response = await app.request('http://localhost/assets/app.js')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('javascript')
    expect(await response.text()).toBe('console.log("page-builder")')
  })

  test('falls back to index.html for root and builder routes', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)

    const handler = createPageBuilderProdFetchHandler({
      distDir,
      appOrigin: 'http://app:3000',
    })

    const rootResponse = await handler(new Request('http://localhost/'))
    const builderResponse = await handler(new Request('http://localhost/builder/workspace-1/session-1'))

    expect(rootResponse.status).toBe(200)
    expect(rootResponse.headers.get('content-security-policy')).toBe("frame-ancestors 'self'")
    expect(rootResponse.headers.get('x-frame-options')).not.toBe('DENY')
    expect(await rootResponse.text()).toContain('page-builder')
    expect(builderResponse.status).toBe(200)
    expect(builderResponse.headers.get('content-security-policy')).toBe("frame-ancestors 'self'")
    expect(builderResponse.headers.get('x-frame-options')).not.toBe('DENY')
    expect(await builderResponse.text()).toContain('page-builder')
  })

  test('injects runtime public base path and hidden toolbar config when serving index.html', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)

    const handler = createPageBuilderProdFetchHandler({
      distDir,
      appOrigin: 'http://app:3000',
      publicBasePath: '/ai/pagebuilder',
      hiddenToolbarItems: ['export', 'saveTemplate'],
    })

    const response = await handler(new Request('http://localhost/ai/pagebuilder/'))
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('<base href="/ai/pagebuilder/">')
    expect(html).toContain('window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__')
    expect(html).toContain('"basePath":"/ai/pagebuilder"')
    expect(html).toContain('"hiddenToolbarItems":["export","saveTemplate"]')
    expect(html).toContain('page-builder')
  })

  test('does not inject runtime config into static assets', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)

    const handler = createPageBuilderProdFetchHandler({
      distDir,
      appOrigin: 'http://app:3000',
      publicBasePath: '/ai/pagebuilder',
    })

    const response = await handler(new Request('http://localhost/ai/pagebuilder/assets/app.js'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toBeNull()
    expect(await response.text()).toBe('console.log("page-builder")')
  })

  test('refreshes existing runtime config injection when the runtime base path changes', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)
    writeFileSync(
      join(distDir, 'index.html'),
      '<!doctype html><html><head><base href="/old/"><script>window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__={"basePath":"/old"};</script></head><body>page-builder</body></html>',
      'utf-8',
    )

    const handler = createPageBuilderProdFetchHandler({
      distDir,
      appOrigin: 'http://app:3000',
      publicBasePath: '/new/path',
    })

    const response = await handler(new Request('http://localhost/new/path/'))
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('<base href="/new/path/">')
    expect(html).toContain('"basePath":"/new/path"')
    expect(html).not.toContain('/old')
  })

  test('returns 404 for missing static assets with file extensions', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)

    const handler = createPageBuilderProdFetchHandler({
      distDir,
      appOrigin: 'http://app:3000',
    })

    const response = await handler(new Request('http://localhost/assets/missing.js'))

    expect(response.status).toBe(404)
  })

  test('proxies /api requests to the configured app origin and preserves streamed responses', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)

    let proxiedUrl = ''
    let proxiedMethod = ''
    let proxiedBody = ''
    let forwardedHost = ''
    let forwardedProto = ''

    const handler = createPageBuilderProdFetchHandler({
      distDir,
      appOrigin: 'http://app:3000',
      fetchImpl: async (request) => {
        proxiedUrl = request.url
        proxiedMethod = request.method
        proxiedBody = await request.text()
        forwardedHost = request.headers.get('x-forwarded-host') ?? ''
        forwardedProto = request.headers.get('x-forwarded-proto') ?? ''

        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('stream-a'))
            controller.enqueue(encoder.encode('stream-b'))
            controller.close()
          },
        })

        return new Response(stream, {
          status: 202,
          headers: { 'x-proxied': 'true' },
        })
      },
    })

    const response = await handler(new Request('http://localhost/api/sessions/session-1/send?draft=1', {
      method: 'POST',
      body: 'payload',
      headers: { 'content-type': 'text/plain' },
    }))

    expect(proxiedUrl).toBe('http://app:3000/api/sessions/session-1/send?draft=1')
    expect(proxiedMethod).toBe('POST')
    expect(proxiedBody).toBe('payload')
    expect(forwardedHost).toBe('localhost')
    expect(forwardedProto).toBe('http')
    expect(response.status).toBe(202)
    expect(response.headers.get('x-proxied')).toBe('true')
    expect(await response.text()).toBe('stream-astream-b')
  })

  test('uses the bundled proxy fetch by default without depending on global fetch', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)

    const upstream = await listenHttpServer((request, response) => {
      let body = ''
      request.setEncoding('utf-8')
      request.on('data', (chunk) => {
        body += chunk
      })
      request.on('end', () => {
        response.writeHead(203, {
          'content-type': 'text/plain; charset=utf-8',
          'x-upstream-method': request.method ?? '',
          'x-upstream-path': request.url ?? '',
        })
        response.write('stream-a')
        response.end(`:${body}`)
      })
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() => {
      throw new Error('global fetch must not be used by the production API proxy')
    }) as unknown as typeof fetch

    try {
      const handler = createPageBuilderProdFetchHandler({
        distDir,
        appOrigin: upstream.origin,
      })

      const response = await handler(new Request('http://localhost/api/proxy-test?draft=1', {
        method: 'POST',
        body: 'payload',
        headers: { 'content-type': 'text/plain' },
      }))

      expect(response.status).toBe(203)
      expect(response.headers.get('x-upstream-method')).toBe('POST')
      expect(response.headers.get('x-upstream-path')).toBe('/api/proxy-test?draft=1')
      expect(await response.text()).toBe('stream-a:payload')
    } finally {
      globalThis.fetch = originalFetch
      await upstream.close()
    }
  })

  test('returns bad gateway when the API proxy cannot reach the upstream server', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)
    const originalConsoleError = console.error
    console.error = () => {}

    try {
      const handler = createPageBuilderProdFetchHandler({
        distDir,
        appOrigin: 'http://app:3000',
        fetchImpl: async () => {
          throw new Error('connect ECONNREFUSED')
        },
      })

      const response = await handler(new Request('http://localhost/api/status'))

      expect(response.status).toBe(502)
      expect(await response.text()).toBe('Bad Gateway')
    } finally {
      console.error = originalConsoleError
    }
  })

  test('handles direct base path requests by stripping the prefix once', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)

    let proxiedUrl = ''
    const handler = createPageBuilderProdFetchHandler({
      distDir,
      appOrigin: 'http://app:3000',
      publicBasePath: '/pagebuilder',
      fetchImpl: async (request) => {
        proxiedUrl = request.url
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        })
      },
    })

    const rootResponse = await handler(new Request('http://localhost/pagebuilder/'))
    const builderResponse = await handler(new Request('http://localhost/pagebuilder/builder/workspace-1/session-1'))
    const assetResponse = await handler(new Request('http://localhost/pagebuilder/assets/app.js'))
    const apiResponse = await handler(new Request('http://localhost/pagebuilder/api/status?ready=1'))

    expect(rootResponse.status).toBe(200)
    expect(await rootResponse.text()).toContain('page-builder')
    expect(builderResponse.status).toBe(200)
    expect(await builderResponse.text()).toContain('page-builder')
    expect(assetResponse.status).toBe(200)
    expect(await assetResponse.text()).toContain('console.log("page-builder")')
    expect(apiResponse.status).toBe(200)
    expect(proxiedUrl).toBe('http://app:3000/api/status?ready=1')
  })

  test('does not strip repeated base path prefixes as an internal API path', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)

    const handler = createPageBuilderProdFetchHandler({
      distDir,
      appOrigin: 'http://app:3000',
      publicBasePath: '/pagebuilder',
      fetchImpl: async () => {
        throw new Error('Repeated base path request must not be proxied as an API request')
      },
    })

    const response = await handler(new Request('http://localhost/pagebuilder/pagebuilder/api/status'))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('page-builder')
  })

  test('forwards browser host and proto after stripping the runtime public base path', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)

    let proxiedUrl = ''
    let forwardedHost = ''
    let forwardedProto = ''
    const handler = createPageBuilderProdFetchHandler({
      distDir,
      appOrigin: 'http://app:3000',
      publicBasePath: '/pagebuilder',
      fetchImpl: async (request) => {
        proxiedUrl = request.url
        forwardedHost = request.headers.get('x-forwarded-host') ?? ''
        forwardedProto = request.headers.get('x-forwarded-proto') ?? ''
        return new Response(null, { status: 204 })
      },
    })

    const response = await handler(new Request('https://builder.example.com/pagebuilder/api/integrations/cms/handoffs/handoff-1/open'))

    expect(response.status).toBe(204)
    expect(proxiedUrl).toBe('http://app:3000/api/integrations/cms/handoffs/handoff-1/open')
    expect(forwardedHost).toBe('builder.example.com')
    expect(forwardedProto).toBe('https')
  })

  test('preserves trusted forwarded host proto and integration headers through the base path proxy', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)

    let forwardedHost = ''
    let forwardedProto = ''
    let authorization = ''
    let cmsCookie = ''
    const handler = createPageBuilderProdFetchHandler({
      distDir,
      appOrigin: 'http://app:3000',
      publicBasePath: '/pagebuilder',
      fetchImpl: async (request) => {
        forwardedHost = request.headers.get('x-forwarded-host') ?? ''
        forwardedProto = request.headers.get('x-forwarded-proto') ?? ''
        authorization = request.headers.get('authorization') ?? ''
        cmsCookie = request.headers.get('x-cms-cookie') ?? ''
        return new Response(null, {
          status: 204,
          headers: {
            'set-cookie': 'ai_page_builder_access=token; Secure; Path=/pagebuilder',
          },
        })
      },
    })

    const response = await handler(new Request('http://web:3333/pagebuilder/api/integrations/cms/projects', {
      method: 'POST',
      headers: {
        authorization: 'Bearer integration-secret',
        'x-cms-cookie': 'CurrentSite=1; ZUSID=abc',
        'x-forwarded-host': 'cms.example.com',
        'x-forwarded-proto': 'https',
      },
    }))

    expect(response.status).toBe(204)
    expect(forwardedHost).toBe('cms.example.com')
    expect(forwardedProto).toBe('https')
    expect(authorization).toBe('Bearer integration-secret')
    expect(cmsCookie).toBe('CurrentSite=1; ZUSID=abc')
  })

  test('does not follow upstream redirects for CMS handoff open responses', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)

    let proxiedRedirectMode = ''
    let proxiedRedirectInit: RequestRedirect | undefined
    const handler = createPageBuilderProdFetchHandler({
      distDir,
      appOrigin: 'http://app:3000',
      publicBasePath: '/pagebuilder',
      fetchImpl: async (request, init) => {
        proxiedRedirectMode = request.redirect
        proxiedRedirectInit = init?.redirect
        return new Response(null, {
          status: 302,
          headers: {
            location: '/pagebuilder/builder/workspace-1/session-1',
            'set-cookie': 'ai_page_builder_access=token; Path=/pagebuilder',
          },
        })
      },
    })

    const response = await handler(new Request('http://localhost/pagebuilder/api/integrations/cms/handoffs/handoff-1/open'))

    expect(proxiedRedirectMode).toBe('manual')
    expect(proxiedRedirectInit).toBe('manual')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/pagebuilder/builder/workspace-1/session-1')
    expect(response.headers.get('set-cookie')).toBe('ai_page_builder_access=token; Path=/pagebuilder')
  })
})
