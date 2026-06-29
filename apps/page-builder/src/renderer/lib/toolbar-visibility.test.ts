import { describe, expect, test } from 'bun:test'
import {
  getPageBuilderVisiblePreviewDeviceMode,
  getPageBuilderVisibleRightPanelTab,
  isPageBuilderToolbarItemHidden,
  normalizePageBuilderHiddenToolbarItems,
  parsePageBuilderHiddenToolbarItems,
} from './toolbar-visibility'

describe('page-builder toolbar visibility helpers', () => {
  test('parses comma-separated hidden toolbar items and ignores empty, duplicate, and unknown keys', () => {
    expect(parsePageBuilderHiddenToolbarItems(' export, saveTemplate,unknown,, export ,projectName ')).toEqual([
      'export',
      'saveTemplate',
      'projectName',
    ])
  })

  test('normalizes arrays from runtime config and ignores non-string values', () => {
    expect(normalizePageBuilderHiddenToolbarItems(['pcPreview', 'bad', 'pcPreview', 1, 'mobilePreview'])).toEqual([
      'pcPreview',
      'mobilePreview',
    ])
  })

  test('checks hidden items from a normalized collection', () => {
    const hiddenItems = normalizePageBuilderHiddenToolbarItems(['refresh', 'projectName'])

    expect(isPageBuilderToolbarItemHidden(hiddenItems, 'refresh')).toBe(true)
    expect(isPageBuilderToolbarItemHidden(hiddenItems, 'export')).toBe(false)
  })

  test('resolves preview device mode fallback from hidden device buttons', () => {
    expect(getPageBuilderVisiblePreviewDeviceMode('desktop', ['pcPreview'])).toBe('mobile')
    expect(getPageBuilderVisiblePreviewDeviceMode('mobile', ['mobilePreview'])).toBe('desktop')
    expect(getPageBuilderVisiblePreviewDeviceMode('mobile', ['pcPreview', 'mobilePreview'])).toBe('desktop')
    expect(getPageBuilderVisiblePreviewDeviceMode('desktop', [])).toBe('desktop')
  })

  test('resolves right panel tab fallback from hidden tab buttons', () => {
    expect(getPageBuilderVisibleRightPanelTab('chat', ['chatTab'])).toBe('code')
    expect(getPageBuilderVisibleRightPanelTab('code', ['codeTab'])).toBe('chat')
    expect(getPageBuilderVisibleRightPanelTab('code', ['chatTab', 'codeTab'])).toBe('chat')
    expect(getPageBuilderVisibleRightPanelTab('code', [])).toBe('code')
  })
})
