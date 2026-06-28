import { normalizePageBuilderPublicBasePath } from '@ai-page-builder/shared'

export interface PageBuilderMonacoLoaderConfig {
  paths: {
    vs: string
  }
  'vs/nls': {
    availableLanguages: {
      '*': 'zh-cn'
    }
  }
}

function getDefaultLocationOrigin(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.location.origin
}

export function buildPageBuilderMonacoAssetsBaseUrl(
  publicBasePath?: string | null,
  origin = '',
): string {
  const normalizedBasePath = normalizePageBuilderPublicBasePath(publicBasePath)
  const pathname = `${normalizedBasePath}/monaco/vs`.replace(/^\/\//, '/')
  return origin ? `${origin}${pathname}` : pathname
}

export function createPageBuilderMonacoLoaderConfig(
  publicBasePath?: string | null,
  origin = getDefaultLocationOrigin(),
): PageBuilderMonacoLoaderConfig {
  return {
    paths: {
      vs: buildPageBuilderMonacoAssetsBaseUrl(publicBasePath, origin),
    },
    'vs/nls': {
      availableLanguages: {
        '*': 'zh-cn',
      },
    },
  }
}
