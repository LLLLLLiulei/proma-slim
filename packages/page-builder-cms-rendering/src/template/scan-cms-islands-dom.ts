export const CMS_ISLAND_SELECTOR = 'cms-catalog, cms-content'

export const CMS_ISLAND_ATTRIBUTES = {
  'cms-catalog': ['site-id', 'ids', 'level', 'parent-id', 'content-type', 'search-keyword', 'take'],
  'cms-content': [
    'site-id',
    'ids',
    'catalog-id',
    'keyword',
    'page-index',
    'page-size',
  ],
} as const

export type CmsIslandComponentName = keyof typeof CMS_ISLAND_ATTRIBUTES
export type CmsIslandPropValue = string | string[]

export interface CmsIslandScanResult {
  component: CmsIslandComponentName
  template: string
  props: Record<string, CmsIslandPropValue>
  element: Element
}

export function scanCmsIslandsFromDom(root: ParentNode): CmsIslandScanResult[] {
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

export function isTopLevelCmsIsland(element: Element): boolean {
  return element.parentElement?.closest(CMS_ISLAND_SELECTOR) == null
}

export function normalizeCmsIslandProps(
  component: CmsIslandComponentName,
  element: Element,
): Record<string, CmsIslandPropValue> {
  const props: Record<string, CmsIslandPropValue> = {}

  for (const attributeName of CMS_ISLAND_ATTRIBUTES[component]) {
    const value = element.getAttribute(attributeName)
    if (!value) {
      continue
    }

    const normalizedValue = value.trim()
    if (!normalizedValue) {
      continue
    }

    const propName = toCamelCase(attributeName)
    props[propName] = propName === 'ids'
      ? normalizedValue.split(',').map((item) => item.trim()).filter(Boolean)
      : normalizedValue
  }

  return props
}

export function toCamelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
}
