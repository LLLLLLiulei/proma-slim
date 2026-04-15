import { PREVIEW_BRIDGE_READY_ATTR } from './constants'
import { shouldSyncFromMutations } from './shared'
import type { ResolvedTarget, RuntimeState } from './types'

interface BootstrapSelectionRuntime {
  resolveSelectableTarget(input: unknown): ResolvedTarget | null
  resolveEditableTextHost(input: unknown): HTMLElement | null
  shouldRetargetSelection(target: ResolvedTarget | null): boolean
}

interface BootstrapInlineEditingRuntime {
  activateInlineEdit(element: HTMLElement): boolean
}

interface BootstrapOverlayRuntime {
  clearAll(notifyParent: boolean): void
  syncOverlays(): void
  updateHoveredTarget(target: ResolvedTarget | null): void
  selectTarget(target: ResolvedTarget | null): void
}

interface BootstrapProtocolRuntime {
  scheduleReadyAnnouncements(): void
  handleParentMessage(event: MessageEvent): void
}

interface BootstrapOptions {
  state: RuntimeState
  selection: BootstrapSelectionRuntime
  inlineEditing: BootstrapInlineEditingRuntime
  overlays: BootstrapOverlayRuntime
  protocol: BootstrapProtocolRuntime
}

export function createBootstrapRuntime({
  state,
  selection,
  inlineEditing,
  overlays,
  protocol,
}: BootstrapOptions) {
  const previewWindow = window as Window & typeof globalThis & {
    __PROMA_CMS_RENDERING_PREVIEW__?: {
      hasCmsRendering?: boolean
    }
    __PROMA_CMS_RENDERING_PREVIEW_READY__?: boolean
  }

  const handleMouseMove = (event: MouseEvent): void => {
    if (!state.selectionModeEnabled || state.selectionInteractionLocked) {
      return
    }

    const target = selection.resolveSelectableTarget(event.target)
    overlays.updateHoveredTarget(target)
  }

  const handleMouseOut = (event: MouseEvent): void => {
    if (!state.selectionModeEnabled || state.selectionInteractionLocked) {
      return
    }

    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && document.contains(relatedTarget)) {
      return
    }

    overlays.updateHoveredTarget(null)
  }

  const handleClick = (event: MouseEvent): void => {
    if (!state.selectionModeEnabled || state.selectionInteractionLocked) {
      return
    }

    const target = selection.resolveSelectableTarget(event.target)
    if (!target) {
      overlays.clearAll(true)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation()
    }

    if (selection.shouldRetargetSelection(target)) {
      if (state.activeInlineEdit && state.activeInlineEdit.element !== target.primaryElement) {
        state.activeInlineEdit.element.blur()
      }

      overlays.updateHoveredTarget(target)
      overlays.selectTarget(target)
      return
    }

    if (state.selectedTarget && state.selectedTarget.key === target.key) {
      if (state.activeInlineEdit && state.activeInlineEdit.element !== target.primaryElement) {
        state.activeInlineEdit.element.blur()
      }

      overlays.updateHoveredTarget(state.selectedTarget)
      if (state.selectedTarget.targetSelection.kind === 'block') {
        const editableHost = selection.resolveEditableTextHost(event.target)
        if (editableHost) {
          inlineEditing.activateInlineEdit(editableHost)
        } else {
          overlays.syncOverlays()
        }
      } else {
        overlays.syncOverlays()
      }
      return
    }

    if (state.activeInlineEdit && state.activeInlineEdit.element !== target.primaryElement) {
      state.activeInlineEdit.element.blur()
    }

    overlays.updateHoveredTarget(target)
    overlays.selectTarget(target)
  }

  const init = (): void => {
    if (document.documentElement.hasAttribute(PREVIEW_BRIDGE_READY_ATTR)) {
      return
    }

    document.documentElement.setAttribute(PREVIEW_BRIDGE_READY_ATTR, 'ready')
    document.addEventListener('mousemove', handleMouseMove, true)
    document.addEventListener('mouseout', handleMouseOut, true)
    document.addEventListener('click', handleClick, true)
    window.addEventListener('message', protocol.handleParentMessage)
    window.addEventListener('scroll', overlays.syncOverlays, true)
    window.addEventListener('resize', overlays.syncOverlays)
    if (typeof MutationObserver === 'function') {
      state.mutationObserver = new MutationObserver((mutations) => {
        if (!shouldSyncFromMutations(mutations)) {
          return
        }

        overlays.syncOverlays()
      })
      state.mutationObserver.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
      })
    }
    protocol.scheduleReadyAnnouncements()
  }

  const initWhenPreviewReady = (): void => {
    const shouldWaitForCmsRenderingReady = previewWindow.__PROMA_CMS_RENDERING_PREVIEW__?.hasCmsRendering === true
    if (shouldWaitForCmsRenderingReady) {
      if (previewWindow.__PROMA_CMS_RENDERING_PREVIEW_READY__ === true) {
        init()
        return
      }

      document.addEventListener('proma:cms-rendering-ready', init, { once: true })
      return
    }

    init()
  }

  const start = (): void => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initWhenPreviewReady, { once: true })
    } else {
      initWhenPreviewReady()
    }
  }

  return {
    start,
  }
}
