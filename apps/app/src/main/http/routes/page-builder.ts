import { Hono } from 'hono'
import { CmsGateway, CmsGatewayError } from '../../lib/cms-gateway'
import {
  readPageBuilderCmsRenderingPreviewScript,
  readPageBuilderCmsRenderingVueScript,
} from '../../lib/page-builder-cms-rendering-preview'
import { deletePageBuilderProject, listPageBuilderProjects } from '../../lib/page-builder-project-service'
import { resolvePageBuilderCmsConfig } from '../../lib/page-builder-cms-config'
import {
  PageBuilderEditLockConflictError,
  pageBuilderEditLockService,
} from '../../lib/page-builder-edit-lock-service'
import { readPageBuilderPreviewBridgeScript } from '../../lib/page-builder-preview-bridge'
import { getAgentWorkspace } from '../../lib/workspace-service'
import { HttpError } from '../errors'
import { json, noContent } from '../responses'

export const pageBuilderRoutes = new Hono()

pageBuilderRoutes.get('/preview-bridge.js', async () => {
  return new Response(await readPageBuilderPreviewBridgeScript(), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/javascript; charset=utf-8',
    },
  })
})

pageBuilderRoutes.get('/cms-rendering-preview.js', async () => {
  return new Response(await readPageBuilderCmsRenderingPreviewScript(), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/javascript; charset=utf-8',
    },
  })
})

pageBuilderRoutes.get('/cms-rendering-vue.js', () => {
  return new Response(readPageBuilderCmsRenderingVueScript(), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/javascript; charset=utf-8',
    },
  })
})

pageBuilderRoutes.get('/projects', (c) => {
  return c.json(listPageBuilderProjects())
})

pageBuilderRoutes.delete('/projects/:workspaceId', (c) => {
  try {
    deletePageBuilderProject(c.req.param('workspaceId'))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('page-builder 项目不存在:')) {
      throw new HttpError(404, error.message)
    }
    if (error instanceof PageBuilderEditLockConflictError) {
      throw new HttpError(409, error.message)
    }
    throw error
  }

  return noContent()
})

pageBuilderRoutes.post('/projects/:workspaceId/edit-lock', async (c) => {
  const workspace = getPageBuilderWorkspaceOrThrow(c.req.param('workspaceId'))
  const body = await readOptionalJsonBody<{
    sessionId?: unknown
    holderId?: unknown
  }>(c.req.raw)

  try {
    return json(pageBuilderEditLockService.acquire(workspace.id, {
      sessionId: readOptionalBodyString(body.sessionId),
      holderId: readOptionalBodyString(body.holderId),
    }), 201)
  } catch (error) {
    if (error instanceof PageBuilderEditLockConflictError) {
      return json({
        error: error.message,
        editState: error.editState,
      }, 409)
    }
    throw error
  }
})

pageBuilderRoutes.post('/projects/:workspaceId/edit-lock/:lockId/renew', async (c) => {
  const workspace = getPageBuilderWorkspaceOrThrow(c.req.param('workspaceId'))
  const body = await readOptionalJsonBody<{ holderId?: unknown }>(c.req.raw)
  const holderId = readOptionalBodyString(body.holderId)
  if (!holderId) {
    throw new HttpError(400, 'holderId 不能为空')
  }

  const lease = pageBuilderEditLockService.renew(workspace.id, c.req.param('lockId'), { holderId })
  if (!lease) {
    throw new HttpError(409, '编辑锁已失效，请从首页重新进入编辑')
  }

  return json(lease)
})

pageBuilderRoutes.get('/projects/:workspaceId/edit-lock/:lockId', (c) => {
  const workspace = getPageBuilderWorkspaceOrThrow(c.req.param('workspaceId'))
  return json(pageBuilderEditLockService.getStatus(workspace.id, c.req.param('lockId')))
})

pageBuilderRoutes.post('/projects/:workspaceId/edit-lock/:lockId/release', async (c) => {
  const workspace = getPageBuilderWorkspaceOrThrow(c.req.param('workspaceId'))
  const body = await readOptionalJsonBody<{ holderId?: unknown }>(c.req.raw)
  const holderId = readOptionalBodyString(body.holderId)
  if (!holderId) {
    throw new HttpError(400, 'holderId 不能为空')
  }

  pageBuilderEditLockService.release(workspace.id, c.req.param('lockId'), { holderId })
  return noContent()
})

pageBuilderRoutes.get('/cms/sites', async (c) => {
  try {
    const gateway = createCmsGateway()
    return noStoreJson(c.json(await gateway.listSites()))
  } catch (error) {
    throw mapCmsGatewayError(error)
  }
})

pageBuilderRoutes.get('/cms/catalogs', async (c) => {
  const ids = readOrderedIdsQuery(c.req.query('ids'))
  const contentType = readOptionalStringQuery(c.req.query('contentType'))
  const searchKeyword = readOptionalStringQuery(c.req.query('searchKeyword'))

  if (ids && (contentType || searchKeyword)) {
    throw new HttpError(400, 'ids 不能与 contentType 或 searchKeyword 混用')
  }

  try {
    const gateway = createCmsGateway()
    return noStoreJson(c.json(await gateway.listCatalogs({
      siteId: readOptionalSiteIdQuery(c.req.query('siteId')),
      ids,
      contentType,
      searchKeyword,
    })))
  } catch (error) {
    throw mapCmsGatewayError(error)
  }
})

pageBuilderRoutes.get('/cms/catalogs/:catalogId', async (c) => {
  const catalogId = readOptionalStringQuery(c.req.param('catalogId'))
  if (!catalogId) {
    throw new HttpError(400, 'catalogId 不能为空')
  }

  try {
    const gateway = createCmsGateway()
    return noStoreJson(c.json(await gateway.getCatalogDetail(
      catalogId,
      readOptionalSiteIdQuery(c.req.query('siteId')),
    )))
  } catch (error) {
    throw mapCmsGatewayError(error)
  }
})

pageBuilderRoutes.get('/cms/contents', async (c) => {
  const ids = readOrderedIdsQuery(c.req.query('ids'))
  const catalogId = readOptionalStringQuery(c.req.query('catalogId'))

  if (ids && (c.req.query('keyword') || c.req.query('pageIndex') || c.req.query('pageSize'))) {
    throw new HttpError(400, 'ids 不能与 keyword、pageIndex 或 pageSize 混用')
  }

  if (!catalogId) {
    throw new HttpError(400, 'catalogId 不能为空')
  }

  try {
    const gateway = createCmsGateway()
    return noStoreJson(c.json(await gateway.listContents({
      siteId: readOptionalSiteIdQuery(c.req.query('siteId')),
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
})

pageBuilderRoutes.get('/cms/assets', async (c) => {
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
})

function createCmsGateway(): CmsGateway {
  const config = resolvePageBuilderCmsConfig()
  if (!config) {
    throw new HttpError(503, 'CMS 浏览暂不可用，请先完成宿主 CMS 配置')
  }

  return new CmsGateway({ config })
}

function getPageBuilderWorkspaceOrThrow(workspaceId: string) {
  const workspace = getAgentWorkspace(decodeURIComponent(workspaceId))
  if (!workspace || workspace.template !== 'page-builder') {
    throw new HttpError(404, `page-builder 项目不存在: ${workspaceId}`)
  }
  return workspace
}

async function readOptionalJsonBody<T extends Record<string, unknown>>(request: Request): Promise<T> {
  if (request.headers.get('content-length') === '0') {
    return {} as T
  }

  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('invalid body')
    }
    return body as T
  } catch {
    return {} as T
  }
}

function readOptionalBodyString(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || undefined
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
