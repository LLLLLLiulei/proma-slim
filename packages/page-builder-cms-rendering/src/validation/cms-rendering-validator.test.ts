import { describe, expect, test } from 'bun:test'
import { validateCmsRendering } from './cms-rendering-validator'

describe('validateCmsRendering', () => {
  test('reports error diagnostics for invalid cms structures and vue syntax outside cms islands', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <section data-proma-block-id="pb_blk_plain">
            <p>{{ title }}</p>
          </section>
          <section data-proma-block-id="pb_blk_missing">
            <cms-content>
              <template v-slot:default="{ items }">
                <script>alert("x")</script>
                <cms-catalog level="root"></cms-catalog>
                <article>{{ items.length }}</article>
              </template>
            </cms-content>
          </section>
          <section data-proma-block-id="pb_blk_slotless">
            <cms-catalog level="root"></cms-catalog>
          </section>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.valid).toBe(false)
    expect(result.errors.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      'OUTSIDE_CMS_VUE_SYNTAX',
      'MISSING_CATALOG_ID',
      'DANGEROUS_TAG',
      'NESTED_CMS_ISLAND',
      'MISSING_DEFAULT_SLOT',
    ]))

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'MISSING_CATALOG_ID',
        component: 'cms-content',
        blockId: 'pb_blk_missing',
      }),
      expect.objectContaining({
        severity: 'error',
        code: 'MISSING_DEFAULT_SLOT',
        component: 'cms-catalog',
        blockId: 'pb_blk_slotless',
      }),
    ]))
  })

  test('reports warning and info diagnostics for recoverable authoring issues', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <section id="news">
            <cms-content catalog-id="news" mystery="unexpected">
              <template #default="{ items }">
                <img :src="item.listLogoUrl">
              </template>
            </cms-content>
          </section>
          <section id="catalogs">
            <cms-catalog level="root">
              <template v-slot:default="{ items }"></template>
            </cms-catalog>
          </section>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.warnings.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      'SHORTHAND_SLOT_SYNTAX',
      'UNKNOWN_PROP',
      'UNGUARDED_OPTIONAL_URL',
      'EMPTY_DEFAULT_SLOT',
    ]))
    expect(result.infos.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      'MISSING_EMPTY_SLOT',
      'MISSING_ERROR_SLOT',
    ]))
  })

  test('reports dangerous tags at the island root and treats style as dangerous', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <section data-proma-block-id="pb_blk_news">
            <cms-content catalog-id="news">
              <script>alert("x")</script>
              <style>.broken { color: red; }</style>
              <template v-slot:default="{ items }">
                <article>{{ items.length }}</article>
              </template>
            </cms-content>
          </section>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'DANGEROUS_TAG',
        component: 'cms-content',
        blockId: 'pb_blk_news',
      }),
      expect.objectContaining({
        severity: 'error',
        code: 'DANGEROUS_TAG',
        component: 'cms-content',
        blockId: 'pb_blk_news',
        message: expect.stringContaining('<style>'),
      }),
    ]))
  })

  test('does not flag standard DOM locator attributes as unknown props', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <cms-content
            id="news-list"
            class="hero-slot"
            data-section="news"
            catalog-id="news"
          >
            <template v-slot:default="{ items }">
              <article>{{ items.length }}</article>
            </template>
          </cms-content>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.warnings.filter((diagnostic) => diagnostic.code === 'UNKNOWN_PROP')).toEqual([])
  })
})
