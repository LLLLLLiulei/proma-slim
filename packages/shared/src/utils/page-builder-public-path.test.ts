import { describe, expect, test } from 'bun:test'
import {
  normalizePageBuilderPublicBasePath,
  prependPageBuilderPublicBasePath,
  stripPageBuilderPublicBasePath,
  toPageBuilderBaseHref,
} from './page-builder-public-path'

describe('page builder public base path utilities', () => {
  test('normalizes root mode and pagebuilder base path inputs', () => {
    expect(normalizePageBuilderPublicBasePath()).toBe('')
    expect(normalizePageBuilderPublicBasePath('')).toBe('')
    expect(normalizePageBuilderPublicBasePath('  ')).toBe('')
    expect(normalizePageBuilderPublicBasePath('/')).toBe('')
    expect(normalizePageBuilderPublicBasePath('pagebuilder')).toBe('/pagebuilder')
    expect(normalizePageBuilderPublicBasePath('/pagebuilder')).toBe('/pagebuilder')
    expect(normalizePageBuilderPublicBasePath('/pagebuilder/')).toBe('/pagebuilder')
  })

  test('rejects invalid public base path values', () => {
    expect(() => normalizePageBuilderPublicBasePath('https://example.com/pagebuilder')).toThrow('Invalid AI_PAGE_BUILDER_BASE_PATH')
    expect(() => normalizePageBuilderPublicBasePath('//example.com/pagebuilder')).toThrow('Invalid AI_PAGE_BUILDER_BASE_PATH')
    expect(() => normalizePageBuilderPublicBasePath('/pagebuilder?mode=1')).toThrow('Invalid AI_PAGE_BUILDER_BASE_PATH')
    expect(() => normalizePageBuilderPublicBasePath('/pagebuilder#hash')).toThrow('Invalid AI_PAGE_BUILDER_BASE_PATH')
    expect(() => normalizePageBuilderPublicBasePath('/../pagebuilder')).toThrow('Invalid AI_PAGE_BUILDER_BASE_PATH')
    expect(() => normalizePageBuilderPublicBasePath('/pagebuilder\\cms')).toThrow('Invalid AI_PAGE_BUILDER_BASE_PATH')
  })

  test('prepends the base path without duplicating it', () => {
    expect(prependPageBuilderPublicBasePath('/api/status', '')).toBe('/api/status')
    expect(prependPageBuilderPublicBasePath('/api/status', '/pagebuilder')).toBe('/pagebuilder/api/status')
    expect(prependPageBuilderPublicBasePath('/pagebuilder/api/status', '/pagebuilder')).toBe('/pagebuilder/api/status')
    expect(prependPageBuilderPublicBasePath('/', '/pagebuilder')).toBe('/pagebuilder/')
    expect(prependPageBuilderPublicBasePath('/api/status?ok=1', '/pagebuilder')).toBe('/pagebuilder/api/status?ok=1')
  })

  test('strips the base path at most once', () => {
    expect(stripPageBuilderPublicBasePath('/api/status', '/pagebuilder')).toBe('/api/status')
    expect(stripPageBuilderPublicBasePath('/pagebuilder', '/pagebuilder')).toBe('/')
    expect(stripPageBuilderPublicBasePath('/pagebuilder/', '/pagebuilder')).toBe('/')
    expect(stripPageBuilderPublicBasePath('/pagebuilder/api/status', '/pagebuilder')).toBe('/api/status')
    expect(stripPageBuilderPublicBasePath('/pagebuilder/pagebuilder/api/status', '/pagebuilder')).toBe('/pagebuilder/api/status')
  })

  test('converts normalized base paths to HTML base href values', () => {
    expect(toPageBuilderBaseHref('')).toBe('/')
    expect(toPageBuilderBaseHref('/')).toBe('/')
    expect(toPageBuilderBaseHref('/pagebuilder')).toBe('/pagebuilder/')
    expect(toPageBuilderBaseHref('pagebuilder')).toBe('/pagebuilder/')
  })
})
