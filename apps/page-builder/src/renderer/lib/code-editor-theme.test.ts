import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_PAGE_BUILDER_CODE_EDITOR_THEME_ID,
  PAGE_BUILDER_CODE_EDITOR_THEMES,
  getPageBuilderCodeEditorThemeName,
  parsePageBuilderCodeEditorThemeId,
  createPageBuilderCodeEditorOptions,
} from './code-editor-theme'

function findRule(token: string) {
  return PAGE_BUILDER_CODE_EDITOR_THEMES.light.theme.rules.find((rule) => rule.token === token)
}

describe('code editor theme', () => {
  test('exposes light and dark Monaco themes with stable labels and names', () => {
    expect(DEFAULT_PAGE_BUILDER_CODE_EDITOR_THEME_ID).toBe('light')
    expect(PAGE_BUILDER_CODE_EDITOR_THEMES.light.label).toBe('浅色')
    expect(PAGE_BUILDER_CODE_EDITOR_THEMES.dark.label).toBe('深色')
    expect(getPageBuilderCodeEditorThemeName('light')).toBe('page-builder-light')
    expect(getPageBuilderCodeEditorThemeName('dark')).toBe('page-builder-dark')
    expect(PAGE_BUILDER_CODE_EDITOR_THEMES.light.theme.base).toBe('vs')
    expect(PAGE_BUILDER_CODE_EDITOR_THEMES.dark.theme.base).toBe('vs-dark')
    expect(PAGE_BUILDER_CODE_EDITOR_THEMES.dark.theme.colors['editor.background']).not.toBe('#FFFFFF')
  })

  test('parses stored theme ids and falls back to the default for invalid values', () => {
    expect(parsePageBuilderCodeEditorThemeId('light')).toBe('light')
    expect(parsePageBuilderCodeEditorThemeId('dark')).toBe('dark')
    expect(parsePageBuilderCodeEditorThemeId('')).toBe('light')
    expect(parsePageBuilderCodeEditorThemeId('solarized')).toBe('light')
    expect(parsePageBuilderCodeEditorThemeId(null)).toBe('light')
  })

  test('defines precise token colors for html css and script languages', () => {
    expect(findRule('tag.html')?.foreground).toBe('116329')
    expect(findRule('attribute.name.html')?.foreground).toBe('0550AE')
    expect(findRule('attribute.value.html')?.foreground).toBe('0A3069')

    expect(findRule('attribute.name.css')?.foreground).toBe('0550AE')
    expect(findRule('attribute.value.css')?.foreground).toBe('953800')
    expect(findRule('number.css')?.foreground).toBe('116329')

    expect(findRule('keyword.js')?.foreground).toBe('CF222E')
    expect(findRule('keyword.ts')?.foreground).toBe('CF222E')
    expect(findRule('identifier.function.js')?.foreground).toBe('6639BA')
    expect(findRule('type.identifier.ts')?.foreground).toBe('953800')
  })

  test('uses editor chrome colors that improve code readability without changing save behavior', () => {
    expect(PAGE_BUILDER_CODE_EDITOR_THEMES.light.theme.colors['editor.selectionBackground']).toBe('#BBDFFF')
    expect(PAGE_BUILDER_CODE_EDITOR_THEMES.light.theme.colors['editorCursor.foreground']).toBe('#0969DA')
    expect(PAGE_BUILDER_CODE_EDITOR_THEMES.light.theme.colors['editorBracketHighlight.foreground1']).toBe('#0969DA')

    const options = createPageBuilderCodeEditorOptions({ readOnly: true, minimapEnabled: false })
    expect(options.readOnly).toBe(true)
    expect(options.minimap).toEqual({ enabled: false })
    expect(options.fontFamily).toContain('JetBrains Mono')
    expect(options.fontLigatures).toBe(true)
    expect(options.renderWhitespace).toBe('selection')
  })
})
