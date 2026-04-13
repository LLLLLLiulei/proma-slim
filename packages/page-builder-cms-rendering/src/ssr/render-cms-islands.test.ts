import { describe, expect, test } from 'bun:test'
import type {
  PageBuilderCmsCatalogList,
  PageBuilderCmsContentList,
  PageBuilderCmsContentQuery,
} from '@proma/shared'
import { createServerCmsClient } from '../runtime/server-cms-client'
import { CmsIslandRenderPipelineError } from './island-render-errors'
import { renderCmsIslands } from './render-cms-islands'

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
      total: 1,
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
      total: 1,
      children: [],
    },
  ],
}

function createContentResponse(query: PageBuilderCmsContentQuery): PageBuilderCmsContentList {
  return {
    pageIndex: query.pageIndex ?? 0,
    pageSize: query.pageSize ?? 20,
    total: 1,
    totalPages: 1,
    items: [
      {
        id: 'content-1',
        catalogId: query.catalogId,
        title: 'Launch Update',
        summary: 'Quarterly launch update',
        publishUrl: 'https://example.com/news/launch-update',
        listLogoUrl: 'https://cms.example.com/upload/resources/image/banner.jpg',
      },
    ],
  }
}

describe('renderCmsIslands', () => {
  test('renders top-level CMS islands into static HTML and preserves raw CMS asset urls', async () => {
    let contentCalls = 0
    const client = createServerCmsClient({
      adapter: {
        async listCatalogs() {
          return CATALOG_RESPONSE
        },
        async listContents(query) {
          contentCalls += 1
          return createContentResponse(query)
        },
      },
    })

    const html = `<!doctype html>
      <html>
        <body>
          <section>
            <cms-content catalog-id="news" page-index="0" page-size="1">
              <template v-slot:default="{ items }">
                <article>
                  <img :src="items[0]?.listLogoUrl" alt="banner">
                  <h2>{{ items[0]?.title }}</h2>
                </article>
              </template>
            </cms-content>
          </section>
          <section>
            <cms-content catalog-id="news" page-index="0" page-size="1">
              <template v-slot:default="{ items }">
                <a :href="items[0]?.publishUrl">{{ items[0]?.title }}</a>
              </template>
            </cms-content>
          </section>
        </body>
      </html>`

    const rendered = await renderCmsIslands({
      html,
      cmsClient: client,
    })

    expect(rendered).toContain('Launch Update')
    expect(rendered).toContain('https://cms.example.com/upload/resources/image/banner.jpg')
    expect(rendered).toContain('https://example.com/news/launch-update')
    expect(rendered).not.toContain('<cms-content')
    expect(contentCalls).toBe(1)
  })

  test('raises structured failures when island prefetch fails', async () => {
    const client = createServerCmsClient({
      adapter: {
        async listCatalogs() {
          return CATALOG_RESPONSE
        },
        async listContents() {
          throw new Error('upstream unavailable')
        },
      },
    })

    const html = `<!doctype html>
      <html>
        <body>
          <cms-content catalog-id="broken" page-size="1">
            <template v-slot:default="{ items }">
              <article>{{ items[0]?.title }}</article>
            </template>
          </cms-content>
        </body>
      </html>`

    await expect(
      renderCmsIslands({
        html,
        cmsClient: client,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'CmsIslandRenderPipelineError',
        failures: [
          expect.objectContaining({
            stage: 'prefetch',
            component: 'cms-content',
            props: {
              catalogId: 'broken',
              pageSize: '1',
            },
            message: 'upstream unavailable',
          }),
        ],
      } satisfies Partial<CmsIslandRenderPipelineError>),
    )
  })

  test('raises structured failures when island template rendering fails', async () => {
    const client = createServerCmsClient({
      adapter: {
        async listCatalogs() {
          return CATALOG_RESPONSE
        },
        async listContents(query) {
          return createContentResponse(query)
        },
      },
    })

    const html = `<!doctype html>
      <html>
        <body>
          <cms-content catalog-id="news" page-size="1">
            <template v-slot:default="{ items }">
              <article>{{ items[0]?.title }</article>
            </template>
          </cms-content>
        </body>
      </html>`

    await expect(
      renderCmsIslands({
        html,
        cmsClient: client,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'CmsIslandRenderPipelineError',
        failures: [
          expect.objectContaining({
            stage: 'render',
            component: 'cms-content',
            props: {
              catalogId: 'news',
              pageSize: '1',
            },
          }),
        ],
      } satisfies Partial<CmsIslandRenderPipelineError>),
    )
  })
})
