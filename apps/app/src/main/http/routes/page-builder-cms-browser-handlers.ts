import type { Context } from 'hono'
import { CmsGateway, CmsGatewayError } from '../../lib/cms-gateway'
import { resolvePageBuilderCmsConfig } from '../../lib/page-builder-cms-config'
import { builderAccessMismatch } from '../../lib/cms-integration/cms-integration-errors'
import { HttpError } from '../errors'
import { json } from '../responses'
import type { HttpAppEnv } from '../types'

export interface PageBuilderCmsBrowserScope {
  siteId?: string
  filterSitesToSiteId?: string
}

type CmsRouteContext = Context<HttpAppEnv>

export async function handlePageBuilderCmsSites(
  c: CmsRouteContext,
  scope: PageBuilderCmsBrowserScope = {},
): Promise<Response> {
  if (scope.siteId) {
    resolveSiteIdQuery(c, scope.siteId)
  }

  try {
    const gateway = createCmsGateway()
    const sites = await gateway.listSites()
    const filteredSites = scope.filterSitesToSiteId
      ? sites.filter((site) => site.id === scope.filterSitesToSiteId)
      : sites
    return noStoreJson(json(filteredSites))
  } catch (error) {
    throw mapCmsGatewayError(error)
  }
}

export async function handlePageBuilderCmsCatalogs(
  c: CmsRouteContext,
  scope: PageBuilderCmsBrowserScope = {},
): Promise<Response> {
  const ids = readOrderedIdsQuery(c.req.query('ids'))
  const contentType = readOptionalStringQuery(c.req.query('contentType'))
  const searchKeyword = readOptionalStringQuery(c.req.query('searchKeyword'))

  if (ids && (contentType || searchKeyword)) {
    throw new HttpError(400, 'ids 不能与 contentType 或 searchKeyword 混用')
  }

  const siteId = resolveSiteIdQuery(c, scope.siteId)

  try {
    const gateway = createCmsGateway()
    return noStoreJson(json(await gateway.listCatalogs({
      siteId,
      ids,
      contentType,
      searchKeyword,
    })))
  } catch (error) {
    throw mapCmsGatewayError(error)
  }
}

export async function handlePageBuilderCmsCatalogDetail(
  c: CmsRouteContext,
  catalogId: string,
  scope: PageBuilderCmsBrowserScope = {},
): Promise<Response> {
  const normalizedCatalogId = readOptionalStringQuery(catalogId)
  if (!normalizedCatalogId) {
    throw new HttpError(400, 'catalogId 不能为空')
  }

  const siteId = resolveSiteIdQuery(c, scope.siteId)

  try {
    const gateway = createCmsGateway()
    return noStoreJson(json(await gateway.getCatalogDetail(
      normalizedCatalogId,
      siteId,
    )))
  } catch (error) {
    throw mapCmsGatewayError(error)
  }
}

export async function handlePageBuilderCmsContents(
  c: CmsRouteContext,
  scope: PageBuilderCmsBrowserScope = {},
): Promise<Response> {
  const ids = readOrderedIdsQuery(c.req.query('ids'))
  const catalogId = readOptionalStringQuery(c.req.query('catalogId'))

  if (ids && (c.req.query('keyword') || c.req.query('pageIndex') || c.req.query('pageSize'))) {
    throw new HttpError(400, 'ids 不能与 keyword、pageIndex 或 pageSize 混用')
  }

  if (!catalogId) {
    throw new HttpError(400, 'catalogId 不能为空')
  }

  const siteId = resolveSiteIdQuery(c, scope.siteId)

  try {
    const gateway = createCmsGateway()
    return noStoreJson(json(await gateway.listContents({
      siteId,
      ids,
      catalogId,
      keyword: readOptionalStringQuery(c.req.query('keyword')),
      pageIndex: readOptionalIntegerQuery(c.req.query('pageIndex'), {
        min: 0,
        label: 'pageIndex',
      }),
      pageSize: readOptionalIntegerQuery(c.req.query('pageSize'), {
        min: 1,
        label: 'pageSize',
      }),
    })))
  } catch (error) {
    throw mapCmsGatewayError(error)
  }
}

export async function handlePageBuilderCmsAsset(c: CmsRouteContext): Promise<Response> {
  const assetUrl = readOptionalStringQuery(c.req.query('url'))
  if (!assetUrl) {
    throw new HttpError(400, 'url 不能为空')
  }

  try {
    const gateway = createCmsGateway()
    const response = await gateway.fetchAsset(assetUrl)

    const headers = new Headers()
    const contentType = response.headers.get('content-type')
    if (contentType) {
      headers.set('content-type', contentType)
    }
    headers.set('cache-control', 'private, no-store')

    return new Response(response.body, {
      status: response.status,
      headers,
    })
  } catch (error) {
    throw mapCmsGatewayError(error)
  }
}

function createCmsGateway(): CmsGateway {
  const config = resolvePageBuilderCmsConfig()
  if (!config) {
    throw new HttpError(503, 'CMS 浏览暂不可用，请先完成宿主 CMS 配置')
  }

  return new CmsGateway({ config })
}

function noStoreJson(response: Response): Response {
  response.headers.set('cache-control', 'no-store')
  return response
}

function mapCmsGatewayError(error: unknown): Error {
  if (error instanceof HttpError) {
    return error
  }

  if (error instanceof CmsGatewayError) {
    if (error.code === 'invalid_request') {
      return new HttpError(400, error.message)
    }

    if (error.code === 'config') {
      return new HttpError(503, error.message)
    }

    return new HttpError(502, error.message)
  }

  return error instanceof Error ? error : new Error(String(error))
}

function resolveSiteIdQuery(c: CmsRouteContext, enforcedSiteId?: string): string | undefined {
  const requestedSiteId = readOptionalSiteIdQuery(c.req.query('siteId'))
  if (enforcedSiteId && requestedSiteId && requestedSiteId !== enforcedSiteId) {
    throw builderAccessMismatch('当前 CMS 数据请求的 siteId 与当前项目绑定站点不匹配，请从 CMS 重新进入')
  }

  return enforcedSiteId ?? requestedSiteId
}

function readOptionalStringQuery(value: string | undefined): string | undefined {
  const next = value?.trim()
  return next ? next : undefined
}

function readOptionalSiteIdQuery(value: string | undefined): string | undefined {
  const parsed = readOptionalIntegerQuery(value, {
    min: 1,
    label: 'siteId',
  })

  return parsed === undefined ? undefined : String(parsed)
}

function readOrderedIdsQuery(value: string | undefined): string[] | undefined {
  const normalized = value?.trim()
  if (!normalized) {
    return undefined
  }

  const ids = normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return ids.length > 0 ? ids : undefined
}

function readOptionalIntegerQuery(
  value: string | undefined,
  options: { min: number; label: string },
): number | undefined {
  const next = value?.trim()
  if (!next) {
    return undefined
  }

  const parsed = Number(next)
  if (!Number.isInteger(parsed) || parsed < options.min) {
    throw new HttpError(400, `${options.label} 必须是大于等于 ${options.min} 的整数`)
  }

  return parsed
}
