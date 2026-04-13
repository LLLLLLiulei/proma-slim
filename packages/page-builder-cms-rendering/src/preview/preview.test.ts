import { describe, expect, test } from 'bun:test'
import {
  CMS_RENDERING_PREVIEW_CONFIG_ATTR,
  CMS_RENDERING_PREVIEW_GLOBAL,
  CMS_RENDERING_PREVIEW_IMPORTMAP_ATTR,
  CMS_RENDERING_PREVIEW_LOADER_ATTR,
  injectCmsRenderingPreview,
} from './cms-rendering-preview-injector'
import { detectCmsRenderingUsage } from './detect-cms-rendering-usage'

describe('CMS rendering preview helpers', () => {
  test('detectCmsRenderingUsage identifies only top-level cms islands', () => {
    const result = detectCmsRenderingUsage(`
      <main>
        <!-- <cms-content catalog-id="example"></cms-content> -->
        <section>&lt;cms-content&gt;example&lt;/cms-content&gt;</section>
        <cms-catalog level="root">
          <template #default="{ items }">
            <nav>{{ items.length }}</nav>
          </template>
          <cms-content catalog-id="nested"></cms-content>
        </cms-catalog>
        <cms-content catalog-id="news" page-index="0"></cms-content>
      </main>
    `)

    expect(result).toEqual({
      hasCmsRendering: true,
      islandCount: 2,
      components: ['cms-catalog', 'cms-content'],
    })
  })

  test('detectCmsRenderingUsage ignores comments and plain text examples', () => {
    const result = detectCmsRenderingUsage(`
      <main>
        <!-- <cms-content catalog-id="example"></cms-content> -->
        <pre>&lt;cms-content catalog-id="demo"&gt;&lt;/cms-content&gt;</pre>
      </main>
    `)

    expect(result).toEqual({
      hasCmsRendering: false,
      islandCount: 0,
      components: [],
    })
  })

  test('injectCmsRenderingPreview injects import map, runtime config and module loader once', () => {
    const sourceHtml = '<!doctype html><html><head><title>Preview</title></head><body><cms-content catalog-id="news"></cms-content></body></html>'

    const transformed = injectCmsRenderingPreview(sourceHtml, {
      workspaceId: 'workspace-1',
      cmsProxyBase: '/api/page-builder/cms',
      vueAssetUrl: '/api/page-builder/cms-rendering-vue.js?v=vue-1',
      bootstrapAssetUrl: '/api/page-builder/cms-rendering-preview.js?v=boot-1',
    })

    expect(transformed).toContain(CMS_RENDERING_PREVIEW_IMPORTMAP_ATTR)
    expect(transformed).toContain(CMS_RENDERING_PREVIEW_CONFIG_ATTR)
    expect(transformed).toContain(CMS_RENDERING_PREVIEW_LOADER_ATTR)
    expect(transformed).toContain(CMS_RENDERING_PREVIEW_GLOBAL)
    expect(transformed).toContain('/api/page-builder/cms-rendering-vue.js?v=vue-1')
    expect(transformed).toContain('/api/page-builder/cms-rendering-preview.js?v=boot-1')
    expect(transformed).toContain('"workspaceId":"workspace-1"')
    expect(transformed).toContain('"cmsProxyBase":"/api/page-builder/cms"')
  })

  test('injectCmsRenderingPreview is idempotent and leaves non-CMS pages unchanged', () => {
    const plainHtml = '<!doctype html><html><body><section>plain</section></body></html>'
    expect(injectCmsRenderingPreview(plainHtml, {
      workspaceId: 'workspace-1',
      cmsProxyBase: '/api/page-builder/cms',
      vueAssetUrl: '/api/page-builder/cms-rendering-vue.js?v=vue-1',
      bootstrapAssetUrl: '/api/page-builder/cms-rendering-preview.js?v=boot-1',
    })).toBe(plainHtml)

    const cmsHtml = '<!doctype html><html><body><cms-content catalog-id="news"></cms-content></body></html>'
    const firstPass = injectCmsRenderingPreview(cmsHtml, {
      workspaceId: 'workspace-1',
      cmsProxyBase: '/api/page-builder/cms',
      vueAssetUrl: '/api/page-builder/cms-rendering-vue.js?v=vue-1',
      bootstrapAssetUrl: '/api/page-builder/cms-rendering-preview.js?v=boot-1',
    })
    const secondPass = injectCmsRenderingPreview(firstPass, {
      workspaceId: 'workspace-1',
      cmsProxyBase: '/api/page-builder/cms',
      vueAssetUrl: '/api/page-builder/cms-rendering-vue.js?v=vue-1',
      bootstrapAssetUrl: '/api/page-builder/cms-rendering-preview.js?v=boot-1',
    })

    expect(secondPass).toBe(firstPass)
    expect(firstPass.match(new RegExp(CMS_RENDERING_PREVIEW_IMPORTMAP_ATTR, 'g'))).toHaveLength(1)
    expect(firstPass.match(new RegExp(CMS_RENDERING_PREVIEW_CONFIG_ATTR, 'g'))).toHaveLength(1)
    expect(firstPass.match(new RegExp(CMS_RENDERING_PREVIEW_LOADER_ATTR, 'g'))).toHaveLength(1)
  })
})
