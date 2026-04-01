import { afterEach, describe, expect, mock, test } from 'bun:test'

const TEST_ENV = {
  PROMA_CMS_BASE_URL: 'https://demo.zving.com/zcmstest/',
  PROMA_CMS_ZUSID: 'test-zusid',
  PROMA_CMS_CURRENT_SITE: '277',
} as const

afterEach(() => {
  mock.restore()
})

describe('CmsGateway', () => {
  test('resolves host cms config from env with normalized base url and stable headers', async () => {
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')

    const config = resolvePageBuilderCmsConfig(TEST_ENV)

    expect(config).toMatchObject({
      baseUrl: 'https://demo.zving.com/zcmstest',
      zusid: 'test-zusid',
      currentSite: '277',
      headers: {
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        Pragma: 'no-cache',
      },
    })
    expect(config?.headers.Referer).toBe('https://demo.zving.com/zcmstest/app.html')
    expect(config?.headers['User-Agent']).toContain('Proma CMS Runtime')
  })

  test('lists catalogs with host-managed cookies and returns a normalized catalog tree', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        'https://demo.zving.com/zcmstest/ui/dimensions/1/catalogs?contentType=Image&searchKeyWord=%E9%A6%96%E9%A1%B5',
      )
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({
        Cookie: 'ZUSID=test-zusid; CurrentSite=277',
        Accept: '*/*',
        Referer: 'https://demo.zving.com/zcmstest/app.html',
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
        headers: { 'content-type': 'application/json' },
      })
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    const result = await gateway.listCatalogs({
      contentType: 'Image',
      searchKeyword: '首页',
    })

    expect(result.tree).toEqual([
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
    ])
  })

  test('preserves nested catalog children returned by the cms response', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const fetchMock = mock(async () => new Response(JSON.stringify({
      status: 1,
      data: [
        {
          ID: 17677,
          parentID: 0,
          path: 'lbt/',
          name: '轮播图',
          contentType: '',
          contentTypeName: '',
          hasChild: true,
          total: 15,
          children: [
            {
              ID: 17765,
              parentID: 17677,
              path: 'lbt/wz/',
              name: '文章',
              contentType: 'Article',
              contentTypeName: '文章',
              hasChild: false,
              total: 11,
            },
          ],
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    const result = await gateway.listCatalogs()

    expect(result.items).toEqual([
      {
        id: '17677',
        name: '轮播图',
        parentId: null,
        path: 'lbt/',
        contentType: '',
        contentTypeName: '',
        hasChild: true,
        total: 15,
        children: [],
      },
      {
        id: '17765',
        name: '文章',
        parentId: '17677',
        path: 'lbt/wz/',
        contentType: 'Article',
        contentTypeName: '文章',
        hasChild: false,
        total: 11,
        children: [],
      },
    ])
    expect(result.tree).toEqual([
      {
        id: '17677',
        name: '轮播图',
        parentId: null,
        path: 'lbt/',
        contentType: '',
        contentTypeName: '',
        hasChild: true,
        total: 15,
        children: [
          {
            id: '17765',
            name: '文章',
            parentId: '17677',
            path: 'lbt/wz/',
            contentType: 'Article',
            contentTypeName: '文章',
            hasChild: false,
            total: 11,
            children: [],
          },
        ],
      },
    ])
  })

  test('normalizes cms catalog detail records into readonly detail fields', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://demo.zving.com/zcmstest/ui/catalogs/17765')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toMatchObject({
        Cookie: 'ZUSID=test-zusid; CurrentSite=277',
        Accept: '*/*',
        Referer: 'https://demo.zving.com/zcmstest/app.html',
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
        headers: { 'content-type': 'application/json' },
      })
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    const result = await gateway.getCatalogDetail('17765')

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
      logoUrl: 'https://demo.zving.com/zcmstest/assets/images/addpicture.png',
    })
  })

  test('sanitizes cms auth failures without leaking raw cookie values', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const fetchMock = mock(async () => new Response(JSON.stringify({
      status: 0,
      message: '401 Unauthorized: cookie=ZUSID=test-zusid',
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }))

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    try {
      await gateway.listCatalogs()
      throw new Error('expected listCatalogs to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      const message = (error as Error).message
      expect(message).toContain('CMS 鉴权失败')
      expect(message).not.toContain('test-zusid')
      expect(message).not.toContain('cookie=')
    }
  })

  test('normalizes cms content records into stable summaries, asset counts, and shapes', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        'https://demo.zving.com/zcmstest/ui/contentcore/contents?catalogID=101&contentSelectType=&keyWord=&title=&pageIndex=0&pageSize=20',
      )

      return new Response(JSON.stringify({
        status: 1,
        data: {
          pageIndex: 0,
          pageSize: 20,
          total: 2,
          list: [
            {
              ID: 501,
              catalogID: 101,
              title: '首页轮播图',
              summary: '三张首页图片',
              listLogo: 'https://demo.zving.com/zcmstest/preview/news/upload/resources/image/banner-list-logo.jpg',
              link: 'https://demo.zving.com/home/banner/501.html',
              addTime: '2025-04-11 17:48:06',
              imagesTotal: 3,
              audiosTotal: 0,
              videosTotal: 0,
              filesTotal: 0,
              extendJSON: JSON.stringify({
                images: [
                  { url: 'https://cdn.example.com/banner-1.jpg' },
                  { url: 'https://cdn.example.com/banner-2.jpg' },
                ],
              }),
            },
            {
              id: 502,
              catalogId: 101,
              title: '品牌素材包',
              description: '包含视频、音频和附件',
              url: 'https://demo.zving.com/home/banner/502.html',
              imagesTotal: 0,
              videosTotal: 1,
              filesTotal: 1,
              extendJSON: {
                audios: [{ url: 'https://cdn.example.com/brand.mp3' }],
                videos: [{ url: 'https://cdn.example.com/brand.mp4' }],
                attachments: [{ url: 'https://cdn.example.com/brand.zip' }],
              },
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
    })

    const result = await gateway.listContents({
      catalogId: '101',
      pageIndex: 0,
      pageSize: 20,
    })

    expect(result).toMatchObject({
      pageIndex: 0,
      pageSize: 20,
      total: 2,
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
            images: [
              { url: 'https://cdn.example.com/banner-1.jpg' },
              { url: 'https://cdn.example.com/banner-2.jpg' },
            ],
          },
        },
        {
          id: '502',
          catalogId: '101',
          title: '品牌素材包',
          summary: '包含视频、音频和附件',
          publishUrl: 'https://demo.zving.com/home/banner/502.html',
          shape: 'mixed',
          assetCounts: {
            images: 0,
            audios: 1,
            videos: 1,
            files: 1,
          },
        },
      ],
    })
  })

  test('falls back to the requested pagination when the cms content response only returns a top-level data array', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
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
        {
          ID: 703,
          catalogID: 101,
          title: '第六页内容 3',
        },
        {
          ID: 704,
          catalogID: 101,
          title: '第六页内容 4',
        },
        {
          ID: 705,
          catalogID: 101,
          title: '第六页内容 5',
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    const result = await gateway.listContents({
      catalogId: '101',
      pageIndex: 5,
      pageSize: 6,
    })

    expect(result.pageIndex).toBe(5)
    expect(result.pageSize).toBe(6)
    expect(result.total).toBe(35)
    expect(result.totalPages).toBe(6)
    expect(result.items).toHaveLength(5)
  })

  test('does not treat successful content payload text as an auth failure', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const fetchMock = mock(async () => new Response(JSON.stringify({
      status: 1,
      data: {
        total: 1,
        list: [
          {
            ID: 901,
            catalogID: 101,
            title: '权限说明',
            summary: '正文里包含权限字样，但这仍然是成功内容响应。',
            publishUrl: 'https://demo.zving.com/home/banner/901.html',
            imagesTotal: 0,
            audiosTotal: 0,
            videosTotal: 0,
            filesTotal: 0,
          },
        ],
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    const result = await gateway.listContents({ catalogId: '101' })

    expect(result.total).toBe(1)
    expect(result.items).toEqual([
      {
        id: '901',
        catalogId: '101',
        title: '权限说明',
        summary: '正文里包含权限字样，但这仍然是成功内容响应。',
        publishUrl: 'https://demo.zving.com/home/banner/901.html',
        shape: 'single-article',
        assetCounts: {
          images: 0,
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
    ])
  })

  test('allows fetching same-origin cms assets outside the base path', async () => {
    const { CmsGateway } = await import('./cms-gateway')
    const { resolvePageBuilderCmsConfig } = await import('./page-builder-cms-config')
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://demo.zving.com/assets/images/addpicture.png')

      return new Response('logo-binary', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    })

    const gateway = new CmsGateway({
      config: resolvePageBuilderCmsConfig(TEST_ENV)!,
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    const response = await gateway.fetchAsset('https://demo.zving.com/assets/images/addpicture.png')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('logo-binary')
  })
})
