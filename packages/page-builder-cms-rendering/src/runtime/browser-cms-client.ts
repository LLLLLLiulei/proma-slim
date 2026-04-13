import type {
  PageBuilderCmsCatalogList,
  PageBuilderCmsCatalogQuery,
  PageBuilderCmsContentList,
  PageBuilderCmsContentQuery,
  PageBuilderCmsContentSummary,
} from '@proma/shared'
import type { CmsRuntimeClient } from './cms-runtime-client'

export interface BrowserCmsClientOptions {
  baseUrl?: string
  fetchFn?: typeof fetch
}

export const DEFAULT_BROWSER_CMS_API_BASE = '/api/page-builder/cms'

export function createBrowserCmsClient(options: BrowserCmsClientOptions = {}): CmsRuntimeClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BROWSER_CMS_API_BASE)
  const fetchFn = (options.fetchFn ?? globalThis.fetch).bind(globalThis) as typeof fetch

  return {
    async listCatalogs(query: PageBuilderCmsCatalogQuery = {}) {
      return requestJson<PageBuilderCmsCatalogList>({
        url: `${baseUrl}/catalogs${toSearchSuffix(query)}`,
        errorLabel: 'Catalog request failed',
        fetchFn,
      })
    },

    async listContents(query: PageBuilderCmsContentQuery) {
      const response = await requestJson<PageBuilderCmsContentList>({
        url: `${baseUrl}/contents${toSearchSuffix(query)}`,
        errorLabel: 'Content request failed',
        fetchFn,
      })

      return rewriteContentListAssetUrls(response, baseUrl)
    },
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  return normalized || DEFAULT_BROWSER_CMS_API_BASE
}

function toSearchSuffix(query: object): string {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (shouldIncludeQueryValue(value)) {
      searchParams.set(key, String(value))
    }
  }

  const search = searchParams.toString()
  return search ? `?${search}` : ''
}

function shouldIncludeQueryValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false
  }

  if (typeof value === 'string') {
    return value.trim() !== ''
  }

  return true
}

function rewriteContentListAssetUrls(
  response: PageBuilderCmsContentList,
  baseUrl: string,
): PageBuilderCmsContentList {
  return {
    ...response,
    items: response.items.map((item) => rewriteContentAssetUrls(item, baseUrl)),
  }
}

function rewriteContentAssetUrls(
  item: PageBuilderCmsContentSummary,
  baseUrl: string,
): PageBuilderCmsContentSummary {
  return {
    ...item,
    listLogoUrl: rewriteAssetUrl(item.listLogoUrl, baseUrl),
  }
}

function rewriteAssetUrl(assetUrl: string | undefined, baseUrl: string): string | undefined {
  const normalized = assetUrl?.trim()
  if (!normalized) {
    return undefined
  }

  if (isProxyAssetUrl(normalized, baseUrl)) {
    return normalized
  }

  return `${baseUrl}/assets?url=${encodeURIComponent(normalized)}`
}

function isProxyAssetUrl(assetUrl: string, baseUrl: string): boolean {
  try {
    const candidate = new URL(assetUrl, 'http://localhost')
    const proxyPath = new URL(`${baseUrl}/assets`, 'http://localhost').pathname
    return candidate.pathname === proxyPath
  } catch {
    return false
  }
}

async function requestJson<TResult>(options: {
  url: string
  errorLabel: string
  fetchFn: typeof fetch
}): Promise<TResult> {
  const response = await options.fetchFn(options.url)

  if (!response.ok) {
    throw new Error(`${options.errorLabel} with HTTP ${response.status}`)
  }

  return response.json() as Promise<TResult>
}
