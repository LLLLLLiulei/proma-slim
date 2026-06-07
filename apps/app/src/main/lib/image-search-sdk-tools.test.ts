import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { closeDiagnosticLoggers, flushDiagnosticLoggers } from './diagnostic-logging'
import { createAgentWorkspace } from './workspace-service'

type RegisteredTool = {
  inputSchema: { parse: (input: unknown) => unknown }
  handler: (args: unknown, extra: unknown) => Promise<unknown>
}

const originalFetch = globalThis.fetch
let configDirOverride: string | null = null
const originalEnv = {
  IMAGE_SEARCH_PROVIDERS: process.env.IMAGE_SEARCH_PROVIDERS,
  PEXELS_API_KEY: process.env.PEXELS_API_KEY,
  PIXABAY_API_KEY: process.env.PIXABAY_API_KEY,
  UNSPLASH_ACCESS_KEY: process.env.UNSPLASH_ACCESS_KEY,
}

function getRegisteredTools(bundle: { mcpServer: unknown }) {
  return (bundle.mcpServer as { instance: { _registeredTools: Record<string, RegisteredTool> } }).instance._registeredTools
}

async function invokeTool<T>(tool: RegisteredTool, input: unknown): Promise<T> {
  const parsed = tool.inputSchema.parse(input)
  const result = await tool.handler(parsed, undefined) as { content: Array<{ text: string }> }
  return JSON.parse(result.content[0]!.text) as T
}

function createPngBuffer(width: number, height: number, totalBytes = 2048): Uint8Array {
  const buffer = new Uint8Array(totalBytes)
  const view = new DataView(buffer.buffer)
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  view.setUint32(12, 0x49484452)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return buffer
}

function resetProviderEnv() {
  for (const key of Object.keys(originalEnv) as Array<keyof typeof originalEnv>) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
}

function clearProviderEnv() {
  delete process.env.IMAGE_SEARCH_PROVIDERS
  delete process.env.PEXELS_API_KEY
  delete process.env.PIXABAY_API_KEY
  delete process.env.UNSPLASH_ACCESS_KEY
}

function setProviderEnv() {
  process.env.PEXELS_API_KEY = 'pexels-test-key'
  process.env.PIXABAY_API_KEY = 'pixabay-test-key'
  process.env.UNSPLASH_ACCESS_KEY = 'unsplash-test-key'
}

beforeEach(() => {
  globalThis.fetch = originalFetch
  resetProviderEnv()
})

afterEach(async () => {
  globalThis.fetch = originalFetch
  resetProviderEnv()
  mock.restore()
  await closeDiagnosticLoggers()
  if (configDirOverride) {
    rmSync(configDirOverride, { recursive: true, force: true })
    configDirOverride = null
    delete process.env.PROMA_CONFIG_DIR
  }
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

describe('image search sdk runtime tools', () => {
  test('search_images defaults to Pexels and Pixabay providers', async () => {
    setProviderEnv()
    const { IMAGE_SEARCH_TOOL_NAMES, buildImageSearchRuntimeToolBundle } = await import('./image-search-sdk-tools')
    const workspace = createAgentWorkspace('Image Search Runtime', { template: 'page-builder' })
    const requests: Array<{ url: string; authorization?: string }> = []
    const bingHtml = [
      '<html><body>',
      '<a class="iusc" m=\'{"murl":"https://bing.example.com/hero.jpg","turl":"https://bing.example.com/thumb.jpg","tw":0,"th":0,"purl":"https://source.example.com/bing","t":"modern living room bing"}\'></a>',
      '<a class="iusc" m=\'{"murl":"https://bing.example.com/hero.jpg","turl":"https://bing.example.com/dup.jpg","tw":320,"th":240,"purl":"https://source.example.com/bing-dup"}\'></a>',
      '<a class="iusc" m=\'{"murl":"https://bing.example.com/icon.svg","turl":"https://bing.example.com/icon.svg","tw":100,"th":100,"purl":"https://source.example.com/svg"}\'></a>',
      '</body></html>',
    ].join('')
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const headers = init?.headers as Record<string, string> | undefined
      requests.push({ url, authorization: headers?.Authorization ?? headers?.authorization })

      if (url.startsWith('https://api.pexels.com/v1/search?')) {
        return Response.json({ photos: [{ id: 101, width: 2400, height: 1600, url: 'https://www.pexels.com/photo/101/', photographer: 'Pexels Author', photographer_url: 'https://www.pexels.com/@author', photographer_id: 55, avg_color: '#aabbcc', alt: 'modern living room pexels', src: { original: 'https://images.pexels.com/photos/101/original.jpg', large2x: 'https://images.pexels.com/photos/101/large2x.jpg', large: 'https://images.pexels.com/photos/101/large.jpg', medium: 'https://images.pexels.com/photos/101/medium.jpg', small: 'https://images.pexels.com/photos/101/small.jpg' } }] })
      }
      if (url.startsWith('https://pixabay.com/api/?')) {
        return Response.json({ hits: [{ id: 202, pageURL: 'https://pixabay.com/photos/202/', imageURL: 'https://pixabay.com/get/202-full.jpg', fullHDURL: 'https://pixabay.com/get/202-fhd.jpg', largeImageURL: 'https://pixabay.com/get/202-large.jpg', webformatURL: 'https://pixabay.com/get/202-web.jpg', previewURL: 'https://pixabay.com/get/202-preview.jpg', imageWidth: 2200, imageHeight: 1300, user: 'Pixabay Author', user_id: 77, userImageURL: 'https://pixabay.com/user.jpg', tags: 'modern living room, interior' }] })
      }
      if (url.startsWith('https://api.unsplash.com/search/photos?')) {
        return Response.json({ total: 1, results: [{ id: 'unsplash-303', description: 'modern living room unsplash', alt_description: 'living room', urls: { raw: 'https://images.unsplash.com/photo-303?ixid=test', full: 'https://images.unsplash.com/photo-303-full.jpg', regular: 'https://images.unsplash.com/photo-303-regular.jpg', small: 'https://images.unsplash.com/photo-303-small.jpg', thumb: 'https://images.unsplash.com/photo-303-thumb.jpg' }, width: 2000, height: 1200, links: { html: 'https://unsplash.com/photos/303', download_location: 'https://api.unsplash.com/photos/303/download' }, user: { name: 'Unsplash Author', links: { html: 'https://unsplash.com/@author' } } }] })
      }
      if (url.startsWith('https://www.bing.com/images/search?')) {
        return new Response(bingHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
      }
      if (url === 'https://bing.example.com/hero.jpg') {
        return new Response(Buffer.from(createPngBuffer(1280, 720)), { status: 200, headers: { 'content-type': 'image/png' } })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const bundle = buildImageSearchRuntimeToolBundle({ workspace, fetchFn: fetchMock as unknown as typeof fetch, now: () => 1_700_000_000_000, uuidFn: () => 'search-uuid' })
    const tools = getRegisteredTools(bundle)

    expect(IMAGE_SEARCH_TOOL_NAMES).toEqual(['mcp__image_search__search_images', 'mcp__image_search__download_images'])
    expect(bundle.allowedTools).toEqual(expect.arrayContaining(IMAGE_SEARCH_TOOL_NAMES))

    const result = await invokeTool<{ results: Array<Record<string, unknown>>; diagnostics: Record<string, { status: string; count: number; error?: string }> }>(tools.search_images!, { query: 'modern living room', count: 4, orientation: 'landscape' })

    expect(result.results.map((item) => item.provider)).toEqual(['pexels', 'pixabay'])
    expect(result.results[0]).toMatchObject({ provider: 'pexels', downloadUrl: 'https://images.pexels.com/photos/101/original.jpg', url: 'https://images.pexels.com/photos/101/original.jpg', previewUrl: 'https://images.pexels.com/photos/101/large2x.jpg', thumbnailUrl: 'https://images.pexels.com/photos/101/medium.jpg', width: 2400, height: 1600, sourcePage: 'https://www.pexels.com/photo/101/', author: 'Pexels Author', licenseName: 'Pexels License' })
    expect(result.results.some((item) => 'raw' in item)).toBeFalse()
    expect(result.diagnostics).toMatchObject({
      pexels: { status: 'ok', count: 1 },
      pixabay: { status: 'ok', count: 1 },
      unsplash: { status: 'skipped', count: 0, error: 'provider disabled by IMAGE_SEARCH_PROVIDERS' },
      bing: { status: 'skipped', count: 0, error: 'provider disabled by IMAGE_SEARCH_PROVIDERS' },
    })
    expect(requests.find((request) => request.url.startsWith('https://api.pexels.com/'))?.authorization).toBe('pexels-test-key')
    expect(requests.find((request) => request.url.startsWith('https://pixabay.com/api/?'))?.url).toContain('key=pixabay-test-key')
    expect(requests.some((request) => request.url.startsWith('https://api.unsplash.com/'))).toBeFalse()
    expect(requests.some((request) => request.url.startsWith('https://www.bing.com/images/search?'))).toBeFalse()
  })

  test('search_images skips unconfigured default providers and leaves non-default providers disabled', async () => {
    clearProviderEnv()
    const { buildImageSearchRuntimeToolBundle } = await import('./image-search-sdk-tools')
    const workspace = createAgentWorkspace('Image Search Missing Provider Config', { template: 'page-builder' })
    const html = '<html><body><a class="iusc" m=\'{"murl":"https://bing.example.com/hero.jpg","turl":"https://bing.example.com/thumb.jpg","tw":640,"th":360,"purl":"https://source.example.com/bing","t":"hero image"}\'></a></body></html>'
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://www.bing.com/images/search?')) return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
      throw new Error(`unexpected fetch: ${url}`)
    })

    const tools = getRegisteredTools(buildImageSearchRuntimeToolBundle({ workspace, fetchFn: fetchMock as unknown as typeof fetch }))
    const result = await invokeTool<{ results: Array<Record<string, unknown>>; diagnostics: Record<string, { status: string; count: number; error?: string }> }>(tools.search_images!, { query: 'hero image', count: 2 })

    expect(result.results).toEqual([])
    expect(result.diagnostics).toMatchObject({
      pexels: { status: 'skipped', count: 0, error: 'PEXELS_API_KEY not configured' },
      pixabay: { status: 'skipped', count: 0, error: 'PIXABAY_API_KEY not configured' },
      unsplash: { status: 'skipped', count: 0, error: 'provider disabled by IMAGE_SEARCH_PROVIDERS' },
      bing: { status: 'skipped', count: 0, error: 'provider disabled by IMAGE_SEARCH_PROVIDERS' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(0)
  })

  test('search_images only queries providers enabled by IMAGE_SEARCH_PROVIDERS', async () => {
    setProviderEnv()
    process.env.IMAGE_SEARCH_PROVIDERS = 'pixabay'
    const { buildImageSearchRuntimeToolBundle } = await import('./image-search-sdk-tools')
    const workspace = createAgentWorkspace('Image Search Provider Allowlist', { template: 'page-builder' })
    const requests: string[] = []
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      requests.push(url)
      if (url.startsWith('https://pixabay.com/api/?')) {
        return Response.json({ hits: [{ id: 202, pageURL: 'https://pixabay.com/photos/202/', imageURL: 'https://pixabay.com/get/202-full.jpg', fullHDURL: 'https://pixabay.com/get/202-fhd.jpg', largeImageURL: 'https://pixabay.com/get/202-large.jpg', webformatURL: 'https://pixabay.com/get/202-web.jpg', previewURL: 'https://pixabay.com/get/202-preview.jpg', imageWidth: 2200, imageHeight: 1300, user: 'Pixabay Author', user_id: 77, userImageURL: 'https://pixabay.com/user.jpg', tags: 'modern living room, interior' }] })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const tools = getRegisteredTools(buildImageSearchRuntimeToolBundle({ workspace, fetchFn: fetchMock as unknown as typeof fetch }))
    const result = await invokeTool<{ results: Array<Record<string, unknown>>; diagnostics: Record<string, { status: string; count: number; error?: string }> }>(tools.search_images!, { query: 'modern living room', count: 3 })

    expect(result.results.map((item) => item.provider)).toEqual(['pixabay'])
    expect(result.diagnostics).toMatchObject({
      pexels: { status: 'skipped', count: 0, error: 'provider disabled by IMAGE_SEARCH_PROVIDERS' },
      pixabay: { status: 'ok', count: 1 },
      unsplash: { status: 'skipped', count: 0, error: 'provider disabled by IMAGE_SEARCH_PROVIDERS' },
      bing: { status: 'skipped', count: 0, error: 'provider disabled by IMAGE_SEARCH_PROVIDERS' },
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toStartWith('https://pixabay.com/api/?')
  })


  test('search_images records provider errors without failing the whole search and rejects the old keyword input', async () => {
    clearProviderEnv()
    process.env.PEXELS_API_KEY = 'pexels-test-key'
    process.env.IMAGE_SEARCH_PROVIDERS = 'pexels,bing'
    const { buildImageSearchRuntimeToolBundle } = await import('./image-search-sdk-tools')
    const workspace = createAgentWorkspace('Image Search Provider Error', { template: 'page-builder' })
    const html = '<html><body><a class="iusc" m=\'{"murl":"https://bing.example.com/fallback.jpg","turl":"https://bing.example.com/fallback-thumb.jpg","tw":800,"th":500,"purl":"https://source.example.com/fallback","t":"fallback image"}\'></a></body></html>'
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://api.pexels.com/v1/search?')) throw new Error('network down')
      if (url.startsWith('https://www.bing.com/images/search?')) return new Response(html, { status: 200 })
      throw new Error(`unexpected fetch: ${url}`)
    })
    const tools = getRegisteredTools(buildImageSearchRuntimeToolBundle({ workspace, fetchFn: fetchMock as unknown as typeof fetch }))

    expect(() => tools.search_images!.inputSchema.parse({ keyword: '旧字段', count: 1 })).toThrow()
    expect(() => tools.search_images!.inputSchema.parse({ query: 'new field', count: 1, orientation: 'landscape' })).not.toThrow()
    const result = await invokeTool<{ results: Array<Record<string, unknown>>; diagnostics: Record<string, { status: string; count: number; error?: string }> }>(tools.search_images!, { query: 'fallback image', count: 2 })

    expect(result.results).toEqual([expect.objectContaining({ provider: 'bing', downloadUrl: 'https://bing.example.com/fallback.jpg' })])
    expect(result.diagnostics.pexels).toMatchObject({ status: 'error', count: 0, error: expect.stringContaining('network down') as unknown as string })
    expect(result.diagnostics.bing).toMatchObject({ status: 'ok', count: 1 })
  })

  test('download_images imports provider-aware candidates, triggers Unsplash tracking, rejects unsafe inputs, and rejects old candidate schema', async () => {
    const { buildImageSearchRuntimeToolBundle } = await import('./image-search-sdk-tools')
    const workspace = createAgentWorkspace('Image Search Import', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')
    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(entryPath, '<!doctype html><html><body><section id="hero"><img src="./assets/original.png"></section></body></html>', 'utf-8')

    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://api.unsplash.com/photos/valid/download') return Response.json({ url: 'https://images.unsplash.com/valid-download.jpg' })
      if (url === 'https://images.unsplash.com/valid.jpg') return new Response(Buffer.from(createPngBuffer(800, 600)), { status: 200, headers: { 'content-type': 'image/png' } })
      if (url === 'https://images.pexels.com/not-image.jpg') return new Response('<html>blocked</html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
      if (url === 'https://pixabay.com/small.png') return new Response(Buffer.from(createPngBuffer(120, 80)), { status: 200, headers: { 'content-type': 'image/png' } })
      throw new Error(`unexpected fetch: ${url}`)
    })
    const tools = getRegisteredTools(buildImageSearchRuntimeToolBundle({ workspace, fetchFn: fetchMock as unknown as typeof fetch, now: () => 1_700_000_000_000, uuidFn: () => 'asset-uuid' }))

    expect(() => tools.download_images!.inputSchema.parse({ images: [{ originalUrl: 'https://img.example.com/hero.jpg', thumbnailUrl: 'https://thumb.example.com/hero.jpg', width: 320, height: 240, sourcePage: 'https://source.example.com/hero' }] })).toThrow()
    expect(() => tools.download_images!.inputSchema.parse({ images: [{ provider: 'bing', downloadUrl: 'https://img.example.com/hero.jpg', url: 'https://img.example.com/hero.jpg', width: 320, height: 240, sourcePage: 'https://source.example.com/hero' }], save_dir: '/tmp/escape' })).toThrow()

    const result = await invokeTool<{ imported: Array<Record<string, unknown>>; failed: Array<{ downloadUrl: string; provider: string; error: string }> }>(tools.download_images!, {
      images: [
        { provider: 'unsplash', downloadUrl: 'https://images.unsplash.com/valid.jpg', url: 'https://images.unsplash.com/valid-regular.jpg', previewUrl: 'https://images.unsplash.com/valid-small.jpg', thumbnailUrl: 'https://images.unsplash.com/valid-thumb.jpg', width: 0, height: 0, sourcePage: 'https://unsplash.com/photos/valid', author: 'Unsplash Author', licenseName: 'Unsplash License', downloadTrackingUrl: 'https://api.unsplash.com/photos/valid/download' },
        { provider: 'bing', downloadUrl: 'http://127.0.0.1/secret.png', url: 'http://127.0.0.1/secret.png', width: 900, height: 600, sourcePage: 'https://source.example.com/unsafe' },
        { provider: 'pexels', downloadUrl: 'https://images.pexels.com/not-image.jpg', url: 'https://images.pexels.com/not-image.jpg', width: 1200, height: 800, sourcePage: 'https://www.pexels.com/photo/not-image/' },
        { provider: 'pixabay', downloadUrl: 'https://pixabay.com/small.png', url: 'https://pixabay.com/small.png', width: 0, height: 0, sourcePage: 'https://pixabay.com/photos/small/' },
      ],
      count: 2,
    })

    expect(result.imported).toEqual([expect.objectContaining({ downloadUrl: 'https://images.unsplash.com/valid.jpg', provider: 'unsplash', sourcePage: 'https://unsplash.com/photos/valid', assetFileName: 'page-builder-image-1700000000000-asset-uuid.png', assetRelativePath: 'assets/page-builder-image-1700000000000-asset-uuid.png', assetPreviewPath: './assets/page-builder-image-1700000000000-asset-uuid.png', width: 800, height: 600, author: 'Unsplash Author', licenseName: 'Unsplash License' })])
    expect(result.failed.find((item) => item.provider === 'bing')).toMatchObject({ downloadUrl: 'http://127.0.0.1/secret.png', error: expect.stringContaining('不安全') as unknown as string })
    expect(result.failed.find((item) => item.provider === 'pexels')).toMatchObject({ downloadUrl: 'https://images.pexels.com/not-image.jpg', error: expect.stringContaining('不是图片') as unknown as string })
    expect(result.failed.find((item) => item.provider === 'pixabay')).toMatchObject({ downloadUrl: 'https://pixabay.com/small.png', error: expect.stringContaining('尺寸过小') as unknown as string })
    expect(readFileSync(entryPath, 'utf-8')).toBe('<!doctype html><html><body><section id="hero"><img src="./assets/original.png"></section></body></html>')
    expect(readFileSync(join(workspaceFilesDir, 'assets', 'page-builder-image-1700000000000-asset-uuid.png'))).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('https://api.unsplash.com/photos/valid/download', expect.anything())
  })

  test('provider config resolver reads provider keys without printing secret values', async () => {
    clearProviderEnv()
    process.env.PEXELS_API_KEY = 'pexels-native'
    process.env.PIXABAY_API_KEY = 'native-pixabay'
    process.env.UNSPLASH_ACCESS_KEY = 'unsplash-native'
    const { resolveImageSearchProviderConfig } = await import('./image-search/config')

    const config = resolveImageSearchProviderConfig(process.env)

    expect(config.pexels.apiKey).toBe('pexels-native')
    expect(config.pixabay.apiKey).toBe('native-pixabay')
    expect(config.unsplash.apiKey).toBe('unsplash-native')
    expect(JSON.stringify(config)).not.toContain('pexels-native')
    expect(JSON.stringify(config)).not.toContain('native-pixabay')
    expect(JSON.stringify(config)).not.toContain('unsplash-native')
  })

  test('provider config resolver sees locally loaded provider keys when they are available', async () => {
    resetProviderEnv()
    const { resolveImageSearchProviderConfig } = await import('./image-search/config')

    const config = resolveImageSearchProviderConfig(process.env)

    if (originalEnv.PEXELS_API_KEY) {
      expect(config.pexels.configured).toBeTrue()
    }
    if (originalEnv.PIXABAY_API_KEY) {
      expect(config.pixabay.configured).toBeTrue()
    }
    if (originalEnv.UNSPLASH_ACCESS_KEY) {
      expect(config.unsplash.configured).toBeTrue()
    }
  })


  test('writes detailed backend logs for search and download tool execution', async () => {
    clearProviderEnv()
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    configDirOverride = mkdtempSync(join(tmpdir(), 'proma-image-search-logs-'))
    process.env.PROMA_CONFIG_DIR = configDirOverride
    process.env.PEXELS_API_KEY = 'pexels-test-key'
    const { buildImageSearchRuntimeToolBundle } = await import('./image-search-sdk-tools')
    const workspace = createAgentWorkspace('Image Search Runtime Logs', { template: 'page-builder' })
    const html = '<html><body><a class="iusc" m=\'{"murl":"https://bing.example.com/log.jpg","turl":"https://bing.example.com/log-thumb.jpg","tw":800,"th":450,"purl":"https://source.example.com/log","t":"log image"}\'></a></body></html>'
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://api.pexels.com/v1/search?')) {
        return Response.json({ photos: [{ id: 404, width: 1200, height: 800, url: 'https://www.pexels.com/photo/404/', photographer: 'Log Author', alt: 'log image pexels', src: { original: 'https://images.pexels.com/log.jpg', large2x: 'https://images.pexels.com/log-large.jpg', large: 'https://images.pexels.com/log-large.jpg', medium: 'https://images.pexels.com/log-medium.jpg', small: 'https://images.pexels.com/log-small.jpg' } }] })
      }
      if (url.startsWith('https://www.bing.com/images/search?')) return new Response(html, { status: 200 })
      if (url === 'https://images.pexels.com/log.jpg') return new Response(Buffer.from(createPngBuffer(1200, 800)), { status: 200, headers: { 'content-type': 'image/png' } })
      throw new Error(`unexpected fetch: ${url}`)
    })

    const tools = getRegisteredTools(buildImageSearchRuntimeToolBundle({
      workspace,
      fetchFn: fetchMock as unknown as typeof fetch,
      now: () => 1_700_000_000_000,
      uuidFn: () => 'log-uuid',
      trace: {
        requestId: 'request-log-1',
        turnId: 'turn-log-1',
        sessionId: 'session-log-1',
        workspaceId: workspace.id,
        workspaceSlug: workspace.slug,
      },
    }))

    const search = await invokeTool<{ results: Array<Record<string, unknown>> }>(tools.search_images!, { query: 'log image', count: 1, orientation: 'landscape' })
    await invokeTool(tools.download_images!, { images: search.results, count: 1 })
    await flushDiagnosticLoggers()

    const backendLog = readdirSync(join(configDirOverride, 'logs', 'backend'))
      .filter((entry) => entry.endsWith('.log'))
      .sort()
      .map((entry) => readFileSync(join(configDirOverride!, 'logs', 'backend', entry), 'utf-8'))
      .join('\n')

    expect(backendLog).toContain('INFO image_search_runtime mcp_tool')
    expect(backendLog).toContain('phase=search_tool_start')
    expect(backendLog).toContain('args.query="log image"')
    expect(backendLog).toContain('phase=provider_search_start')
    expect(backendLog).toContain('provider=pexels')
    expect(backendLog).toContain('phase=ranking_completed')
    expect(backendLog).toContain('phase=search_tool_success')
    expect(backendLog).toContain('result.diagnostics.pexels.status=ok')
    expect(backendLog).toContain('phase=download_tool_start')
    expect(backendLog).toContain('phase=download_candidate_start')
    expect(backendLog).toContain('phase=download_candidate_success')
    expect(backendLog).toContain('assetRelativePath=assets/page-builder-image-1700000000000-log-uuid.png')
    expect(backendLog).toContain('phase=download_tool_success')
    expect(backendLog).toContain('result.imported.0.provider=pexels')
    expect(backendLog).not.toContain('pexels-test-key')
  })

})
