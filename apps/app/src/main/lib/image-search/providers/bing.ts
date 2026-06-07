import { parseHTML } from 'linkedom'
import { logImageSearchInfo } from '../logging'
import type { FetchLike, ImageOrientation, ImageResult, ProviderSearchContext } from '../types'
import { DEFAULT_IMAGE_COUNT, DIMENSION_TIMEOUT, MAX_RETRIES } from '../types'
import { parseImageDimensions } from '../asset-importer'

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
] as const

interface BingSearchResult {
  url: string
  thumbnailUrl: string
  width: number
  height: number
  sourcePage: string
  title?: string
}

function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] ?? USER_AGENTS[0]
}

function isSvgUrl(url: string): boolean {
  return /\.svg(?:[?#].*)?$/i.test(url)
}

function bingFiltersForOrientation(orientation?: ImageOrientation): string {
  if (orientation === 'landscape') return '+filterui:aspect-wide'
  if (orientation === 'portrait') return '+filterui:aspect-tall'
  if (orientation === 'squarish') return '+filterui:aspect-square'
  return ''
}

async function fetchTextWithRetry(fetchFn: FetchLike, url: string, timeoutMs: number): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetchFn(url, {
        headers: { 'User-Agent': pickUserAgent() },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function normalizePositiveNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 0
}

function parseImageElements(html: string, maxCount: number): BingSearchResult[] {
  const { document } = parseHTML(html)
  const anchors = Array.from(document.querySelectorAll('a.iusc'))
  const seen = new Set<string>()
  const results: BingSearchResult[] = []

  for (const anchor of anchors) {
    if (results.length >= maxCount) break
    const payload = anchor.getAttribute('m')
    if (!payload) continue

    try {
      const data = JSON.parse(payload) as Record<string, unknown>
      const url = typeof data.murl === 'string' ? data.murl : ''
      if (!url || seen.has(url) || isSvgUrl(url)) continue

      seen.add(url)
      results.push({
        url,
        thumbnailUrl: typeof data.turl === 'string' ? data.turl : '',
        width: normalizePositiveNumber(data.tw),
        height: normalizePositiveNumber(data.th),
        sourcePage: typeof data.purl === 'string' ? data.purl : '',
        title: typeof data.t === 'string'
          ? data.t
          : typeof data.pt === 'string'
            ? data.pt
            : '',
      })
    } catch {
      // Ignore malformed Bing metadata.
    }
  }

  return results
}

async function fetchImageDimensions(fetchFn: FetchLike, imageUrl: string): Promise<{ width: number; height: number }> {
  try {
    const response = await fetchFn(imageUrl, {
      headers: {
        'User-Agent': pickUserAgent(),
        Range: 'bytes=0-65536',
      },
      signal: AbortSignal.timeout(DIMENSION_TIMEOUT),
    })
    if (!response.ok) return { width: 0, height: 0 }
    return parseImageDimensions(await response.arrayBuffer())
  } catch {
    return { width: 0, height: 0 }
  }
}

function toImageResult(result: BingSearchResult): ImageResult {
  return {
    url: result.url,
    downloadUrl: result.url,
    previewUrl: result.thumbnailUrl,
    thumbnailUrl: result.thumbnailUrl,
    width: result.width,
    height: result.height,
    provider: 'bing',
    sourcePage: result.sourcePage,
    title: result.title || '',
    description: result.title || '',
  }
}

export async function searchBingImages(
  keyword: string,
  count = DEFAULT_IMAGE_COUNT,
  orientation: ImageOrientation | undefined,
  context: ProviderSearchContext,
): Promise<ImageResult[]> {
  const query = encodeURIComponent(keyword)
  const qft = bingFiltersForOrientation(orientation)
  const searchUrl = `https://www.bing.com/images/search?q=${query}&first=1&count=${Math.min(count * 2, 35)}${qft ? `&qft=${encodeURIComponent(qft)}` : ''}`
  logImageSearchInfo(context.logger, 'provider_request', {
    provider: 'bing',
    endpoint: 'https://www.bing.com/images/search',
    params: {
      query: keyword,
      count: Math.min(count * 2, 35),
      qft: qft || null,
    },
  })
  const html = await fetchTextWithRetry(context.fetchFn, searchUrl, context.timeoutMs)
  const results = parseImageElements(html, count)

  const enriched = await Promise.all(results.map(async (result) => {
    if (result.width > 0 && result.height > 0) return result
    const dimensions = await fetchImageDimensions(context.fetchFn, result.url)
    return { ...result, ...dimensions }
  }))

  return enriched.map(toImageResult)
}
