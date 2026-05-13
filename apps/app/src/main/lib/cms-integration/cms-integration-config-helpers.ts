import { normalizePageBuilderPublicBasePath, prependPageBuilderPublicBasePath } from '@ai-page-builder/shared'

export function normalizeCmsHandoffPublicOrigin(value: string | undefined | null): string | null {
  const raw = value?.trim()
  if (!raw) {
    return null
  }

  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }

    if (url.pathname !== '/' || url.search || url.hash) {
      return null
    }

    return url.origin
  } catch {
    return null
  }
}

export function buildCmsHandoffOpenUrl(input: {
  publicOrigin: string
  basePath: string
  handoffId: string
}): string {
  const normalizedBasePath = normalizePageBuilderPublicBasePath(input.basePath)
  const path = prependPageBuilderPublicBasePath(
    `/api/integrations/cms/handoffs/${encodeURIComponent(input.handoffId)}/open`,
    normalizedBasePath,
  )
  return `${input.publicOrigin}${path}`
}

export function resolveCmsHandoffCookieSecure(publicOrigin: string, forwardedProto?: string | null): boolean {
  if (publicOrigin.startsWith('https://')) {
    return true
  }

  return forwardedProto?.trim().toLowerCase() === 'https'
}
