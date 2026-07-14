import { afterEach, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createAgentWorkspace } from './workspace-service'
import { getWorkspaceFilesDir } from './config-paths'
import {
  PAGE_BUILDER_RUNTIME_MCP_ALLOWED_TOOLS,
  PAGE_BUILDER_RUNTIME_MCP_SERVER_NAME,
  buildPageBuilderRuntimeMcpToolBundle,
  createPageBuilderGeneratedImageAssetSink,
  createPageBuilderImageSourceResolver,
  hasPageBuilderMcpProviderConfig,
} from './page-builder-runtime-mcp'

type RegisteredToolMap = Record<string, unknown>

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
  mock.restore()
})

function getRegisteredToolNames(bundle: Awaited<ReturnType<typeof buildPageBuilderRuntimeMcpToolBundle>>): string[] {
  if (!bundle) return []
  const instance = bundle.mcpServer.instance as { _registeredTools?: RegisteredToolMap }
  return Object.keys(instance._registeredTools ?? {})
}

function createPngBuffer(width: number, height: number, totalBytes = 2048): Buffer {
  const buffer = Buffer.alloc(totalBytes)
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  view.setUint32(12, 0x49484452)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return buffer
}

describe('page builder runtime MCP', () => {
  test('provider preflight requires native pagebuilder MCP keys and ignores Anthropic fallback token', () => {
    expect(hasPageBuilderMcpProviderConfig({ PLATFORM_MODE: 'ZHIPU', ANTHROPIC_AUTH_TOKEN: 'sk-anthropic-only' })).toBe(false)
    expect(hasPageBuilderMcpProviderConfig({ PLATFORM_MODE: 'ZHIPU', Z_AI_API_KEY: 'sk-zhipu-live' })).toBe(true)
    expect(hasPageBuilderMcpProviderConfig({ PLATFORM_MODE: 'ZAI', ZAI_API_KEY: 'sk-zai-live' })).toBe(true)
    expect(hasPageBuilderMcpProviderConfig({ PLATFORM_MODE: 'ALIYUN', ALIYUN_API_KEY: 'sk-aliyun-live' })).toBe(true)
    expect(hasPageBuilderMcpProviderConfig({ PLATFORM_MODE: 'QWEN', QWEN_API_KEY: 'sk-qwen-live' })).toBe(true)
    expect(hasPageBuilderMcpProviderConfig({ PLATFORM_MODE: 'DASHSCOPE', DASHSCOPE_API_KEY: 'sk-dashscope-live' })).toBe(true)
    expect(hasPageBuilderMcpProviderConfig({ PLATFORM_MODE: 'ALIYUN', Z_AI_API_KEY: 'sk-zhipu-live' })).toBe(false)
  })

  test('builds a pagebuilder runtime sdk server only for page-builder workspaces with provider config', async () => {
    const workspace = createAgentWorkspace('Runtime MCP Workspace', { template: 'page-builder' })
    const regularWorkspace = createAgentWorkspace('Regular Workspace')

    await expect(buildPageBuilderRuntimeMcpToolBundle({
      workspace: regularWorkspace,
      env: { Z_AI_API_KEY: 'sk-zhipu-live' },
    })).resolves.toBeNull()

    await expect(buildPageBuilderRuntimeMcpToolBundle({
      workspace,
      env: { ANTHROPIC_AUTH_TOKEN: 'sk-anthropic-only' },
    })).resolves.toBeNull()

    const bundle = await buildPageBuilderRuntimeMcpToolBundle({
      workspace,
      env: { PLATFORM_MODE: 'ZHIPU', Z_AI_API_KEY: 'sk-zhipu-live' },
      generateImage: async () => 'https://images.example.com/generated.png',
      analyzeImage: async () => 'visual analysis result',
    })

    expect(bundle).not.toBeNull()
    expect(bundle?.mcpServer).toMatchObject({
      type: 'sdk',
      name: PAGE_BUILDER_RUNTIME_MCP_SERVER_NAME,
    })
    expect(bundle?.mcpServer).toHaveProperty('instance')
    expect(bundle?.allowedTools).toEqual(PAGE_BUILDER_RUNTIME_MCP_ALLOWED_TOOLS)
    expect(getRegisteredToolNames(bundle)).toEqual(['analyze_image', 'generate_image'])
  })

  test('builds a pagebuilder runtime sdk server from runtimeMcp.pagebuilder in AI providers config', async () => {
    const workspace = createAgentWorkspace('Runtime MCP AI Providers Config', { template: 'page-builder' })

    const bundle = await buildPageBuilderRuntimeMcpToolBundle({
      workspace,
      env: {
        AI_PAGE_BUILDER_AI_PROVIDERS_CONFIG_FILE: '/ai-providers.jsonc',
      },
      readFileText: (filePath) => {
        expect(filePath).toBe('/ai-providers.jsonc')
        return JSON.stringify({
          runtimeMcp: {
            pagebuilder: {
              provider: 'zhipu',
              apiKey: 'json-zhipu-key',
              vision: { model: 'glm-4.6v' },
              image: { model: 'glm-image', size: '1280x1280' },
            },
          },
        })
      },
      generateImage: async () => 'https://images.example.com/generated.png',
      analyzeImage: async () => 'visual analysis result',
    })

    expect(bundle).not.toBeNull()
    expect(bundle?.mcpServer).toMatchObject({
      type: 'sdk',
      name: PAGE_BUILDER_RUNTIME_MCP_SERVER_NAME,
    })
    expect(bundle?.allowedTools).toEqual(PAGE_BUILDER_RUNTIME_MCP_ALLOWED_TOOLS)
    expect(getRegisteredToolNames(bundle)).toEqual(['analyze_image', 'generate_image'])
  })

  test('saves generated image urls as workspace assets through the runtime asset sink', async () => {
    const workspace = createAgentWorkspace('Runtime MCP Asset Sink', { template: 'page-builder' })
    const workspaceFilesDir = getWorkspaceFilesDir(workspace.slug)
    const generatedPng = createPngBuffer(800, 600)
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://images.example.com/generated.png')
      return new Response(new Uint8Array(generatedPng), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    })

    const sink = createPageBuilderGeneratedImageAssetSink({
      workspace,
      fetchFn: fetchMock as unknown as typeof fetch,
      now: () => 1_700_000_000_000,
      uuidFn: () => 'generated-uuid',
    })
    const asset = await sink('https://images.example.com/generated.png', {
      prompt: 'A text-free conference banner',
      size: '1280x1280',
      provider: 'ZHIPU',
    })

    expect(asset).toMatchObject({
      downloadUrl: 'https://images.example.com/generated.png',
      provider: 'bing',
      sourcePage: 'https://images.example.com/generated.png',
      assetFileName: 'page-builder-image-1700000000000-generated-uuid.png',
      assetRelativePath: 'assets/page-builder-image-1700000000000-generated-uuid.png',
      assetPreviewPath: './assets/page-builder-image-1700000000000-generated-uuid.png',
      width: 800,
      height: 600,
    })
    expect(readFileSync(join(workspaceFilesDir, 'assets', 'page-builder-image-1700000000000-generated-uuid.png'))).toBeTruthy()
  })

  test('rejects generated image urls that cannot be safely imported', async () => {
    const workspace = createAgentWorkspace('Runtime MCP Unsafe Asset Sink', { template: 'page-builder' })
    const fetchMock = mock(async () => new Response('<svg></svg>', {
      status: 200,
      headers: { 'content-type': 'image/svg+xml' },
    }))
    const sink = createPageBuilderGeneratedImageAssetSink({
      workspace,
      fetchFn: fetchMock as unknown as typeof fetch,
      now: () => 1_700_000_000_000,
      uuidFn: () => 'unsafe-uuid',
    })

    await expect(sink('https://images.example.com/generated.svg', {
      prompt: 'bad svg',
      provider: 'ZHIPU',
    })).rejects.toThrow('生成图片落地失败')
  })

  test('resolves analyze_image sources without workspace or remote URL restrictions', async () => {
    const workspace = createAgentWorkspace('Runtime MCP Analyze Source', { template: 'page-builder' })
    const workspaceFilesDir = getWorkspaceFilesDir(workspace.slug)
    const assetsDir = join(workspaceFilesDir, 'assets')
    mkdirSync(assetsDir, { recursive: true })
    writeFileSync(join(assetsDir, 'example.png'), createPngBuffer(800, 600))
    writeFileSync(join(workspaceFilesDir, 'not-image.png'), Buffer.from('not an image'))

    const outsideDir = join(homedir(), '.proma-outside-pagebuilder-runtime-test')
    rmSync(outsideDir, { recursive: true, force: true })
    mkdirSync(outsideDir, { recursive: true })
    writeFileSync(join(outsideDir, 'secret.png'), createPngBuffer(800, 600))
    symlinkSync(join(outsideDir, 'secret.png'), join(assetsDir, 'escape.png'))

    const resolver = createPageBuilderImageSourceResolver(workspace)

    await expect(resolver('./assets/example.png')).resolves.toBe(join(workspaceFilesDir, 'assets/example.png'))
    await expect(resolver('assets/example.png')).resolves.toBe(join(workspaceFilesDir, 'assets/example.png'))
    await expect(resolver('https://images.example.com/remote.png')).resolves.toBe('https://images.example.com/remote.png')
    await expect(resolver('/etc/passwd')).resolves.toBe('/etc/passwd')
    await expect(resolver('../secret.png')).resolves.toBe(join(workspaceFilesDir, '../secret.png'))
    await expect(resolver('assets\\..\\secret.png')).resolves.toBe(join(workspaceFilesDir, 'assets\\..\\secret.png'))
    await expect(resolver('./assets/missing.png')).resolves.toBe(join(workspaceFilesDir, 'assets/missing.png'))
    await expect(resolver('./not-image.png')).resolves.toBe(join(workspaceFilesDir, 'not-image.png'))
    await expect(resolver('./assets/escape.png')).resolves.toBe(join(workspaceFilesDir, 'assets/escape.png'))
    await expect(resolver('file:///tmp/example.png')).resolves.toBe('file:///tmp/example.png')
    await expect(resolver('http://127.0.0.1/image.png')).resolves.toBe('http://127.0.0.1/image.png')
    await expect(resolver('   ')).rejects.toThrow('runtime analyze_image 图片来源不能为空')

    expect(existsSync(join(outsideDir, 'secret.png'))).toBe(true)
    rmSync(outsideDir, { recursive: true, force: true })
  })
})
