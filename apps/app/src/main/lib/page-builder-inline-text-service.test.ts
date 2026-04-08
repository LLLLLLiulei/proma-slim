import { describe, expect, test } from 'bun:test'
import { applyPageBuilderInlineTextEdit } from './page-builder-inline-text-service'

describe('page-builder inline text service', () => {
  test('updates the targeted simple text host by selector and child path', () => {
    const html = '<!doctype html><html><body><section id="hero"><div><h1>旧标题</h1><p>旧描述</p></div></section></body></html>'

    const updated = applyPageBuilderInlineTextEdit(html, '#hero', {
      version: 1,
      tagName: 'h1',
      childPath: [0, 0],
    }, '新标题')

    expect(updated).toContain('<h1>新标题</h1>')
    expect(updated).toContain('<p>旧描述</p>')
  })

  test('updates a pure-text div host by selector and child path', () => {
    const html = '<!doctype html><html><body><section id="hero"><div>旧文案</div><p>旧描述</p></section></body></html>'

    const updated = applyPageBuilderInlineTextEdit(html, '#hero', {
      version: 1,
      tagName: 'div',
      childPath: [0],
    }, '新文案')

    expect(updated).toContain('<div>新文案</div>')
    expect(updated).toContain('<p>旧描述</p>')
  })

  test('rejects selectors that do not resolve to a unique block before writing', () => {
    const html = '<!doctype html><html><body><section class="hero"><h1>甲</h1></section><section class="hero"><h1>乙</h1></section></body></html>'

    expect(() => applyPageBuilderInlineTextEdit(html, '.hero', {
      version: 1,
      tagName: 'h1',
      childPath: [0],
    }, '新标题')).toThrow('无法唯一定位')
  })
})
