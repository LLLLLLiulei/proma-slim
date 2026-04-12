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

  test('throws a descriptive error when a content request fails', async () => {
    const fetchMock = mock(async () => new Response('nope', { status: 502 }))
    const client = createBrowserCmsClient({
      fetchFn: fetchMock as unknown as typeof fetch,
    })

    await expect(client.listContents({ catalogId: 'news' })).rejects.toThrow(
      'Content request failed with HTTP 502',
    )
  })
})
