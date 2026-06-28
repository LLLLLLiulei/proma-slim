import type * as monaco from 'monaco-editor'

export type PageBuilderCodeEditorThemeId = 'light' | 'dark'

export interface PageBuilderCodeEditorThemeDefinition {
  id: PageBuilderCodeEditorThemeId
  label: string
  monacoThemeName: string
  theme: monaco.editor.IStandaloneThemeData
}

export const DEFAULT_PAGE_BUILDER_CODE_EDITOR_THEME_ID: PageBuilderCodeEditorThemeId = 'light'

const PAGE_BUILDER_CODE_EDITOR_LIGHT_THEME: monaco.editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A737D', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'CF222E' },
    { token: 'string', foreground: '0A3069' },
    { token: 'number', foreground: '116329' },
    { token: 'regexp', foreground: '8250DF' },
    { token: 'type', foreground: '953800' },
    { token: 'class', foreground: '953800' },
    { token: 'namespace', foreground: '953800' },
    { token: 'function', foreground: '6639BA' },
    { token: 'identifier.function', foreground: '6639BA' },
    { token: 'variable', foreground: '24292F' },
    { token: 'delimiter', foreground: '57606A' },
    { token: 'delimiter.bracket', foreground: '57606A' },
    { token: 'operator', foreground: '57606A' },

    { token: 'tag', foreground: '116329' },
    { token: 'tag.html', foreground: '116329' },
    { token: 'metatag.html', foreground: 'CF222E' },
    { token: 'delimiter.html', foreground: '57606A' },
    { token: 'delimiter.angle.html', foreground: '57606A' },
    { token: 'attribute.name', foreground: '0550AE' },
    { token: 'attribute.name.html', foreground: '0550AE' },
    { token: 'attribute.value', foreground: '0A3069' },
    { token: 'attribute.value.html', foreground: '0A3069' },

    { token: 'tag.css', foreground: '116329' },
    { token: 'attribute.name.css', foreground: '0550AE' },
    { token: 'attribute.value.css', foreground: '953800' },
    { token: 'keyword.css', foreground: 'CF222E' },
    { token: 'number.css', foreground: '116329' },
    { token: 'string.css', foreground: '0A3069' },
    { token: 'type.css', foreground: '953800' },
    { token: 'operator.css', foreground: '57606A' },

    { token: 'keyword.js', foreground: 'CF222E' },
    { token: 'keyword.ts', foreground: 'CF222E' },
    { token: 'string.js', foreground: '0A3069' },
    { token: 'string.ts', foreground: '0A3069' },
    { token: 'number.js', foreground: '116329' },
    { token: 'number.ts', foreground: '116329' },
    { token: 'regexp.js', foreground: '8250DF' },
    { token: 'regexp.ts', foreground: '8250DF' },
    { token: 'identifier.function.js', foreground: '6639BA' },
    { token: 'identifier.function.ts', foreground: '6639BA' },
    { token: 'type.identifier.ts', foreground: '953800' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#24292F',
    'editorCursor.foreground': '#0969DA',
    'editorLineNumber.foreground': '#8C959F',
    'editorLineNumber.activeForeground': '#24292F',
    'editor.selectionBackground': '#BBDFFF',
    'editor.inactiveSelectionBackground': '#DDF4FF',
    'editor.lineHighlightBackground': '#F6F8FA',
    'editorWhitespace.foreground': '#D0D7DE',
    'editorIndentGuide.background': '#D8DEE4',
    'editorIndentGuide.activeBackground': '#8C959F',
    'editorBracketMatch.background': '#DDF4FF',
    'editorBracketMatch.border': '#54AEFF',
    'editorBracketHighlight.foreground1': '#0969DA',
    'editorBracketHighlight.foreground2': '#116329',
    'editorBracketHighlight.foreground3': '#953800',
    'editorBracketHighlight.foreground4': '#8250DF',
    'editorBracketHighlight.foreground5': '#CF222E',
    'editorBracketHighlight.foreground6': '#0550AE',
    'editorOverviewRuler.border': '#D0D7DE',
  },
}

const PAGE_BUILDER_CODE_EDITOR_DARK_THEME: monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '8B949E', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'FF7B72' },
    { token: 'string', foreground: 'A5D6FF' },
    { token: 'number', foreground: '79C0FF' },
    { token: 'regexp', foreground: 'D2A8FF' },
    { token: 'type', foreground: 'FFA657' },
    { token: 'class', foreground: 'FFA657' },
    { token: 'namespace', foreground: 'FFA657' },
    { token: 'function', foreground: 'D2A8FF' },
    { token: 'identifier.function', foreground: 'D2A8FF' },
    { token: 'variable', foreground: 'C9D1D9' },
    { token: 'delimiter', foreground: '8B949E' },
    { token: 'delimiter.bracket', foreground: '8B949E' },
    { token: 'operator', foreground: '8B949E' },

    { token: 'tag', foreground: '7EE787' },
    { token: 'tag.html', foreground: '7EE787' },
    { token: 'metatag.html', foreground: 'FF7B72' },
    { token: 'delimiter.html', foreground: '8B949E' },
    { token: 'delimiter.angle.html', foreground: '8B949E' },
    { token: 'attribute.name', foreground: '79C0FF' },
    { token: 'attribute.name.html', foreground: '79C0FF' },
    { token: 'attribute.value', foreground: 'A5D6FF' },
    { token: 'attribute.value.html', foreground: 'A5D6FF' },

    { token: 'tag.css', foreground: '7EE787' },
    { token: 'attribute.name.css', foreground: '79C0FF' },
    { token: 'attribute.value.css', foreground: 'FFA657' },
    { token: 'keyword.css', foreground: 'FF7B72' },
    { token: 'number.css', foreground: '79C0FF' },
    { token: 'string.css', foreground: 'A5D6FF' },
    { token: 'type.css', foreground: 'FFA657' },
    { token: 'operator.css', foreground: '8B949E' },

    { token: 'keyword.js', foreground: 'FF7B72' },
    { token: 'keyword.ts', foreground: 'FF7B72' },
    { token: 'string.js', foreground: 'A5D6FF' },
    { token: 'string.ts', foreground: 'A5D6FF' },
    { token: 'number.js', foreground: '79C0FF' },
    { token: 'number.ts', foreground: '79C0FF' },
    { token: 'regexp.js', foreground: 'D2A8FF' },
    { token: 'regexp.ts', foreground: 'D2A8FF' },
    { token: 'identifier.function.js', foreground: 'D2A8FF' },
    { token: 'identifier.function.ts', foreground: 'D2A8FF' },
    { token: 'type.identifier.ts', foreground: 'FFA657' },
  ],
  colors: {
    'editor.background': '#0D1117',
    'editor.foreground': '#C9D1D9',
    'editorCursor.foreground': '#58A6FF',
    'editorLineNumber.foreground': '#6E7681',
    'editorLineNumber.activeForeground': '#C9D1D9',
    'editor.selectionBackground': '#264F78',
    'editor.inactiveSelectionBackground': '#1F6FEB40',
    'editor.lineHighlightBackground': '#161B22',
    'editorWhitespace.foreground': '#30363D',
    'editorIndentGuide.background': '#30363D',
    'editorIndentGuide.activeBackground': '#8B949E',
    'editorBracketMatch.background': '#1F6FEB33',
    'editorBracketMatch.border': '#58A6FF',
    'editorBracketHighlight.foreground1': '#58A6FF',
    'editorBracketHighlight.foreground2': '#7EE787',
    'editorBracketHighlight.foreground3': '#FFA657',
    'editorBracketHighlight.foreground4': '#D2A8FF',
    'editorBracketHighlight.foreground5': '#FF7B72',
    'editorBracketHighlight.foreground6': '#79C0FF',
    'editorOverviewRuler.border': '#30363D',
  },
}

export const PAGE_BUILDER_CODE_EDITOR_THEMES: Record<PageBuilderCodeEditorThemeId, PageBuilderCodeEditorThemeDefinition> = {
  light: {
    id: 'light',
    label: '浅色',
    monacoThemeName: 'page-builder-light',
    theme: PAGE_BUILDER_CODE_EDITOR_LIGHT_THEME,
  },
  dark: {
    id: 'dark',
    label: '深色',
    monacoThemeName: 'page-builder-dark',
    theme: PAGE_BUILDER_CODE_EDITOR_DARK_THEME,
  },
}

export const PAGE_BUILDER_CODE_EDITOR_THEME_OPTIONS = [
  PAGE_BUILDER_CODE_EDITOR_THEMES.light,
  PAGE_BUILDER_CODE_EDITOR_THEMES.dark,
]

export const PAGE_BUILDER_CODE_EDITOR_THEME = PAGE_BUILDER_CODE_EDITOR_THEMES.light.theme

export function parsePageBuilderCodeEditorThemeId(value: unknown): PageBuilderCodeEditorThemeId {
  return value === 'dark' ? 'dark' : DEFAULT_PAGE_BUILDER_CODE_EDITOR_THEME_ID
}

export function getPageBuilderCodeEditorThemeName(themeId: PageBuilderCodeEditorThemeId): string {
  return PAGE_BUILDER_CODE_EDITOR_THEMES[themeId].monacoThemeName
}

export interface PageBuilderCodeEditorOptionsInput {
  readOnly: boolean
  minimapEnabled: boolean
}

export function createPageBuilderCodeEditorOptions({
  readOnly,
  minimapEnabled,
}: PageBuilderCodeEditorOptionsInput): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    readOnly,
    minimap: { enabled: minimapEnabled },
    fontFamily: '"JetBrains Mono", "Fira Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    fontLigatures: true,
    fontSize: 13,
    lineHeight: 20,
    renderWhitespace: 'selection',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: 'on',
    tabSize: 2,
    padding: { top: 8 },
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    stickyScroll: { enabled: true },
    linkedEditing: true,
    renderLineHighlight: 'all',
    matchBrackets: 'always',
  }
}
