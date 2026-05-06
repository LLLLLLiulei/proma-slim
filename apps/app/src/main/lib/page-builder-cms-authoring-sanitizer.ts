import { parseHTML } from 'linkedom'
import type {
  CmsRenderingDiagnostic,
  CmsRenderingValidationResult,
} from '@ai-page-builder/page-builder-cms-rendering'

export function isRuntimeOnlyCmsAuthoringAttr(name: string): boolean {
  return name === 'data-proma-cms-source-id' || name.startsWith('data-proma-cms-island-')
}

export function sanitizeRuntimeOnlyCmsAuthoringHtml(
  html: string,
  htmlPath: string,
): {
  html: string
  diagnostics: CmsRenderingDiagnostic[]
} {
  const { document } = parseHTML(html)
  const removals = stripRuntimeOnlyCmsAuthoringAttrsFromTree(document)

  return {
    html: removals.length > 0 ? serializeDocument(html, document) : html,
    diagnostics: removals.map(({ element, removedAttrs }) => ({
      severity: 'info',
      code: 'RUNTIME_ONLY_ATTRIBUTE_STRIPPED',
      message: `Removed runtime-only CMS attrs from authoring HTML: ${removedAttrs.join(', ')}.`,
      blockId: element.closest('[data-proma-block-id]')?.getAttribute('data-proma-block-id')?.trim() ?? null,
      selectorSnapshot: null,
      htmlPath,
      islandIndex: undefined,
    })),
  }
}

export function sanitizeRuntimeOnlyCmsAuthoringElementOuterHtml(element: Element): string {
  const sanitizedClone = element.cloneNode(true) as Element
  stripRuntimeOnlyCmsAuthoringAttrsFromTree(sanitizedClone)
  return sanitizedClone.outerHTML.trim()
}

export function mergeCmsRenderingSanitizationDiagnostics(
  validation: CmsRenderingValidationResult,
  sanitizationDiagnostics: CmsRenderingDiagnostic[],
): CmsRenderingValidationResult {
  if (sanitizationDiagnostics.length === 0) {
    return validation
  }

  return {
    valid: validation.valid,
    diagnostics: [...validation.diagnostics, ...sanitizationDiagnostics],
    errors: validation.errors,
    warnings: validation.warnings,
    infos: [...validation.infos, ...sanitizationDiagnostics],
  }
}

function stripRuntimeOnlyCmsAuthoringAttrsFromTree(
  root: Document | Element,
): Array<{ element: Element; removedAttrs: string[] }> {
  const elements = [
    ...(root.nodeType === 1 ? [root as Element] : []),
    ...Array.from(root.querySelectorAll('*')),
  ]
  const removals: Array<{ element: Element; removedAttrs: string[] }> = []

  for (const element of elements) {
    const removedAttrs = Array.from(element.attributes)
      .map((attribute) => attribute.name)
      .filter(isRuntimeOnlyCmsAuthoringAttr)

    if (removedAttrs.length === 0) {
      continue
    }

    for (const attrName of removedAttrs) {
      element.removeAttribute(attrName)
    }

    removals.push({ element, removedAttrs })
  }

  return removals
}

function serializeDocument(sourceHtml: string, document: Document): string {
  const serialized = document.toString()
  if (/^\s*<!doctype/i.test(serialized)) {
    return serialized
  }

  const doctypeMatch = sourceHtml.match(/^\s*<!doctype[^>]*>/i)
  if (!doctypeMatch) {
    return serialized
  }

  return `${doctypeMatch[0]}${serialized}`
}
