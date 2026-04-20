import {
  CMS_ISLAND_COMPONENT_ATTR,
  CMS_ISLAND_EDIT_BOUNDARY_ATTR,
  CMS_ISLAND_HTML_PATH_ATTR,
  CMS_ISLAND_ID_ATTR,
  CMS_ISLAND_PARENT_BLOCK_SELECTOR_ATTR,
  CMS_ISLAND_SOURCE_SELECTOR_ATTR,
  OVERLAY_ATTR,
} from './constants'
import { resolveTargetRuntimeKey } from './shared'
import type { CmsIslandMeta, CmsIslandTargetSelection, ResolvedTarget } from './types'

function normalizeEditBoundary(value: string | null): 'source-atomic' {
  return value === 'source-atomic' ? value : 'source-atomic'
}

export function createCmsIslandRuntime() {
  const resolveCmsIslandRoots = (islandId: string | null | undefined): Element[] => {
    if (!islandId) {
      return []
    }

    try {
      return Array.from(document.querySelectorAll(`[${CMS_ISLAND_ID_ATTR}="${islandId}"]`))
        .filter((element): element is Element => element instanceof Element)
    } catch {
      return []
    }
  }

  const resolveCmsIslandMeta = (element: Element | null | undefined): CmsIslandMeta | null => {
    if (!(element instanceof Element)) {
      return null
    }

    const islandId = element.getAttribute(CMS_ISLAND_ID_ATTR)
    if (!islandId) {
      return null
    }

    const htmlPath = element.getAttribute(CMS_ISLAND_HTML_PATH_ATTR)
    const component = element.getAttribute(CMS_ISLAND_COMPONENT_ATTR)
    const sourceSelector = element.getAttribute(CMS_ISLAND_SOURCE_SELECTOR_ATTR)
    const parentBlockSelector = element.getAttribute(CMS_ISLAND_PARENT_BLOCK_SELECTOR_ATTR)
    if (!htmlPath || !component || !sourceSelector || !parentBlockSelector) {
      return null
    }

    const elements = resolveCmsIslandRoots(islandId)
    if (elements.length === 0) {
      return null
    }

    return {
      islandId,
      htmlPath,
      component,
      sourceSelector,
      parentBlockSelector,
      editBoundary: normalizeEditBoundary(element.getAttribute(CMS_ISLAND_EDIT_BOUNDARY_ATTR)),
      elements,
    }
  }

  const isSameCmsIslandMeta = (left: CmsIslandMeta | null, right: CmsIslandMeta | null): boolean => {
    return Boolean(
      left
      && right
      && left.islandId === right.islandId
      && left.htmlPath === right.htmlPath
      && left.component === right.component
      && left.sourceSelector === right.sourceSelector
      && left.parentBlockSelector === right.parentBlockSelector,
    )
  }

  const resolveCmsIslandSubtreeMeta = (element: Element | null | undefined): CmsIslandMeta | null => {
    if (!(element instanceof Element) || element.hasAttribute(OVERLAY_ATTR)) {
      return null
    }

    const directMeta = resolveCmsIslandMeta(element)
    if (directMeta) {
      return directMeta
    }

    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE && Boolean(node.textContent && node.textContent.trim())) {
        return null
      }
    }

    const childElements = Array.from(element.children)
      .filter((child): child is Element => child instanceof Element && !child.hasAttribute(OVERLAY_ATTR))
    if (childElements.length === 0) {
      return null
    }

    let resolvedMeta: CmsIslandMeta | null = null
    for (const child of childElements) {
      const childMeta = resolveCmsIslandSubtreeMeta(child)
      if (!childMeta) {
        return null
      }

      if (resolvedMeta && !isSameCmsIslandMeta(resolvedMeta, childMeta)) {
        return null
      }

      resolvedMeta = childMeta
    }

    return resolvedMeta
  }

  const createCmsIslandTarget = (
    meta: CmsIslandMeta,
    primaryElement: Element,
  ): ResolvedTarget => {
    const targetSelection: CmsIslandTargetSelection = {
      kind: 'cms-island',
      htmlPath: meta.htmlPath,
      sourceSelector: meta.sourceSelector,
      parentBlockSelector: meta.parentBlockSelector,
      component: meta.component,
      editBoundary: meta.editBoundary,
    }

    return {
      key: resolveTargetRuntimeKey(targetSelection, meta.islandId),
      islandId: meta.islandId,
      targetSelection,
      primaryElement,
      elements: meta.elements,
    }
  }

  const resolveCmsIslandTarget = (input: unknown): ResolvedTarget | null => {
    let element = input instanceof Element ? input : null

    while (element) {
      if (element.hasAttribute(OVERLAY_ATTR)) {
        element = element.parentElement
        continue
      }

      const meta = resolveCmsIslandSubtreeMeta(element)
      if (meta) {
        return createCmsIslandTarget(meta, element)
      }

      element = element.parentElement
    }

    return null
  }

  const resolvePassiveCmsIslandTargets = (): ResolvedTarget[] => {
    const seenIslandIds = new Set<string>()
    const targets: ResolvedTarget[] = []
    const roots = Array.from(document.querySelectorAll(`[${CMS_ISLAND_ID_ATTR}]`))
      .filter((element): element is Element => element instanceof Element)

    for (const root of roots) {
      const meta = resolveCmsIslandMeta(root)
      if (!meta || seenIslandIds.has(meta.islandId)) {
        continue
      }

      seenIslandIds.add(meta.islandId)
      targets.push(createCmsIslandTarget(meta, meta.elements[0] ?? root))
    }

    return targets
  }

  return {
    resolveCmsIslandRoots,
    resolveCmsIslandTarget,
    resolvePassiveCmsIslandTargets,
  }
}
