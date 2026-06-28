import { describe, expect, test } from 'bun:test'
import {
  PAGE_BUILDER_CODE_EDITOR_THEME,
  createPageBuilderCodeEditorOptions,
} from './code-editor-theme'

function findRule(token: string) {
  return PAGE_BUILDER_CODE_EDITOR_THEME.rules.find((rule) => rule.token === token)
}

describe('code editor theme', () => {
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
    expect(PAGE_BUILDER_CODE_EDITOR_THEME.colors['editor.selectionBackground']).toBe('#BBDFFF')
    expect(PAGE_BUILDER_CODE_EDITOR_THEME.colors['editorCursor.foreground']).toBe('#0969DA')
    expect(PAGE_BUILDER_CODE_EDITOR_THEME.colors['editorBracketHighlight.foreground1']).toBe('#0969DA')

    const options = createPageBuilderCodeEditorOptions({ readOnly: true, minimapEnabled: false })
    expect(options.readOnly).toBe(true)
    expect(options.minimap).toEqual({ enabled: false })
    expect(options.fontFamily).toContain('JetBrains Mono')
    expect(options.fontLigatures).toBe(true)
    expect(options.renderWhitespace).toBe('selection')
  })
})
