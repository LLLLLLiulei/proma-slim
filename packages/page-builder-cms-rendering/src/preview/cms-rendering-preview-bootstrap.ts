import * as Vue from 'vue'
import { CmsCatalog } from '../components/cms-catalog'
import { CmsContent } from '../components/cms-content'
import { createBrowserCmsClient } from '../runtime/browser-cms-client'
import { CMS_RUNTIME_CLIENT_KEY } from '../runtime/cms-runtime-client'
import { compileIslandTemplate } from '../template/compile-island-template'
import { scanCmsIslandsFromDom } from '../template/scan-cms-islands-dom'

export const CMS_RENDERING_READY_EVENT = 'proma:cms-rendering-ready'

declare global {
  interface Window {
    __PROMA_CMS_RENDERING_PREVIEW__?: {
      workspaceId: string
      cmsProxyBase: string
      vueAssetUrl: string
      bootstrapAssetUrl: string
      hasCmsRendering: boolean
    }
    __PROMA_CMS_RENDERING_PREVIEW_READY__?: boolean
  }
}

const config = window.__PROMA_CMS_RENDERING_PREVIEW__

if (config?.hasCmsRendering) {
  bootstrapCmsRenderingPreview(config)
}

function bootstrapCmsRenderingPreview(
  previewConfig: NonNullable<Window['__PROMA_CMS_RENDERING_PREVIEW__']>,
): void {
  const cmsClient = createBrowserCmsClient({
    baseUrl: previewConfig.cmsProxyBase,
  })
  const islands = scanCmsIslandsFromDom(document)
  let pendingCount = islands.length
  let readyDispatched = false

  const dispatchReady = () => {
    if (readyDispatched) {
      return
    }

    readyDispatched = true
    window.__PROMA_CMS_RENDERING_PREVIEW_READY__ = true
    document.dispatchEvent(new Event(CMS_RENDERING_READY_EVENT))
  }

  const markIslandSettled = () => {
    pendingCount -= 1
    if (pendingCount <= 0) {
      dispatchReady()
    }
  }

  if (pendingCount === 0) {
    dispatchReady()
    return
  }

  for (const island of islands) {
    try {
      const render = compileIslandTemplate(island.template)
      const mountContainer = document.createElement('div')
      mountContainer.setAttribute('data-proma-cms-rendering-island', island.component)
      island.element.replaceWith(mountContainer)

      const app = Vue.createApp({ render })
      app.provide(CMS_RUNTIME_CLIENT_KEY, cmsClient)
      app.component('cms-catalog', CmsCatalog)
      app.component('cms-content', CmsContent)
      app.mount(mountContainer)

      void Vue.nextTick().then(markIslandSettled, markIslandSettled)
    } catch (error) {
      console.error('[cms-rendering-preview] Failed to mount island:', error)
      markIslandSettled()
    }
  }
}
