import { parseHTML } from 'linkedom'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { CmsCatalog } from '../components/cms-catalog'
import { CmsContent } from '../components/cms-content'
import { CMS_RUNTIME_CLIENT_KEY, type CmsRuntimeClient } from '../runtime/cms-runtime-client'
import { compileIslandTemplate } from './compile-island-template'

function serializeDocument(sourceHtml: string, document: Document): string {
  const serialized = document.toString()
  if (/^\s*<!doctype/i.test(serialized)) {
    return serialized
  }

  const doctypeMatch = sourceHtml.match(/^\s*<!doctype[^>]*>/i)
  return doctypeMatch ? `${doctypeMatch[0]}${serialized}` : serialized
}

export async function renderIslandsSsr(options: {
  html: string
  cmsClient: CmsRuntimeClient
}): Promise<string> {
  const { html, cmsClient } = options
  const { document } = parseHTML(html)
  const islands = Array.from(document.querySelectorAll('cms-catalog, cms-content'))

  if (islands.length === 0) {
    return html
  }

  for (const island of islands) {
    const render = compileIslandTemplate(island.outerHTML)
    const app = createSSRApp({ render })
    app.provide(CMS_RUNTIME_CLIENT_KEY, cmsClient)
    app.component('cms-catalog', CmsCatalog)
    app.component('cms-content', CmsContent)

    const renderedIslandHtml = await renderToString(app)
    island.outerHTML = renderedIslandHtml
  }

  return serializeDocument(html, document)
}
