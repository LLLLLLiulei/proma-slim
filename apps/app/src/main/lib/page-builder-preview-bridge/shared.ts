import { OVERLAY_ATTR } from './constants'
import type {
  BlockTargetSelection,
  BridgeRect,
  ReplaceImageCapability,
  TargetSelection,
} from './types'

export const logBridge = (..._args: unknown[]) => {}

export function cssEscape(value: string): string {
  if (window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(value)
  }

  return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => {
    const code = character.codePointAt(0)
    return code ? `\\${code.toString(16)} ` : character
  })
}

export function toBridgeRect(rect: DOMRect | BridgeRect): BridgeRect {
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
}

export function resolveReplaceImageCapabilityKey(capability: ReplaceImageCapability | null | undefined): string {
  if (!capability || !capability.supported || !capability.targetDescriptor) {
    return 'replace-image:none'
  }

  return [
    'replace-image',
    capability.targetDescriptor.tagName,
    capability.targetDescriptor.childPath.join('.'),
  ].join(':')
}

export function createBlockTargetSelection(selector: string): BlockTargetSelection {
  return {
    kind: 'block',
    selector,
    parentBlockSelector: selector,
    editBoundary: 'block',
  }
}

export function resolveTargetSelector(targetSelection: TargetSelection): string {
  return targetSelection.kind === 'cms-island'
    ? targetSelection.sourceSelector
    : targetSelection.selector
}

export function resolveTargetRuntimeKey(targetSelection: TargetSelection, islandId?: string): string {
  return targetSelection.kind === 'cms-island'
    ? `cms-island:${islandId ?? `${targetSelection.htmlPath}:${targetSelection.sourceSelector}`}`
    : `block:${targetSelection.selector}`
}

export function resolveRectKey(
  targetSelection: TargetSelection | null,
  rect: BridgeRect | null,
  capabilities?: {
    replaceImage?: ReplaceImageCapability | null
  },
  islandId?: string,
): string | null {
  if (!targetSelection || !rect) {
    return null
  }

  return [
    resolveTargetRuntimeKey(targetSelection, islandId),
    rect.top,
    rect.left,
    rect.right,
    rect.bottom,
    rect.width,
    rect.height,
    resolveReplaceImageCapabilityKey(capabilities?.replaceImage),
  ].join(':')
}

export function resolveElementRect(element: Element | null | undefined): BridgeRect | null {
  if (!element || !document.contains(element)) {
    return null
  }

  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return null
  }

  return toBridgeRect(rect)
}

export function resolveGroupedRect(elements: Element[]): BridgeRect | null {
  const rects = elements
    .filter((element) => element instanceof Element && document.contains(element))
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)

  if (rects.length === 0) {
    return null
  }

  const left = Math.min(...rects.map((rect) => rect.left))
  const top = Math.min(...rects.map((rect) => rect.top))
  const right = Math.max(...rects.map((rect) => rect.right))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))

  return toBridgeRect({
    top,
    left,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  })
}

export function formatLabelToken(value: string): string {
  return String(value)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('')
}

export function isBridgeOverlayNode(node: unknown): boolean {
  return node instanceof Element && node.hasAttribute(OVERLAY_ATTR)
}

export function shouldSyncFromMutations(mutations: MutationRecord[]): boolean {
  return mutations.some((mutation) => {
    if (isBridgeOverlayNode(mutation.target)) {
      return false
    }

    if (mutation.type === 'childList') {
      for (const node of mutation.addedNodes) {
        if (!isBridgeOverlayNode(node)) {
          return true
        }
      }

      for (const node of mutation.removedNodes) {
        if (!isBridgeOverlayNode(node)) {
          return true
        }
      }

      return false
    }

    return true
  })
}
