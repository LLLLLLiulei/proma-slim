import { describe, expect, test } from 'bun:test'
import { shouldHandleCodeEditorSaveShortcut } from './code-editor-shortcuts'

function event(overrides: Partial<KeyboardEvent> = {}): Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'> {
  return {
    altKey: false,
    ctrlKey: false,
    key: 's',
    metaKey: true,
    shiftKey: false,
    ...overrides,
  }
}

describe('code-editor-shortcuts', () => {
  test('只在代码 Tab 激活、编辑器聚焦、非只读时处理保存快捷键', () => {
    expect(shouldHandleCodeEditorSaveShortcut(event(), {
      active: true,
      editorFocused: true,
      readOnly: false,
    })).toBe(true)

    expect(shouldHandleCodeEditorSaveShortcut(event(), {
      active: false,
      editorFocused: true,
      readOnly: false,
    })).toBe(false)

    expect(shouldHandleCodeEditorSaveShortcut(event(), {
      active: true,
      editorFocused: false,
      readOnly: false,
    })).toBe(false)

    expect(shouldHandleCodeEditorSaveShortcut(event(), {
      active: true,
      editorFocused: true,
      readOnly: true,
    })).toBe(false)
  })

  test('忽略非保存快捷键和带额外修饰键的组合', () => {
    const activeOptions = {
      active: true,
      editorFocused: true,
      readOnly: false,
    }

    expect(shouldHandleCodeEditorSaveShortcut(event({ metaKey: false, ctrlKey: false }), activeOptions)).toBe(false)
    expect(shouldHandleCodeEditorSaveShortcut(event({ key: 'p' }), activeOptions)).toBe(false)
    expect(shouldHandleCodeEditorSaveShortcut(event({ altKey: true }), activeOptions)).toBe(false)
    expect(shouldHandleCodeEditorSaveShortcut(event({ shiftKey: true }), activeOptions)).toBe(false)
  })
})
