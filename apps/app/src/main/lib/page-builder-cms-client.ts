import { getFetchFn } from './proxy-fetch'
import { getEffectiveProxyUrl } from './proxy-settings-service'
import {
  buildPageBuilderCmsCookie,
  readPageBuilderCmsSettings,
  resolvePageBuilderCmsPreviewUrl,
} from './page-builder-cms-settings-service'

interface ListChannelsOptions {
  search?: string
}

interface ListContentsOptions {
  catalogId: string
  title?: string
  pageIndex?: number
  pageSize?: number
}

function buildHeaders(): Headers {
  const settings = readPageBuilderCmsSettings()
  return new Headers({
    accept: '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    referer: `${settings.baseUrl}/app.html`,
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    cookie: buildPageBuilderCmsCookie(settings),
  })
}

async function getFetch(): Promise<typeof globalThis.fetch> {
  return getFetchFn(await getEffectiveProxyUrl())
}

async function requestJson<T>(url: string): Promise<T> {
  const fetchFn = await getFetch()
  const response = await fetchFn(url, {
    method: 'GET',
    headers: buildHeaders(),
  })

  if (!response.ok) {
    throw new Error(`CMS 请求失败 (${response.status}): ${url}`)
  }

  return await response.json() as T
}

async function fetchPreviewAsset(relativePath: string): Promise<Response> {
  const fetchFn = await getFetch()
  const settings = readPageBuilderCmsSettings()
  const response = await fetchFn(resolvePageBuilderCmsPreviewUrl(relativePath, settings), {
    method: 'GET',
    headers: buildHeaders(),
  })

  if (!response.ok) {
    throw new Error(`CMS 资源请求失败 (${response.status}): ${relativePath}`)
  }

  return response
}

export function createPageBuilderCmsClient() {
  return {
    async listChannels(options: ListChannelsOptions = {}) {
      const settings = readPageBuilderCmsSettings()
      const url = new URL(`${settings.baseUrl}/ui/dimensions/1/catalogs`)
      if (options.search?.trim()) {
        url.searchParams.set('searchKeyWord', options.search.trim())
      }

      return requestJson<{ status: number; data: unknown[] }>(url.toString())
    },

    async listContents(options: ListContentsOptions) {
      const settings = readPageBuilderCmsSettings()
      const url = new URL(`${settings.baseUrl}/ui/contentcore/contents`)
      url.searchParams.set('contentSelectType', '')
      url.searchParams.set('keyWord', '')
      url.searchParams.set('top', 'false')
      url.searchParams.set('title', options.title?.trim() ?? '')
      url.searchParams.set('catalogID', options.catalogId)
      url.searchParams.set('pageIndex', String(options.pageIndex ?? 0))
      url.searchParams.set('pageSize', String(options.pageSize ?? 20))

      return requestJson<{ total?: number; status?: number; data?: unknown[] }>(url.toString())
    },

    fetchPreviewAsset,
  }
}
