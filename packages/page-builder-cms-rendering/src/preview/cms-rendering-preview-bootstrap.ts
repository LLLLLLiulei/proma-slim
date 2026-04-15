import * as Vue from 'vue'
import { CmsCatalog } from '../components/cms-catalog'
import { CmsContent } from '../components/cms-content'
import { createBrowserCmsClient } from '../runtime/browser-cms-client'
import {
  CMS_ISLAND_SETTLED_CALLBACK_KEY,
  CMS_RUNTIME_CLIENT_KEY,
} from '../runtime/cms-runtime-client'
import { compileIslandTemplate } from '../template/compile-island-template'
import { scanCmsIslandsFromDom } from '../template/scan-cms-islands-dom'

export const CMS_RENDERING_READY_EVENT = 'proma:cms-rendering-ready'
const CMS_ISLAND_ID_ATTR = 'data-proma-cms-island-id'
const CMS_ISLAND_COMPONENT_ATTR = 'data-proma-cms-island-component'
const CMS_ISLAND_SOURCE_SELECTOR_ATTR = 'data-proma-cms-island-source-selector'
const CMS_ISLAND_PARENT_BLOCK_SELECTOR_ATTR = 'data-proma-cms-island-parent-block-selector'
const CMS_ISLAND_EDIT_BOUNDARY_ATTR = 'data-proma-cms-island-edit-boundary'
const CMS_SOURCE_ATOMIC_EDIT_BOUNDARY = 'source-atomic'
const BLOCKED_SELECTOR_TAGS = new Set(['HTML', 'HEAD', 'SCRIPT', 'STYLE', 'META', 'LINK'])

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
      const mountHost = island.element
      const sourceSelector = resolveStableElementSelector(mountHost)
      const parentBlockSelector = resolveParentBlockSelector(mountHost) ?? sourceSelector
      const islandId = sourceSelector
        ? createCmsIslandId(island.component, sourceSelector)
        : null
      mountHost.setAttribute('data-proma-cms-rendering-island', island.component)
      let hostFinalized = false

      const finalizeHost = () => {
        if (hostFinalized) {
          return
        }

        hostFinalized = true
        annotateRenderedIslandRoots(mountHost, {
          islandId,
          component: island.component,
          sourceSelector,
          parentBlockSelector,
        })
        replaceHostWithRenderedChildren(mountHost)
        markIslandSettled()
      }

      const app = Vue.createApp({ render })
      app.provide(CMS_RUNTIME_CLIENT_KEY, cmsClient)
      app.provide(CMS_ISLAND_SETTLED_CALLBACK_KEY, finalizeHost)
      app.component('cms-catalog', CmsCatalog)
      app.component('cms-content', CmsContent)
      app.mount(mountHost)
    } catch (error) {
      console.error('[cms-rendering-preview] Failed to mount island:', error)
      markIslandSettled()
    }
  }
}

function resolveParentBlockSelector(host: Element): string | null {
  const blockElement = host.parentElement?.closest('[data-proma-block-id]') ?? null
  if (blockElement) {
    return resolveStableElementSelector(blockElement)
  }

  return resolveStableElementSelector(host)
}

function annotateRenderedIslandRoots(
  host: Element,
  metadata: {
    islandId: string | null
    component: string
    sourceSelector: string | null
    parentBlockSelector: string | null
  },
): void {
  if (!metadata.islandId || !metadata.sourceSelector || !metadata.parentBlockSelector) {
    return
  }

  for (const child of Array.from(host.children)) {
    child.setAttribute(CMS_ISLAND_ID_ATTR, metadata.islandId)
    child.setAttribute(CMS_ISLAND_COMPONENT_ATTR, metadata.component)
    child.setAttribute(CMS_ISLAND_SOURCE_SELECTOR_ATTR, metadata.sourceSelector)
    child.setAttribute(CMS_ISLAND_PARENT_BLOCK_SELECTOR_ATTR, metadata.parentBlockSelector)
    child.setAttribute(CMS_ISLAND_EDIT_BOUNDARY_ATTR, CMS_SOURCE_ATOMIC_EDIT_BOUNDARY)
  }
}

function createCmsIslandId(component: string, sourceSelector: string): string {
  return `cms-island-${component}-${hashString(sourceSelector)}`
}

function resolveStableElementSelector(element: Element): string | null {
  const segments: string[] = []
  let current: Element | null = element

  while (current && !BLOCKED_SELECTOR_TAGS.has(current.tagName)) {
    if (current.tagName === 'BODY') {
      segments.unshift('body')
      break
    }

    segments.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${getNthOfType(current)})`)
    current = current.parentElement
  }

  return segments.length > 0 ? segments.join(' > ') : null
}

function getNthOfType(element: Element): number {
  let index = 1
  let sibling = element.previousElementSibling

  while (sibling) {
    if (sibling.tagName === element.tagName) {
      index += 1
    }
    sibling = sibling.previousElementSibling
  }

  return index
}

function hashString(input: string): string {
  let hash = 2166136261

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16)
}

function replaceHostWithRenderedChildren(host: Element): void {
  const ownerDocument = host.ownerDocument
  if (!ownerDocument) {
    return
  }

  const fragment = ownerDocument.createDocumentFragment()
  while (host.firstChild) {
    fragment.appendChild(host.firstChild)
  }

  host.replaceWith(fragment)
}
