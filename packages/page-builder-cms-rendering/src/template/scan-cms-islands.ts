import { parseHTML } from 'linkedom'

const CMS_ISLAND_SELECTOR = 'cms-catalog, cms-content'

const CMS_ISLAND_ATTRIBUTES = {
  'cms-catalog': ['level', 'parent-id', 'content-type', 'search-keyword', 'take'],
  'cms-content': [
    'catalog-id',
    'content-select-type',
    'keyword',
    'title',
    'page-index',
    'page-size',
  ],
} as const

export type CmsIslandComponentName = keyof typeof CMS_ISLAND_ATTRIBUTES

export interface CmsIslandScanResult {
  component: CmsIslandComponentName
  template: string
  props: Record<string, string>
  element: Element
}

export function scanCmsIslands(source: string | ParentNode): CmsIslandScanResult[] {
  const root = typeof source === 'string' ? parseHTML(source).document : source
  const islands = Array.from(root.querySelectorAll(CMS_ISLAND_SELECTOR)).filter(isTopLevelCmsIsland)

  return islands.map((element) => {
    const component = element.tagName.toLowerCase() as CmsIslandComponentName

    return {
      component,
      template: element.outerHTML,
      props: normalizeCmsIslandProps(component, element),
      element,
    }
  })
}

function isTopLevelCmsIsland(element: Element): boolean {
  return element.parentElement?.closest(CMS_ISLAND_SELECTOR) == null
}

function normalizeCmsIslandProps(
  component: CmsIslandComponentName,
  element: Element,
): Record<string, string> {
  const props: Record<string, string> = {}

  for (const attributeName of CMS_ISLAND_ATTRIBUTES[component]) {
    const value = element.getAttribute(attributeName)
    if (!value) {
      continue
    }

    const normalizedValue = value.trim()
    if (!normalizedValue) {
      continue
    }

    props[toCamelCase(attributeName)] = normalizedValue
  }

  return props
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
}
