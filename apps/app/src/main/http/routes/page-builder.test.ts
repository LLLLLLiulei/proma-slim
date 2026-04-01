import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createAgentSession } from '../../lib/agent-session-manager'
import { createAgentWorkspace } from '../../lib/workspace-service'
import { createHttpApp } from '../app'

const originalFetch = globalThis.fetch
const originalCmsEnv = {
  PROMA_CMS_BASE_URL: process.env.PROMA_CMS_BASE_URL,
  PROMA_CMS_ZUSID: process.env.PROMA_CMS_ZUSID,
  PROMA_CMS_CURRENT_SITE: process.env.PROMA_CMS_CURRENT_SITE,
} as const

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
  globalThis.fetch = originalFetch
  mock.restore()
  restoreCmsEnv()
})

function createApp() {
  return createHttpApp({
    distDir: process.cwd(),
    isDev: true,
  })
}

function setCmsEnv() {
  process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/zcmstest/'
  process.env.PROMA_CMS_ZUSID = 'test-zusid'
  process.env.PROMA_CMS_CURRENT_SITE = '277'
}

function restoreCmsEnv() {
  restoreEnvVar('PROMA_CMS_BASE_URL', originalCmsEnv.PROMA_CMS_BASE_URL)
  restoreEnvVar('PROMA_CMS_ZUSID', originalCmsEnv.PROMA_CMS_ZUSID)
  restoreEnvVar('PROMA_CMS_CURRENT_SITE', originalCmsEnv.PROMA_CMS_CURRENT_SITE)
}

function restoreEnvVar(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

describe('page-builder routes', () => {
  test('GET /api/page-builder/projects returns page-builder project summaries', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('History Project', { template: 'page-builder' })
    createAgentSession('History Session', undefined, workspace.id)

    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(join(workspaceFilesDir, 'index.html'), '<h1>Preview</h1>', 'utf-8')

    const response = await app.fetch(new Request('http://localhost/api/page-builder/projects'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([expect.objectContaining({
      workspaceId: workspace.id,
      workspaceName: 'History Project',
      previewUrl: `/api/workspaces/${workspace.id}/preview/`,
    })])
  })

  test('DELETE /api/page-builder/projects/:workspaceId deletes the whole page-builder project', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Disposable Project', { template: 'page-builder' })
    createAgentSession('Draft', undefined, workspace.id)
    const workspaceRoot = join(homedir(), '.proma', 'agent-workspaces', workspace.slug)
    writeFileSync(join(workspaceRoot, 'workspace-files', 'index.html'), '<h1>Preview</h1>', 'utf-8')

    const response = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}`, {
      method: 'DELETE',
    }))

    expect(response.status).toBe(204)
    const listResponse = await app.fetch(new Request('http://localhost/api/page-builder/projects'))
    expect(await listResponse.json()).toEqual([])
  })

  test('GET /api/page-builder/cms/catalogs returns normalized catalog data', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        'https://demo.zving.com/zcmstest/ui/dimensions/1/catalogs?contentType=Image&searchKeyWord=%E9%A6%96%E9%A1%B5',
      )
      expect(init?.headers).toMatchObject({
        Cookie: 'ZUSID=test-zusid; CurrentSite=277',
      })

      return new Response(JSON.stringify({
        status: 1,
        data: [
          {
            ID: 100,
            parentID: 0,
            path: 'home/',
            name: '首页',
            contentType: '',
            contentTypeName: '文章',
            hasChild: true,
            total: 12,
          },
          {
            ID: 101,
            parentID: 100,
            path: 'home/banner/',
            name: 'Banner',
            contentType: 'Image',
            contentTypeName: '图片',
            hasChild: false,
            total: 3,
          },
        ],
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/catalogs?contentType=Image&searchKeyword=%E9%A6%96%E9%A1%B5'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [
        {
          id: '100',
          name: '首页',
          parentId: null,
          path: 'home/',
          contentType: '',
          contentTypeName: '文章',
          hasChild: true,
          total: 12,
          children: [],
        },
        {
          id: '101',
          name: 'Banner',
          parentId: '100',
          path: 'home/banner/',
          contentType: 'Image',
          contentTypeName: '图片',
          hasChild: false,
          total: 3,
          children: [],
        },
      ],
      tree: [
        {
          id: '100',
          name: '首页',
          parentId: null,
          path: 'home/',
          contentType: '',
          contentTypeName: '文章',
          hasChild: true,
          total: 12,
          children: [
            {
              id: '101',
              name: 'Banner',
              parentId: '100',
              path: 'home/banner/',
              contentType: 'Image',
              contentTypeName: '图片',
              hasChild: false,
              total: 3,
              children: [],
            },
          ],
        },
      ],
    })
  })

  test('GET /api/page-builder/cms/contents returns normalized content summaries', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        'https://demo.zving.com/zcmstest/ui/contentcore/contents?catalogID=101&contentSelectType=&keyWord=&title=&pageIndex=1&pageSize=10',
      )

      return new Response(JSON.stringify({
        status: 1,
        data: {
          pageIndex: 1,
          pageSize: 10,
          total: 1,
          list: [
            {
              id: 501,
              catalogId: 101,
              title: '首页轮播图',
              summary: '三张首页图片',
              listLogo: 'https://demo.zving.com/zcmstest/preview/news/upload/resources/image/banner-list-logo.jpg',
              publishUrl: 'https://demo.zving.com/home/banner/501.html',
              addTime: '2025-04-11 17:48:06',
              imagesTotal: 3,
            },
          ],
        },
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/contents?catalogId=101&pageIndex=1&pageSize=10'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      pageIndex: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      items: [
        {
          id: '501',
          catalogId: '101',
          title: '首页轮播图',
          summary: '三张首页图片',
          listLogoUrl: 'https://demo.zving.com/zcmstest/preview/news/upload/resources/image/banner-list-logo.jpg',
          addedAt: '2025-04-11 17:48',
          publishUrl: 'https://demo.zving.com/home/banner/501.html',
          shape: 'gallery',
          assetCounts: {
            images: 3,
            audios: 0,
            videos: 0,
            files: 0,
          },
          assetHints: {
            images: [],
            audios: [],
            videos: [],
            files: [],
          },
        },
      ],
    })
  })

  test('GET /api/page-builder/cms/catalogs/:catalogId returns normalized catalog detail', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://demo.zving.com/zcmstest/ui/catalogs/17765')
      expect(init?.headers).toMatchObject({
        Cookie: 'ZUSID=test-zusid; CurrentSite=277',
      })

      return new Response(JSON.stringify({
        status: 1,
        data: {
          ID: 17765,
          innerCode: '002676000004',
          status: 20,
          name: '文章',
          alias: 'lbt_wz',
          contentType: 'Article',
          info: '栏目描述',
          logoSrc: '/assets/images/addpicture.png',
        },
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/catalogs/17765'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: '17765',
      innerCode: '002676000004',
      statusCode: 20,
      statusLabel: '启用',
      name: '文章',
      alias: 'lbt_wz',
      contentType: 'Article',
      contentTypeName: '文章',
      description: '栏目描述',
      logoUrl: 'https://demo.zving.com/zcmstest/assets/images/addpicture.png',
    })
  })

  test('GET /api/page-builder/cms/assets proxies authenticated cms logo images', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        'https://demo.zving.com/zcmstest/preview/news/upload/resources/image/banner-list-logo.jpg',
      )
      expect(init?.headers).toMatchObject({
        Cookie: 'ZUSID=test-zusid; CurrentSite=277',
      })

      return new Response('binary-image', {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request(
      'http://localhost/api/page-builder/cms/assets?url=https%3A%2F%2Fdemo.zving.com%2Fzcmstest%2Fpreview%2Fnews%2Fupload%2Fresources%2Fimage%2Fbanner-list-logo.jpg',
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(await response.text()).toBe('binary-image')
  })

  test('GET /api/page-builder/cms/assets proxies same-origin root cms assets', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://demo.zving.com/assets/images/addpicture.png')
      expect(init?.headers).toMatchObject({
        Cookie: 'ZUSID=test-zusid; CurrentSite=277',
      })

      return new Response('root-binary-image', {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request(
      'http://localhost/api/page-builder/cms/assets?url=https%3A%2F%2Fdemo.zving.com%2Fassets%2Fimages%2Faddpicture.png',
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(await response.text()).toBe('root-binary-image')
  })

  test('GET /api/page-builder/cms/catalogs returns 503 when cms host config is missing', async () => {
    delete process.env.PROMA_CMS_BASE_URL
    delete process.env.PROMA_CMS_ZUSID
    delete process.env.PROMA_CMS_CURRENT_SITE

    const app = createApp()
    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/catalogs'))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'CMS 浏览暂不可用，请先完成宿主 CMS 配置',
    })
  })

  test('GET /api/page-builder/cms/contents returns 502 when the cms upstream fails', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async () => new Response(JSON.stringify({
      status: 0,
      message: '上游接口不可用',
    }), {
      status: 500,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/contents?catalogId=101'))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'CMS 请求失败：上游接口不可用',
    })
  })
})
