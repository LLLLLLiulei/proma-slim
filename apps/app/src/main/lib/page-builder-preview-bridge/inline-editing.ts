import { INLINE_EDITING_ATTR, INLINE_SAVING_ATTR } from './constants'
import type { EditableTextTargetDescriptor, RuntimeState } from './types'

interface InlineEditingSelectionRuntime {
  resolveEditableTextTargetDescriptor(
    root: Element | null | undefined,
    element: Element | null | undefined,
  ): EditableTextTargetDescriptor | null
}

interface InlineEditingOptions {
  state: RuntimeState
  selection: InlineEditingSelectionRuntime
  syncOverlays(): void
  postToParent(message: Record<string, unknown>): void
}

export function createInlineEditingRuntime({
  state,
  selection,
  syncOverlays,
  postToParent,
}: InlineEditingOptions) {
  const placeCaretAtEnd = (element: HTMLElement): void => {
    const selectionRange = window.getSelection()
    if (!selectionRange) {
      return
    }

    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    selectionRange.removeAllRanges()
    selectionRange.addRange(range)
  }

  function handleInlineTextBlur(event: FocusEvent) {
    const context = state.activeInlineEdit
    if (!context || event.currentTarget !== context.element) {
      return
    }

    const nextText = context.element.textContent ?? ''
    teardownInlineEdit(context)
    state.activeInlineEdit = null

    if (nextText === context.originalText) {
      syncOverlays()
      return
    }

    const requestId = `inline-text-save-${String(++state.inlineSaveSequence)}`
    context.element.setAttribute(INLINE_SAVING_ATTR, 'true')
    state.pendingInlineSaves.set(requestId, {
      element: context.element,
      previousText: context.originalText,
      nextText,
    })

    postToParent({
      type: 'inline-text-save-request',
      requestId,
      selector: context.selector,
      textTargetDescriptor: context.descriptor,
      previousText: context.originalText,
      nextText,
    })
    syncOverlays()
  }

  const teardownInlineEdit = (context: NonNullable<typeof state.activeInlineEdit>): void => {
    const { element } = context
    element.removeEventListener('blur', handleInlineTextBlur)
    element.removeAttribute(INLINE_EDITING_ATTR)

    if (context.previousContentEditable === null) {
      element.removeAttribute('contenteditable')
    } else {
      element.setAttribute('contenteditable', context.previousContentEditable)
    }

    if (context.previousTabIndex === null) {
      element.removeAttribute('tabindex')
    } else {
      element.setAttribute('tabindex', context.previousTabIndex)
    }
  }

  const discardActiveInlineEdit = (): void => {
    if (!state.activeInlineEdit) {
      return
    }

    teardownInlineEdit(state.activeInlineEdit)
    state.activeInlineEdit = null
  }

  const activateInlineEdit = (element: HTMLElement): boolean => {
    if (!state.selectedTarget || state.selectedTarget.targetSelection.kind !== 'block') {
      return false
    }

    const descriptor = selection.resolveEditableTextTargetDescriptor(state.selectedTarget.primaryElement, element)
    if (!descriptor) {
      return false
    }

    if (state.activeInlineEdit && state.activeInlineEdit.element === element) {
      return true
    }

    discardActiveInlineEdit()

    state.activeInlineEdit = {
      element,
      selector: state.selectedTarget.targetSelection.selector,
      descriptor,
      originalText: element.textContent ?? '',
      previousContentEditable: element.getAttribute('contenteditable'),
      previousTabIndex: element.getAttribute('tabindex'),
    }

    element.setAttribute('contenteditable', 'true')
    element.setAttribute('tabindex', '-1')
    element.setAttribute(INLINE_EDITING_ATTR, 'true')
    element.addEventListener('blur', handleInlineTextBlur)
    element.focus()
    placeCaretAtEnd(element)
    return true
  }

  const handleInlineTextSaveResult = (message: { requestId?: string; ok?: boolean }): void => {
    if (!message.requestId) {
      return
    }

    const pending = state.pendingInlineSaves.get(message.requestId)
    if (!pending) {
      return
    }

    state.pendingInlineSaves.delete(message.requestId)

    if (!document.contains(pending.element)) {
      return
    }

    pending.element.removeAttribute(INLINE_SAVING_ATTR)
    if (!message.ok) {
      pending.element.textContent = pending.previousText
    }

    syncOverlays()
  }

  return {
    discardActiveInlineEdit,
    activateInlineEdit,
    handleInlineTextSaveResult,
  }
}
