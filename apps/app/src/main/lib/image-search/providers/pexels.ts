import { logImageSearchInfo } from '../logging'
import type { ImageOrientation, ImageResult, ProviderSearchContext } from '../types'

const API_URL = 'https://api.pexels.com/v1/search'

const ORIENTATION_MAP: Record<ImageOrientation, string> = {
  landscape: 'landscape',
  portrait: 'portrait',
  squarish: 'square',
}

interface PexelsPhoto {
  id: number
  width: number
  height: number
  url: string
  photographer: string
  photographer_url?: string
  photographer_id?: number
  avg_color?: string
  alt: string
  src: {
    original: string
    large2x: string
    large: string
    medium: string
    small: string
    tiny?: string
    portrait?: string
    landscape?: string
  }
}

function pickDownloadUrl(src: PexelsPhoto['src']): string {
  return src.original || src.large2x || src.large || ''
}

function buildAttribution(photo: PexelsPhoto): string {
  const author = photo.photographer || 'Pexels photographer'
  return `Photo by ${author} on Pexels`
}

function parseResults(photos: PexelsPhoto[]): ImageResult[] {
  const results: ImageResult[] = []
  for (const item of photos) {
    const downloadUrl = pickDownloadUrl(item.src)
    if (!downloadUrl) continue
    const thumbnailUrl = item.src.medium || item.src.small || item.src.tiny || ''
    const previewUrl = item.src.large2x || item.src.large || thumbnailUrl
    results.push({
      id: String(item.id || ''),
      url: downloadUrl,
      downloadUrl,
      previewUrl,
      thumbnailUrl,
      width: item.width || 0,
      height: item.height || 0,
      provider: 'pexels',
      author: item.photographer || '',
      authorUrl: item.photographer_url || '',
      authorId: item.photographer_id ? String(item.photographer_id) : '',
      sourcePage: item.url || '',
      title: item.alt || '',
      description: item.alt || '',
      dominantColor: item.avg_color || '',
      licenseName: 'Pexels License',
      licenseUrl: 'https://www.pexels.com/license/',
      attributionRequired: false,
      attributionText: buildAttribution(item),
    })
  }
  return results
}

export async function searchPexelsImages(
  query: string,
  perPage: number,
  orientation: ImageOrientation | undefined,
  context: ProviderSearchContext,
): Promise<ImageResult[]> {
  const apiKey = context.config.pexels.apiKey
  if (!apiKey) throw new Error('PEXELS_API_KEY not configured')

  const params: Record<string, string> = {
    query,
    per_page: String(Math.min(perPage, 80)),
    size: 'large',
  }
  if (orientation) params.orientation = ORIENTATION_MAP[orientation]

  logImageSearchInfo(context.logger, 'provider_request', {
    provider: 'pexels',
    endpoint: API_URL,
    params,
    apiKeyConfigured: true,
    apiKeySource: context.config.pexels.source ?? null,
  })

  const response = await context.fetchFn(`${API_URL}?${new URLSearchParams(params).toString()}`, {
    headers: {
      Authorization: apiKey,
      'User-Agent': 'image-search-mcp/1.0',
    },
    signal: AbortSignal.timeout(context.timeoutMs),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Pexels API error: ${response.status} - ${text}`)
  }

  const data = await response.json() as { photos: PexelsPhoto[] }
  return parseResults(data.photos || [])
}
