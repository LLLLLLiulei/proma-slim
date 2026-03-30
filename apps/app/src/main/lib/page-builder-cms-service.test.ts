import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAgentWorkspace } from './workspace-service'
import { getCmsSettingsPath, getWorkspaceFilesDir } from './config-paths'
import {
  createPageBuilderCmsService,
  createPageBuilderCmsAssetPreviewResponse,
} from './page-builder-cms-service'

const originalFetch = globalThis.fetch

describe('page builder cms service', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-page-builder-cms-service-'))
    process.env.PROMA_CONFIG_DIR = configDir
    writeFileSync(getCmsSettingsPath(), JSON.stringify({
      baseUrl: 'https://demo.zving.com/zcmstest',
      currentSite: '277',
      zusid: '_-rOf-_qTSOM1GBM3IfH8A',
    }, null, 2), 'utf-8')
  })

  afterEach(() => {
    delete process.env.PROMA_CONFIG_DIR
    globalThis.fetch = originalFetch
    rmSync(configDir, { recursive: true, force: true })
  })

  test('requests upstream channels with the configured cookie and browser-compatible headers', async () => {
    const fetchCalls: Array<{ url: string; headers: Headers }> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({
        url: String(input),
        headers: new Headers(init?.headers),
      })

      return new Response(JSON.stringify({
        status: 1,
        data: [{
          ID: 17680,
          parentID: 0,
          siteID: 277,
          path: 'cj/',
          name: '财经',
          alias: 'cj',
          contentType: '',
          contentTypeName: '',
          type: 'Default',
          treeLevel: 1,
          total: 27,
          childCount: 0,
          hasChild: false,
          link: 'https://demo.zving.com/test/cj/',
        }],
      }), {
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const service = createPageBuilderCmsService()
    const channels = await service.listChannels({ search: '财经' })

    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0]?.url).toBe('https://demo.zving.com/zcmstest/ui/dimensions/1/catalogs?searchKeyWord=%E8%B4%A2%E7%BB%8F')
    expect(fetchCalls[0]?.headers.get('cookie')).toBe('CurrentSite=277; ZUSID=_-rOf-_qTSOM1GBM3IfH8A')
    expect(fetchCalls[0]?.headers.get('referer')).toBe('https://demo.zving.com/zcmstest/app.html')
    expect(fetchCalls[0]?.headers.get('user-agent')).toContain('Mozilla/5.0')
    expect(channels).toEqual([expect.objectContaining({
      id: '17680',
      name: '财经',
    })])
  })

  test('imports protected assets into workspace-files/assets/cms using a stable hashed path', async () => {
    globalThis.fetch = (async () => {
      return new Response('cms asset body', {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
        },
      })
    }) as typeof fetch

    const workspace = createAgentWorkspace('CMS Import Target', { template: 'page-builder' })
    const service = createPageBuilderCmsService()
    const result = await service.importAssetToWorkspace({
      workspaceId: workspace.id,
      relativePath: 'upload/resources/file/2022/03/30/37600.txt',
    })

    expect(result.relativePath).toBe('upload/resources/file/2022/03/30/37600.txt')
    expect(result.workspaceRelativePath).toMatch(/^assets\/cms\/[a-f0-9]{12}-37600\.txt$/)
    expect(result.filename).toBe('37600.txt')

    const storedPath = join(getWorkspaceFilesDir(workspace.slug), result.workspaceRelativePath)
    expect(existsSync(storedPath)).toBe(true)
    expect(readFileSync(storedPath, 'utf-8')).toBe('cms asset body')
  })

  test('builds preview responses from protected preview/news assets without exposing upstream urls', async () => {
    globalThis.fetch = (async () => {
      return new Response('preview bytes', {
        headers: {
          'content-type': 'image/jpeg',
          'content-length': '13',
        },
      })
    }) as typeof fetch

    const response = await createPageBuilderCmsAssetPreviewResponse('upload/resources/image/2025/06/30/38925_361x300.jpeg')

    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('preview bytes')
  })
})
