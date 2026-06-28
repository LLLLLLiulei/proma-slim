import { describe, expect, test } from 'bun:test'
import {
  PAGE_BUILDER_CODE_EDITOR_THEME_STORAGE_KEY,
  readPageBuilderCodeEditorThemePreference,
  writePageBuilderCodeEditorThemePreference,
} from './code-editor-theme-preference'

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  }
}

describe('code-editor-theme-preference', () => {
  test('reads a valid stored Monaco editor theme preference', () => {
    const storage = createMemoryStorage()
    storage.setItem(PAGE_BUILDER_CODE_EDITOR_THEME_STORAGE_KEY, 'dark')

    expect(readPageBuilderCodeEditorThemePreference(storage)).toBe('dark')
  })

  test('falls back to light when stored value is missing or invalid', () => {
    const storage = createMemoryStorage()

    expect(readPageBuilderCodeEditorThemePreference(storage)).toBe('light')

    storage.setItem(PAGE_BUILDER_CODE_EDITOR_THEME_STORAGE_KEY, 'unknown')
    expect(readPageBuilderCodeEditorThemePreference(storage)).toBe('light')
  })

  test('writes the selected Monaco editor theme preference', () => {
    const storage = createMemoryStorage()

    writePageBuilderCodeEditorThemePreference(storage, 'dark')

    expect(storage.getItem(PAGE_BUILDER_CODE_EDITOR_THEME_STORAGE_KEY)).toBe('dark')
  })
})
