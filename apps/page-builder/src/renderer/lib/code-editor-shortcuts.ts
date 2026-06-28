export interface CodeEditorSaveShortcutState {
  active: boolean
  editorFocused: boolean
  readOnly: boolean
}

export function shouldHandleCodeEditorSaveShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
  state: CodeEditorSaveShortcutState,
): boolean {
  if (!state.active || !state.editorFocused || state.readOnly) {
    return false
  }

  return (event.metaKey || event.ctrlKey)
    && !event.altKey
    && !event.shiftKey
    && (event.key === 's' || event.key === 'S')
}
