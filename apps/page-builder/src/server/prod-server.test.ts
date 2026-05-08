import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createPageBuilderProdFetchHandler,
  resolvePageBuilderProdAppOrigin,
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

  test('serves static assets from dist', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)

    const handler = createPageBuilderProdFetchHandler({
      distDir,
      appOrigin: 'http://app:3000',
    })

    const response = await handler(new Request('http://localhost/assets/app.js'))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('console.log("page-builder")')
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
    expect(await rootResponse.text()).toContain('page-builder')
    expect(builderResponse.status).toBe(200)
    expect(await builderResponse.text()).toContain('page-builder')
  })

  test('injects runtime public base path config when serving index.html', async () => {
    const distDir = createTempDistDir()
    tempDirs.push(distDir)

    const handler = createPageBuilderProdFetchHandler({
      distDir,
      appOrigin: 'http://app:3000',
      publicBasePath: '/ai/pagebuilder',
    })

    const response = await handler(new Request('http://localhost/ai/pagebuilder/'))
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('<base href="/ai/pagebuilder/">')
    expect(html).toContain('window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__')
    expect(html).toContain('"basePath":"/ai/pagebuilder"')
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

    const handler = createPageBuilderProdFetchHandler({
      distDir,
      appOrigin: 'http://app:3000',
      fetchImpl: async (request) => {
        proxiedUrl = request.url
        proxiedMethod = request.method
        proxiedBody = await request.text()

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
    expect(response.status).toBe(202)
    expect(response.headers.get('x-proxied')).toBe('true')
    expect(await response.text()).toBe('stream-astream-b')
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
})
