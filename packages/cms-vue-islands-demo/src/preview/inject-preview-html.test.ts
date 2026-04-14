import { describe, expect, test } from 'bun:test'
import { injectPreviewHtml } from './inject-preview-html'

describe('injectPreviewHtml', () => {
  test('injects local Vue and preview bootstrap assets into the author HTML', () => {
    const sourceHtml = '<!doctype html><html><body><main>demo</main></body></html>'

    const result = injectPreviewHtml(sourceHtml, {
      pageName: 'basic-navigation.html',
      cmsApiBase: '/api/mock-cms',
      bootstrapAssetPath: '/assets/preview-bootstrap.js',
    })

    expect(result).toContain('/assets/preview-bootstrap.js')
    expect(result).toContain('"pageName":"basic-navigation.html"')
    expect(result).toContain('"cmsApiBase":"/api/mock-cms"')
    expect(result).not.toContain('/assets/vue.global.js')
  })
})
