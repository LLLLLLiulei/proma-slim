import { describe, expect, test } from 'bun:test'
import { createCatalogDisplayOptions, createContentQuery } from './helpers'

describe('CMS component helpers', () => {
  test('rejects malformed numeric props instead of partially parsing them', () => {
    expect(
      createContentQuery({
        catalogId: 'news',
        pageIndex: '0foo',
        pageSize: '2.5',
      }),
    ).toEqual({
      catalogId: 'news',
      contentSelectType: undefined,
      keyword: undefined,
      title: undefined,
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
})
