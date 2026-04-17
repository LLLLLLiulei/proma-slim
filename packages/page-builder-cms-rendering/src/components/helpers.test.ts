import { describe, expect, test } from 'bun:test'
import { createCatalogDisplayOptions, createCatalogQuery, createContentQuery } from './helpers'

describe('CMS component helpers', () => {
  test('rejects malformed numeric props instead of partially parsing them', () => {
    expect(
      createContentQuery({
        catalogId: 'news',
        pageIndex: '0foo',
        pageSize: '2.5',
      }),
    ).toEqual({
      siteId: '1',
      catalogId: 'news',
      keyword: undefined,
      pageIndex: undefined,
      pageSize: undefined,
    })

    expect(
      createCatalogDisplayOptions({
        level: 'children',
        parentId: 'root',
        take: '08px',
      }),
    ).toEqual({
      level: 'children',
      parentId: 'root',
      take: undefined,
    })
  })

  test('normalizes ordered ids for fixed-id catalog and content queries', () => {
    expect(
      createCatalogQuery({
        siteId: '14',
        ids: 'cat-b, cat-a ,, cat-c',
      }),
    ).toEqual({
      siteId: '14',
      ids: ['cat-b', 'cat-a', 'cat-c'],
      contentType: undefined,
      searchKeyword: undefined,
    })

    expect(
      createContentQuery({
        siteId: '14',
        ids: 'n-2, n-1',
        catalogId: 'news',
      }),
    ).toEqual({
      siteId: '14',
      ids: ['n-2', 'n-1'],
      catalogId: 'news',
      keyword: undefined,
      pageIndex: undefined,
      pageSize: undefined,
    })
  })
})
