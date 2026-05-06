import { describe, expect, test } from 'bun:test'
import type { PageBuilderCmsCatalog, PageBuilderCmsContentSummary } from '@ai-page-builder/shared'
import { mapCatalog } from './catalog'
import { mapContent } from './content'

const SAMPLE_CATALOG: PageBuilderCmsCatalog = {
  id: 'root',
  name: '首页',
  parentId: null,
  path: '/home',
  contentType: 'Article',
  contentTypeName: '文章',
  logoUrl: 'https://example.com/catalog-root.png',
  hasChild: true,
  total: 6,
  children: [
    {
      id: 'child',
      name: '新闻',
      parentId: 'root',
      path: '/home/news',
      contentType: 'Article',
      contentTypeName: '文章',
      logoUrl: 'https://example.com/catalog-child.png',
      hasChild: true,
      total: 3,
      children: [
        {
          id: 'grandchild',
          name: '专题',
          parentId: 'child',
          path: '/home/news/topic',
          contentType: 'Article',
          contentTypeName: '文章',
          hasChild: false,
          total: 1,
          children: [],
        },
      ],
    },
  ],
}

const SAMPLE_CONTENT: PageBuilderCmsContentSummary = {
  id: 'content-1',
  catalogId: 'news',
  title: 'Launch Update',
  summary: 'Quarterly launch update',
  listLogoUrl: 'https://example.com/logo.png',
  addedAt: '2026-04-11T08:00:00.000Z',
  publishUrl: 'https://example.com/news/launch-update',
}

describe('viewmodel mappers', () => {
  test('mapCatalog preserves recursive children', () => {
    expect(mapCatalog(SAMPLE_CATALOG)).toEqual({
      id: 'root',
      name: '首页',
      path: '/home',
      parentId: null,
      logoUrl: 'https://example.com/catalog-root.png',
      hasChild: true,
      total: 6,
      contentType: 'Article',
      contentTypeName: '文章',
      children: [
        {
          id: 'child',
          name: '新闻',
          path: '/home/news',
          parentId: 'root',
          logoUrl: 'https://example.com/catalog-child.png',
          hasChild: true,
          total: 3,
          contentType: 'Article',
          contentTypeName: '文章',
          children: [
            {
              id: 'grandchild',
              name: '专题',
              path: '/home/news/topic',
              parentId: 'child',
              logoUrl: undefined,
              hasChild: false,
              total: 1,
              contentType: 'Article',
              contentTypeName: '文章',
              children: [],
            },
          ],
        },
      ],
    })
  })

  test('mapContent exposes the stable content viewmodel fields', () => {
    expect(mapContent(SAMPLE_CONTENT)).toEqual({
      id: 'content-1',
      catalogId: 'news',
      title: 'Launch Update',
      summary: 'Quarterly launch update',
      publishUrl: 'https://example.com/news/launch-update',
      listLogoUrl: 'https://example.com/logo.png',
      addedAt: '2026-04-11T08:00:00.000Z',
    })
  })
})
