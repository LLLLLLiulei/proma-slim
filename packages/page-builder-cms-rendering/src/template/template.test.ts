import { describe, expect, test } from 'bun:test'
import { renderToString } from '@vue/server-renderer'
import { createSSRApp } from 'vue'
import { CmsContent } from '../components/cms-content'
import { CMS_RUNTIME_CLIENT_KEY, type CmsRuntimeClient } from '../runtime/cms-runtime-client'
import { compileIslandTemplate } from './compile-island-template'
import { scanCmsIslands } from './scan-cms-islands'

describe('template utilities', () => {
  test('compileIslandTemplate compiles an author template into a reusable render function', async () => {
    const render = compileIslandTemplate(`
      <cms-content catalog-id="news" page-index="0" page-size="1">
        <template #default="{ items, loading, empty }">
          <article data-state="content">
            <h2>{{ items[0] && items[0].title }}</h2>
            <p>{{ String(loading) }}:{{ String(empty) }}</p>
          </article>
        </template>
      </cms-content>
    `)

    const client: CmsRuntimeClient = {
      async listCatalogs() {
        return { items: [], tree: [] }
      },
      async listContents() {
        return {
          pageIndex: 0,
          pageSize: 1,
          total: 1,
          totalPages: 1,
          items: [
            {
              id: 'content-1',
              catalogId: 'news',
              title: 'Launch Update',
              summary: 'Quarterly launch update',
              publishUrl: 'https://example.com/news/launch-update',
            },
          ],
        }
      },
    }

    const app = createSSRApp({ render })
    app.component('cms-content', CmsContent)
    app.provide(CMS_RUNTIME_CLIENT_KEY, client)

    const html = await renderToString(app)

    expect(html).toContain('Launch Update')
    expect(html).toContain('false:false')
  })

  test('scanCmsIslands returns only cms-catalog and cms-content nodes with normalized props', () => {
    const islands = scanCmsIslands(`
      <main>
        <section>plain html</section>
        <cms-catalog site-id="14" level="root" take="2">
          <template #default="{ items }">
            <nav>{{ items.length }}</nav>
          </template>
        </cms-catalog>
        <cms-content site-id="14" catalog-id="news" page-index="0" page-size="3" keyword="launch"></cms-content>
      </main>
    `)

    expect(islands).toHaveLength(2)
    const [catalogIsland, contentIsland] = islands
    if (!catalogIsland || !contentIsland) {
      throw new Error('expected cms islands to be scanned')
    }

    expect(catalogIsland).toMatchObject({
      component: 'cms-catalog',
      props: {
        siteId: '14',
        level: 'root',
        take: '2',
      },
    })
    expect(catalogIsland.template).toContain('<cms-catalog')
    expect(catalogIsland.element.tagName.toLowerCase()).toBe('cms-catalog')

    expect(contentIsland).toMatchObject({
      component: 'cms-content',
      props: {
        siteId: '14',
        catalogId: 'news',
        pageIndex: '0',
        pageSize: '3',
        keyword: 'launch',
      },
    })
  })
})
