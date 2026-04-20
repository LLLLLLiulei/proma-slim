import {
  BRIDGE_SOURCE,
  PARENT_SOURCE,
  READY_ANNOUNCEMENT_INTERVAL_MS,
  READY_ANNOUNCEMENT_MAX_ATTEMPTS,
} from './constants'
import { logBridge, resolveRectKey, resolveTargetSelector } from './shared'
import type { ReplaceImageCapability, ResolvedTarget, RuntimeState } from './types'

interface ProtocolSelectionRuntime {
  refreshResolvedTarget(target: ResolvedTarget | null): ResolvedTarget | null
  resolveTargetRect(target: ResolvedTarget | null): { top: number; left: number; right: number; bottom: number; width: number; height: number } | null
  resolveReplaceImageCapabilityForTarget(target: ResolvedTarget | null): ReplaceImageCapability | null
}

interface ProtocolOptions {
  state: RuntimeState
  selection: ProtocolSelectionRuntime
  clearAll(notifyParent: boolean): void
  syncOverlays(): void
  handleInlineTextSaveResult(message: { requestId?: string; ok?: boolean }): void
}

export function createProtocolRuntime({
  state,
  selection,
  clearAll,
  syncOverlays,
  handleInlineTextSaveResult,
}: ProtocolOptions) {
  const postToParent = (message: Record<string, unknown>): void => {
    window.parent.postMessage({
      source: BRIDGE_SOURCE,
      ...message,
    }, '*')
  }

  const clearReadyAnnouncementTimer = (): void => {
    if (state.readyAnnouncementTimer === null) {
      return
    }

    window.clearInterval(state.readyAnnouncementTimer)
    state.readyAnnouncementTimer = null
  }

  const announceReady = (): void => {
    state.readyAnnouncementAttempts += 1
    logBridge('ready', { attempt: state.readyAnnouncementAttempts })
    postToParent({ type: 'ready' })

    if (state.readyAnnouncementAttempts >= READY_ANNOUNCEMENT_MAX_ATTEMPTS) {
      clearReadyAnnouncementTimer()
    }
  }

  const scheduleReadyAnnouncements = (): void => {
    clearReadyAnnouncementTimer()
    state.readyAnnouncementAttempts = 0
    announceReady()
    state.readyAnnouncementTimer = window.setInterval(announceReady, READY_ANNOUNCEMENT_INTERVAL_MS)
  }

  const postSelectedRect = (): void => {
    if (!state.selectedTarget) {
      state.lastSelectedRectKey = null
      return
    }

    const refreshedTarget = selection.refreshResolvedTarget(state.selectedTarget)
    if (!refreshedTarget) {
      clearAll(true)
      return
    }

    state.selectedTarget = refreshedTarget

    const rect = selection.resolveTargetRect(refreshedTarget)
    if (!rect) {
      clearAll(true)
      return
    }

    const replaceImage = selection.resolveReplaceImageCapabilityForTarget(refreshedTarget)
    const capabilities = replaceImage
      ? { replaceImage }
      : undefined
    const nextKey = resolveRectKey(
      refreshedTarget.targetSelection,
      rect,
      capabilities,
      refreshedTarget.islandId,
    )
    if (nextKey && nextKey === state.lastSelectedRectKey) {
      return
    }

    state.lastSelectedRectKey = nextKey
    postToParent({
      type: 'selected',
      selector: resolveTargetSelector(refreshedTarget.targetSelection),
      targetSelection: refreshedTarget.targetSelection,
      rect,
      ...(capabilities ? { capabilities } : {}),
    })
  }

  const handleParentMessage = (event: MessageEvent): void => {
    const data = event.data
    if (!data || typeof data !== 'object') {
      return
    }

    if ((data as { source?: string }).source !== PARENT_SOURCE) {
      return
    }

    if ((data as { type?: string }).type === 'selection-mode') {
      const payload = data as {
        type: 'selection-mode'
        enabled?: boolean
        locked?: boolean
        showCmsIslandOutlines?: boolean
      }
      logBridge('parent-message', {
        type: payload.type,
        enabled: Boolean(payload.enabled),
        locked: Boolean(payload.locked),
        showCmsIslandOutlines: Boolean(payload.showCmsIslandOutlines),
      })
      state.selectionModeEnabled = Boolean(payload.enabled)
      state.selectionInteractionLocked = Boolean(payload.locked)
      state.showCmsIslandOutlines = Boolean(payload.showCmsIslandOutlines)
      if (!state.selectionModeEnabled) {
        clearAll(false)
      } else {
        syncOverlays()
      }
      return
    }

    if ((data as { type?: string }).type === 'selection-clear') {
      logBridge('parent-message', { type: 'selection-clear' })
      state.selectionModeEnabled = false
      state.selectionInteractionLocked = false
      state.showCmsIslandOutlines = false
      clearAll(false)
      return
    }

    if ((data as { type?: string }).type === 'inline-text-save-result') {
      handleInlineTextSaveResult(data as { requestId?: string; ok?: boolean })
    }
  }

  return {
    postToParent,
    postSelectedRect,
    scheduleReadyAnnouncements,
    handleParentMessage,
  }
}
