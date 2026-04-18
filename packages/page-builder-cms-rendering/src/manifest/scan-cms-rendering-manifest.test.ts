import { describe, expect, test } from 'bun:test'
import { scanCmsRenderingManifest } from './scan-cms-rendering-manifest'

describe('scanCmsRenderingManifest', () => {
  test('scans top-level cms islands into block-oriented manifest entries', () => {
    const manifest = scanCmsRenderingManifest(`
      <!doctype html>
      <html>
        <body>
          <section data-proma-block-id="pb_blk_nav">
            <cms-catalog data-proma-cms-source-id="cms-src-nav" site-id="14" ids="nav-b, nav-a">
              <template v-slot:default="{ items }">
                <nav>{{ items.length }}</nav>
              </template>
            </cms-catalog>
          </section>
          <section id="news-list">
            <cms-content data-proma-cms-source-id="cms-src-news" site-id="14" catalog-id="news" ids="content-2,content-1">
              <template v-slot:default="{ items }">
                <article>{{ items.length }}</article>
              </template>
            </cms-content>
          </section>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
      generatedAt: '2026-04-13T00:00:00.000Z',
    })

    expect(manifest).toEqual({
      version: 1,
      generatedAt: '2026-04-13T00:00:00.000Z',
      entries: [
        {
          blockId: 'pb_blk_nav',
          sourceId: 'cms-src-nav',
          selectorSnapshot: '[data-proma-block-id="pb_blk_nav"]',
          component: 'cms-catalog',
          props: {
            siteId: '14',
            ids: ['nav-b', 'nav-a'],
          },
          htmlPath: 'index.html',
          islandIndex: 0,
        },
        {
          blockId: null,
          sourceId: 'cms-src-news',
          selectorSnapshot: '#news-list',
          component: 'cms-content',
          props: {
            siteId: '14',
            catalogId: 'news',
            ids: ['content-2', 'content-1'],
          },
          htmlPath: 'index.html',
          islandIndex: 1,
        },
      ],
    })
  })

  test('returns an empty manifest for pages without top-level islands and ignores nested islands as standalone entries', () => {
    const emptyManifest = scanCmsRenderingManifest('<!doctype html><html><body><main>plain html</main></body></html>', {
      htmlPath: 'index.html',
      generatedAt: '2026-04-13T00:00:00.000Z',
    })

    expect(emptyManifest.entries).toEqual([])

    const nestedManifest = scanCmsRenderingManifest(`
      <!doctype html>
      <html>
        <body>
          <section id="outer">
            <cms-content catalog-id="news">
              <template v-slot:default="{ items }">
                <cms-catalog level="root"></cms-catalog>
              </template>
            </cms-content>
          </section>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
      generatedAt: '2026-04-13T00:00:00.000Z',
    })

    expect(nestedManifest.entries).toHaveLength(1)
    expect(nestedManifest.entries[0]).toMatchObject({
      component: 'cms-content',
      selectorSnapshot: '#outer',
      islandIndex: 0,
    })
  })

  test('keeps only supported normalized source props in manifest entries', () => {
    const manifest = scanCmsRenderingManifest(`
      <!doctype html>
      <html>
        <body>
          <section id="news-list">
            <cms-content
              id="legacy-news"
              class="content-shell"
              site-id="14"
              catalog-id="news"
              ids="content-2,content-1"
              content-select-type="Recent"
              title="Legacy Filter"
            >
              <template v-slot:default="{ items }">
                <article>{{ items.length }}</article>
              </template>
            </cms-content>
          </section>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
      generatedAt: '2026-04-13T00:00:00.000Z',
    })

    expect(manifest.entries).toHaveLength(1)
    expect(manifest.entries[0]?.props).toEqual({
      siteId: '14',
      catalogId: 'news',
      ids: ['content-2', 'content-1'],
    })
  })
})
