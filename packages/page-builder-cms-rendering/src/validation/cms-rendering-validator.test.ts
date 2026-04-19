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
            <cms-content site-id="14" catalog-id="news" mystery="unexpected">
              <template #default="{ items }">
                <img :src="item.listLogoUrl">
              </template>
            </cms-content>
          </section>
          <section id="catalogs">
            <cms-catalog site-id="14" level="root">
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

  test('reports blocking errors for unsupported item field access inside cms slots', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <section data-proma-block-id="pb_blk_news">
            <cms-content site-id="14" catalog-id="news">
              <template v-slot:default="{ items }">
                <article v-for="item in items" :key="item.id">
                  <a :href="item.url">{{ item.title }}</a>
                </article>
              </template>
            </cms-content>
          </section>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'UNKNOWN_ITEM_FIELD',
        component: 'cms-content',
        blockId: 'pb_blk_news',
        message: expect.stringContaining('item.url'),
      }),
    ]))
  })

  test('reports blocking errors for undeclared CMS slot variables inside slot content', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <section data-proma-block-id="pb_blk_news">
            <cms-content site-id="14" catalog-id="news">
              <template v-slot:default="{ items }">
                <p v-if="loading">加载中...</p>
                <article v-for="item in items" :key="item.id">{{ item.title }}</article>
              </template>
            </cms-content>
          </section>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'UNKNOWN_SLOT_VARIABLE',
        component: 'cms-content',
        blockId: 'pb_blk_news',
        message: expect.stringContaining('"loading"'),
      }),
    ]))
  })

  test('reports blocking errors for slot alias objects referenced inside cms slot content', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <section data-proma-block-id="pb_blk_news">
            <cms-content site-id="14" catalog-id="news">
              <template v-slot:default="{ items, loading, error, empty }">
                <article v-for="item in slotProps.items" :key="item.id">{{ item.title }}</article>
              </template>
            </cms-content>
          </section>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'UNKNOWN_SLOT_VARIABLE',
        component: 'cms-content',
        blockId: 'pb_blk_news',
        message: expect.stringContaining('"slotProps"'),
      }),
    ]))
  })

  test('reports blocking errors for unsupported CMS slot scope declarations', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <section data-proma-block-id="pb_blk_news">
            <cms-content site-id="14" catalog-id="news">
              <template v-slot:default="slotProps">
                <article v-for="item in slotProps.items" :key="item.id">{{ item.title }}</article>
              </template>
            </cms-content>
          </section>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'INVALID_SLOT_SCOPE',
        component: 'cms-content',
        blockId: 'pb_blk_news',
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

  test('accepts legacy tags without site-id while keeping site-id out of unknown-prop warnings', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <cms-content site-id="14" catalog-id="news">
            <template v-slot:default="{ items }">
              <article>{{ items.length }}</article>
            </template>
          </cms-content>
          <cms-catalog level="root">
            <template v-slot:default="{ items }">
              <ul><li v-for="item in items">{{ item.name }}</li></ul>
            </template>
          </cms-catalog>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.warnings.filter((diagnostic) => diagnostic.code === 'UNKNOWN_PROP')).toEqual([])
    expect(result.valid).toBe(true)
  })

  test('accepts ids as supported props and preserves legacy missing-site compatibility', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <cms-catalog ids="cat-b,cat-a">
            <template v-slot:default="{ items }">
              <ul><li v-for="item in items">{{ item.name }}</li></ul>
            </template>
          </cms-catalog>
          <cms-content site-id="14" catalog-id="news" ids="content-2,content-1">
            <template v-slot:default="{ items }">
              <section><article v-for="item in items">{{ item.title }}</article></section>
            </template>
          </cms-content>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.errors).toEqual([])
    expect(result.warnings.filter((diagnostic) => diagnostic.code === 'UNKNOWN_PROP')).toEqual([])
  })

  test('reports error diagnostics when ids are mixed with conflicting query props', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <cms-catalog ids="cat-1" parent-id="root">
            <template v-slot:default="{ items }">
              <ul><li v-for="item in items">{{ item.name }}</li></ul>
            </template>
          </cms-catalog>
          <cms-content ids="content-1" catalog-id="news" page-size="3">
            <template v-slot:default="{ items }">
              <section><article v-for="item in items">{{ item.title }}</article></section>
            </template>
          </cms-content>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.errors.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      'CONFLICTING_SOURCE_PROPS',
    ]))
  })

  test('treats legacy cms-content source props as non-conflicting and warns on unsupported source-only attrs', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <cms-content
            site-id="14"
            catalog-id="news"
            ids="content-1,content-2"
            content-select-type="Recent"
            title="Legacy Filter"
          >
            <template v-slot:default="{ items }">
              <section><article v-for="item in items">{{ item.title }}</article></section>
            </template>
          </cms-content>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.errors.map((diagnostic) => diagnostic.code)).not.toContain('CONFLICTING_SOURCE_PROPS')
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'UNKNOWN_PROP',
        message: 'Unknown prop "content-select-type" on cms-content.',
      }),
    ]))
  })

  test('reports warnings when the major dynamic container is kept outside the cms slot', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <section data-proma-block-id="pb_blk_nav">
            <ul class="nav-list">
              <cms-catalog level="root">
                <template v-slot:default="{ items }">
                  <li v-for="item in items">{{ item.name }}</li>
                </template>
              </cms-catalog>
            </ul>
          </section>
          <section data-proma-block-id="pb_blk_news">
            <section class="news-list">
              <cms-content catalog-id="news">
                <template v-slot:default="{ items }">
                  <article v-for="item in items">{{ item.title }}</article>
                </template>
              </cms-content>
            </section>
          </section>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.warnings.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      'OUTSIDE_SLOT_MAJOR_CONTAINER',
    ]))
  })

  test('reports warnings when v-for inside cms slots omits a stable key', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <cms-content site-id="14" catalog-id="news">
            <template v-slot:default="{ items }">
              <section class="news-list">
                <article v-for="item in items">{{ item.title }}</article>
              </section>
            </template>
          </cms-content>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'MISSING_V_FOR_KEY',
        severity: 'warning',
        component: 'cms-content',
      }),
    ]))
  })

  test('does not warn for optional image bindings when they are guarded', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <cms-content site-id="14" catalog-id="news">
            <template v-slot:default="{ items }">
              <section class="news-list">
                <img v-if="items[0]?.listLogoUrl" :src="items[0].listLogoUrl" alt="">
              </section>
            </template>
          </cms-content>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.warnings.filter((diagnostic) => diagnostic.code === 'UNGUARDED_OPTIONAL_URL')).toEqual([])
  })

  test('does not warn when the major dynamic container lives inside the cms slot', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <cms-catalog level="root">
            <template v-slot:default="{ items }">
              <ul class="nav-list">
                <li v-for="item in items">{{ item.name }}</li>
              </ul>
            </template>
          </cms-catalog>
          <cms-content catalog-id="news">
            <template v-slot:default="{ items }">
              <section class="news-list">
                <article v-for="item in items">{{ item.title }}</article>
              </section>
            </template>
          </cms-content>
        </body>
      </html>
    `, {
      htmlPath: 'index.html',
    })

    expect(result.warnings.filter((diagnostic) => diagnostic.code === 'OUTSIDE_SLOT_MAJOR_CONTAINER')).toEqual([])
  })

  test('reports duplicate top-level cms source ids as blocking errors', () => {
    const result = validateCmsRendering(`
      <!doctype html>
      <html>
        <body>
          <section>
            <cms-catalog data-proma-cms-source-id="cms-src-dup" level="root">
              <template v-slot:default="{ items }">
                <ul><li v-for="item in items">{{ item.name }}</li></ul>
              </template>
            </cms-catalog>
          </section>
          <section>
            <cms-content data-proma-cms-source-id="cms-src-dup" catalog-id="news">
              <template v-slot:default="{ items }">
                <section><article v-for="item in items">{{ item.title }}</article></section>
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
        code: 'DUPLICATE_SOURCE_ID',
        severity: 'error',
      }),
    ]))
  })
})
