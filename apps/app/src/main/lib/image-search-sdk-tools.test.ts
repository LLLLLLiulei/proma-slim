import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createAgentWorkspace } from './workspace-service'

type RegisteredTool = {
  inputSchema: { parse: (input: unknown) => unknown }
  handler: (args: unknown, extra: unknown) => Promise<unknown>
}

const originalFetch = globalThis.fetch

function getRegisteredTools(bundle: {
  mcpServer: unknown
}) {
  return (bundle.mcpServer as {
    instance: {
      _registeredTools: Record<string, RegisteredTool>
    }
  }).instance._registeredTools
}

async function invokeTool<T>(tool: RegisteredTool, input: unknown): Promise<T> {
  const parsed = tool.inputSchema.parse(input)
  const result = await tool.handler(parsed, undefined) as {
    content: Array<{ text: string }>
  }
  return JSON.parse(result.content[0]!.text) as T
}

async function expectToolRejects(tool: RegisteredTool, input: unknown, message: string): Promise<void> {
  try {
    const parsed = tool.inputSchema.parse(input)
    await tool.handler(parsed, undefined)
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(message)
    return
  }

  throw new Error(`expected tool to reject with ${message}`)
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

beforeEach(() => {
  globalThis.fetch = originalFetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  mock.restore()
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

describe('image search sdk runtime tools', () => {
  test('search_images normalizes Bing results, deduplicates original URLs, filters svg, and fills missing dimensions', async () => {
    const { IMAGE_SEARCH_TOOL_NAMES, buildImageSearchRuntimeToolBundle } = await import('./image-search-sdk-tools')
    const workspace = createAgentWorkspace('Image Search Runtime', { template: 'page-builder' })
    const html = [
      '<html><body>',
      '<a class="iusc" m=\'{"murl":"https://img.example.com/hero.jpg","turl":"https://thumb.example.com/hero.jpg","tw":320,"th":240,"purl":"https://source.example.com/a"}\'></a>',
      '<a class="iusc" m=\'{"murl":"https://img.example.com/hero.jpg","turl":"https://thumb.example.com/hero-duplicate.jpg","tw":320,"th":240,"purl":"https://source.example.com/a-dup"}\'></a>',
      '<a class="iusc" m=\'{"murl":"https://img.example.com/icon.svg","turl":"https://thumb.example.com/icon.svg","tw":100,"th":100,"purl":"https://source.example.com/svg"}\'></a>',
      '<a class="iusc" m=\'{"murl":"https://img.example.com/banner.png","turl":"https://thumb.example.com/banner.png","purl":"https://source.example.com/b"}\'></a>',
      '</body></html>',
    ].join('')
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://www.bing.com/images/search?')) {
        return new Response(html, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }

      if (url === 'https://img.example.com/banner.png') {
        return new Response(Buffer.from(createPngBuffer(640, 480)), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      }

      throw new Error(`unexpected fetch: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const bundle = buildImageSearchRuntimeToolBundle({
      workspace,
      fetchFn: fetchMock as unknown as typeof fetch,
      now: () => 1_700_000_000_000,
      uuidFn: () => 'search-uuid',
    })
    const tools = getRegisteredTools(bundle)

    expect(IMAGE_SEARCH_TOOL_NAMES).toEqual([
      'mcp__image_search__search_images',
      'mcp__image_search__download_images',
    ])
    expect(bundle.allowedTools).toEqual(expect.arrayContaining(IMAGE_SEARCH_TOOL_NAMES))

    const result = await invokeTool<{
      items: Array<{
        originalUrl: string
        thumbnailUrl: string
        width: number
        height: number
        sourcePage: string
      }>
    }>(tools.search_images!, {
      keyword: '现代客厅',
      count: 5,
      color: 'blue',
    })

    expect(result.items).toEqual([
      {
        originalUrl: 'https://img.example.com/hero.jpg',
        thumbnailUrl: 'https://thumb.example.com/hero.jpg',
        width: 320,
        height: 240,
        sourcePage: 'https://source.example.com/a',
      },
      {
        originalUrl: 'https://img.example.com/banner.png',
        thumbnailUrl: 'https://thumb.example.com/banner.png',
        width: 640,
        height: 480,
        sourcePage: 'https://source.example.com/b',
      },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('search_images returns a readable tool error when Bing search fails after retries', async () => {
    const { buildImageSearchRuntimeToolBundle } = await import('./image-search-sdk-tools')
    const workspace = createAgentWorkspace('Image Search Runtime Failure', { template: 'page-builder' })
    const fetchMock = mock(async () => new Response('bad gateway', { status: 502 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const bundle = buildImageSearchRuntimeToolBundle({
      workspace,
      fetchFn: fetchMock as unknown as typeof fetch,
    })
    const tools = getRegisteredTools(bundle)

    await expectToolRejects(tools.search_images!, {
      keyword: '错误路径',
      count: 2,
    }, 'Bing 图片搜索失败')

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  test('download_images imports valid images into workspace assets, returns asset paths, preserves partial failures, and never edits html', async () => {
    const { buildImageSearchRuntimeToolBundle } = await import('./image-search-sdk-tools')
    const workspace = createAgentWorkspace('Image Search Import', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    const entryPath = join(workspaceFilesDir, 'index.html')
    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(entryPath, '<!doctype html><html><body><section id="hero"><img src="./assets/original.png"></section></body></html>', 'utf-8')

    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://img.example.com/valid-large.png') {
        return new Response(Buffer.from(createPngBuffer(800, 600)), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      }

      if (url === 'https://img.example.com/too-small.png') {
        return new Response(Buffer.from(createPngBuffer(120, 80)), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      }

      if (url === 'https://img.example.com/broken.png') {
        return new Response('broken', {
          status: 503,
          headers: { 'content-type': 'text/plain' },
        })
      }

      throw new Error(`unexpected fetch: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const bundle = buildImageSearchRuntimeToolBundle({
      workspace,
      fetchFn: fetchMock as unknown as typeof fetch,
      now: () => 1_700_000_000_000,
      uuidFn: () => 'asset-uuid',
    })
    const tools = getRegisteredTools(bundle)

    const result = await invokeTool<{
      imported: Array<{
        originalUrl: string
        thumbnailUrl: string
        sourcePage: string
        assetFileName: string
        assetRelativePath: string
        assetPreviewPath: string
        width: number
        height: number
      }>
      failed: Array<{
        originalUrl: string
        error: string
      }>
    }>(tools.download_images!, {
      images: [
        {
          originalUrl: 'https://img.example.com/valid-large.png',
          thumbnailUrl: 'https://thumb.example.com/valid-large.png',
          width: 0,
          height: 0,
          sourcePage: 'https://source.example.com/valid',
        },
        {
          originalUrl: 'https://img.example.com/broken.png',
          thumbnailUrl: 'https://thumb.example.com/broken.png',
          width: 0,
          height: 0,
          sourcePage: 'https://source.example.com/broken',
        },
        {
          originalUrl: 'https://img.example.com/too-small.png',
          thumbnailUrl: 'https://thumb.example.com/too-small.png',
          width: 0,
          height: 0,
          sourcePage: 'https://source.example.com/small',
        },
      ],
      count: 3,
    })

    expect(result.imported).toEqual([
      {
        originalUrl: 'https://img.example.com/valid-large.png',
        thumbnailUrl: 'https://thumb.example.com/valid-large.png',
        sourcePage: 'https://source.example.com/valid',
        assetFileName: 'page-builder-image-1700000000000-asset-uuid.png',
        assetRelativePath: 'assets/page-builder-image-1700000000000-asset-uuid.png',
        assetPreviewPath: './assets/page-builder-image-1700000000000-asset-uuid.png',
        width: 800,
        height: 600,
      },
    ])
    expect(result.failed).toEqual(expect.arrayContaining([
      {
        originalUrl: 'https://img.example.com/broken.png',
        error: expect.stringContaining('HTTP 503') as unknown as string,
      },
      {
        originalUrl: 'https://img.example.com/too-small.png',
        error: expect.stringContaining('尺寸过小') as unknown as string,
      },
    ]))
    expect(readFileSync(entryPath, 'utf-8')).toBe('<!doctype html><html><body><section id="hero"><img src="./assets/original.png"></section></body></html>')
    expect(readFileSync(join(workspaceFilesDir, 'assets', 'page-builder-image-1700000000000-asset-uuid.png'))).toBeTruthy()
  })

  test('download_images rejects arbitrary save_dir at the schema boundary', async () => {
    const { buildImageSearchRuntimeToolBundle } = await import('./image-search-sdk-tools')
    const workspace = createAgentWorkspace('Image Search SaveDir Guard', { template: 'page-builder' })
    const bundle = buildImageSearchRuntimeToolBundle({
      workspace,
    })
    const tools = getRegisteredTools(bundle)

    expect(() => tools.download_images!.inputSchema.parse({
      images: [{
        originalUrl: 'https://img.example.com/hero.jpg',
        thumbnailUrl: 'https://thumb.example.com/hero.jpg',
        width: 320,
        height: 240,
        sourcePage: 'https://source.example.com/hero',
        }],
      save_dir: '/tmp/escape',
    })).toThrow()
  })

  test('download_images rejects non-image 200 responses instead of importing them from Bing metadata dimensions', async () => {
    const { buildImageSearchRuntimeToolBundle } = await import('./image-search-sdk-tools')
    const workspace = createAgentWorkspace('Image Search Non Image Response', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    mkdirSync(workspaceFilesDir, { recursive: true })

    const fetchMock = mock(async () => new Response('<html>blocked</html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const bundle = buildImageSearchRuntimeToolBundle({
      workspace,
      fetchFn: fetchMock as unknown as typeof fetch,
      now: () => 1_700_000_000_000,
      uuidFn: () => 'non-image-uuid',
    })
    const tools = getRegisteredTools(bundle)

    const result = await invokeTool<{
      imported: Array<{
        assetRelativePath: string
      }>
      failed: Array<{
        originalUrl: string
        error: string
      }>
    }>(tools.download_images!, {
      images: [{
        originalUrl: 'https://img.example.com/fake.jpg',
        thumbnailUrl: 'https://thumb.example.com/fake.jpg',
        width: 1200,
        height: 800,
        sourcePage: 'https://source.example.com/fake',
      }],
      count: 1,
    })

    expect(result.imported).toEqual([])
    expect(result.failed).toEqual([{
      originalUrl: 'https://img.example.com/fake.jpg',
      error: expect.stringContaining('不是图片') as unknown as string,
    }])
    expect(existsSync(join(workspaceFilesDir, 'assets', 'page-builder-image-1700000000000-non-image-uuid.jpg'))).toBeFalse()
  })
})
