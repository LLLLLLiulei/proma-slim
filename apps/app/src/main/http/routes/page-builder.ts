import { Hono } from 'hono'
import { CmsGateway, CmsGatewayError } from '../../lib/cms-gateway'
import {
  readPageBuilderCmsRenderingPreviewScript,
  readPageBuilderCmsRenderingVueScript,
} from '../../lib/page-builder-cms-rendering-preview'
import { deletePageBuilderProject, listPageBuilderProjects } from '../../lib/page-builder-project-service'
import { resolvePageBuilderCmsConfig } from '../../lib/page-builder-cms-config'
import { readPageBuilderPreviewBridgeScript } from '../../lib/page-builder-preview-bridge'
import { HttpError } from '../errors'
import { noContent } from '../responses'

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
    throw error
  }

  return noContent()
})

pageBuilderRoutes.get('/cms/sites', async (c) => {
  try {
    const gateway = createCmsGateway()
    return c.json(await gateway.listSites())
  } catch (error) {
    throw mapCmsGatewayError(error)
  }
})

pageBuilderRoutes.get('/cms/catalogs', async (c) => {
  try {
    const gateway = createCmsGateway()
    return c.json(await gateway.listCatalogs({
      siteId: readOptionalSiteIdQuery(c.req.query('siteId')),
      contentType: readOptionalStringQuery(c.req.query('contentType')),
      searchKeyword: readOptionalStringQuery(c.req.query('searchKeyword')),
    }))
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
    return c.json(await gateway.getCatalogDetail(
      catalogId,
      readOptionalSiteIdQuery(c.req.query('siteId')),
    ))
  } catch (error) {
    throw mapCmsGatewayError(error)
  }
})

pageBuilderRoutes.get('/cms/contents', async (c) => {
  const catalogId = readOptionalStringQuery(c.req.query('catalogId'))
  if (!catalogId) {
    throw new HttpError(400, 'catalogId 不能为空')
  }

  try {
    const gateway = createCmsGateway()
    return c.json(await gateway.listContents({
      siteId: readOptionalSiteIdQuery(c.req.query('siteId')),
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
    }))
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

function mapCmsGatewayError(error: unknown): Error {
  if (error instanceof HttpError) {
    return error
  }

  if (error instanceof CmsGatewayError) {
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
