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
  PROMA_CMS_USERNAME: process.env.PROMA_CMS_USERNAME,
  PROMA_CMS_PASSWORD: process.env.PROMA_CMS_PASSWORD,
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
  process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager/'
  process.env.PROMA_CMS_USERNAME = 'test-user'
  process.env.PROMA_CMS_PASSWORD = 'test-pass'
}

function restoreCmsEnv() {
  restoreEnvVar('PROMA_CMS_BASE_URL', originalCmsEnv.PROMA_CMS_BASE_URL)
  restoreEnvVar('PROMA_CMS_USERNAME', originalCmsEnv.PROMA_CMS_USERNAME)
  restoreEnvVar('PROMA_CMS_PASSWORD', originalCmsEnv.PROMA_CMS_PASSWORD)
}

function restoreEnvVar(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

function createTokenResponse() {
  return new Response(JSON.stringify({
    status: 1,
    message: '操作成功!',
    access_token: 'Bearer slim-token',
    expires_in: 18_000,
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
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
    expect(await response.json()).toEqual(expect.arrayContaining([expect.objectContaining({
      workspaceId: workspace.id,
      workspaceName: 'History Project',
      previewUrl: `/api/workspaces/${workspace.id}/preview/`,
    })]))
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

  test('edit-lock routes acquire, renew, validate, and release project edit locks', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Lockable Project', { template: 'page-builder' })

    const acquireResponse = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        holderId: 'holder-1',
      }),
    }))

    expect(acquireResponse.status).toBe(201)
    const lease = await acquireResponse.json() as {
      workspaceId: string
      lockId: string
      holderId: string
      expiresAt: number
      heartbeatIntervalMs: number
    }
    expect(lease.workspaceId).toBe(workspace.id)
    expect(lease.holderId).toBe('holder-1')
    expect(lease.heartbeatIntervalMs).toBe(15_000)

    const renewResponse = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock/${lease.lockId}/renew`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        holderId: 'holder-1',
      }),
    }))

    expect(renewResponse.status).toBe(200)
    const renewedLease = await renewResponse.json() as { holderId: string; expiresAt: number }
    expect(renewedLease.holderId).toBe('holder-1')
    expect(renewedLease.expiresAt).toBeGreaterThanOrEqual(lease.expiresAt)

    const mismatchedRenewResponse = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock/${lease.lockId}/renew`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        holderId: 'holder-2',
      }),
    }))

    expect(mismatchedRenewResponse.status).toBe(409)

    const statusResponse = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock/${lease.lockId}`))

    expect(statusResponse.status).toBe(200)
    expect(await statusResponse.json()).toEqual(expect.objectContaining({
      valid: true,
      lease: expect.objectContaining({
        lockId: lease.lockId,
        holderId: 'holder-1',
      }),
    }))

    const releaseResponse = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock/${lease.lockId}/release`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        holderId: 'holder-1',
      }),
    }))

    expect(releaseResponse.status).toBe(204)
  })

  test('edit-lock acquire rejects a second editor and project summaries expose locked edit state', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Locked History Project', { template: 'page-builder' })

    const firstAcquire = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        holderId: 'holder-1',
      }),
    }))
    expect(firstAcquire.status).toBe(201)

    const secondAcquire = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        holderId: 'holder-2',
      }),
    }))

    expect(secondAcquire.status).toBe(409)
    expect(await secondAcquire.json()).toEqual(expect.objectContaining({
      error: '该项目当前有其他编辑会话正在进行，请稍后再试',
      editState: expect.objectContaining({
        status: 'locked',
        reason: 'editor',
      }),
    }))

    const projectsResponse = await app.fetch(new Request('http://localhost/api/page-builder/projects'))

    expect(projectsResponse.status).toBe(200)
    expect(await projectsResponse.json()).toEqual(expect.arrayContaining([expect.objectContaining({
      workspaceId: workspace.id,
      editState: expect.objectContaining({
        status: 'locked',
        reason: 'editor',
      }),
    })]))
  })

  test('DELETE /api/page-builder/projects/:workspaceId rejects locked projects', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Locked Delete Project', { template: 'page-builder' })

    const acquireResponse = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}/edit-lock`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        holderId: 'holder-1',
      }),
    }))
    expect(acquireResponse.status).toBe(201)

    const deleteResponse = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}`, {
      method: 'DELETE',
    }))

    expect(deleteResponse.status).toBe(409)
    expect(await deleteResponse.json()).toEqual({
      error: '该项目当前有其他编辑会话正在进行，请稍后再试',
    })
  })

  test('GET /api/page-builder/cms/catalogs returns normalized catalog data', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        expect(init?.method).toBe('POST')
        expect(JSON.parse(String(init?.body))).toEqual({
          username: 'test-user',
          password: 'test-pass',
        })
        return createTokenResponse()
      }

      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer slim-token',
      })

      if (url === 'https://demo.zving.com/manager/api/catalogsTree?siteID=14&contentType=Image&keyword=%E9%A6%96%E9%A1%B5') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              ID: 100,
              parentID: 0,
              name: '首页',
              children: [
                {
                  ID: 101,
                  parentID: 100,
                  name: 'Banner',
                },
              ],
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/catalogs?siteID=14&level=All&pageIndex=0&pageSize=500') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 100,
              parentID: 0,
              path: 'home/',
              listLink: 'https://site14.example.com/home/list.shtml',
              name: '首页',
              logoFile: 'upload/resources/image/home.png',
              contentType: '',
              contentTypeName: '文章',
              childCount: 1,
              total: 12,
              siteID: 14,
            },
            {
              id: 101,
              parentID: 100,
              path: 'home/banner/',
              link: 'https://site14.example.com/home/banner/',
              name: 'Banner',
              logoFile: '/upload/resources/image/banner.png',
              contentType: 'Image',
              contentTypeName: '图片',
              hasChild: false,
              total: 3,
              siteID: 14,
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/sites') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 14,
              name: '新闻站',
              url: 'https://site14.example.com/',
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/catalogs?siteId=14&contentType=Image&searchKeyword=%E9%A6%96%E9%A1%B5'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      items: [
        {
          id: '100',
          name: '首页',
          parentId: null,
          path: 'https://site14.example.com/home/list.shtml',
          contentType: '',
          contentTypeName: '文章',
          logoUrl: 'https://site14.example.com/upload/resources/image/home.png',
          hasChild: true,
          total: 12,
          children: [],
        },
        {
          id: '101',
          name: 'Banner',
          parentId: '100',
          path: 'https://site14.example.com/home/banner/',
          contentType: 'Image',
          contentTypeName: '图片',
          logoUrl: 'https://site14.example.com/upload/resources/image/banner.png',
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
          path: 'https://site14.example.com/home/list.shtml',
          contentType: '',
          contentTypeName: '文章',
          logoUrl: 'https://site14.example.com/upload/resources/image/home.png',
          hasChild: true,
          total: 12,
          children: [
            {
              id: '101',
              name: 'Banner',
              parentId: '100',
              path: 'https://site14.example.com/home/banner/',
              contentType: 'Image',
              contentTypeName: '图片',
              logoUrl: 'https://site14.example.com/upload/resources/image/banner.png',
              hasChild: false,
              total: 3,
              children: [],
            },
          ],
        },
      ],
    })
  })

  test('GET /api/page-builder/cms/catalogs supports ordered fixed ids without loading the full catalog tree', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        return createTokenResponse()
      }

      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer slim-token',
      })

      if (url === 'https://demo.zving.com/manager/api/catalogs?siteID=14&id=102&level=CurrentAndChild') {
        return new Response(JSON.stringify({
          status: 1,
          data: {
            id: 102,
            parentID: 0,
            path: 'brand/',
            name: '品牌素材',
            contentType: 'Image',
            contentTypeName: '图片',
            hasChild: false,
            total: 2,
          },
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/catalogs?siteID=14&id=999&level=CurrentAndChild') {
        return new Response(JSON.stringify({
          status: 1,
          data: [],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/catalogs?siteID=14&id=101&level=CurrentAndChild') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 101,
              parentID: 0,
              path: 'news/',
              name: '新闻中心',
              contentType: 'Article',
              contentTypeName: '文章',
              hasChild: false,
              total: 8,
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/catalogs?siteId=14&ids=102,999,101'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [
        {
          id: '102',
          name: '品牌素材',
          parentId: null,
          path: 'brand/',
          contentType: 'Image',
          contentTypeName: '图片',
          hasChild: false,
          total: 2,
          children: [],
        },
        {
          id: '101',
          name: '新闻中心',
          parentId: null,
          path: 'news/',
          contentType: 'Article',
          contentTypeName: '文章',
          hasChild: false,
          total: 8,
          children: [],
        },
      ],
      tree: [
        {
          id: '102',
          name: '品牌素材',
          parentId: null,
          path: 'brand/',
          contentType: 'Image',
          contentTypeName: '图片',
          hasChild: false,
          total: 2,
          children: [],
        },
        {
          id: '101',
          name: '新闻中心',
          parentId: null,
          path: 'news/',
          contentType: 'Article',
          contentTypeName: '文章',
          hasChild: false,
          total: 8,
          children: [],
        },
      ],
    })
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/catalogsTree'))).toBe(false)
  })

  test('GET /api/page-builder/cms/contents returns normalized content summaries', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        return createTokenResponse()
      }

      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer slim-token',
      })

      if (url === 'https://demo.zving.com/manager/api/catalogs/101/contents?siteID=14&pageIndex=1&pageSize=10&loadextend=true') {
        return new Response(JSON.stringify({
          status: 1,
          data: {
            pageIndex: 1,
            pageSize: 10,
            total: 1,
            data: [
              {
                id: 501,
                catalogID: 101,
                title: '首页轮播图',
                summary: '三张首页图片',
                logoFile: 'preview/news/upload/resources/image/banner-list-logo.jpg',
                link: 'https://demo.zving.com/home/banner/501.html',
                publishUrl: 'https://legacy.example.com/home/banner/501.html',
                addTime: '2025-04-11 17:48:06',
              },
            ],
          },
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/sites') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 14,
              name: '新闻站',
              url: 'https://site14.example.com/',
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/contents?siteId=14&catalogId=101&pageIndex=1&pageSize=10'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
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
          listLogoUrl: 'https://site14.example.com/preview/news/upload/resources/image/banner-list-logo.jpg',
          addedAt: '2025-04-11 17:48',
          publishUrl: 'https://demo.zving.com/home/banner/501.html',
        },
      ],
    })
  })

  test('GET /api/page-builder/cms/contents supports single-catalog fixed ids and drops invalid items', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        return createTokenResponse()
      }

      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer slim-token',
      })

      if (url === 'https://demo.zving.com/manager/api/catalogs/101/contents?siteID=14&pageIndex=0&pageSize=100&loadextend=true') {
        return new Response(JSON.stringify({
          status: 1,
          data: {
            data: [
              {
                id: 501,
                catalogID: 101,
                title: '首页轮播图',
                summary: '三张首页图片',
                logoFile: 'preview/news/upload/resources/image/banner-list-logo.jpg',
                publishUrl: 'https://demo.zving.com/home/banner/501.html',
                addTime: '2025-04-11 17:48:06',
              },
              {
                id: 502,
                catalogID: 101,
                title: '品牌素材包',
                summary: '包含视频、音频和附件',
                url: 'https://demo.zving.com/home/banner/502.html',
                publishDate: '2025-04-12 10:08:00',
              },
            ],
            pageIndex: 0,
            pageSize: 100,
            total: 2,
          },
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/sites') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 14,
              name: '新闻站',
              url: 'https://site14.example.com/',
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/contents?siteId=14&catalogId=101&ids=502,999,501'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      pageIndex: 0,
      pageSize: 2,
      total: 2,
      totalPages: 1,
      items: [
        {
          id: '502',
          catalogId: '101',
          title: '品牌素材包',
          summary: '包含视频、音频和附件',
          addedAt: '2025-04-12 10:08',
          publishUrl: 'https://demo.zving.com/home/banner/502.html',
        },
        {
          id: '501',
          catalogId: '101',
          title: '首页轮播图',
          summary: '三张首页图片',
          listLogoUrl: 'https://site14.example.com/preview/news/upload/resources/image/banner-list-logo.jpg',
          addedAt: '2025-04-11 17:48',
          publishUrl: 'https://demo.zving.com/home/banner/501.html',
        },
      ],
    })
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/catalogs/101/contents'))).toHaveLength(1)
  })

  test('GET /api/page-builder/cms/catalogs/:catalogId returns normalized catalog detail', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        return createTokenResponse()
      }

      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer slim-token',
      })

      if (url === 'https://demo.zving.com/manager/api/catalogs?siteID=14&level=All&pageIndex=0&pageSize=500') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 17765,
              innerCode: '002676000004',
              status: 20,
              name: '文章',
              alias: 'lbt_wz',
              contentType: 'Article',
              info: '栏目描述',
              logoFile: 'assets/images/addpicture.png',
              siteID: 14,
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/sites') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 14,
              name: '新闻站',
              url: 'https://site14.example.com/',
            },
          ],
        }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/catalogs/17765?siteId=14'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
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
      logoUrl: 'https://site14.example.com/assets/images/addpicture.png',
    })
  })

  test('GET /api/page-builder/cms/sites returns normalized site summaries', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        return createTokenResponse()
      }

      expect(url).toBe('https://demo.zving.com/manager/api/sites')
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer slim-token',
      })

      return new Response(JSON.stringify({
        status: 1,
        data: [
          {
            id: 1,
            name: '主站',
            url: 'https://demo.zving.com',
            parentID: 0,
            branchInnerCode: '0001',
          },
          {
            id: 14,
            name: '新闻站',
            url: 'https://news.demo.zving.com',
            parentID: 1,
            branchInnerCode: '000114',
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

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/sites'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual([
      {
        id: '1',
        name: '主站',
        url: 'https://demo.zving.com',
        parentId: null,
        branchInnerCode: '0001',
      },
      {
        id: '14',
        name: '新闻站',
        url: 'https://news.demo.zving.com',
        parentId: '1',
        branchInnerCode: '000114',
      },
    ])
  })

  test('GET /api/page-builder/cms/catalogs defaults siteId to 1 when it is omitted', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        return createTokenResponse()
      }

      expect(url).toBe('https://demo.zving.com/manager/api/catalogsTree?siteID=1')

      return new Response(JSON.stringify({
        status: 1,
        data: [],
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/catalogs'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [],
      tree: [],
    })
  })

  test('GET /api/page-builder/cms/assets proxies cms logo images without auth headers', async () => {
    setCmsEnv()
    const app = createApp()
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        'https://demo.zving.com/manager/preview/news/upload/resources/image/banner-list-logo.jpg',
      )
      expect(init?.headers).toBeUndefined()

      return new Response('binary-image', {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request(
      'http://localhost/api/page-builder/cms/assets?url=https%3A%2F%2Fdemo.zving.com%2Fmanager%2Fpreview%2Fnews%2Fupload%2Fresources%2Fimage%2Fbanner-list-logo.jpg',
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
      expect(init?.headers).toBeUndefined()

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
    delete process.env.PROMA_CMS_USERNAME
    delete process.env.PROMA_CMS_PASSWORD

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
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://demo.zving.com/manager/api/token') {
        return createTokenResponse()
      }

      return new Response(JSON.stringify({
        status: 0,
        message: '上游接口不可用',
      }), {
        status: 500,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const response = await app.fetch(new Request('http://localhost/api/page-builder/cms/contents?catalogId=101'))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'CMS 请求失败：上游接口不可用',
    })
  })
})
