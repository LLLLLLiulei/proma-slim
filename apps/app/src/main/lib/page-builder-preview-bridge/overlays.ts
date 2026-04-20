import {
  CMS_PASSIVE_OVERLAY_ISLAND_ATTR,
  CMS_PASSIVE_OVERLAY_KIND,
  LABEL_MAX_WIDTH,
  OVERLAY_ATTR,
} from './constants'
import type { PassiveCmsIslandOverlayPair, ResolvedTarget, RuntimeState } from './types'

interface OverlaySelectionRuntime {
  refreshResolvedTarget(target: ResolvedTarget | null): ResolvedTarget | null
  resolveTargetRect(target: ResolvedTarget | null): { top: number; left: number; right: number; bottom: number; width: number; height: number } | null
  resolveTargetLabel(target: ResolvedTarget | null): string
}

interface CmsIslandRuntime {
  resolvePassiveCmsIslandTargets(): ResolvedTarget[]
}

interface OverlayRuntimeOptions {
  state: RuntimeState
  selection: OverlaySelectionRuntime
  cmsIslands: CmsIslandRuntime
  discardActiveInlineEdit(): void
  postToParent(message: Record<string, unknown>): void
  postSelectedRect(): void
}

export function resolveOverlayBorder(kind: 'hover' | 'selected', target: ResolvedTarget | null): string {
  return kind === 'selected' && target?.targetSelection.kind !== 'cms-island'
    ? '2px solid rgba(37, 99, 235, 0.92)'
    : '2px dashed rgba(59, 130, 246, 0.65)'
}

function resolveOverlayBackground(kind: 'hover' | 'selected', target: ResolvedTarget | null): string {
  if (kind === 'selected' && target?.targetSelection.kind !== 'cms-island') {
    return 'rgba(37, 99, 235, 0.16)'
  }

  return target?.targetSelection.kind === 'cms-island'
    ? 'rgba(59, 130, 246, 0.07)'
    : 'rgba(59, 130, 246, 0.10)'
}

function resolveOverlayShadow(kind: 'hover' | 'selected', target: ResolvedTarget | null): string {
  if (kind === 'selected' && target?.targetSelection.kind !== 'cms-island') {
    return '0 0 0 1px rgba(255,255,255,0.8), 0 10px 28px rgba(37, 99, 235, 0.16)'
  }

  return target?.targetSelection.kind === 'cms-island'
    ? '0 0 0 1px rgba(255,255,255,0.72), 0 8px 24px rgba(59, 130, 246, 0.10)'
    : '0 0 0 1px rgba(255,255,255,0.65), 0 8px 24px rgba(59, 130, 246, 0.12)'
}

export function createOverlayRuntime({
  state,
  selection,
  cmsIslands,
  discardActiveInlineEdit,
  postToParent,
  postSelectedRect,
}: OverlayRuntimeOptions) {
  const createOverlay = (kind: string): HTMLDivElement => {
    const element = document.createElement('div')
    element.setAttribute(OVERLAY_ATTR, kind)
    Object.assign(element.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      display: 'none',
      pointerEvents: 'none',
      zIndex: '2147483647',
      borderRadius: '0',
      boxSizing: 'border-box',
      transition: 'all 120ms ease-out',
    })
    document.body.appendChild(element)
    return element
  }

  const createOverlayLabel = (kind: string): HTMLDivElement => {
    const label = document.createElement('div')
    label.setAttribute(OVERLAY_ATTR, `${kind}-label`)
    Object.assign(label.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      display: 'none',
      pointerEvents: 'none',
      zIndex: '2147483647',
      boxSizing: 'border-box',
      padding: '6px 10px',
      maxWidth: `${LABEL_MAX_WIDTH}px`,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '12px',
      lineHeight: '1',
      fontWeight: '600',
      letterSpacing: '0.01em',
      color: '#ffffff',
      background: kind === 'selected'
        ? 'rgba(37, 99, 235, 0.96)'
        : 'rgba(59, 130, 246, 0.92)',
      borderRadius: '4px',
      boxShadow: kind === 'selected'
        ? '0 8px 20px rgba(37, 99, 235, 0.22)'
        : '0 6px 16px rgba(59, 130, 246, 0.18)',
      transform: 'translateY(0)',
    })
    document.body.appendChild(label)
    return label
  }

  const hoverOverlay = createOverlay('hover')
  const selectedOverlay = createOverlay('selected')
  const hoverLabel = createOverlayLabel('hover')
  const selectedLabel = createOverlayLabel('selected')

  const hideOverlayPair = (overlay: HTMLElement, label: HTMLElement): void => {
    overlay.style.display = 'none'
    label.style.display = 'none'
    label.textContent = ''
  }

  const createPassiveCmsIslandOverlayPair = (islandId: string): PassiveCmsIslandOverlayPair => {
    const overlay = createOverlay(CMS_PASSIVE_OVERLAY_KIND)
    const label = createOverlayLabel(CMS_PASSIVE_OVERLAY_KIND)
    overlay.setAttribute(CMS_PASSIVE_OVERLAY_ISLAND_ATTR, islandId)
    label.setAttribute(CMS_PASSIVE_OVERLAY_ISLAND_ATTR, islandId)
    return { overlay, label }
  }

  const clearPassiveCmsIslandOverlays = (): void => {
    for (const { overlay, label } of state.passiveCmsIslandOverlays.values()) {
      overlay.remove()
      label.remove()
    }

    state.passiveCmsIslandOverlays.clear()
  }

  const updateOverlay = (
    overlay: HTMLElement,
    target: ResolvedTarget | null,
    kind: 'hover' | 'selected',
  ): void => {
    const rect = selection.resolveTargetRect(target)
    if (!target || !rect) {
      overlay.style.display = 'none'
      return
    }

    overlay.style.display = 'block'
    overlay.style.left = `${rect.left}px`
    overlay.style.top = `${rect.top}px`
    overlay.style.width = `${rect.width}px`
    overlay.style.height = `${rect.height}px`
    overlay.style.border = resolveOverlayBorder(kind, target)
    overlay.style.background = resolveOverlayBackground(kind, target)
    overlay.style.boxShadow = resolveOverlayShadow(kind, target)
  }

  const updateOverlayLabel = (label: HTMLElement, target: ResolvedTarget | null): void => {
    const rect = selection.resolveTargetRect(target)
    if (!target || !rect) {
      label.style.display = 'none'
      label.textContent = ''
      return
    }

    label.textContent = selection.resolveTargetLabel(target)
    label.style.display = 'block'

    const labelRect = label.getBoundingClientRect()
    const labelWidth = labelRect.width || LABEL_MAX_WIDTH
    const labelHeight = labelRect.height || 24
    const desiredLeft = target.targetSelection.kind === 'cms-island'
      ? rect.right - labelWidth
      : rect.left
    const maxLeft = Math.max(0, window.innerWidth - labelWidth)
    const nextTop = Math.max(0, rect.top - labelHeight - 4)

    label.style.left = `${Math.min(Math.max(0, desiredLeft), maxLeft)}px`
    label.style.top = `${nextTop}px`
  }

  const resolveEffectiveHoverTarget = (): ResolvedTarget | null => {
    return state.selectionModeEnabled
      && !state.selectionInteractionLocked
      && state.hoveredTarget
      && (!state.selectedTarget || state.hoveredTarget.key !== state.selectedTarget.key)
      ? state.hoveredTarget
      : null
  }

  const syncPassiveCmsIslandOverlays = (effectiveHoverTarget: ResolvedTarget | null): void => {
    if (!state.selectionModeEnabled || !state.showCmsIslandOutlines) {
      clearPassiveCmsIslandOverlays()
      return
    }

    const passiveTargets = cmsIslands.resolvePassiveCmsIslandTargets()
    const activeIslandIds = new Set(passiveTargets.map((target) => target.islandId).filter(Boolean) as string[])
    for (const [islandId, pair] of state.passiveCmsIslandOverlays.entries()) {
      if (!activeIslandIds.has(islandId)) {
        pair.overlay.remove()
        pair.label.remove()
        state.passiveCmsIslandOverlays.delete(islandId)
      }
    }

    const hiddenIslandIds = new Set<string>()
    if (state.selectedTarget?.targetSelection.kind === 'cms-island' && state.selectedTarget.islandId) {
      hiddenIslandIds.add(state.selectedTarget.islandId)
    }
    if (effectiveHoverTarget?.targetSelection.kind === 'cms-island' && effectiveHoverTarget.islandId) {
      hiddenIslandIds.add(effectiveHoverTarget.islandId)
    }

    for (const target of passiveTargets) {
      const islandId = target.islandId
      if (!islandId) {
        continue
      }

      let pair = state.passiveCmsIslandOverlays.get(islandId)
      if (!pair) {
        pair = createPassiveCmsIslandOverlayPair(islandId)
        state.passiveCmsIslandOverlays.set(islandId, pair)
      }

      if (hiddenIslandIds.has(islandId)) {
        hideOverlayPair(pair.overlay, pair.label)
        continue
      }

      updateOverlay(pair.overlay, target, 'hover')
      updateOverlayLabel(pair.label, target)
    }
  }

  const clearHover = (): void => {
    state.hoveredTarget = null
    hideOverlayPair(hoverOverlay, hoverLabel)
  }

  const clearSelected = (): void => {
    discardActiveInlineEdit()
    state.selectedTarget = null
    hideOverlayPair(selectedOverlay, selectedLabel)
  }

  const clearAll = (notifyParent: boolean): void => {
    clearHover()
    clearSelected()
    state.lastSelectedRectKey = null
    syncPassiveCmsIslandOverlays(null)
    if (notifyParent) {
      postToParent({ type: 'reset' })
    }
  }

  const syncOverlays = (): void => {
    const hadSelectedTarget = Boolean(state.selectedTarget)
    state.hoveredTarget = selection.refreshResolvedTarget(state.hoveredTarget)
    state.selectedTarget = selection.refreshResolvedTarget(state.selectedTarget)

    if (hadSelectedTarget && !state.selectedTarget) {
      clearAll(true)
      return
    }

    if (state.selectedTarget === null && state.activeInlineEdit) {
      discardActiveInlineEdit()
    }

    const effectiveHoverTarget = resolveEffectiveHoverTarget()

    updateOverlay(hoverOverlay, effectiveHoverTarget, 'hover')
    updateOverlayLabel(hoverLabel, effectiveHoverTarget)
    updateOverlay(selectedOverlay, state.selectedTarget, 'selected')
    updateOverlayLabel(selectedLabel, state.selectedTarget)
    syncPassiveCmsIslandOverlays(effectiveHoverTarget)

    if (state.selectedTarget) {
      postSelectedRect()
      return
    }

    state.lastSelectedRectKey = null
  }

  const updateHoveredTarget = (target: ResolvedTarget | null): void => {
    const nextTarget = target ? selection.refreshResolvedTarget(target) : null
    if (state.hoveredTarget?.key === nextTarget?.key) {
      syncOverlays()
      return
    }

    state.hoveredTarget = nextTarget
    syncOverlays()
    postToParent({
      type: 'hover',
      selector: nextTarget ? (nextTarget.targetSelection.kind === 'cms-island'
        ? nextTarget.targetSelection.sourceSelector
        : nextTarget.targetSelection.selector) : null,
      targetSelection: nextTarget?.targetSelection ?? null,
    })
  }

  const selectTarget = (target: ResolvedTarget | null): void => {
    const nextTarget = target ? selection.refreshResolvedTarget(target) : null
    if (!nextTarget) {
      clearAll(true)
      return
    }

    state.selectedTarget = nextTarget
    syncOverlays()
  }

  return {
    clearAll,
    syncOverlays,
    updateHoveredTarget,
    selectTarget,
  }
}
