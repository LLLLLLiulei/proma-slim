import * as React from 'react'
import {
  DEFAULT_PAGE_BUILDER_CODE_EDITOR_THEME_ID,
  parsePageBuilderCodeEditorThemeId,
  type PageBuilderCodeEditorThemeId,
} from './code-editor-theme'

export const PAGE_BUILDER_CODE_EDITOR_THEME_STORAGE_KEY = 'page-builder.codeEditor.theme'

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

export function readPageBuilderCodeEditorThemePreference(
  storage: Storage | null = getBrowserStorage(),
): PageBuilderCodeEditorThemeId {
  if (!storage) return DEFAULT_PAGE_BUILDER_CODE_EDITOR_THEME_ID
  try {
    return parsePageBuilderCodeEditorThemeId(storage.getItem(PAGE_BUILDER_CODE_EDITOR_THEME_STORAGE_KEY))
  } catch {
    return DEFAULT_PAGE_BUILDER_CODE_EDITOR_THEME_ID
  }
}

export function writePageBuilderCodeEditorThemePreference(
  storage: Storage | null,
  themeId: PageBuilderCodeEditorThemeId,
): void {
  if (!storage) return
  try {
    storage.setItem(PAGE_BUILDER_CODE_EDITOR_THEME_STORAGE_KEY, themeId)
  } catch {
    // Storage can be unavailable in private modes; keep the in-memory selection.
  }
}

export function usePageBuilderCodeEditorThemePreference(): readonly [
  PageBuilderCodeEditorThemeId,
  (themeId: PageBuilderCodeEditorThemeId) => void,
] {
  const [themeId, setThemeId] = React.useState<PageBuilderCodeEditorThemeId>(() =>
    readPageBuilderCodeEditorThemePreference())

  const updateThemeId = React.useCallback((nextThemeId: PageBuilderCodeEditorThemeId) => {
    setThemeId(nextThemeId)
    writePageBuilderCodeEditorThemePreference(getBrowserStorage(), nextThemeId)
  }, [])

  return [themeId, updateThemeId] as const
}
