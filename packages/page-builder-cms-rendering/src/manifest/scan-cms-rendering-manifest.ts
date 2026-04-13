import { parseHTML } from 'linkedom'
import {
  CMS_ISLAND_SELECTOR,
  isTopLevelCmsIsland,
  toCamelCase,
  type CmsIslandComponentName,
} from '../template/scan-cms-islands-dom'
import {
  CMS_RENDERING_MANIFEST_VERSION,
  type CmsRenderingManifest,
  type CmsRenderingManifestEntry,
} from './cms-rendering-manifest'

const BLOCK_SELECTOR = '[data-proma-block-id]'
const BLOCKED_SELECTOR_TAGS = new Set(['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'META', 'LINK'])

export interface ScanCmsRenderingManifestOptions {
  htmlPath?: string
  generatedAt?: string
}

export function scanCmsRenderingManifest(
  source: string | ParentNode,
  options: ScanCmsRenderingManifestOptions = {},
): CmsRenderingManifest {
  const root = typeof source === 'string' ? parseHTML(source).document : source
  const entries = Array.from(root.querySelectorAll(CMS_ISLAND_SELECTOR))
    .filter(isTopLevelCmsIsland)
    .map((element, islandIndex) => createManifestEntry(
      element,
      islandIndex,
      options.htmlPath ?? 'index.html',
    ))

  return {
    version: CMS_RENDERING_MANIFEST_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    entries,
  }
}

export function resolveCmsRenderingSelectorSnapshot(element: Element): string | null {
  if (element.id) {
    const idSelector = `#${cssEscape(element.id)}`
    if (isUniqueSelector(element, idSelector)) {
      return idSelector
    }
  }

  const dataAttributes = Array.from(element.attributes)
    .filter((attribute) => attribute.name.startsWith('data-') && attribute.value.trim())

  for (const attribute of dataAttributes) {
    const selector = `[${attribute.name}="${attribute.value.replace(/"/g, '\\"')}"]`
    if (isUniqueSelector(element, selector)) {
      return selector
    }
  }

  const classNames = Array.from(element.classList)
    .filter((className) => /^[A-Za-z0-9_-]+$/.test(className))
    .slice(0, 2)

  if (classNames.length > 0) {
    const selector = `${element.tagName.toLowerCase()}.${classNames.map(cssEscape).join('.')}`
    if (isUniqueSelector(element, selector)) {
      return selector
    }
  }

  const segments: string[] = []
  let current: Element | null = element

  while (current && !BLOCKED_SELECTOR_TAGS.has(current.tagName)) {
    if (current.id) {
      segments.unshift(`#${cssEscape(current.id)}`)
      const selector = segments.join(' > ')
      if (isUniqueSelector(element, selector)) {
        return selector
      }
      break
    }

    segments.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${getNthOfType(current)})`)
    const selector = segments.join(' > ')
    if (isUniqueSelector(element, selector)) {
      return selector
    }

    current = current.parentElement
  }

  return segments.length > 0 ? segments.join(' > ') : null
}

function createManifestEntry(
  element: Element,
  islandIndex: number,
  htmlPath: string,
): CmsRenderingManifestEntry {
  const component = element.tagName.toLowerCase() as CmsIslandComponentName
  const blockElement = element.closest(BLOCK_SELECTOR)
  const selectorTarget = blockElement ?? resolveFallbackSelectorTarget(element)
  const blockId = normalizeOptionalAttribute(blockElement, 'data-proma-block-id')

  return {
    blockId,
    selectorSnapshot: resolveCmsRenderingSelectorSnapshot(selectorTarget),
    component,
    props: normalizeManifestProps(element),
    htmlPath,
    islandIndex,
  }
}

function resolveFallbackSelectorTarget(element: Element): Element {
  const parent = element.parentElement

  if (parent && !BLOCKED_SELECTOR_TAGS.has(parent.tagName)) {
    return parent
  }

  return element
}

function normalizeManifestProps(element: Element): Record<string, string> {
  const props: Record<string, string> = {}

  for (const attribute of Array.from(element.attributes)) {
    const normalizedValue = attribute.value.trim()
    if (!normalizedValue) {
      continue
    }

    props[toCamelCase(attribute.name)] = normalizedValue
  }

  return props
}

function normalizeOptionalAttribute(element: Element | null, attributeName: string): string | null {
  const value = element?.getAttribute(attributeName)?.trim()
  return value ? value : null
}

function getNthOfType(element: Element): number {
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

function isUniqueSelector(element: Element, selector: string): boolean {
  const root = element.ownerDocument
  if (!root) {
    return false
  }

  try {
    return root.querySelectorAll(selector).length === 1
  } catch {
    return false
  }
}

function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => {
    const code = character.codePointAt(0)
    return code ? `\\${code.toString(16)} ` : character
  })
}
