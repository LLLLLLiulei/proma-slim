import { BLOCKED_TAGS, EDITABLE_TEXT_TAGS } from './constants'
import { formatLabelToken, createBlockTargetSelection, cssEscape, resolveElementRect, resolveGroupedRect, resolveTargetRuntimeKey } from './shared'
import type {
  EditableTextTargetDescriptor,
  ReplaceImageCapability,
  ReplaceImageTargetDescriptor,
  ResolvedTarget,
  RuntimeState,
} from './types'

interface CmsIslandRuntime {
  resolveCmsIslandRoots(islandId: string | null | undefined): Element[]
  resolveCmsIslandTarget(input: unknown): ResolvedTarget | null
}

export function createSelectionRuntime(
  state: RuntimeState,
  cmsIslands: CmsIslandRuntime,
) {
  const isUniqueSelector = (selector: string): boolean => {
    if (!selector) {
      return false
    }

    try {
      return document.querySelectorAll(selector).length === 1
    } catch {
      return false
    }
  }

  const getNthOfType = (element: Element): number => {
    let index = 1
    let sibling = element.previousElementSibling
    while (sibling) {
      if (sibling.tagName === element.tagName) {
        index += 1
      }
      sibling = sibling.previousElementSibling
    }
    return index
  }

  const resolveSelectableElement = (input: unknown): Element | null => {
    let element = input instanceof Element ? input : null

    while (element) {
      if (element.hasAttribute('data-page-builder-preview-overlay')) {
        element = element.parentElement
        continue
      }

      if (!BLOCKED_TAGS.has(element.tagName)) {
        return element
      }

      element = element.parentElement
    }

    return null
  }

  const resolveSelector = (element: Element): string => {
    if (element.id) {
      const idSelector = `#${cssEscape(element.id)}`
      if (isUniqueSelector(idSelector)) {
        return idSelector
      }
    }

    const dataAttributes = Array.from(element.attributes)
      .filter((attribute) => attribute.name.startsWith('data-') && attribute.value)
    for (const attribute of dataAttributes) {
      const dataSelector = `[${attribute.name}="${attribute.value.replace(/"/g, '\\"')}"]`
      if (isUniqueSelector(dataSelector)) {
        return dataSelector
      }
    }

    const classNames = Array.from(element.classList)
      .filter((className) => /^[A-Za-z0-9_-]+$/.test(className))
      .slice(0, 2)
    if (classNames.length > 0) {
      const classSelector = `${element.tagName.toLowerCase()}.${classNames.map(cssEscape).join('.')}`
      if (isUniqueSelector(classSelector)) {
        return classSelector
      }
    }

    const segments: string[] = []
    let current: Element | null = element
    while (current && !BLOCKED_TAGS.has(current.tagName)) {
      const tagName = current.tagName.toLowerCase()

      if (current.id) {
        segments.unshift(`#${cssEscape(current.id)}`)
        const selector = segments.join(' > ')
        if (isUniqueSelector(selector)) {
          return selector
        }
        break
      }

      segments.unshift(`${tagName}:nth-of-type(${getNthOfType(current)})`)
      const selector = segments.join(' > ')
      if (isUniqueSelector(selector)) {
        return selector
      }

      current = current.parentElement
    }

    return segments.join(' > ')
  }

  const resolveTargetRect = (target: ResolvedTarget | null): ReturnType<typeof resolveElementRect> => {
    if (!target) {
      return null
    }

    return target.targetSelection.kind === 'cms-island'
      ? resolveGroupedRect(target.elements)
      : resolveElementRect(target.primaryElement)
  }

  const refreshResolvedTarget = (target: ResolvedTarget | null): ResolvedTarget | null => {
    if (!target) {
      return null
    }

    if (target.targetSelection.kind === 'cms-island') {
      const elements = cmsIslands.resolveCmsIslandRoots(target.islandId)
      const primaryElement = elements[0]
      if (!primaryElement) {
        return null
      }

      return {
        ...target,
        elements,
        primaryElement,
      }
    }

    try {
      const element = document.querySelector(target.targetSelection.selector)
      if (!(element instanceof Element)) {
        return null
      }

      return {
        ...target,
        primaryElement: element,
        elements: [element],
      }
    } catch {
      return null
    }
  }

  const resolveElementLabel = (element: Element): string => {
    const dataSection = element.getAttribute('data-section')
    if (dataSection) {
      return formatLabelToken(dataSection)
    }

    const ariaLabel = element.getAttribute('aria-label')
    if (ariaLabel) {
      return formatLabelToken(ariaLabel)
    }

    const title = element.getAttribute('title')
    if (title) {
      return formatLabelToken(title)
    }

    if (element.id) {
      return formatLabelToken(element.id)
    }

    const tagName = element.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tagName)) {
      return `Header${tagName.slice(1)}`
    }

    const tagLabelMap: Record<string, string> = {
      button: 'Button',
      section: 'Section',
      article: 'Article',
      nav: 'Navigation',
      header: 'Header',
      footer: 'Footer',
      main: 'Main',
      form: 'Form',
      input: 'Input',
      textarea: 'Textarea',
      select: 'Select',
      img: 'Image',
      a: 'Link',
      p: 'Paragraph',
      ul: 'List',
      ol: 'List',
      li: 'ListItem',
      span: 'Text',
      div: 'Container',
    }
    if (tagLabelMap[tagName]) {
      return tagLabelMap[tagName]
    }

    const className = Array.from(element.classList).find(Boolean)
    if (className) {
      return formatLabelToken(className)
    }

    return formatLabelToken(tagName) || 'Block'
  }

  const resolveTargetLabel = (target: ResolvedTarget | null): string => {
    if (!target) {
      return ''
    }

    return target.targetSelection.kind === 'cms-island'
      ? target.targetSelection.component
      : resolveElementLabel(target.primaryElement)
  }

  const buildChildPath = (root: Element, element: Element): number[] | null => {
    const path: number[] = []
    let current: Element | null = element

    while (current && current !== root) {
      const parent: Element | null = current.parentElement
      if (!parent) {
        return null
      }

      const index = Array.from(parent.children).indexOf(current)
      if (index < 0) {
        return null
      }

      path.unshift(index)
      current = parent
    }

    return current === root ? path : null
  }

  const resolveReplaceImageTargetDescriptor = (
    root: Element | null | undefined,
    element: Element | null | undefined,
  ): ReplaceImageTargetDescriptor | null => {
    if (!root || !element || !root.contains(element) || element.tagName !== 'IMG') {
      return null
    }

    const childPath = buildChildPath(root, element)
    if (!childPath) {
      return null
    }

    return {
      version: 1,
      tagName: element.tagName.toLowerCase(),
      childPath,
    }
  }

  const resolveReplaceImageCapability = (element: Element | null | undefined): ReplaceImageCapability | null => {
    if (!(element instanceof Element)) {
      return null
    }

    if (element.tagName === 'IMG') {
      const targetDescriptor = resolveReplaceImageTargetDescriptor(element, element)
      return targetDescriptor
        ? {
            supported: true,
            targetDescriptor,
          }
        : null
    }

    const imageElements = Array.from(element.querySelectorAll('img'))
    if (imageElements.length !== 1) {
      return null
    }

    const targetDescriptor = resolveReplaceImageTargetDescriptor(element, imageElements[0])
    return targetDescriptor
      ? {
          supported: true,
          targetDescriptor,
        }
      : null
  }

  const resolveReplaceImageCapabilityForTarget = (
    target: ResolvedTarget | null,
  ): ReplaceImageCapability | null => {
    if (!target || target.targetSelection.kind !== 'block') {
      return null
    }

    return resolveReplaceImageCapability(target.primaryElement)
  }

  const hasVisibleDirectText = (element: Element): boolean => {
    return Array.from(element.childNodes).some((node) =>
      node.nodeType === Node.TEXT_NODE && Boolean(node.textContent && node.textContent.trim()),
    )
  }

  const isEditableTextHost = (element: Element | null | undefined): boolean => {
    if (!(element instanceof Element)) {
      return false
    }

    if (!EDITABLE_TEXT_TAGS.has(element.tagName)) {
      return false
    }

    if (element.children.length > 0) {
      return false
    }

    return hasVisibleDirectText(element)
  }

  const resolveEditableTextTargetDescriptor = (
    root: Element | null | undefined,
    element: Element | null | undefined,
  ): EditableTextTargetDescriptor | null => {
    if (!root || !element || !root.contains(element) || !isEditableTextHost(element)) {
      return null
    }

    const childPath = buildChildPath(root, element)
    if (!childPath) {
      return null
    }

    return {
      version: 1,
      tagName: element.tagName.toLowerCase(),
      childPath,
    }
  }

  const resolveEditableTextHost = (input: unknown): HTMLElement | null => {
    if (!state.selectedTarget || state.selectedTarget.targetSelection.kind !== 'block') {
      return null
    }

    const selectedElement = state.selectedTarget.primaryElement
    let element = input instanceof Element ? input : null
    while (element && selectedElement.contains(element)) {
      if (isEditableTextHost(element)) {
        const descriptor = resolveEditableTextTargetDescriptor(selectedElement, element)
        if (descriptor) {
          return element as HTMLElement
        }
      }

      if (element === selectedElement) {
        break
      }

      element = element.parentElement
    }

    return null
  }

  const resolveSelectableTarget = (input: unknown): ResolvedTarget | null => {
    const cmsIslandTarget = cmsIslands.resolveCmsIslandTarget(input)
    if (cmsIslandTarget) {
      return cmsIslandTarget
    }

    const element = resolveSelectableElement(input)
    const selector = element ? resolveSelector(element) : null
    if (!element || !selector) {
      return null
    }

    const targetSelection = createBlockTargetSelection(selector)
    return {
      key: resolveTargetRuntimeKey(targetSelection),
      targetSelection,
      primaryElement: element,
      elements: [element],
    }
  }

  const shouldRetargetSelection = (target: ResolvedTarget | null): boolean => {
    return Boolean(
      state.selectedTarget
      && target
      && state.selectedTarget.targetSelection.kind === 'block'
      && target.targetSelection.kind === 'block'
      && state.selectedTarget.key !== target.key
      && state.selectedTarget.primaryElement !== target.primaryElement
      && state.selectedTarget.primaryElement.contains(target.primaryElement),
    )
  }

  return {
    refreshResolvedTarget,
    resolveTargetRect,
    resolveTargetLabel,
    resolveReplaceImageCapabilityForTarget,
    resolveEditableTextTargetDescriptor,
    resolveEditableTextHost,
    resolveSelectableTarget,
    shouldRetargetSelection,
    isEditableTextHost,
    resolveSelector,
  }
}
