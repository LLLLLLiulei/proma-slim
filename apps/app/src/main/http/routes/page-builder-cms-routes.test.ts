import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAgentWorkspace } from '../../lib/workspace-service'
import { getCmsSettingsPath, getWorkspaceFilesDir } from '../../lib/config-paths'
import { createHttpApp } from '../app'

const originalFetch = globalThis.fetch

describe('page builder cms routes', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-page-builder-cms-routes-'))
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

  function createApp() {
    return createHttpApp({
      distDir: process.cwd(),
      isDev: true,
    })
  }

  test('GET /api/page-builder/cms/channels returns normalized channel data', async () => {
    globalThis.fetch = (async () => {
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

    const response = await createApp().fetch(new Request('http://localhost/api/page-builder/cms/channels?search=%E8%B4%A2%E7%BB%8F'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([expect.objectContaining({
      id: '17680',
      name: '财经',
    })])
  })

  test('POST /api/page-builder/cms/assets/import stores the asset inside workspace-files and returns a local mapping', async () => {
    globalThis.fetch = (async () => {
      return new Response('asset body', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }) as typeof fetch

    const workspace = createAgentWorkspace('CMS Route Import', { template: 'page-builder' })

    const response = await createApp().fetch(new Request('http://localhost/api/page-builder/cms/assets/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId: workspace.id,
        relativePath: 'upload/resources/file/2022/03/30/37600.txt',
      }),
    }))

    expect(response.status).toBe(200)
    const payload = await response.json() as {
      workspaceRelativePath: string
    }
    const storedPath = join(getWorkspaceFilesDir(workspace.slug), payload.workspaceRelativePath)

    expect(payload.workspaceRelativePath).toMatch(/^assets\/cms\/[a-f0-9]{12}-37600\.txt$/)
    expect(existsSync(storedPath)).toBe(true)
    expect(readFileSync(storedPath, 'utf-8')).toBe('asset body')
  })
})
