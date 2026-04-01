import { describe, expect, test } from 'bun:test'
import { applyPageBuilderBlockDeletion } from './page-builder-block-deletion-service'

describe('page-builder block deletion service', () => {
  test('removes the targeted block by selector', () => {
    const html = '<!doctype html><html><body><section id="hero"><h1>标题</h1></section><section id="features"><p>保留内容</p></section></body></html>'

    const updated = applyPageBuilderBlockDeletion(html, '#hero')

    expect(updated).not.toContain('id="hero"')
    expect(updated).toContain('id="features"')
    expect(updated).toContain('保留内容')
  })

  test('rejects selectors that do not resolve to a unique block before writing', () => {
    const html = '<!doctype html><html><body><section class="hero"><h1>甲</h1></section><section class="hero"><h1>乙</h1></section></body></html>'

    expect(() => applyPageBuilderBlockDeletion(html, '.hero')).toThrow('无法唯一定位')
  })
})
