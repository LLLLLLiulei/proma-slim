import {
  NodeTypes,
  compile,
  parse as parseVueTemplate,
  type DirectiveNode,
  type ElementNode,
  type ExpressionNode,
  type InterpolationNode,
  type TemplateChildNode,
} from '@vue/compiler-dom'
import { parseHTML } from 'linkedom'
import { PAGE_BUILDER_CMS_AUTHORING_CONTRACT } from '@ai-page-builder/shared'
import {
  CMS_ISLAND_ATTRIBUTES,
  CMS_ISLAND_SELECTOR,
  isTopLevelCmsIsland,
  type CmsIslandComponentName,
} from '../template/scan-cms-islands-dom'
import {
  resolveCmsIslandSourceSelectorSnapshot,
  resolveCmsRenderingSelectorSnapshot,
} from '../manifest/scan-cms-rendering-manifest'

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
const BARE_FUNCTION_CALL_PATTERN = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:\?\.)?\s*\(/g
const INLINE_EVENT_HANDLER_ATTRIBUTE_PATTERN = /^on[a-z]+$/
const VUE_PACKAGE_SPECIFIER_PATTERN = /^(?:vue|@vue\/.+)$/i
const VUE_RUNTIME_URL_PATTERN = /(?:^|[/:@._-])vue(?:@[\w.-]+)?(?:[/:._-]|$)|@vue\//i
const VUE_MODULE_IMPORT_PATTERN = /\bimport(?:["'\s*{},A-Za-z_$\n\r]+from\s*)?["']([^"']+)["']/g
const VUE_DYNAMIC_IMPORT_PATTERN = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
const VUE_REQUIRE_PATTERN = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g
const VUE_CREATE_APP_CALL_PATTERN = /\b(?:Vue|window\.Vue)\.(?:createApp|createSSRApp)\s*\(/i
const VUE_LOCAL_CREATE_APP_CALL_PATTERN = /\b(?:createApp|createSSRApp)\s*\(/
const VUE_GLOBAL_DESTRUCTURE_PATTERN = /\b(?:const|let|var)\s*{\s*[^}]*\b(?:createApp|createSSRApp)\b[^}]*}\s*=\s*(?:window\.)?Vue\b/i
const VUE_GLOBAL_ASSIGNMENT_PATTERN = /\b(?:const|let|var)\s+\w+\s*=\s*(?:window\.)?Vue\.(?:createApp|createSSRApp)\b/i
const RESERVED_FUNCTION_LIKE_IDENTIFIERS = new Set([
  'await',
  'case',
  'catch',
  'class',
  'const',
  'do',
  'delete',
  'else',
  'for',
  'function',
  'if',
  'import',
  'let',
  'new',
  'return',
  'super',
  'switch',
  'try',
  'throw',
  'typeof',
  'var',
  'void',
  'while',
  'yield',
])
const SAFE_SLOT_EXPRESSION_GLOBALS = new Set([
  'Array',
  'Boolean',
  'Date',
  'JSON',
  'Math',
  'Number',
  'Object',
  'String',
  'decodeURI',
  'decodeURIComponent',
  'encodeURI',
  'encodeURIComponent',
  'isFinite',
  'isNaN',
  'parseFloat',
  'parseInt',
])

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

  validateAuthorManagedVueRuntime(root, htmlPath, diagnostics)

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

    validateCmsSourcePropValues(
      island,
      component,
      htmlPath,
      islandIndex,
      diagnostics,
    )

    const runtimeOnlyAttrs = collectRuntimeOnlyAttributes(island)
    if (runtimeOnlyAttrs.length > 0) {
      diagnostics.push(createDiagnostic({
        severity: 'error',
        code: 'RUNTIME_ONLY_ATTRIBUTE',
        message: `Authoring HTML must not persist runtime-only CMS locator attrs: ${runtimeOnlyAttrs.join(', ')}.`,
        element: island,
        component,
        htmlPath,
        islandIndex,
      }))
    }

    if (isTopLevelCmsIsland(island)) {
      const sourceSelectorSnapshot = resolveCmsIslandSourceSelectorSnapshot(island)
      const parentBlockSelectorSnapshot = resolveCmsRenderingSelectorSnapshot(resolveLocatorParentBlockElement(island))
        ?? sourceSelectorSnapshot
      if (!sourceSelectorSnapshot || !parentBlockSelectorSnapshot) {
        diagnostics.push(createDiagnostic({
          severity: 'error',
          code: 'INVALID_RUNTIME_LOCATOR',
          message: 'Unable to derive a stable runtime locator snapshot for this CMS island.',
          element: island,
          component,
          htmlPath,
          islandIndex,
        }))
      }
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

      for (const helper of collectUndeclaredSlotHelpers(slot.content)) {
        diagnostics.push(createDiagnostic({
          severity: 'error',
          code: 'UNKNOWN_SLOT_HELPER',
          message: `Unknown CMS slot helper "${helper}" in ${component} ${slot.name} slot.`,
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

      const duplicateListShellTagName = resolveDuplicateListShellTagName(island, slotRoot)
      if (duplicateListShellTagName) {
        diagnostics.push(createDiagnostic({
          severity: 'error',
          code: 'DUPLICATE_LIST_SHELL',
          message: `CMS slot duplicates the preserved <${duplicateListShellTagName}> list shell.`,
          element: island,
          component,
          htmlPath,
          islandIndex,
        }))
      }

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
        for (const attribute of Array.from(descendant.attributes)) {
          if (!INLINE_EVENT_HANDLER_ATTRIBUTE_PATTERN.test(attribute.name)) {
            continue
          }

          diagnostics.push(createDiagnostic({
            severity: 'error',
            code: 'INLINE_EVENT_HANDLER_ATTRIBUTE',
            message: `Raw HTML event attribute "${attribute.name}" is not allowed inside CMS slots.`,
            element: island,
            component,
            htmlPath,
            islandIndex,
          }))
        }

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

      for (const syntaxError of collectInvalidVueTemplateSyntaxMessages(slot.content)) {
        diagnostics.push(createDiagnostic({
          severity: 'error',
          code: 'INVALID_VUE_TEMPLATE_SYNTAX',
          message: `Invalid Vue template syntax in ${component} ${slot.name} slot: ${syntaxError}`,
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

function validateAuthorManagedVueRuntime(
  root: ParentNode,
  htmlPath: string,
  diagnostics: CmsRenderingDiagnostic[],
): void {
  for (const script of Array.from(root.querySelectorAll('script'))) {
    if (script.closest(CMS_ISLAND_SELECTOR) || script.closest('template')) {
      continue
    }

    const type = script.getAttribute('type')?.trim().toLowerCase() ?? ''
    const src = script.getAttribute('src')?.trim() ?? ''
    const content = script.textContent ?? ''

    if (src && looksLikeVueRuntimeSource(src)) {
      diagnostics.push(createDiagnostic({
        severity: 'error',
        code: 'AUTHOR_MANAGED_VUE_RUNTIME',
        message: 'Vue runtime assets/imports are host-managed. Remove author-managed Vue script/importmap/module imports from page-builder author HTML.',
        element: script,
        htmlPath,
      }))
    }

    if (isImportmapScriptType(type) && importmapMentionsVueRuntime(content)) {
      diagnostics.push(createDiagnostic({
        severity: 'error',
        code: 'AUTHOR_MANAGED_VUE_RUNTIME',
        message: 'Vue runtime assets/imports are host-managed. Remove author-managed Vue script/importmap/module imports from page-builder author HTML.',
        element: script,
        htmlPath,
      }))
    }

    if (isModuleScriptType(type) && scriptImportsVueRuntime(content)) {
      diagnostics.push(createDiagnostic({
        severity: 'error',
        code: 'AUTHOR_MANAGED_VUE_RUNTIME',
        message: 'Vue runtime assets/imports are host-managed. Remove author-managed Vue script/importmap/module imports from page-builder author HTML.',
        element: script,
        htmlPath,
      }))
    }

    if (scriptBootstrapsVueRuntime(content)) {
      diagnostics.push(createDiagnostic({
        severity: 'error',
        code: 'AUTHOR_MANAGED_VUE_BOOTSTRAP',
        message: 'Vue bootstrap is host-managed. Remove author-managed createApp/createSSRApp/mount code from page-builder author HTML.',
        element: script,
        htmlPath,
      }))
    }
  }
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

function resolveDuplicateListShellTagName(island: Element, slotRoot: ParentNode): string | null {
  const parentTagName = island.parentElement?.localName.toLowerCase()
  if (parentTagName !== 'ul' && parentTagName !== 'ol') {
    return null
  }

  const rootElements = Array.from(slotRoot.childNodes)
    .filter((node): node is Element => node.nodeType === node.ELEMENT_NODE)
  if (rootElements.length !== 1) {
    return null
  }

  const slotRootTagName = rootElements[0]?.localName.toLowerCase()
  return slotRootTagName === parentTagName ? parentTagName : null
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

function collectUndeclaredSlotHelpers(template: string): string[] {
  const expressions = collectVueSlotExpressions(template)
  const allowedHelpers = new Set(PAGE_BUILDER_CMS_AUTHORING_CONTRACT.allowedSlotHelpers)
  const helpers = new Set<string>()

  for (const expression of expressions) {
    for (const helper of collectBareFunctionCalls(expression)) {
      if (!allowedHelpers.has(helper) && !SAFE_SLOT_EXPRESSION_GLOBALS.has(helper)) {
        helpers.add(helper)
      }
    }
  }

  return [...helpers]
}

function collectVueSlotExpressions(template: string): string[] {
  const normalizedTemplate = template.trim()
  if (!normalizedTemplate) {
    return []
  }

  try {
    const root = parseVueTemplate(normalizedTemplate)
    const expressions: string[] = []
    collectExpressionsFromTemplateChildren(root.children, expressions)
    return expressions
  } catch {
    return []
  }
}

function collectExpressionsFromTemplateChildren(
  children: readonly TemplateChildNode[],
  expressions: string[],
): void {
  for (const child of children) {
    collectExpressionsFromTemplateChild(child, expressions)
  }
}

function collectExpressionsFromTemplateChild(node: TemplateChildNode, expressions: string[]): void {
  switch (node.type) {
    case NodeTypes.INTERPOLATION:
      collectExpressionNode((node as InterpolationNode).content, expressions)
      return
    case NodeTypes.ELEMENT:
      collectExpressionsFromElement(node as ElementNode, expressions)
      return
    case NodeTypes.IF:
      for (const branch of node.branches) {
        collectExpressionsFromTemplateChildren(branch.children, expressions)
      }
      return
    case NodeTypes.IF_BRANCH:
      collectExpressionsFromTemplateChildren(node.children, expressions)
      return
    case NodeTypes.FOR:
      collectExpressionNode(node.source, expressions)
      collectExpressionNode(node.keyAlias, expressions)
      collectExpressionNode(node.valueAlias, expressions)
      collectExpressionNode(node.objectIndexAlias, expressions)
      collectExpressionsFromTemplateChildren(node.children, expressions)
      return
    case NodeTypes.COMPOUND_EXPRESSION:
      expressions.push(expressionNodeToString(node))
      return
    case NodeTypes.TEXT:
    case NodeTypes.COMMENT:
    case NodeTypes.TEXT_CALL:
      return
  }
}

function collectExpressionsFromElement(node: ElementNode, expressions: string[]): void {
  for (const prop of node.props) {
    if (prop.type !== NodeTypes.DIRECTIVE) {
      continue
    }

    const directive = prop as DirectiveNode
    if (directive.name !== 'for') {
      collectExpressionNode(directive.exp, expressions)
    }
    collectExpressionNode(directive.arg, expressions)

    if (directive.forParseResult) {
      collectExpressionNode(directive.forParseResult.source, expressions)
      collectExpressionNode(directive.forParseResult.key, expressions)
      collectExpressionNode(directive.forParseResult.value, expressions)
      collectExpressionNode(directive.forParseResult.index, expressions)
    }
  }

  collectExpressionsFromTemplateChildren(node.children, expressions)
}

function collectExpressionNode(node: ExpressionNode | undefined, expressions: string[]): void {
  if (!node) {
    return
  }

  const expression = expressionNodeToString(node).trim()
  if (expression) {
    expressions.push(expression)
  }
}

function expressionNodeToString(node: ExpressionNode): string {
  if (node.type === NodeTypes.SIMPLE_EXPRESSION) {
    return node.content
  }

  return node.children
    .map((child) => {
      if (typeof child === 'string') {
        return child
      }

      if (typeof child === 'symbol') {
        return ''
      }

      if (child.type === NodeTypes.INTERPOLATION) {
        return expressionNodeToString(child.content)
      }

      if (child.type === NodeTypes.SIMPLE_EXPRESSION || child.type === NodeTypes.COMPOUND_EXPRESSION) {
        return expressionNodeToString(child)
      }

      return child.content
    })
    .join('')
}

function collectBareFunctionCalls(expression: string): string[] {
  const helpers = new Set<string>()
  BARE_FUNCTION_CALL_PATTERN.lastIndex = 0

  for (const match of expression.matchAll(BARE_FUNCTION_CALL_PATTERN)) {
    const helper = match[1]
    if (!helper || RESERVED_FUNCTION_LIKE_IDENTIFIERS.has(helper)) {
      continue
    }

    if (!isBareFunctionCall(expression, match.index ?? 0)) {
      continue
    }

    helpers.add(helper)
  }

  return [...helpers]
}

function isBareFunctionCall(expression: string, identifierIndex: number): boolean {
  const previous = findPreviousSignificantCharacter(expression, identifierIndex)
  if (!previous) {
    return true
  }

  return previous !== '.'
    && previous !== '?'
    && !/[A-Za-z0-9_$]/.test(previous)
}

function findPreviousSignificantCharacter(expression: string, index: number): string | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = expression[cursor]
    if (char && !/\s/.test(char)) {
      return char
    }
  }

  return null
}

function collectInvalidVueTemplateSyntaxMessages(template: string): string[] {
  const normalizedTemplate = template.trim()
  if (!normalizedTemplate) {
    return []
  }

  const errors = new Set<string>()

  try {
    const compiled = compile(normalizedTemplate, {
      mode: 'function',
      onError(error) {
        const message = error.message?.trim()
        if (message) {
          errors.add(message)
        }
      },
    })

    try {
      new Function('Vue', compiled.code)
    } catch (error) {
      const message = error instanceof Error ? error.message.trim() : String(error).trim()
      if (message) {
        errors.add(message)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.trim() : String(error).trim()
    if (message) {
      errors.add(message)
    }
  }

  return [...errors]
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

function isImportmapScriptType(type: string): boolean {
  return type === 'importmap' || type.endsWith('+importmap')
}

function isModuleScriptType(type: string): boolean {
  return type === 'module'
}

function looksLikeVueRuntimeSource(source: string): boolean {
  return VUE_RUNTIME_URL_PATTERN.test(source.trim())
}

function importmapMentionsVueRuntime(content: string): boolean {
  const normalized = content.trim()
  if (!normalized) {
    return false
  }

  try {
    return containsVueRuntimeSpecifier(JSON.parse(normalized))
  } catch {
    return VUE_RUNTIME_URL_PATTERN.test(normalized) || /["'](?:vue|@vue\/[^"']+)["']\s*:/.test(normalized)
  }
}

function containsVueRuntimeSpecifier(value: unknown): boolean {
  if (typeof value === 'string') {
    return isVueModuleSpecifier(value) || looksLikeVueRuntimeSource(value)
  }

  if (Array.isArray(value)) {
    return value.some((entry) => containsVueRuntimeSpecifier(entry))
  }

  if (!value || typeof value !== 'object') {
    return false
  }

  return Object.entries(value).some(([key, nestedValue]) =>
    isVueModuleSpecifier(key)
    || looksLikeVueRuntimeSource(key)
    || containsVueRuntimeSpecifier(nestedValue),
  )
}

function scriptImportsVueRuntime(content: string): boolean {
  return containsVueImportSpecifier(content, VUE_MODULE_IMPORT_PATTERN)
    || containsVueImportSpecifier(content, VUE_DYNAMIC_IMPORT_PATTERN)
    || containsVueImportSpecifier(content, VUE_REQUIRE_PATTERN)
}

function containsVueImportSpecifier(content: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0

  for (const match of content.matchAll(pattern)) {
    const specifier = match[1]?.trim()
    if (specifier && isVueModuleSpecifier(specifier)) {
      return true
    }
  }

  return false
}

function isVueModuleSpecifier(specifier: string): boolean {
  return VUE_PACKAGE_SPECIFIER_PATTERN.test(specifier.trim())
}

function scriptBootstrapsVueRuntime(content: string): boolean {
  const normalized = content.trim()
  if (!normalized) {
    return false
  }

  if (VUE_CREATE_APP_CALL_PATTERN.test(normalized)) {
    return true
  }

  if (!VUE_LOCAL_CREATE_APP_CALL_PATTERN.test(normalized)) {
    return false
  }

  return scriptImportsVueRuntime(normalized)
    || VUE_GLOBAL_DESTRUCTURE_PATTERN.test(normalized)
    || VUE_GLOBAL_ASSIGNMENT_PATTERN.test(normalized)
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

function validateCmsSourcePropValues(
  island: Element,
  component: CmsIslandComponentName,
  htmlPath: string,
  islandIndex: number | undefined,
  diagnostics: CmsRenderingDiagnostic[],
): void {
  validatePositiveIntegerAttribute(
    island,
    component,
    'site-id',
    htmlPath,
    islandIndex,
    diagnostics,
  )

  if (component === 'cms-catalog') {
    validateCatalogLevelAttribute(island, component, htmlPath, islandIndex, diagnostics)
    validateCatalogParentLevelConsistency(island, component, htmlPath, islandIndex, diagnostics)
    validatePositiveIntegerAttribute(island, component, 'parent-id', htmlPath, islandIndex, diagnostics)
    validatePositiveIntegerListAttribute(island, component, 'ids', htmlPath, islandIndex, diagnostics)
    validatePositiveIntegerAttribute(island, component, 'take', htmlPath, islandIndex, diagnostics)
    return
  }

  validatePositiveIntegerAttribute(island, component, 'catalog-id', htmlPath, islandIndex, diagnostics)
  validatePositiveIntegerListAttribute(island, component, 'ids', htmlPath, islandIndex, diagnostics)
  validatePositiveIntegerAttribute(island, component, 'page-size', htmlPath, islandIndex, diagnostics)
}

function validateCatalogLevelAttribute(
  island: Element,
  component: CmsIslandComponentName,
  htmlPath: string,
  islandIndex: number | undefined,
  diagnostics: CmsRenderingDiagnostic[],
): void {
  if (!island.hasAttribute('level')) {
    return
  }

  const value = island.getAttribute('level')?.trim() ?? ''
  if (value === 'root' || value === 'children') {
    return
  }

  diagnostics.push(createDiagnostic({
    severity: 'error',
    code: 'INVALID_SOURCE_PROP',
    message: 'cms-catalog level must be "root" or "children".',
    element: island,
    component,
    htmlPath,
    islandIndex,
  }))
}

function validateCatalogParentLevelConsistency(
  island: Element,
  component: CmsIslandComponentName,
  htmlPath: string,
  islandIndex: number | undefined,
  diagnostics: CmsRenderingDiagnostic[],
): void {
  const level = island.getAttribute('level')?.trim()
  const parentId = island.getAttribute('parent-id')?.trim()

  if (parentId && level !== 'children') {
    diagnostics.push(createDiagnostic({
      severity: 'error',
      code: 'INVALID_SOURCE_PROP',
      message: 'cms-catalog parent-id requires level="children".',
      element: island,
      component,
      htmlPath,
      islandIndex,
    }))
  }

  if (level === 'children' && !parentId) {
    diagnostics.push(createDiagnostic({
      severity: 'error',
      code: 'INVALID_SOURCE_PROP',
      message: 'cms-catalog level="children" requires parent-id.',
      element: island,
      component,
      htmlPath,
      islandIndex,
    }))
  }
}

function validatePositiveIntegerAttribute(
  island: Element,
  component: CmsIslandComponentName,
  attributeName: string,
  htmlPath: string,
  islandIndex: number | undefined,
  diagnostics: CmsRenderingDiagnostic[],
): void {
  if (!island.hasAttribute(attributeName)) {
    return
  }

  const value = island.getAttribute(attributeName)?.trim() ?? ''
  if (/^[1-9]\d*$/.test(value)) {
    return
  }

  diagnostics.push(createDiagnostic({
    severity: 'error',
    code: 'INVALID_SOURCE_PROP',
    message: `${component} ${attributeName} must be a positive integer.`,
    element: island,
    component,
    htmlPath,
    islandIndex,
  }))
}

function validatePositiveIntegerListAttribute(
  island: Element,
  component: CmsIslandComponentName,
  attributeName: string,
  htmlPath: string,
  islandIndex: number | undefined,
  diagnostics: CmsRenderingDiagnostic[],
): void {
  if (!island.hasAttribute(attributeName)) {
    return
  }

  const value = island.getAttribute(attributeName)?.trim() ?? ''
  const ids = value.split(',').map((entry) => entry.trim()).filter(Boolean)
  if (ids.length > 0 && ids.every((id) => /^[1-9]\d*$/.test(id))) {
    return
  }

  diagnostics.push(createDiagnostic({
    severity: 'error',
    code: 'INVALID_SOURCE_PROP',
    message: `${component} ${attributeName} must contain positive integer CMS ids.`,
    element: island,
    component,
    htmlPath,
    islandIndex,
  }))
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

function collectRuntimeOnlyAttributes(element: Element): string[] {
  return Array.from(element.attributes)
    .map((attribute) => attribute.name)
    .filter((name) => name === 'data-proma-cms-source-id' || name.startsWith('data-proma-cms-island-'))
}

function resolveLocatorParentBlockElement(element: Element): Element {
  const blockElement = element.closest(BLOCK_SELECTOR)
  if (blockElement) {
    return blockElement
  }

  const parent = element.parentElement
  if (parent) {
    return parent
  }

  return element
}
