export const PAGE_BUILDER_HTML_URL_ATTRIBUTES = [
  'src',
  'href',
  'poster',
] as const

export const PAGE_BUILDER_HTML_SRCSET_ATTRIBUTES = [
  'srcset',
] as const

const DOWNLOADABLE_ASSET_PATTERN = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif|mp4|webm|ogg|mp3|wav|m4a|flac|aac|pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|csv)(?:[?#].*)?$/i

export function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

export function isIgnorableUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase()
  return !trimmed
    || trimmed.startsWith('data:')
    || trimmed.startsWith('blob:')
    || trimmed.startsWith('javascript:')
    || trimmed.startsWith('mailto:')
    || trimmed.startsWith('tel:')
    || trimmed.startsWith('#')
  }

export function looksLikeDownloadableAsset(assetUrl: string): boolean {
  const normalized = assetUrl.toLowerCase()

  if (normalized.includes('/upload/resources/') || normalized.includes('/preview/')) {
    return true
  }

  return DOWNLOADABLE_ASSET_PATTERN.test(normalized)
}

export function isCmsRootRelativeAssetPath(baseUrl: string, assetUrl: string): boolean {
  if (!assetUrl.startsWith('/')) {
    return false
  }

  try {
    const base = new URL(baseUrl)
    const basePath = base.pathname.replace(/\/+$/, '')
    return assetUrl.startsWith('/preview/')
      || assetUrl.startsWith('/upload/')
      || assetUrl.startsWith('/resources/')
      || (basePath ? assetUrl.startsWith(`${basePath}/preview/`) : false)
      || (basePath ? assetUrl.startsWith(`${basePath}/upload/`) : false)
      || (basePath ? assetUrl.startsWith(`${basePath}/resources/`) : false)
  } catch {
    return false
  }
}

export function resolveCmsAssetUrl(baseUrl: string, assetUrl: string): string | null {
  const trimmed = assetUrl.trim()
  if (!trimmed || isIgnorableUrl(trimmed)) {
    return null
  }

  try {
    const proxyCandidate = new URL(trimmed, 'http://localhost')
    if (proxyCandidate.pathname === '/api/page-builder/cms/assets') {
      return null
    }
  } catch {
    return null
  }

  try {
    if (!isAbsoluteHttpUrl(trimmed) && !isCmsRootRelativeAssetPath(baseUrl, trimmed)) {
      return null
    }

    const base = new URL(baseUrl)
    if (trimmed.startsWith('/')) {
      if (trimmed.startsWith(base.pathname.replace(/\/+$/, ''))) {
        return `${base.origin}${trimmed}`
      }

      const basePath = base.pathname.replace(/\/+$/, '')
      return `${base.origin}${basePath}${trimmed}`
    }

    return new URL(trimmed, base).toString()
  } catch {
    return null
  }
}

export function isAllowedCmsAssetUrl(baseUrl: string, assetUrl: string): boolean {
  try {
    const base = new URL(baseUrl)
    const candidate = new URL(assetUrl)
    return base.origin === candidate.origin
  } catch {
    return false
  }
}

export function rewriteSrcsetValue(
  srcset: string,
  rewriteUrl: (url: string) => string,
): string {
  return srcset
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim()
      if (!trimmed) {
        return trimmed
      }

      const [rawUrl, ...descriptors] = trimmed.split(/\s+/)
      const nextUrl = rawUrl ? rewriteUrl(rawUrl) : rawUrl
      return [nextUrl, ...descriptors].filter(Boolean).join(' ')
    })
    .join(', ')
}

export function rewriteCssUrlFunctions(
  cssValue: string,
  rewriteUrl: (url: string) => string,
): string {
  return cssValue.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, quote: string, rawUrl: string) => {
    const rewrittenUrl = rewriteUrl(rawUrl)
    if (rewrittenUrl === rawUrl) {
      return match
    }

    const nextQuote = quote || '"'
    return `url(${nextQuote}${rewrittenUrl}${nextQuote})`
  })
}

export function shouldRewritePreviewAttributeUrl(element: Element, attribute: string, rawValue: string): boolean {
  const tagName = element.tagName.toLowerCase()
  const normalizedAttribute = attribute.toLowerCase()

  if (!rawValue.trim()) {
    return false
  }

  if (normalizedAttribute === 'href') {
    if (tagName === 'link') {
      return false
    }

    if (tagName === 'a') {
      return looksLikeDownloadableAsset(rawValue)
    }
  }

  if (normalizedAttribute === 'poster') {
    return true
  }

  if (normalizedAttribute === 'src') {
    return ['img', 'audio', 'video', 'source'].includes(tagName) || tagName.startsWith('amp-img')
  }

  if (normalizedAttribute === 'srcset') {
    return ['img', 'source'].includes(tagName)
  }

  return false
}
