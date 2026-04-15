import type { RuntimeState } from './types'

export function createRuntimeState(): RuntimeState {
  return {
    selectionModeEnabled: false,
    selectionInteractionLocked: false,
    showCmsIslandOutlines: false,
    hoveredTarget: null,
    selectedTarget: null,
    lastSelectedRectKey: null,
    mutationObserver: null,
    readyAnnouncementAttempts: 0,
    readyAnnouncementTimer: null,
    activeInlineEdit: null,
    inlineSaveSequence: 0,
    pendingInlineSaves: new Map(),
    passiveCmsIslandOverlays: new Map(),
  }
}
