import { parseHTML } from 'linkedom'
import { renderToString } from '@vue/server-renderer'
import { createSSRApp } from 'vue'
import { CmsCatalog } from '../components/cms-catalog'
import { CmsContent } from '../components/cms-content'
import { CMS_RUNTIME_CLIENT_KEY, type CmsRuntimeClient } from '../runtime/cms-runtime-client'
import { compileIslandTemplate } from '../template/compile-island-template'
import { scanCmsIslands, type CmsIslandScanResult } from '../template/scan-cms-islands'
import { CmsIslandRenderPipelineError, createCmsIslandRenderFailure } from './island-render-errors'
import { prefetchCmsIslands } from './prefetch-cms-islands'

export async function renderCmsIslands(options: {
  html: string
  cmsClient: CmsRuntimeClient
}): Promise<string> {
  const { html, cmsClient } = options
  const { document } = parseHTML(html)
  const islands = scanCmsIslands(document)

  if (islands.length === 0) {
    return html
  }

  await prefetchCmsIslands({
    islands,
    cmsClient,
  })

  const failures: ReturnType<typeof createCmsIslandRenderFailure>[] = []

  for (const island of islands) {
    try {
      island.element.outerHTML = await renderOneIsland(island, cmsClient)
    } catch (error) {
      failures.push(createCmsIslandRenderFailure(island, 'render', error))
    }
  }

  if (failures.length > 0) {
    throw new CmsIslandRenderPipelineError('CMS island render failed', failures)
  }

  return serializeDocument(html, document)
}

async function renderOneIsland(
  island: CmsIslandScanResult,
  cmsClient: CmsRuntimeClient,
): Promise<string> {
  const render = compileIslandTemplate(island.template)
  const app = createSSRApp({ render })
  app.provide(CMS_RUNTIME_CLIENT_KEY, cmsClient)
  app.component('cms-catalog', CmsCatalog)
  app.component('cms-content', CmsContent)
  return renderToString(app)
}

function serializeDocument(sourceHtml: string, document: Document): string {
  const serialized = document.toString()
  if (/^\s*<!doctype/i.test(serialized)) {
    return serialized
  }

  const doctypeMatch = sourceHtml.match(/^\s*<!doctype[^>]*>/i)
  return doctypeMatch ? `${doctypeMatch[0]}${serialized}` : serialized
}
