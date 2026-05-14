import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { getPageBuilderPreviewBridgeAssetUrl } from './page-builder-preview-bridge'
import { createWorkspacePreviewResponse, getWorkspacePreviewState } from './workspace-preview-service'
import { createAgentWorkspace } from './workspace-service'

const CMS_ENV_KEYS = [
  'AI_PAGE_BUILDER_BASE_PATH',
  'PROMA_CMS_BASE_URL',
  'PROMA_CMS_SITE_ID',
  'PROMA_CMS_USERNAME',
  'PROMA_CMS_PASSWORD',
] as const

const originalCmsEnv = {
  AI_PAGE_BUILDER_BASE_PATH: process.env.AI_PAGE_BUILDER_BASE_PATH,
  PROMA_CMS_BASE_URL: process.env.PROMA_CMS_BASE_URL,
  PROMA_CMS_SITE_ID: process.env.PROMA_CMS_SITE_ID,
  PROMA_CMS_USERNAME: process.env.PROMA_CMS_USERNAME,
  PROMA_CMS_PASSWORD: process.env.PROMA_CMS_PASSWORD,
}

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })

  for (const key of CMS_ENV_KEYS) {
    const value = originalCmsEnv[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

describe('workspace preview service', () => {
  test('rejects preview traversal attempts that escape workspace-files', () => {
    const workspace = createAgentWorkspace('Preview Traversal')

    expect(() => createWorkspacePreviewResponse(workspace, '../memory/MEMORY.md')).toThrow('非法路径')
  })

  test('reports preview availability only when workspace-files/index.html exists', async () => {
    const workspace = createAgentWorkspace('Preview State')
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    expect(getWorkspacePreviewState(workspace)).toEqual({
      hasPreview: false,
      entryUrl: null,
      revision: null,
      hasCmsRendering: false,
      requiresSameOrigin: false,
    })

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(join(workspaceFilesDir, 'index.html'), '<html><body>ready</body></html>', 'utf-8')

    const state = getWorkspacePreviewState(workspace)
    expect(state.hasPreview).toBe(true)
    expect(state.entryUrl).toBe(`/api/workspaces/${workspace.id}/preview/`)
    expect(typeof state.revision).toBe('string')
    expect(state.revision?.length).toBeGreaterThan(0)
    expect(state.hasCmsRendering).toBe(false)
    expect(state.requiresSameOrigin).toBe(false)
  })

  test('returns preview entry URLs with the configured public base path', async () => {
    process.env.AI_PAGE_BUILDER_BASE_PATH = '/pagebuilder'
    const workspace = createAgentWorkspace('Preview State With Base Path')
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(join(workspaceFilesDir, 'index.html'), '<html><body>ready</body></html>', 'utf-8')

    const state = getWorkspacePreviewState(workspace)

    expect(state.entryUrl).toBe(`/pagebuilder/api/workspaces/${workspace.id}/preview/`)
  })

  test('reports CMS preview metadata and injects CMS rendering assets before the bridge', async () => {
    const workspace = createAgentWorkspace('CMS Preview State', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><cms-content catalog-id="news"></cms-content></body></html>',
      'utf-8',
    )

    const state = getWorkspacePreviewState(workspace)
    expect(state.hasCmsRendering).toBe(true)
    expect(state.requiresSameOrigin).toBe(true)

    const response = createWorkspacePreviewResponse(workspace, '/', { enablePageBuilderBridge: true })
    const html = await response.text()

    expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'self'")
    expect(response.headers.get('x-frame-options')).not.toBe('DENY')
    const previewAssetIndex = html.indexOf('/api/page-builder/cms-rendering-preview.js')
    const bridgeAssetIndex = html.indexOf(getPageBuilderPreviewBridgeAssetUrl())

    expect(html).toContain('data-proma-cms-rendering-importmap="true"')
    expect(html).toContain('data-proma-cms-rendering-config="true"')
    expect(html).toContain('data-proma-cms-rendering-loader="true"')
    expect(previewAssetIndex).toBeGreaterThan(-1)
    expect(bridgeAssetIndex).toBeGreaterThan(previewAssetIndex)
  })

  test('injects the configured public base path into CMS preview runtime requests', async () => {
    process.env.AI_PAGE_BUILDER_BASE_PATH = '/pagebuilder'
    const workspace = createAgentWorkspace('CMS Preview State With Base Path', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><cms-content catalog-id="news"></cms-content></body></html>',
      'utf-8',
    )

    const response = createWorkspacePreviewResponse(workspace, '/', { enablePageBuilderBridge: true })
    const html = await response.text()

    expect(html).toContain(`"cmsProxyBase":"/pagebuilder/api/workspaces/${workspace.id}/page-builder/cms"`)
    expect(html).not.toContain('"cmsProxyBase":"/api/page-builder/cms"')
  })

  test('injects the page-builder preview bridge only when the request explicitly enables it', async () => {
    const builderWorkspace = createAgentWorkspace('Builder Preview', { template: 'page-builder' })
    const regularWorkspace = createAgentWorkspace('Regular Preview')
    const builderWorkspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', builderWorkspace.slug, 'workspace-files')
    const regularWorkspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', regularWorkspace.slug, 'workspace-files')

    mkdirSync(builderWorkspaceFilesDir, { recursive: true })
    mkdirSync(regularWorkspaceFilesDir, { recursive: true })
    writeFileSync(join(builderWorkspaceFilesDir, 'index.html'), '<!doctype html><html><body><h1>Builder</h1></body></html>', 'utf-8')
    writeFileSync(join(regularWorkspaceFilesDir, 'index.html'), '<!doctype html><html><body><h1>Regular</h1></body></html>', 'utf-8')

    const builderResponse = createWorkspacePreviewResponse(builderWorkspace, '/', { enablePageBuilderBridge: true })
    const builderWithoutBridgeResponse = createWorkspacePreviewResponse(builderWorkspace, '/')
    const regularResponse = createWorkspacePreviewResponse(regularWorkspace, '/')

    const builderHtml = await builderResponse.text()

    expect(builderHtml).toContain(getPageBuilderPreviewBridgeAssetUrl())
    expect(builderHtml).toContain('data-page-builder-preview-bridge-loader="true"')
    expect(builderHtml).not.toContain('window.parent !== window')
    expect(builderHtml).not.toContain('const resolveElementLabel = (element) => {')
    expect(await builderWithoutBridgeResponse.text()).not.toContain(getPageBuilderPreviewBridgeAssetUrl())
    expect(await regularResponse.text()).not.toContain(getPageBuilderPreviewBridgeAssetUrl())
  })

  test('keeps page-builder preview assets unchanged when serving non-html files', async () => {
    const workspace = createAgentWorkspace('Builder Preview Assets', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(join(workspaceFilesDir, 'assets'), { recursive: true })
    writeFileSync(join(workspaceFilesDir, 'assets', 'site.css'), 'body { color: rebeccapurple; }', 'utf-8')

    const assetResponse = createWorkspacePreviewResponse(workspace, '/assets/site.css')

    expect(assetResponse.headers.get('content-security-policy')).toBeNull()
    expect(await assetResponse.text()).toBe('body { color: rebeccapurple; }')
  })

  test('rewrites CMS resource URLs in preview html to the asset proxy', async () => {
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager/'
    process.env.PROMA_CMS_SITE_ID = '277'
    process.env.PROMA_CMS_USERNAME = 'test-user'
    process.env.PROMA_CMS_PASSWORD = 'test-pass'

    const workspace = createAgentWorkspace('Preview CMS Asset Proxy', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      `<!doctype html><html><body>
        <link rel="stylesheet" href="./assets/site.css">
        <img src="https://demo.zving.com/manager/preview/news/upload/resources/image/banner.jpg">
        <img src="/assets/images/addpicture.png">
        <video controls poster="https://demo.zving.com/manager/preview/news/upload/resources/image/poster.jpg" src="https://demo.zving.com/manager/preview/news/upload/resources/video/demo.mp4"></video>
        <audio src="https://demo.zving.com/manager/preview/news/upload/resources/audio/demo.mp3"></audio>
        <a href="https://demo.zving.com/manager/preview/news/upload/resources/file/demo.pdf">下载文件</a>
        <a href="https://demo.zving.com/test/kj/">科技</a>
        <img src="https://example.com/not-cms.png">
      </body></html>`,
      'utf-8',
    )

    const response = createWorkspacePreviewResponse(workspace, '/')
    const html = await response.text()

    expect(html).toContain(`/api/workspaces/${workspace.id}/page-builder/cms/assets?url=`)
    expect(html).toContain(encodeURIComponent('https://demo.zving.com/manager/preview/news/upload/resources/image/banner.jpg'))
    expect(html).toContain(encodeURIComponent('https://demo.zving.com/assets/images/addpicture.png'))
    expect(html).toContain(encodeURIComponent('https://demo.zving.com/manager/preview/news/upload/resources/video/demo.mp4'))
    expect(html).toContain(encodeURIComponent('https://demo.zving.com/manager/preview/news/upload/resources/audio/demo.mp3'))
    expect(html).toContain(encodeURIComponent('https://demo.zving.com/manager/preview/news/upload/resources/file/demo.pdf'))
    expect(html).toContain(encodeURIComponent('https://demo.zving.com/manager/preview/news/upload/resources/image/poster.jpg'))
    expect(html).toContain(encodeURIComponent('https://example.com/not-cms.png'))
    expect(html).toContain('<link rel="stylesheet" href="./assets/site.css">')
    expect(html).toContain('<a href="https://demo.zving.com/test/kj/">科技</a>')
    expect(html).not.toContain('<img src="https://example.com/not-cms.png">')
  })

  test('rewrites CMS resource URLs with the configured public base path', async () => {
    process.env.AI_PAGE_BUILDER_BASE_PATH = '/pagebuilder'
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager/'
    process.env.PROMA_CMS_SITE_ID = '277'
    process.env.PROMA_CMS_USERNAME = 'test-user'
    process.env.PROMA_CMS_PASSWORD = 'test-pass'

    const workspace = createAgentWorkspace('Preview CMS Asset Proxy With Base Path', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><img src="https://demo.zving.com/manager/preview/news/upload/resources/image/banner.jpg"></body></html>',
      'utf-8',
    )

    const response = createWorkspacePreviewResponse(workspace, '/')
    const html = await response.text()

    expect(html).toContain(`/pagebuilder/api/workspaces/${workspace.id}/page-builder/cms/assets?url=`)
    expect(html).not.toContain('src="/api/page-builder/cms/assets?url=')
  })
})
