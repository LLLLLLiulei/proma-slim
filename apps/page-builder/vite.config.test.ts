import { describe, expect, test } from 'bun:test'
import { toPageBuilderBaseHref } from '@ai-page-builder/shared'
import { createPageBuilderDevProxy, pageBuilderViteBase } from './vite.config'

describe('page-builder Vite base path', () => {
  test('builds runtime-neutral relative assets for one reusable web image', () => {
    expect(pageBuilderViteBase).toBe('./')
  })

  test('formats runtime HTML base href from a public base path', () => {
    expect(toPageBuilderBaseHref()).toBe('/')
    expect(toPageBuilderBaseHref('/')).toBe('/')
    expect(toPageBuilderBaseHref('pagebuilder')).toBe('/pagebuilder/')
    expect(toPageBuilderBaseHref('/pagebuilder/')).toBe('/pagebuilder/')
  })

  test('rejects invalid public base path values', () => {
    expect(() => toPageBuilderBaseHref('https://example.com/pagebuilder')).toThrow('Invalid AI_PAGE_BUILDER_BASE_PATH')
  })
})

describe('page-builder Vite dev proxy', () => {
  test('proxies root API requests by default', () => {
    const proxy = createPageBuilderDevProxy()

    expect(Object.keys(proxy)).toEqual(['/api'])
    expect(proxy['/api']?.target).toBe('http://127.0.0.1:3000')
  })

  test('proxies configured base-path API requests and strips the public prefix', () => {
    const proxy = createPageBuilderDevProxy('/pagebuilder')

    expect(Object.keys(proxy)).toEqual(['/api', '/pagebuilder/api'])
    expect(proxy['/pagebuilder/api']?.target).toBe('http://127.0.0.1:3000')
    expect(proxy['/pagebuilder/api']?.rewrite?.('/pagebuilder/api/status')).toBe('/api/status')
  })
})
