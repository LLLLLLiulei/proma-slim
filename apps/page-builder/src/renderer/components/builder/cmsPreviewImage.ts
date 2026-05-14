import { resolveApiUrl } from '@/lib/api'

export function buildCmsAssetProxyUrl(assetUrl: string, workspaceId?: string | null): string {
  const normalizedWorkspaceId = workspaceId?.trim()
  const path = normalizedWorkspaceId
    ? `/api/workspaces/${encodeURIComponent(normalizedWorkspaceId)}/page-builder/cms/assets?url=${encodeURIComponent(assetUrl)}`
    : `/api/page-builder/cms/assets?url=${encodeURIComponent(assetUrl)}`
  return resolveApiUrl(path)
}

function buildDefaultPreviewImage(): string {
  const svg = `
    <svg width="208" height="156" viewBox="0 0 208 156" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="208" height="156" fill="#F6F7F9"/>
      <rect x="20" y="20" width="168" height="116" rx="8" fill="#FFFFFF" stroke="#D9DDE3"/>
      <rect x="36" y="36" width="136" height="62" fill="#EEF2F6"/>
      <circle cx="68" cy="61" r="10" fill="#D5DBE3"/>
      <path d="M46 92L78 62L101 84L117 71L162 116H46V92Z" fill="#C7CFDA"/>
      <rect x="36" y="108" width="74" height="8" rx="4" fill="#E2E7EE"/>
      <rect x="116" y="108" width="34" height="8" rx="4" fill="#E9EDF3"/>
    </svg>
  `.replace(/\s+/g, ' ').trim()

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export const DEFAULT_CMS_PREVIEW_IMAGE = buildDefaultPreviewImage()

export function pickCmsPreviewImage(assetUrl?: string | null, workspaceId?: string | null): string {
  if (assetUrl) {
    return buildCmsAssetProxyUrl(assetUrl, workspaceId)
  }

  return DEFAULT_CMS_PREVIEW_IMAGE
}
