import { afterEach, describe, expect, mock, test } from 'bun:test'
import { createBrowserCmsClient, DEFAULT_BROWSER_CMS_API_BASE } from './browser-cms-client'

afterEach(() => {
  mock.restore()
})

describe('createBrowserCmsClient', () => {
  test('serializes catalog queries against the default proxy base', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'https://example.com')

      expect(url.pathname).toBe('/api/page-builder/cms/catalogs')
      expect(url.searchParams.get('contentType')).toBe('Article')
      expect(url.searchParams.get('searchKeyword')).toBe('首页')

      return new Response(JSON.stringify({ items: [], tree: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const client = createBrowserCmsClient({
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    const result = await client.listCatalogs({
      contentType: 'Article',
      searchKeyword: '首页',
    })

    expect(DEFAULT_BROWSER_CMS_API_BASE).toBe('/api/page-builder/cms')
    expect(result).toEqual({ items: [], tree: [] })
  })

  test('preserves pageIndex=0 when serializing content queries', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'https://example.com')

      expect(url.pathname).toBe('/api/page-builder/cms/contents')
      expect(url.searchParams.get('catalogId')).toBe('news')
      expect(url.searchParams.get('pageIndex')).toBe('0')
      expect(url.searchParams.get('pageSize')).toBe('5')
      expect(url.searchParams.get('keyword')).toBe('business')

      return new Response(JSON.stringify({
        pageIndex: 0,
        pageSize: 5,
        total: 0,
        totalPages: 0,
        items: [],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const client = createBrowserCmsClient({
      baseUrl: '/api/page-builder/cms/',
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    const result = await client.listContents({
      catalogId: 'news',
      keyword: 'business',
      pageIndex: 0,
      pageSize: 5,
    })

    expect(result.pageIndex).toBe(0)
  })

  test('proxies content list logo images through the cms asset endpoint', async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({
      pageIndex: 0,
      pageSize: 2,
      total: 2,
      totalPages: 1,
      items: [
        {
          id: 'content-1',
          catalogId: 'news',
          title: 'Launch Update',
          summary: 'Quarterly launch update',
          listLogoUrl: 'https://demo.zving.com/zcmstest/preview/news/upload/resources/image/logo.png',
          publishUrl: 'https://demo.zving.com/news/launch-update',
        },
        {
          id: 'content-2',
          catalogId: 'news',
          title: 'Quarterly Results',
          summary: 'Quarterly revenue report',
          publishUrl: 'https://demo.zving.com/news/quarterly-results',
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const client = createBrowserCmsClient({
      baseUrl: '/api/page-builder/cms/',
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    const result = await client.listContents({
      catalogId: 'news',
      pageIndex: 0,
      pageSize: 2,
    })

    expect(result.items[0]?.listLogoUrl).toBe(
      '/api/page-builder/cms/assets?url=https%3A%2F%2Fdemo.zving.com%2Fzcmstest%2Fpreview%2Fnews%2Fupload%2Fresources%2Fimage%2Flogo.png',
    )
    expect(result.items[1]?.listLogoUrl).toBeUndefined()
  })

  test('throws a descriptive error when a content request fails', async () => {
    const fetchMock = mock(async () => new Response('nope', { status: 502 }))
    const client = createBrowserCmsClient({
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    await expect(client.listContents({ catalogId: 'news' })).rejects.toThrow(
      'Content request failed with HTTP 502',
    )
  })

  test('invokes fetch with the global context so native browser fetch remains callable', async () => {
    const fetchMock = mock(async function (this: typeof globalThis, input: RequestInfo | URL) {
      expect(this).toBe(globalThis)

      const url = new URL(String(input), 'https://example.com')
      expect(url.pathname).toBe('/api/page-builder/cms/catalogs')

      return new Response(JSON.stringify({ items: [], tree: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const client = createBrowserCmsClient({
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    await expect(client.listCatalogs()).resolves.toEqual({ items: [], tree: [] })
  })
})
