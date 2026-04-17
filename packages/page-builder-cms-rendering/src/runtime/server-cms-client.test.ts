import { describe, expect, test } from 'bun:test'
import type {
  PageBuilderCmsCatalogList,
  PageBuilderCmsContentList,
  PageBuilderCmsContentQuery,
} from '@proma/shared'
import { createServerCmsClient } from './server-cms-client'

const CATALOG_RESPONSE: PageBuilderCmsCatalogList = {
  items: [
    {
      id: 'news',
      name: '新闻',
      parentId: null,
      path: '/news',
      contentType: 'Article',
      contentTypeName: '文章',
      hasChild: false,
      total: 2,
      children: [],
    },
  ],
  tree: [
    {
      id: 'news',
      name: '新闻',
      parentId: null,
      path: '/news',
      contentType: 'Article',
      contentTypeName: '文章',
      hasChild: false,
      total: 2,
      children: [],
    },
  ],
}

function createContentResponse(query: PageBuilderCmsContentQuery): PageBuilderCmsContentList {
  const sourceCatalogId = query.catalogId ?? query.ids?.[0] ?? 'fixed'
  const sourceLabel = query.ids?.join(',') ?? query.catalogId ?? 'fixed'

  return {
    pageIndex: query.pageIndex ?? 0,
    pageSize: query.pageSize ?? 20,
    total: 1,
    totalPages: 1,
    items: [
      {
        id: `${sourceLabel}-${query.pageIndex ?? 0}-${query.pageSize ?? 20}-${query.keyword ?? 'none'}`,
        catalogId: sourceCatalogId,
        title: `title:${sourceLabel}:${query.pageIndex ?? 0}:${query.pageSize ?? 20}:${query.keyword ?? 'none'}`,
        summary: 'summary',
        publishUrl: 'https://example.com/content',
        listLogoUrl: 'https://cms.example.com/logo.png',
      },
    ],
  }
}

describe('createServerCmsClient', () => {
  test('reuses identical content queries within one task-scoped cache', async () => {
    let contentCalls = 0
    const client = createServerCmsClient({
      adapter: {
        async listCatalogs() {
          return CATALOG_RESPONSE
        },
        async listContents(query) {
          contentCalls += 1
          await Promise.resolve()
          return createContentResponse(query)
        },
      },
    })

    const query = {
      catalogId: 'news',
      pageIndex: 0,
      pageSize: 2,
      keyword: 'launch',
    }

    const [first, second] = await Promise.all([
      client.listContents(query),
      client.listContents({ ...query }),
    ])

    expect(contentCalls).toBe(1)
    expect(first).toEqual(second)
  })

  test('separates different transport queries so pageIndex=0 and pageIndex=1 do not collide', async () => {
    const seenQueries: PageBuilderCmsContentQuery[] = []
    const client = createServerCmsClient({
      adapter: {
        async listCatalogs() {
          return CATALOG_RESPONSE
        },
        async listContents(query) {
          seenQueries.push(query)
          return createContentResponse(query)
        },
      },
    })

    const first = await client.listContents({
      catalogId: 'news',
      pageIndex: 0,
      pageSize: 1,
    })
    const second = await client.listContents({
      catalogId: 'news',
      pageIndex: 1,
      pageSize: 1,
    })

    expect(seenQueries).toHaveLength(2)
    expect(first.items[0]?.title).toBe('title:news:0:1:none')
    expect(second.items[0]?.title).toBe('title:news:1:1:none')
  })

  test('keeps ordered fixed ids in the cache key so different id orders do not collide', async () => {
    const seenQueries: PageBuilderCmsContentQuery[] = []
    const client = createServerCmsClient({
      adapter: {
        async listCatalogs() {
          return CATALOG_RESPONSE
        },
        async listContents(query) {
          seenQueries.push(query)
          return createContentResponse(query)
        },
      },
    })

    const first = await client.listContents({
      siteId: '14',
      catalogId: 'news',
      ids: ['content-2', 'content-1'],
    })
    const second = await client.listContents({
      siteId: '14',
      catalogId: 'news',
      ids: ['content-1', 'content-2'],
    })

    expect(seenQueries).toEqual([
      { siteId: '14', catalogId: 'news', ids: ['content-2', 'content-1'] },
      { siteId: '14', catalogId: 'news', ids: ['content-1', 'content-2'] },
    ])
    expect(first.items[0]?.title).toContain('content-2,content-1')
    expect(second.items[0]?.title).toContain('content-1,content-2')
  })

  test('does not share cached catalog results across different export tasks', async () => {
    let catalogCalls = 0
    const adapter = {
      async listCatalogs() {
        catalogCalls += 1
        return CATALOG_RESPONSE
      },
      async listContents(query: PageBuilderCmsContentQuery) {
        return createContentResponse(query)
      },
    }

    const firstTaskClient = createServerCmsClient({ adapter })
    const secondTaskClient = createServerCmsClient({ adapter })

    await firstTaskClient.listCatalogs({ contentType: 'Article' })
    await secondTaskClient.listCatalogs({ contentType: 'Article' })

    expect(catalogCalls).toBe(2)
  })
})
