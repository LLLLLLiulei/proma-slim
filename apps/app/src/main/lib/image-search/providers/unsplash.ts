import { logImageSearchInfo } from '../logging'
import type { ImageOrientation, ImageResult, ProviderSearchContext } from '../types'

const API_BASE = 'https://api.unsplash.com'

interface UnsplashPhoto {
  id: string
  description: string | null
  alt_description?: string | null
  urls: {
    raw: string
    full: string
    regular: string
    small: string
    thumb: string
  }
  width: number
  height: number
  links: {
    html: string
    download_location?: string
  }
  user: {
    name: string
    links?: {
      html?: string
    }
  }
}

function toImageResults(photos: UnsplashPhoto[]): ImageResult[] {
  return photos.map((photo) => ({
    id: photo.id,
    url: photo.urls.regular,
    downloadUrl: photo.urls.regular,
    previewUrl: photo.urls.small || photo.urls.regular,
    thumbnailUrl: photo.urls.thumb || photo.urls.small,
    width: photo.width,
    height: photo.height,
    provider: 'unsplash' as const,
    author: photo.user.name,
    authorUrl: photo.user.links?.html || '',
    sourcePage: photo.links.html,
    title: photo.description || photo.alt_description || '',
    description: photo.description || photo.alt_description || '',
    downloadTrackingUrl: photo.links.download_location || '',
    licenseName: 'Unsplash License',
    licenseUrl: 'https://unsplash.com/license',
    attributionRequired: false,
    attributionText: photo.user.name ? `Photo by ${photo.user.name} on Unsplash` : 'Photo on Unsplash',
  }))
}

export async function searchUnsplashImages(
  query: string,
  perPage: number,
  orientation: ImageOrientation | undefined,
  context: ProviderSearchContext,
): Promise<ImageResult[]> {
  const apiKey = context.config.unsplash.apiKey
  if (!apiKey) throw new Error('UNSPLASH_ACCESS_KEY not configured')

  const params: Record<string, string> = {
    query,
    per_page: String(Math.min(perPage, 30)),
    page: '1',
    order_by: 'relevant',
  }
  if (orientation) params.orientation = orientation

  logImageSearchInfo(context.logger, 'provider_request', {
    provider: 'unsplash',
    endpoint: `${API_BASE}/search/photos`,
    params,
    apiKeyConfigured: true,
    apiKeySource: context.config.unsplash.source ?? null,
  })

  const response = await context.fetchFn(`${API_BASE}/search/photos?${new URLSearchParams(params).toString()}`, {
    headers: {
      'Accept-Version': 'v1',
      Authorization: `Client-ID ${apiKey}`,
    },
    signal: AbortSignal.timeout(context.timeoutMs),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Unsplash API error: ${response.status} - ${text}`)
  }

  const data = await response.json() as { results: UnsplashPhoto[]; total: number }
  return toImageResults(data.results || [])
}
