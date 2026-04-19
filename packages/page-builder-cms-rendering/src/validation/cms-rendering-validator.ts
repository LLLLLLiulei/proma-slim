import { parseHTML } from 'linkedom'
import { PAGE_BUILDER_CMS_AUTHORING_CONTRACT } from '@proma/shared'
import {
  CMS_ISLAND_ATTRIBUTES,
  CMS_ISLAND_SELECTOR,
  CMS_SOURCE_ID_ATTRIBUTE,
  isTopLevelCmsIsland,
  type CmsIslandComponentName,
} from '../template/scan-cms-islands-dom'
import { resolveCmsRenderingSelectorSnapshot } from '../manifest/scan-cms-rendering-manifest'

const BLOCK_SELECTOR = '[data-proma-block-id]'
const DANGEROUS_TAGS = new Set(['script', 'style'])
const ALLOWED_STRUCTURAL_ATTRIBUTES = new Set(['id', 'class', 'style', 'title', 'role'])
const CATALOG_OUTSIDE_SLOT_CONTAINER_TAGS = new Set(['ul', 'ol', 'nav'])
const CONTENT_OUTSIDE_SLOT_CONTAINER_TAGS = new Set(['section', 'ul', 'ol'])
const CATALOG_ITEM_TAGS = new Set(['li', 'a'])
const CONTENT_ITEM_TAGS = new Set(['article', 'li'])
const ITEM_FIELD_ACCESS_PATTERN = /\bitem\??\.([A-Za-z_][A-Za-z0-9_]*)\b/g
const INDEXED_ITEM_FIELD_ACCESS_PATTERN = /\bitems\s*\[[^\]]+\]\??\.([A-Za-z_][A-Za-z0-9_]*)\b/g
const SLOT_SCOPE_REFERENCE_PATTERN = /(^|[^\w$.])(items|loading|error|empty)\b(?!\s*:)/g
const SLOT_SCOPE_ALIAS_REFERENCE_PATTERN = /(^|[^\w$.])([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*(items|loading|error|empty)\b/g
const ITEM_INDEX_ACCESS_PATTERN = /\bitems\s*\[[^\]]+\]\??\.([A-Za-z_][A-Za-z0-9_]*)\b/g

export type CmsRenderingDiagnosticSeverity = 'error' | 'warning' | 'info'

export interface CmsRenderingDiagnostic {
  severity: CmsRenderingDiagnosticSeverity
  code: string
  message: string
  component?: CmsIslandComponentName
  blockId?: string | null
  selectorSnapshot?: string | null
  htmlPath?: string
  islandIndex?: number
}

export interface CmsRenderingValidationResult {
  valid: boolean
  diagnostics: CmsRenderingDiagnostic[]
  errors: CmsRenderingDiagnostic[]
  warnings: CmsRenderingDiagnostic[]
  infos: CmsRenderingDiagnostic[]
}

export interface ValidateCmsRenderingOptions {
  htmlPath?: string
}

export function validateCmsRendering(
  source: string | ParentNode,
  options: ValidateCmsRenderingOptions = {},
): CmsRenderingValidationResult {
  const root = typeof source === 'string' ? parseHTML(source).document : source
  const htmlPath = options.htmlPath ?? 'index.html'
  const diagnostics: CmsRenderingDiagnostic[] = []
  const topLevelIslands = Array.from(root.querySelectorAll(CMS_ISLAND_SELECTOR)).filter(isTopLevelCmsIsland)
  const topLevelIslandIndexByElement = new Map(topLevelIslands.map((element, index) => [element, index]))
  const topLevelSourceIdCounts = new Map<string, number>()

  for (const island of topLevelIslands) {
    const sourceId = readSourceIdAttribute(island)
    if (!sourceId) {
      continue
    }

    topLevelSourceIdCounts.set(sourceId, (topLevelSourceIdCounts.get(sourceId) ?? 0) + 1)
  }

  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (element.closest(CMS_ISLAND_SELECTOR)) {
      continue
    }

    validateOutsideCmsVueSyntax(element, htmlPath, diagnostics)
  }

  for (const nestedIsland of Array.from(root.querySelectorAll(CMS_ISLAND_SELECTOR)).filter((element) => !isTopLevelCmsIsland(element))) {
    diagnostics.push(createDiagnostic({
      severity: 'error',
      code: 'NESTED_CMS_ISLAND',
      message: 'Nested cms-* islands are not supported.',
      element: nestedIsland,
      component: nestedIsland.tagName.toLowerCase() as CmsIslandComponentName,
      htmlPath,
    }))
  }

  for (const island of Array.from(root.querySelectorAll(CMS_ISLAND_SELECTOR))) {
    const component = island.tagName.toLowerCase() as CmsIslandComponentName
    const islandIndex = topLevelIslandIndexByElement.get(island)
    const slotInfo = collectSlotInfo(island)
    const catalogId = island.getAttribute('catalog-id')?.trim()
    const orderedIds = readOrderedIdsAttribute(island.getAttribute('ids'))
    const sourceId = isTopLevelCmsIsland(island) ? readSourceIdAttribute(island) : null

    if (component === 'cms-content' && !catalogId) {
      diagnostics.push(createDiagnostic({
        severity: 'error',
        code: 'MISSING_CATALOG_ID',
        message: orderedIds ? 'cms-content ids require catalog-id.' : 'cms-content requires catalog-id.',
        element: island,
        component,
        htmlPath,
        islandIndex,
      }))
    }

    if (component === 'cms-content' && orderedIds && hasConflictingContentIdsProps(island)) {
      diagnostics.push(createDiagnostic({
        severity: 'error',
        code: 'CONFLICTING_SOURCE_PROPS',
        message: 'cms-content ids cannot be combined with catalog query props.',
        element: island,
        component,
        htmlPath,
        islandIndex,
      }))
    }

    if (component === 'cms-catalog' && orderedIds && hasConflictingCatalogIdsProps(island)) {
      diagnostics.push(createDiagnostic({
        severity: 'error',
        code: 'CONFLICTING_SOURCE_PROPS',
        message: 'cms-catalog ids cannot be combined with catalog query props.',
        element: island,
        component,
        htmlPath,
        islandIndex,
      }))
    }

    if (sourceId && (topLevelSourceIdCounts.get(sourceId) ?? 0) > 1) {
      diagnostics.push(createDiagnostic({
        severity: 'error',
        code: 'DUPLICATE_SOURCE_ID',
        message: `Duplicate cms source id "${sourceId}" is not allowed across top-level CMS islands.`,
        element: island,
        component,
        htmlPath,
        islandIndex,
      }))
    }

    if (!slotInfo.defaultSlot) {
      diagnostics.push(createDiagnostic({
        severity: 'error',
        code: 'MISSING_DEFAULT_SLOT',
        message: 'CMS islands require a <template v-slot:default> slot.',
        element: island,
        component,
        htmlPath,
        islandIndex,
      }))
    }

    if (slotInfo.defaultSlot?.shorthand) {
      diagnostics.push(createDiagnostic({
        severity: 'warning',
        code: 'SHORTHAND_SLOT_SYNTAX',
        message: 'Use explicit v-slot:* syntax instead of shorthand slot syntax.',
        element: island,
        component,
        htmlPath,
        islandIndex,
      }))
    }

    if (slotInfo.emptySlot?.shorthand || slotInfo.errorSlot?.shorthand) {
      diagnostics.push(createDiagnostic({
        severity: 'warning',
        code: 'SHORTHAND_SLOT_SYNTAX',
        message: 'Use explicit v-slot:* syntax instead of shorthand slot syntax.',
        element: island,
        component,
        htmlPath,
        islandIndex,
      }))
    }

    if (slotInfo.defaultSlot && !slotInfo.defaultSlot.content.trim()) {
      diagnostics.push(createDiagnostic({
        severity: 'warning',
        code: 'EMPTY_DEFAULT_SLOT',
        message: 'The default slot is empty.',
        element: island,
        component,
        htmlPath,
        islandIndex,
      }))
    }

    maybeReportOutsideSlotMajorContainerWarning(
      island,
      component,
      slotInfo.defaultSlot,
      htmlPath,
      islandIndex,
      diagnostics,
    )

    if (!slotInfo.emptySlot) {
      diagnostics.push(createDiagnostic({
        severity: 'info',
        code: 'MISSING_EMPTY_SLOT',
        message: 'Consider adding a v-slot:empty fallback.',
        element: island,
        component,
        htmlPath,
        islandIndex,
      }))
    }

    if (!slotInfo.errorSlot) {
      diagnostics.push(createDiagnostic({
        severity: 'info',
        code: 'MISSING_ERROR_SLOT',
        message: 'Consider adding a v-slot:error fallback.',
        element: island,
        component,
        htmlPath,
        islandIndex,
      }))
    }

    for (const attribute of Array.from(island.attributes)) {
      if (CMS_ISLAND_ATTRIBUTES[component].includes(attribute.name as never) || isAllowedStructuralAttribute(attribute.name)) {
        continue
      }

      diagnostics.push(createDiagnostic({
        severity: 'warning',
        code: 'UNKNOWN_PROP',
        message: `Unknown prop "${attribute.name}" on ${component}.`,
        element: island,
        component,
        htmlPath,
        islandIndex,
      }))
    }

    const slotRoots = slotInfo.allSlots.map((slot) => ({
      slot,
      root: parseTemplateSlot(slot.content),
    }))

    for (const slot of slotInfo.allSlots) {
      const resolvedSlotScope = resolveDeclaredSlotScopeVariables(slot.scopeExpression)
      if (!resolvedSlotScope.valid) {
        diagnostics.push(createDiagnostic({
          severity: 'error',
          code: 'INVALID_SLOT_SCOPE',
          message: `CMS slot "${slot.name}" must declare an explicit subset of { items, loading, error, empty }.`,
          element: island,
          component,
          htmlPath,
          islandIndex,
        }))
      }

      for (const variable of collectUndeclaredSlotVariables(slot.content, resolvedSlotScope.declared)) {
        diagnostics.push(createDiagnostic({
          severity: 'error',
          code: 'UNKNOWN_SLOT_VARIABLE',
          message: `Unknown CMS slot variable "${variable}" in ${component} ${slot.name} slot.`,
          element: island,
          component,
          htmlPath,
          islandIndex,
        }))
      }
    }

    for (const dangerousTag of DANGEROUS_TAGS) {
      for (const dangerousNode of Array.from(island.querySelectorAll(dangerousTag))) {
        if (dangerousNode.closest('template')) {
          continue
        }

        diagnostics.push(createDiagnostic({
          severity: 'error',
          code: 'DANGEROUS_TAG',
          message: `Dangerous tag <${dangerousTag}> is not allowed inside CMS islands.`,
          element: island,
          component,
          htmlPath,
          islandIndex,
        }))
      }
    }

      for (const { slot, root: slotRoot } of slotRoots) {
      const optionalItemFields = getOptionalItemFields(component)

      for (const nestedIsland of Array.from(slotRoot.querySelectorAll(CMS_ISLAND_SELECTOR))) {
        diagnostics.push(createDiagnostic({
          severity: 'error',
          code: 'NESTED_CMS_ISLAND',
          message: 'Nested cms-* islands are not supported.',
          element: island,
          component: nestedIsland.tagName.toLowerCase() as CmsIslandComponentName,
          htmlPath,
          islandIndex,
        }))
      }

      for (const dangerousTag of DANGEROUS_TAGS) {
        if (slotRoot.querySelector(dangerousTag)) {
          diagnostics.push(createDiagnostic({
            severity: 'error',
            code: 'DANGEROUS_TAG',
            message: `Dangerous tag <${dangerousTag}> is not allowed inside CMS islands.`,
            element: island,
            component,
            htmlPath,
            islandIndex,
          }))
        }
      }

      for (const descendant of Array.from(slotRoot.querySelectorAll('*'))) {
        if (
          descendant.hasAttribute('v-for')
          && !descendant.hasAttribute(':key')
          && !descendant.hasAttribute('v-bind:key')
        ) {
          diagnostics.push(createDiagnostic({
            severity: 'warning',
            code: 'MISSING_V_FOR_KEY',
            message: 'Elements using v-for inside CMS slots should provide a stable :key.',
            element: island,
            component,
            htmlPath,
            islandIndex,
          }))
        }

        const boundUrlValues = [
          descendant.getAttribute(':src'),
          descendant.getAttribute('v-bind:src'),
          descendant.getAttribute(':href'),
          descendant.getAttribute('v-bind:href'),
          descendant.getAttribute(':srcset'),
          descendant.getAttribute('v-bind:srcset'),
        ].filter((value): value is string => typeof value === 'string')
        const hasOptionalUrlBinding = boundUrlValues.some((value) =>
          referencesOptionalItemField(value, optionalItemFields),
        )

        if (hasOptionalUrlBinding && !descendant.hasAttribute('v-if') && !descendant.hasAttribute('v-else-if')) {
          diagnostics.push(createDiagnostic({
            severity: 'warning',
            code: 'UNGUARDED_OPTIONAL_URL',
            message: 'Optional URL bindings should be guarded with v-if.',
            element: island,
            component,
            htmlPath,
            islandIndex,
          }))
          break
        }
      }

      const unsupportedFieldAccesses = collectUnsupportedItemFieldAccesses(slot.content, component)
      for (const fieldAccess of unsupportedFieldAccesses) {
        diagnostics.push(createDiagnostic({
          severity: 'error',
          code: 'UNKNOWN_ITEM_FIELD',
          message: `Unknown CMS item field access "${fieldAccess}" for ${component}.`,
          element: island,
          component,
          htmlPath,
          islandIndex,
        }))
      }
    }
  }

  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning')
  const infos = diagnostics.filter((diagnostic) => diagnostic.severity === 'info')

  return {
    valid: errors.length === 0,
    diagnostics,
    errors,
    warnings,
    infos,
  }
}

function validateOutsideCmsVueSyntax(
  element: Element,
  htmlPath: string,
  diagnostics: CmsRenderingDiagnostic[],
): void {
  const hasVueAttribute = Array.from(element.attributes).some((attribute) =>
    attribute.name.startsWith('v-') || attribute.name.startsWith(':') || attribute.name.startsWith('@'),
  )
  const hasVueInterpolation = Array.from(element.childNodes).some((node) =>
    node.nodeType === node.TEXT_NODE && /{{[\s\S]+?}}/.test(node.textContent ?? ''),
  )

  if (!hasVueAttribute && !hasVueInterpolation) {
    return
  }

  diagnostics.push(createDiagnostic({
    severity: 'error',
    code: 'OUTSIDE_CMS_VUE_SYNTAX',
    message: 'Vue template syntax is only supported inside cms-* islands.',
    element,
    htmlPath,
  }))
}

function collectSlotInfo(element: Element): {
  defaultSlot: SlotInfo | null
  emptySlot: SlotInfo | null
  errorSlot: SlotInfo | null
  allSlots: SlotInfo[]
} {
  const slots = Array.from(element.children)
    .filter((child): child is Element => child.tagName.toLowerCase() === 'template')
    .map((child) => resolveSlotInfo(child))
    .filter((slot): slot is SlotInfo => slot !== null)

  return {
    defaultSlot: slots.find((slot) => slot.name === 'default') ?? null,
    emptySlot: slots.find((slot) => slot.name === 'empty') ?? null,
    errorSlot: slots.find((slot) => slot.name === 'error') ?? null,
    allSlots: slots,
  }
}

interface SlotInfo {
  name: 'default' | 'empty' | 'error'
  shorthand: boolean
  content: string
  scopeExpression: string | null
}

function resolveSlotInfo(templateElement: Element): SlotInfo | null {
  for (const attribute of Array.from(templateElement.attributes)) {
    if (attribute.name === 'v-slot:default' || attribute.name === '#default') {
      return {
        name: 'default',
        shorthand: attribute.name.startsWith('#'),
        content: templateElement.innerHTML,
        scopeExpression: normalizeSlotScopeExpression(attribute.value),
      }
    }

    if (attribute.name === 'v-slot:empty' || attribute.name === '#empty') {
      return {
        name: 'empty',
        shorthand: attribute.name.startsWith('#'),
        content: templateElement.innerHTML,
        scopeExpression: normalizeSlotScopeExpression(attribute.value),
      }
    }

    if (attribute.name === 'v-slot:error' || attribute.name === '#error') {
      return {
        name: 'error',
        shorthand: attribute.name.startsWith('#'),
        content: templateElement.innerHTML,
        scopeExpression: normalizeSlotScopeExpression(attribute.value),
      }
    }
  }

  return null
}

function createDiagnostic(input: {
  severity: CmsRenderingDiagnosticSeverity
  code: string
  message: string
  element: Element
  htmlPath: string
  component?: CmsIslandComponentName
  islandIndex?: number
}): CmsRenderingDiagnostic {
  const blockElement = input.element.closest(BLOCK_SELECTOR)
  const selectorTarget = blockElement ?? input.element

  return {
    severity: input.severity,
    code: input.code,
    message: input.message,
    component: input.component,
    blockId: blockElement?.getAttribute('data-proma-block-id')?.trim() ?? null,
    selectorSnapshot: resolveCmsRenderingSelectorSnapshot(selectorTarget),
    htmlPath: input.htmlPath,
    islandIndex: input.islandIndex,
  }
}

function parseTemplateSlot(content: string): ParentNode {
  return parseHTML(`<!doctype html><html><body><div data-proma-slot-root>${content}</div></body></html>`)
    .document
    .querySelector('[data-proma-slot-root]')!
}

function isAllowedStructuralAttribute(attributeName: string): boolean {
  return ALLOWED_STRUCTURAL_ATTRIBUTES.has(attributeName)
    || attributeName.startsWith('data-')
    || attributeName.startsWith('aria-')
}

function readOrderedIdsAttribute(value: string | null): string[] | null {
  const normalized = value?.trim()
  if (!normalized) {
    return null
  }

  const ids = normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return ids.length > 0 ? ids : null
}

function readSourceIdAttribute(element: Element): string | null {
  const normalized = element.getAttribute(CMS_SOURCE_ID_ATTRIBUTE)?.trim()
  return normalized ? normalized : null
}

function collectUnsupportedItemFieldAccesses(
  source: string,
  component: CmsIslandComponentName,
): string[] {
  const allowedFields = new Set(PAGE_BUILDER_CMS_AUTHORING_CONTRACT.components[component].itemFields)
  const unsupported = new Set<string>()

  for (const match of source.matchAll(ITEM_FIELD_ACCESS_PATTERN)) {
    const field = match[1]
    if (field && !allowedFields.has(field)) {
      unsupported.add(`item.${field}`)
    }
  }

  for (const match of source.matchAll(INDEXED_ITEM_FIELD_ACCESS_PATTERN)) {
    const field = match[1]
    if (field && !allowedFields.has(field)) {
      unsupported.add(`items[*].${field}`)
    }
  }

  return [...unsupported]
}

function getOptionalItemFields(component: CmsIslandComponentName): Set<string> {
  return new Set(
    PAGE_BUILDER_CMS_AUTHORING_CONTRACT.components[component].itemFieldMeta
      .filter((field) => field.optional)
      .map((field) => field.name),
  )
}

function referencesOptionalItemField(source: string, optionalFields: ReadonlySet<string>): boolean {
  for (const match of source.matchAll(ITEM_FIELD_ACCESS_PATTERN)) {
    const field = match[1]
    if (field && optionalFields.has(field)) {
      return true
    }
  }

  for (const match of source.matchAll(ITEM_INDEX_ACCESS_PATTERN)) {
    const field = match[1]
    if (field && optionalFields.has(field)) {
      return true
    }
  }

  return false
}

function normalizeSlotScopeExpression(value: string | null): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function resolveDeclaredSlotScopeVariables(scopeExpression: string | null): {
  valid: boolean
  declared: Set<string>
} {
  const declared = new Set<string>()
  const normalized = scopeExpression?.trim()
  if (!normalized || !normalized.startsWith('{') || !normalized.endsWith('}')) {
    return {
      valid: false,
      declared,
    }
  }

  const rawEntries = normalized.slice(1, -1)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (rawEntries.length === 0) {
    return {
      valid: false,
      declared,
    }
  }

  const allowedVariables = new Set(PAGE_BUILDER_CMS_AUTHORING_CONTRACT.slotScope)

  for (const rawEntry of rawEntries) {
    if (
      rawEntry.includes(':')
      || rawEntry.startsWith('...')
      || rawEntry.includes('[')
      || rawEntry.includes(']')
    ) {
      return {
        valid: false,
        declared: new Set<string>(),
      }
    }

    const identifier = rawEntry.replace(/\s*=.*$/, '').trim()
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(identifier) || !allowedVariables.has(identifier)) {
      return {
        valid: false,
        declared: new Set<string>(),
      }
    }

    declared.add(identifier)
  }

  return {
    valid: true,
    declared,
  }
}

function collectUndeclaredSlotVariables(
  source: string,
  declaredVariables: ReadonlySet<string>,
): string[] {
  const undeclared = new Set<string>()
  for (const match of source.matchAll(SLOT_SCOPE_REFERENCE_PATTERN)) {
    const identifier = match[2]
    if (identifier && !declaredVariables.has(identifier)) {
      undeclared.add(identifier)
    }
  }

  for (const match of source.matchAll(SLOT_SCOPE_ALIAS_REFERENCE_PATTERN)) {
    const identifier = match[2]
    if (identifier && !declaredVariables.has(identifier)) {
      undeclared.add(identifier)
    }
  }

  return [...undeclared]
}

function hasConflictingCatalogIdsProps(island: Element): boolean {
  return hasNonEmptyAttribute(island, 'level')
    || hasNonEmptyAttribute(island, 'parent-id')
    || hasNonEmptyAttribute(island, 'content-type')
    || hasNonEmptyAttribute(island, 'search-keyword')
    || hasNonEmptyAttribute(island, 'take')
}

function hasConflictingContentIdsProps(island: Element): boolean {
  return hasNonEmptyAttribute(island, 'keyword')
    || hasNonEmptyAttribute(island, 'page-index')
    || hasNonEmptyAttribute(island, 'page-size')
}

function hasNonEmptyAttribute(element: Element, attributeName: string): boolean {
  return Boolean(element.getAttribute(attributeName)?.trim())
}

function maybeReportOutsideSlotMajorContainerWarning(
  island: Element,
  component: CmsIslandComponentName,
  defaultSlot: SlotInfo | null,
  htmlPath: string,
  islandIndex: number | undefined,
  diagnostics: CmsRenderingDiagnostic[],
): void {
  if (!defaultSlot) {
    return
  }

  const parent = island.parentElement
  if (!parent || !isOutsideSlotContainerCandidate(parent, component) || !hasOnlyIslandAsElementChild(parent, island)) {
    return
  }

  const slotRoot = parseTemplateSlot(defaultSlot.content)
  if (!slotContainsOnlyItemLevelNodes(slotRoot, component)) {
    return
  }

  diagnostics.push(createDiagnostic({
    severity: 'warning',
    code: 'OUTSIDE_SLOT_MAJOR_CONTAINER',
    message: 'Prefer moving the major dynamic container into the CMS slot so the cms-* tag remains the source root.',
    element: island,
    component,
    htmlPath,
    islandIndex,
  }))
}

function isOutsideSlotContainerCandidate(
  element: Element,
  component: CmsIslandComponentName,
): boolean {
  const tagName = element.tagName.toLowerCase()

  if (component === 'cms-catalog') {
    return CATALOG_OUTSIDE_SLOT_CONTAINER_TAGS.has(tagName)
  }

  if (CONTENT_OUTSIDE_SLOT_CONTAINER_TAGS.has(tagName)) {
    return true
  }

  if (tagName !== 'div') {
    return false
  }

  const className = element.getAttribute('class') ?? ''
  return /\b(grid|list|cards?|items?)\b/i.test(className)
}

function hasOnlyIslandAsElementChild(parent: Element, island: Element): boolean {
  return Array.from(parent.children).filter((child) => child !== island).length === 0
}

function slotContainsOnlyItemLevelNodes(
  slotRoot: ParentNode,
  component: CmsIslandComponentName,
): boolean {
  const childElements = Array.from(slotRoot.childNodes)
    .filter((node): node is Element => node.nodeType === node.ELEMENT_NODE)

  if (childElements.length === 0) {
    return false
  }

  const itemTags = component === 'cms-catalog' ? CATALOG_ITEM_TAGS : CONTENT_ITEM_TAGS
  return childElements.every((element) => isItemLevelNode(element, itemTags))
}

function isItemLevelNode(element: Element, itemTags: ReadonlySet<string>): boolean {
  const tagName = element.tagName.toLowerCase()
  if (itemTags.has(tagName)) {
    return true
  }

  if (tagName !== 'div') {
    return false
  }

  const className = element.getAttribute('class') ?? ''
  return /\b(card|item)\b/i.test(className)
}
