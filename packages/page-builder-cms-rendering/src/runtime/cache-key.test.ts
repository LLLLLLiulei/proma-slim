import { describe, expect, test } from 'bun:test'
import type {
  PageBuilderCmsCatalogQuery,
  PageBuilderCmsContentQuery,
} from '@proma/shared'
import { createCatalogQueryCacheKey, createContentQueryCacheKey } from './cache-key'

describe('cache-key', () => {
  test('keeps equivalent nested runtime queries stable regardless of property order', () => {
    const firstQuery: PageBuilderCmsContentQuery & {
      filters: {
        site: string
        status: string[]
      }
    } = {
      catalogId: 'news',
      keyword: ' launch ',
      pageIndex: 0,
      pageSize: 5,
      filters: {
        site: 'cn',
        status: ['published', 'featured'],
      },
    }

    const secondQuery: PageBuilderCmsContentQuery & {
      filters: {
        status: string[]
        site: string
      }
    } = {
      pageSize: 5,
      pageIndex: 0,
      keyword: 'launch',
      catalogId: 'news',
      filters: {
        status: ['published', 'featured'],
        site: 'cn',
      },
    }

    const first = createContentQueryCacheKey(firstQuery)
    const second = createContentQueryCacheKey(secondQuery)

    expect(first).toBe(second)
  })

  test('includes additional runtime query fields when generating content cache keys', () => {
    const base = createContentQueryCacheKey({
      catalogId: 'news',
      keyword: 'launch',
      pageIndex: 0,
      pageSize: 5,
    })

    const queryWithAdditionalField: PageBuilderCmsContentQuery & {
      filters: {
        site: string
      }
    } = {
      catalogId: 'news',
      keyword: 'launch',
      pageIndex: 0,
      pageSize: 5,
      filters: {
        site: 'cn',
      },
    }

    const withAdditionalField = createContentQueryCacheKey(queryWithAdditionalField)

    expect(withAdditionalField).not.toBe(base)
  })

  test('includes additional runtime query fields when generating catalog cache keys', () => {
    const base = createCatalogQueryCacheKey({
      contentType: 'Article',
      searchKeyword: '首页',
    })

    const queryWithAdditionalField: PageBuilderCmsCatalogQuery & {
      locale: string
    } = {
      searchKeyword: '首页',
      contentType: 'Article',
      locale: 'zh-CN',
    }

    const withAdditionalField = createCatalogQueryCacheKey(queryWithAdditionalField)

    expect(withAdditionalField).not.toBe(base)
  })
})
