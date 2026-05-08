import { normalizePageBuilderPublicBasePath } from '@ai-page-builder/shared'

declare global {
  interface Window {
    __AI_PAGE_BUILDER_RUNTIME_CONFIG__?: {
      basePath?: string | null
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
