import { parseHTML } from 'linkedom'

const CMS_REGION_SELECTOR = 'cms-content, cms-catalog'
const CMS_PREVIEW_RUNTIME_GLOBAL = '__PROMA_CMS_RENDERING_PREVIEW__'
const CMS_PREVIEW_RUNTIME_SCRIPT = 'cms-rendering-preview.js'

export function removePageBuilderStandaloneCmsArtifacts(sourceHtml: string): string {
  if (!mayContainCmsArtifacts(sourceHtml)) {
    return sourceHtml
  }

  const { document } = parseHTML(sourceHtml)
  let changed = false

  for (const element of Array.from(document.querySelectorAll(CMS_REGION_SELECTOR))) {
    if (element.parentElement?.closest(CMS_REGION_SELECTOR)) {
      continue
    }

    element.remove()
    changed = true
  }

  for (const script of Array.from(document.querySelectorAll('script'))) {
    if (isCmsPreviewRuntimeScript(script)) {
      script.remove()
      changed = true
    }
  }

  for (const element of Array.from(document.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      if (isCmsRuntimeAttribute(attribute.name)) {
        element.removeAttribute(attribute.name)
        changed = true
      }
    }
  }

  return changed ? serializeDocument(sourceHtml, document) : sourceHtml
}

function mayContainCmsArtifacts(sourceHtml: string): boolean {
  return /<cms-(?:content|catalog)\b/i.test(sourceHtml)
    || sourceHtml.includes('data-proma-cms-')
    || sourceHtml.includes('data-proma-cms-rendering-')
    || sourceHtml.includes(CMS_PREVIEW_RUNTIME_GLOBAL)
    || sourceHtml.includes(CMS_PREVIEW_RUNTIME_SCRIPT)
}

function isCmsPreviewRuntimeScript(script: Element): boolean {
  for (const attribute of Array.from(script.attributes)) {
    if (attribute.name.startsWith('data-proma-cms-rendering-')) {
      return true
    }
  }

  const src = script.getAttribute('src')
  if (src?.includes(CMS_PREVIEW_RUNTIME_SCRIPT)) {
    return true
  }

  return script.textContent.includes(CMS_PREVIEW_RUNTIME_GLOBAL)
}

function isCmsRuntimeAttribute(attributeName: string): boolean {
  return attributeName.startsWith('data-proma-cms-')
    || attributeName.startsWith('data-proma-cms-rendering-')
}

function serializeDocument(sourceHtml: string, document: Document): string {
  const serialized = document.toString()
  if (/^\s*<!doctype/i.test(serialized)) {
    return serialized
  }

  const doctypeMatch = sourceHtml.match(/^\s*<!doctype[^>]*>/i)
  return doctypeMatch ? `${doctypeMatch[0]}${serialized}` : serialized
}
