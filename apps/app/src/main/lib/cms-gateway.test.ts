import { afterEach, describe, expect, mock, test } from 'bun:test'

const TEST_ENV = {
  PROMA_CMS_BASE_URL: 'https://demo.zving.com/manager/',
  PROMA_CMS_USERNAME: 'test-user',
  PROMA_CMS_PASSWORD: 'test-pass',
} as const

afterEach(() => {
  mock.restore()
})

describe('CmsGateway', () => {
  test('resolves host cms config from env with normalized base url', async () => {
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')

    const config = resolvePageBuilderCmsConfig(TEST_ENV)

    expect(config).toEqual({
      baseUrl: 'https://demo.zving.com/manager',
      username: 'test-user',
      password: 'test-pass',
    })
  })

  test('lists sites from the slim sites endpoint and returns normalized site summaries', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://demo.zving.com/manager/api/sites')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({
        Accept: 'application/json',
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
        headers: { 'content-type': 'application/json' },
      })
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    await expect(gateway.listSites()).resolves.toEqual([
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

  test('enriches catalog tree items from catalog metadata and resolves logoFile against the site url', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const requestedUrls: string[] = []
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requestedUrls.push(url)
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({
        Accept: 'application/json',
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
          headers: { 'content-type': 'application/json' },
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
              link: 'https://site14.example.com/home/',
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
          headers: { 'content-type': 'application/json' },
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
          headers: { 'content-type': 'application/json' },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    const result = await gateway.listCatalogs({
      siteId: '14',
      contentType: 'Image',
      searchKeyword: '首页',
    })

    expect(result.items).toEqual([
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
    ])
    expect(result.tree).toEqual([
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
    ])
    expect(requestedUrls).toEqual([
      'https://demo.zving.com/manager/api/catalogsTree?siteID=14&contentType=Image&keyword=%E9%A6%96%E9%A1%B5',
      'https://demo.zving.com/manager/api/catalogs?siteID=14&level=All&pageIndex=0&pageSize=500',
      'https://demo.zving.com/manager/api/sites',
    ])
  })

  test('preserves catalogsTree hierarchy when catalog metadata has conflicting parent fields', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const requestedUrls: string[] = []
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requestedUrls.push(url)
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({
        Accept: 'application/json',
        Authorization: 'Bearer slim-token',
      })

      if (url === 'https://demo.zving.com/manager/api/catalogsTree?siteID=14') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              ID: 100,
              parentID: 0,
              name: 'Root',
              children: [
                {
                  ID: 101,
                  parentID: 100,
                  name: 'Child',
                },
              ],
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/catalogs?siteID=14&level=All&pageIndex=0&pageSize=500') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 100,
              parentID: 0,
              name: 'Root metadata',
              listLink: 'https://site14.example.com/root/',
            },
            {
              id: 101,
              parentID: 999,
              name: 'Child metadata',
              listLink: 'https://site14.example.com/child/',
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    const result = await gateway.listCatalogs({ siteId: '14' })

    expect(result.items.map((item) => [item.id, item.parentId])).toEqual([
      ['100', null],
      ['101', '100'],
    ])
    expect(result.tree).toEqual([
      expect.objectContaining({
        id: '100',
        parentId: null,
        children: [
          expect.objectContaining({
            id: '101',
            parentId: '100',
            children: [],
          }),
        ],
      }),
    ])
    expect(requestedUrls).toEqual([
      'https://demo.zving.com/manager/api/catalogsTree?siteID=14',
      'https://demo.zving.com/manager/api/catalogs?siteID=14&level=All&pageIndex=0&pageSize=500',
    ])
  })

  test('defaults siteId to 1 when a catalog request omits it', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://demo.zving.com/manager/api/catalogsTree?siteID=1')
      return new Response(JSON.stringify({
        status: 1,
        data: [],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    await expect(gateway.listCatalogs()).resolves.toEqual({
      items: [],
      tree: [],
    })
  })

  test('lists fixed catalog ids through exact-id reads, preserves order, and drops invalid ids', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const requestedUrls: string[] = []
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)

      if (url === 'https://demo.zving.com/manager/api/catalogs?siteID=14&id=102&level=CurrentAndChild') {
        return new Response(JSON.stringify({
          status: 1,
          data: {
            id: 102,
            parentID: 0,
            path: 'brand/',
            listLink: 'https://site14.example.com/brand/list.shtml',
            link: 'https://site14.example.com/brand/',
            logoFile: 'upload/resources/image/brand.png',
            siteID: 14,
            name: '品牌素材',
            contentType: 'Image',
            contentTypeName: '图片',
            hasChild: false,
            total: 2,
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/catalogs?siteID=14&id=999&level=CurrentAndChild') {
        return new Response(JSON.stringify({
          status: 1,
          data: [],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
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
              link: 'https://site14.example.com/news/',
              logoFile: 'https://cdn.example.com/news.png',
              siteID: 14,
              name: '新闻中心',
              contentType: 'Article',
              contentTypeName: '文章',
              hasChild: false,
              total: 8,
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
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
          headers: { 'content-type': 'application/json' },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    const result = await gateway.listCatalogs({
      siteId: '14',
      ids: ['102', '999', '101'],
    })

    expect(result).toEqual({
      items: [
        {
          id: '102',
          name: '品牌素材',
          parentId: null,
          path: 'https://site14.example.com/brand/list.shtml',
          contentType: 'Image',
          contentTypeName: '图片',
          logoUrl: 'https://site14.example.com/upload/resources/image/brand.png',
          hasChild: false,
          total: 2,
          children: [],
        },
        {
          id: '101',
          name: '新闻中心',
          parentId: null,
          path: 'https://site14.example.com/news/',
          contentType: 'Article',
          contentTypeName: '文章',
          logoUrl: 'https://cdn.example.com/news.png',
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
          path: 'https://site14.example.com/brand/list.shtml',
          contentType: 'Image',
          contentTypeName: '图片',
          logoUrl: 'https://site14.example.com/upload/resources/image/brand.png',
          hasChild: false,
          total: 2,
          children: [],
        },
        {
          id: '101',
          name: '新闻中心',
          parentId: null,
          path: 'https://site14.example.com/news/',
          contentType: 'Article',
          contentTypeName: '文章',
          logoUrl: 'https://cdn.example.com/news.png',
          hasChild: false,
          total: 8,
          children: [],
        },
      ],
    })
    expect(requestedUrls).toEqual([
      'https://demo.zving.com/manager/api/catalogs?siteID=14&id=102&level=CurrentAndChild',
      'https://demo.zving.com/manager/api/catalogs?siteID=14&id=999&level=CurrentAndChild',
      'https://demo.zving.com/manager/api/catalogs?siteID=14&id=101&level=CurrentAndChild',
      'https://demo.zving.com/manager/api/sites',
    ])
    expect(requestedUrls.some((url) => url.includes('/api/catalogsTree'))).toBe(false)
  })

  test('assembles catalog detail from the slim catalogs endpoint', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const requestedUrls: string[] = []
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requestedUrls.push(url)
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({
        Accept: 'application/json',
        Authorization: 'Bearer slim-token',
      })

      if (url === 'https://demo.zving.com/manager/api/catalogs?siteID=14&level=All&pageIndex=0&pageSize=500') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 100,
              name: '首页',
              alias: 'home',
            },
            {
              id: 17765,
              innerCode: '002676000004',
              status: '20',
              name: '文章',
              alias: 'lbt_wz',
              contentType: 'Article',
              info: '栏目描述',
              logoFile: 'upload/resources/image/logo.png',
              siteID: 14,
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url === 'https://demo.zving.com/manager/api/sites') {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 14,
              name: '新闻站',
              url: 'https://site14.example.com',
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    const result = await gateway.getCatalogDetail('17765', '14')

    expect(result).toEqual({
      id: '17765',
      innerCode: '002676000004',
      statusCode: 20,
      statusLabel: '启用',
      name: '文章',
      alias: 'lbt_wz',
      contentType: 'Article',
      contentTypeName: '文章',
      description: '栏目描述',
      logoUrl: 'https://site14.example.com/upload/resources/image/logo.png',
    })
    expect(requestedUrls).toEqual([
      'https://demo.zving.com/manager/api/catalogs?siteID=14&level=All&pageIndex=0&pageSize=500',
      'https://demo.zving.com/manager/api/sites',
    ])
  })

  test('continues catalog pagination when a full page is returned without total metadata', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      id: index + 1,
      name: `栏目${index + 1}`,
    }))
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('pageIndex=0&pageSize=500')) {
        return new Response(JSON.stringify({
          status: 1,
          data: firstPage,
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.endsWith('pageIndex=1&pageSize=500')) {
        return new Response(JSON.stringify({
          status: 1,
          data: [
            {
              id: 501,
              innerCode: '002676000501',
              status: '20',
              name: '第二页栏目',
              alias: 'page-2',
              contentType: 'Article',
            },
          ],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    const result = await gateway.getCatalogDetail('501', '14')

    expect(result).toMatchObject({
      id: '501',
      name: '第二页栏目',
      alias: 'page-2',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('normalizes slim cms content records into base summaries only', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const requestedUrls: string[] = []
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requestedUrls.push(url)
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({
        Accept: 'application/json',
        Authorization: 'Bearer slim-token',
      })

      if (url === 'https://demo.zving.com/manager/api/catalogs/101/contents?siteID=14&pageIndex=0&pageSize=20&loadextend=true&keyword=banner') {
        return new Response(JSON.stringify({
          status: 1,
          data: {
            pageIndex: 0,
            pageSize: 20,
            total: 2,
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
                quantity: 3,
                logoMode: 1,
                extendJSON: {
                  images: [
                    { url: 'https://cdn.example.com/banner-1.jpg' },
                  ],
                },
              },
              {
                id: 502,
                catalogID: 101,
                title: '品牌素材包',
                summary: '包含视频、音频和附件',
                logoFile: 'https://cdn.example.com/brand.png',
                url: 'https://demo.zving.com/home/banner/502.html',
                publishDate: '2025-04-12 10:08:00',
              },
            ],
          },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
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
          headers: { 'content-type': 'application/json' },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    const result = await gateway.listContents({
      siteId: '14',
      catalogId: '101',
      keyword: 'banner',
      pageIndex: 0,
      pageSize: 20,
    })

    expect(result).toEqual({
      pageIndex: 0,
      pageSize: 20,
      total: 2,
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
        {
          id: '502',
          catalogId: '101',
          title: '品牌素材包',
          summary: '包含视频、音频和附件',
          listLogoUrl: 'https://cdn.example.com/brand.png',
          addedAt: '2025-04-12 10:08',
          publishUrl: 'https://demo.zving.com/home/banner/502.html',
        },
      ],
    })
    expect(requestedUrls).toEqual([
      'https://demo.zving.com/manager/api/catalogs/101/contents?siteID=14&pageIndex=0&pageSize=20&loadextend=true&keyword=banner',
      'https://demo.zving.com/manager/api/sites',
    ])
  })

  test('lists fixed content ids through a single catalog list load, preserves order, and drops invalid ids', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const requestedUrls: string[] = []
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requestedUrls.push(url)

      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({
        Accept: 'application/json',
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
          headers: { 'content-type': 'application/json' },
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
          headers: { 'content-type': 'application/json' },
        })
      }

      throw new Error(`unexpected request: ${url}`)
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    const result = await gateway.listContents({
      siteId: '14',
      catalogId: '101',
      ids: ['502', '999', '501'],
    })

    expect(result).toEqual({
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
    expect(requestedUrls).toEqual([
      'https://demo.zving.com/manager/api/catalogs/101/contents?siteID=14&pageIndex=0&pageSize=100&loadextend=true',
      'https://demo.zving.com/manager/api/sites',
    ])
  })

  test('keeps normalized summaries unchanged when loadextend-style fields appear upstream', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const fetchMock = mock(async () => {
      const includeExtendFields = fetchMock.mock.calls.length === 1

      return new Response(JSON.stringify({
        status: 1,
        data: {
          pageIndex: 0,
          pageSize: 20,
          total: 1,
          data: [
            {
              id: 501,
              catalogID: 101,
              title: '首页轮播图',
              summary: '三张首页图片',
              logoFile: 'https://cdn.example.com/banner-list-logo.jpg',
              link: 'https://demo.zving.com/home/banner/501.html',
              addTime: '2025-04-11 17:48:06',
              ...(includeExtendFields
                ? {
                    extendJSON: {
                      images: [{ url: 'https://cdn.example.com/banner-1.jpg' }],
                    },
                    quantity: 3,
                    logoMode: 1,
                  }
                : {}),
            },
          ],
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    const withExtend = await gateway.listContents({
      siteId: '14',
      catalogId: '101',
      pageIndex: 0,
      pageSize: 20,
    })
    const withoutExtend = await gateway.listContents({
      siteId: '14',
      catalogId: '101',
      pageIndex: 0,
      pageSize: 20,
    })

    expect(withExtend).toEqual(withoutExtend)
  })

  test('falls back to the requested pagination when the cms content response only returns a top-level data array', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const fetchMock = mock(async () => new Response(JSON.stringify({
      status: 1,
      total: 35,
      data: [
        {
          ID: 701,
          catalogID: 101,
          title: '第六页内容 1',
        },
        {
          ID: 702,
          catalogID: 101,
          title: '第六页内容 2',
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    const result = await gateway.listContents({
      siteId: '14',
      catalogId: '101',
      pageIndex: 5,
      pageSize: 6,
    })

    expect(result.pageIndex).toBe(5)
    expect(result.pageSize).toBe(6)
    expect(result.total).toBe(35)
    expect(result.totalPages).toBe(6)
    expect(result.items).toEqual([
      {
        id: '701',
        catalogId: '101',
        title: '第六页内容 1',
        summary: '',
        publishUrl: '',
      },
      {
        id: '702',
        catalogId: '101',
        title: '第六页内容 2',
        summary: '',
        publishUrl: '',
      },
    ])
  })

  test('sanitizes cms auth failures without leaking raw credentials or bearer tokens', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const fetchMock = mock(async () => new Response(JSON.stringify({
      status: 0,
      message: '401 Unauthorized: Authorization Bearer slim-token username=test-user password=test-pass',
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }))

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    try {
      await gateway.listCatalogs({ siteId: '14' })
      throw new Error('expected listCatalogs to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      const message = (error as Error).message
      expect(message).toContain('CMS 鉴权失败')
      expect(message).not.toContain('slim-token')
      expect(message).not.toContain('test-user')
      expect(message).not.toContain('test-pass')
    }
  })

  test('maps listCatalogs network failures to CmsGatewayError upstream errors', async () => {
    const { CmsGateway, CmsGatewayError } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const fetchMock = mock(async () => {
      throw new Error('socket hang up')
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    await expect(gateway.listCatalogs({ siteId: '14' })).rejects.toMatchObject({
      name: 'CmsGatewayError',
      code: 'upstream',
      message: 'CMS 请求失败：socket hang up',
    } satisfies Pick<InstanceType<typeof CmsGatewayError>, 'name' | 'code' | 'message'>)
  })

  test('fetches cms assets without auth headers and preserves query strings', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        'https://demo.zving.com/preview/news/upload/resources/image/banner-list-logo.jpg?width=480&height=320',
      )
      expect(init?.method).toBe('GET')
      expect(init?.headers).toBeUndefined()

      return new Response('logo-binary', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    const response = await gateway.fetchAsset(
      'https://demo.zving.com/preview/news/upload/resources/image/banner-list-logo.jpg?width=480&height=320',
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('logo-binary')
    expect(tokenProvider.getAuthorizationHeader).not.toHaveBeenCalled()
  })

  test('fetches root-relative /assets resources from the cms origin root', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://demo.zving.com/assets/images/addpicture.png')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toBeUndefined()

      return new Response('asset-binary', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    const response = await gateway.fetchAsset('/assets/images/addpicture.png')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('asset-binary')
    expect(tokenProvider.getAuthorizationHeader).not.toHaveBeenCalled()
  })

  test('fetches absolute http assets from other origins through the cms asset proxy', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://cdn.example.com/images/banner.png')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toBeUndefined()

      return new Response('external-asset', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    const response = await gateway.fetchAsset('https://cdn.example.com/images/banner.png')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('external-asset')
    expect(tokenProvider.getAuthorizationHeader).not.toHaveBeenCalled()
  })

  test('maps fetchAsset network failures to CmsGatewayError upstream errors', async () => {
    const { CmsGateway, CmsGatewayError } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const tokenProvider = {
      getAuthorizationHeader: mock(async () => 'Bearer slim-token'),
    }
    const fetchMock = mock(async () => {
      throw new Error('connect ECONNRESET')
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
      tokenProvider,
    })

    await expect(gateway.fetchAsset('https://demo.zving.com/preview/news/upload/resources/image/banner.jpg')).rejects.toMatchObject({
      name: 'CmsGatewayError',
      code: 'upstream',
      message: 'CMS 资源请求失败：connect ECONNRESET',
    } satisfies Pick<InstanceType<typeof CmsGatewayError>, 'name' | 'code' | 'message'>)
  })
})
