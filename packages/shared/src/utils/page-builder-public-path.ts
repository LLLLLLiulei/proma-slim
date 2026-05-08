const BASE_PATH_ENV_NAME = 'AI_PAGE_BUILDER_BASE_PATH'

function createInvalidBasePathError(value: string, reason: string): Error {
  return new Error(`Invalid ${BASE_PATH_ENV_NAME}: ${JSON.stringify(value)}. ${reason}`)
}

export function normalizePageBuilderPublicBasePath(value?: string | null): string {
  const rawValue = value?.trim() ?? ''
  if (!rawValue || rawValue === '/') {
    return ''
  }

  if (
    rawValue.includes('\\')
    || rawValue.includes('?')
    || rawValue.includes('#')
    || rawValue.includes('://')
    || rawValue.startsWith('//')
  ) {
    throw createInvalidBasePathError(value ?? '', 'Use a path-only value such as /pagebuilder.')
  }

  const withLeadingSlash = rawValue.startsWith('/') ? rawValue : `/${rawValue}`
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '')
  const segments = withoutTrailingSlash.split('/').filter(Boolean)

  if (segments.length === 0) {
    return ''
  }

  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw createInvalidBasePathError(value ?? '', 'Path traversal segments are not allowed.')
  }

  return `/${segments.join('/')}`
}

function ensureLeadingSlash(pathname: string): string {
  return pathname.startsWith('/') ? pathname : `/${pathname}`
}

export function prependPageBuilderPublicBasePath(pathname: string, basePath?: string | null): string {
  const normalizedBasePath = normalizePageBuilderPublicBasePath(basePath)
  const normalizedPathname = ensureLeadingSlash(pathname)
  if (!normalizedBasePath) {
    return normalizedPathname
  }

  if (normalizedPathname === normalizedBasePath || normalizedPathname.startsWith(`${normalizedBasePath}/`)) {
    return normalizedPathname
  }

  if (normalizedPathname === '/') {
    return `${normalizedBasePath}/`
  }

  return `${normalizedBasePath}${normalizedPathname}`
}

export function stripPageBuilderPublicBasePath(pathname: string, basePath?: string | null): string {
  const normalizedBasePath = normalizePageBuilderPublicBasePath(basePath)
  const normalizedPathname = ensureLeadingSlash(pathname)
  if (!normalizedBasePath) {
    return normalizedPathname
  }

  if (normalizedPathname === normalizedBasePath || normalizedPathname === `${normalizedBasePath}/`) {
    return '/'
  }

  if (normalizedPathname.startsWith(`${normalizedBasePath}/`)) {
    return normalizedPathname.slice(normalizedBasePath.length)
  }

  return normalizedPathname
}

export function toPageBuilderBaseHref(basePath?: string | null): string {
  const normalizedBasePath = normalizePageBuilderPublicBasePath(basePath)
  return normalizedBasePath ? `${normalizedBasePath}/` : '/'
}
