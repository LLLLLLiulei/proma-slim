import { normalizePageBuilderPublicBasePath } from '@ai-page-builder/shared'
import { normalizePageBuilderHiddenToolbarItems, type PageBuilderToolbarItemKey } from './toolbar-visibility'

declare const __AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS__: unknown

declare global {
  interface Window {
    __AI_PAGE_BUILDER_RUNTIME_CONFIG__?: {
      basePath?: string | null
      hiddenToolbarItems?: unknown
    }
  }
}

export function getPageBuilderPublicBasePath(): string {
  const runtimeBasePath = typeof window === 'undefined'
    ? undefined
    : window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__?.basePath
  const viteBaseUrl = import.meta.env.BASE_URL
  const publicBasePath = runtimeBasePath ?? (viteBaseUrl === './' ? '' : viteBaseUrl)
  return normalizePageBuilderPublicBasePath(publicBasePath)
}


export function getPageBuilderHiddenToolbarItems(): PageBuilderToolbarItemKey[] {
  const runtimeConfig = typeof window === 'undefined'
    ? undefined
    : window.__AI_PAGE_BUILDER_RUNTIME_CONFIG__
  const hasRuntimeHiddenToolbarItems = runtimeConfig
    ? Object.prototype.hasOwnProperty.call(runtimeConfig, 'hiddenToolbarItems')
    : false
  const devHiddenToolbarItems = typeof __AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS__ === 'undefined'
    ? undefined
    : __AI_PAGE_BUILDER_HIDDEN_TOOLBAR_ITEMS__
  return normalizePageBuilderHiddenToolbarItems(
    hasRuntimeHiddenToolbarItems ? runtimeConfig?.hiddenToolbarItems : devHiddenToolbarItems,
  )
}
