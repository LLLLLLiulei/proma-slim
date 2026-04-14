import { describe, expect, test } from 'bun:test'
import { createMockServerCmsClient } from '../runtime/server-cms-client'
import { renderIslandsSsr } from './render-islands-ssr'

describe('renderIslandsSsr', () => {
  test('renders cms-catalog and cms-content islands into static HTML', async () => {
    const sourceHtml = `<!doctype html>
      <html>
        <body>
          <section>
            <cms-catalog level="root" take="2">
              <template v-slot:default="{ items }">
                <nav>
                  <a v-for="item in items" :key="item.id" :href="item.path">{{ item.name }}</a>
                </nav>
              </template>
            </cms-catalog>
          </section>
          <section>
            <cms-content catalog-id="news" page-size="2">
              <template v-slot:default="{ items }">
                <article v-for="item in items" :key="item.id">
                  <h2>{{ item.title }}</h2>
                  <p>{{ item.summary }}</p>
                </article>
              </template>
            </cms-content>
          </section>
        </body>
      </html>`

    const result = await renderIslandsSsr({
      html: sourceHtml,
      cmsClient: createMockServerCmsClient({ delay: false }),
    })

    expect(result).toContain('<nav>')
    expect(result).toContain('News')
    expect(result).toContain('About')
    expect(result).toContain('Launch Update')
    expect(result).toContain('Quarterly Results')
    expect(result).not.toContain('<cms-catalog')
    expect(result).not.toContain('<cms-content')
  })
})
