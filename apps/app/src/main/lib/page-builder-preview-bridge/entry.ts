import { createBootstrapRuntime } from './bootstrap'
import { createCmsIslandRuntime } from './cms-islands'
import { createInlineEditingRuntime } from './inline-editing'
import { createOverlayRuntime } from './overlays'
import { createProtocolRuntime } from './protocol'
import { createSelectionRuntime } from './selection'
import { createRuntimeState } from './state'

function isEmbeddedPreview(): boolean {
  try {
    return window.parent !== window
  } catch {
    return true
  }
}

function startPageBuilderPreviewBridge(): void {
  if (!isEmbeddedPreview()) {
    return
  }

  const state = createRuntimeState()
  const cmsIslands = createCmsIslandRuntime()
  const selection = createSelectionRuntime(state, cmsIslands)

  let syncOverlays = () => {}
  let postToParent = (_message: Record<string, unknown>) => {}
  let postSelectedRect = () => {}
  let clearAll = (_notifyParent: boolean) => {}

  const inlineEditing = createInlineEditingRuntime({
    state,
    selection,
    syncOverlays: () => syncOverlays(),
    postToParent: (message) => postToParent(message),
  })

  const overlays = createOverlayRuntime({
    state,
    selection,
    cmsIslands,
    discardActiveInlineEdit: () => inlineEditing.discardActiveInlineEdit(),
    postToParent: (message) => postToParent(message),
    postSelectedRect: () => postSelectedRect(),
  })

  syncOverlays = overlays.syncOverlays
  clearAll = overlays.clearAll

  const protocol = createProtocolRuntime({
    state,
    selection,
    clearAll: (notifyParent) => clearAll(notifyParent),
    discardActiveInlineEdit: () => inlineEditing.discardActiveInlineEdit(),
    selectTarget: (target) => overlays.selectTarget(target),
    syncOverlays: () => syncOverlays(),
    updateHoveredTarget: (target) => overlays.updateHoveredTarget(target),
    handleInlineTextSaveResult: inlineEditing.handleInlineTextSaveResult,
  })

  postToParent = protocol.postToParent
  postSelectedRect = protocol.postSelectedRect

  const bootstrap = createBootstrapRuntime({
    state,
    selection,
    inlineEditing,
    overlays,
    protocol,
  })

  bootstrap.start()
}

startPageBuilderPreviewBridge()
