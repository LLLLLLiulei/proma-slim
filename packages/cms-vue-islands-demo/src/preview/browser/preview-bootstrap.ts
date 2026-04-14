import * as Vue from 'vue'
import { CmsCatalog } from '../../components/cms-catalog'
import { CmsContent } from '../../components/cms-content'
import { createBrowserCmsClient } from '../../runtime/browser-cms-client'
import { CMS_RUNTIME_CLIENT_KEY } from '../../runtime/cms-runtime-client'
import { compileIslandTemplate } from '../../shared/compile-island-template'

declare global {
  interface Window {
    __CMS_VUE_ISLANDS_DEMO__?: {
      pageName: string
      cmsApiBase: string
    }
  }
}

const config = window.__CMS_VUE_ISLANDS_DEMO__

if (config) {
  const client = createBrowserCmsClient(config.cmsApiBase)
  const islands = Array.from(document.querySelectorAll('cms-catalog, cms-content'))

  for (const island of islands) {
    const render = compileIslandTemplate(island.outerHTML)
    const mountContainer = document.createElement('div')

    mountContainer.setAttribute('data-cms-vue-islands-demo', island.tagName.toLowerCase())
    island.replaceWith(mountContainer)

    const app = Vue.createApp({ render })
    app.provide(CMS_RUNTIME_CLIENT_KEY, client)
    app.component('cms-catalog', CmsCatalog)
    app.component('cms-content', CmsContent)
    app.mount(mountContainer)
  }
}
