import { describe, expect, test } from 'bun:test'
import { applyPageBuilderImageReplacement } from './page-builder-image-replacement-service'

describe('page-builder image replacement service', () => {
  test('updates the targeted img src by selector and child path', () => {
    const html = '<!doctype html><html><body><section id="hero"><div><img src="./assets/original.png" alt="旧图"></div></section></body></html>'

    const updated = applyPageBuilderImageReplacement(html, '#hero', {
      version: 1,
      tagName: 'img',
      childPath: [0, 0],
    }, './assets/replacement-banner.png')

    expect(updated).toContain('src="./assets/replacement-banner.png"')
    expect(updated).not.toContain('src="./assets/original.png"')
  })

  test('rejects selectors that do not resolve to a unique replacement target before writing', () => {
    const html = '<!doctype html><html><body><section class="hero"><img src="./assets/a.png"></section><section class="hero"><img src="./assets/b.png"></section></body></html>'

    expect(() => applyPageBuilderImageReplacement(html, '.hero', {
      version: 1,
      tagName: 'img',
      childPath: [0],
    }, './assets/replacement-banner.png')).toThrow('无法唯一定位')
  })
})
