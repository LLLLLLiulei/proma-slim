import { describe, expect, test } from 'bun:test'
import { renderToString } from '@vue/server-renderer'
import type {
  PageBuilderCmsCatalogList,
  PageBuilderCmsContentList,
  PageBuilderCmsContentQuery,
} from '@proma/shared'
import { createSSRApp, h, type Component } from 'vue'
import { CMS_RUNTIME_CLIENT_KEY, type CmsRuntimeClient, type CmsSlotScope } from '../runtime/cms-runtime-client'
import { CmsCatalog } from './cms-catalog'
import { CmsContent } from './cms-content'

const CATALOG_RESPONSE: PageBuilderCmsCatalogList = {
  items: [
    {
      id: 'root',
      name: '首页',
      parentId: null,
      path: '/home',
      contentType: 'Article',
      contentTypeName: '文章',
      hasChild: true,
      total: 3,
      children: [],
    },
    {
      id: 'news',
      name: '新闻',
      parentId: 'root',
      path: '/home/news',
      contentType: 'Article',
      contentTypeName: '文章',
      hasChild: true,
      total: 2,
      children: [],
    },
    {
      id: 'events',
      name: '活动',
      parentId: 'root',
      path: '/home/events',
      contentType: 'Article',
      contentTypeName: '文章',
      hasChild: false,
      total: 1,
      children: [],
    },
  ],
  tree: [
    {
      id: 'root',
      name: '首页',
      parentId: null,
      path: '/home',
      contentType: 'Article',
      contentTypeName: '文章',
      hasChild: true,
      total: 3,
      children: [
        {
          id: 'news',
          name: '新闻',
          parentId: 'root',
          path: '/home/news',
          contentType: 'Article',
          contentTypeName: '文章',
          hasChild: true,
          total: 2,
          children: [
            {
              id: 'deep-news',
              name: '深度报道',
              parentId: 'news',
              path: '/home/news/deep',
              contentType: 'Article',
              contentTypeName: '文章',
              hasChild: false,
              total: 1,
              children: [],
            },
          ],
        },
        {
          id: 'events',
          name: '活动',
          parentId: 'root',
          path: '/home/events',
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

const CONTENT_RESPONSE: PageBuilderCmsContentList = {
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
      publishUrl: 'https://example.com/news/launch-update',
      listLogoUrl: 'https://example.com/logo.png',
      addedAt: '2026-04-11T08:00:00.000Z',
      shape: 'single-article',
      assetCounts: {
        images: 1,
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
    {
      id: 'content-2',
      catalogId: 'news',
      title: 'Quarterly Results',
      summary: 'Quarterly revenue report',
      publishUrl: 'https://example.com/news/quarterly-results',
      shape: 'single-article',
      assetCounts: {
        images: 0,
        audios: 0,
        videos: 0,
        files: 1,
      },
      assetHints: {
        images: [],
        audios: [],
        videos: [],
        files: [],
      },
    },
  ],
}

function createClient(overrides: Partial<CmsRuntimeClient> = {}): CmsRuntimeClient {
  return {
    async listCatalogs() {
      return CATALOG_RESPONSE
    },
    async listContents() {
      return CONTENT_RESPONSE
    },
    ...overrides,
  }
}

async function renderCmsComponent(
  component: Component,
  props: Record<string, unknown>,
  slots: Record<string, (scope: CmsSlotScope<any>) => ReturnType<typeof h>>,
  client: CmsRuntimeClient,
) {
  const app = createSSRApp({
    render: () => h(component, props, slots),
  })

  app.provide(CMS_RUNTIME_CLIENT_KEY, client)

  return renderToString(app)
}

describe('CMS rendering components', () => {
  test('cms-content renders the default slot and preserves pageIndex=0 query semantics', async () => {
    let capturedQuery: PageBuilderCmsContentQuery | null = null
    const client = createClient({
      async listContents(query) {
        capturedQuery = query
        return CONTENT_RESPONSE
      },
    })

    const html = await renderCmsComponent(
      CmsContent,
      {
        catalogId: 'news',
        pageIndex: '0',
        pageSize: '2',
      },
      {
        default: (scope) =>
          h('section', { 'data-state': `${scope.loading}:${scope.empty}:${scope.error ? 'yes' : 'no'}` }, [
            h('h2', scope.items[0]?.title ?? 'missing'),
            h('p', scope.items[1]?.title ?? 'missing'),
          ]),
      },
      client,
    )

    expect(capturedQuery).toMatchObject({
      catalogId: 'news',
      pageIndex: 0,
      pageSize: 2,
    })
    expect(html).toContain('data-state="false:false:no"')
    expect(html).toContain('Launch Update')
    expect(html).toContain('Quarterly Results')
  })

  test('cms-content renders the empty slot with the unified scope contract', async () => {
    const html = await renderCmsComponent(
      CmsContent,
      { catalogId: 'missing' },
      {
        empty: (scope) => h('p', `empty:${scope.empty}:${scope.loading}:${scope.error ? 'yes' : 'no'}`),
      },
      createClient({
        async listContents() {
          return {
            ...CONTENT_RESPONSE,
            items: [],
            total: 0,
            totalPages: 0,
          }
        },
      }),
    )

    expect(html).toContain('empty:true:false:no')
  })

  test('cms-content renders the error slot with the unified scope contract', async () => {
    const html = await renderCmsComponent(
      CmsContent,
      { catalogId: 'broken' },
      {
        error: (scope) => h('p', `error:${scope.error?.message}:${scope.empty}:${scope.loading}`),
      },
      createClient({
        async listContents() {
          throw new Error('upstream unavailable')
        },
      }),
    )

    expect(html).toContain('error:upstream unavailable:true:false')
  })

  test('cms-content falls back to the default slot for empty results', async () => {
    const html = await renderCmsComponent(
      CmsContent,
      { catalogId: 'missing' },
      {
        default: (scope) => h('p', `default-empty:${scope.empty}:${scope.loading}:${scope.error ? 'yes' : 'no'}`),
      },
      createClient({
        async listContents() {
          return {
            ...CONTENT_RESPONSE,
            items: [],
            total: 0,
            totalPages: 0,
          }
        },
      }),
    )

    expect(html).toContain('default-empty:true:false:no')
  })

  test('cms-content falls back to the default slot for error states', async () => {
    const html = await renderCmsComponent(
      CmsContent,
      { catalogId: 'broken' },
      {
        default: (scope) => h('p', `default-error:${scope.error?.message}:${scope.empty}:${scope.loading}`),
      },
      createClient({
        async listContents() {
          throw new Error('upstream unavailable')
        },
      }),
    )

    expect(html).toContain('default-error:upstream unavailable:true:false')
  })

  test('cms-content prefers the default slot over the empty slot for error states', async () => {
    const html = await renderCmsComponent(
      CmsContent,
      { catalogId: 'broken' },
      {
        default: (scope) => h('p', `default-before-empty:${scope.error?.message}:${scope.empty}:${scope.loading}`),
        empty: (scope) => h('p', `empty-before-default:${scope.empty}:${scope.loading}:${scope.error ? 'yes' : 'no'}`),
      },
      createClient({
        async listContents() {
          throw new Error('upstream unavailable')
        },
      }),
    )

    expect(html).toContain('default-before-empty:upstream unavailable:true:false')
    expect(html).not.toContain('empty-before-default')
  })

  test('cms-catalog filters tree results by level, parentId and take while preserving descendants', async () => {
    const html = await renderCmsComponent(
      CmsCatalog,
      {
        level: 'children',
        parentId: 'root',
        take: '1',
      },
      {
        default: (scope) =>
          h('div', [
            h('p', scope.items.map((item) => item.name).join(',')),
            h('p', scope.items[0]?.children[0]?.name ?? 'missing-child'),
          ]),
      },
      createClient(),
    )

    expect(html).toContain('<p>新闻</p>')
    expect(html).toContain('<p>深度报道</p>')
    expect(html).not.toContain('活动')
  })
})
