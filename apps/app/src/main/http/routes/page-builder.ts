import { Hono } from 'hono'
import {
  readPageBuilderCmsRenderingPreviewScript,
  readPageBuilderCmsRenderingVueScript,
} from '../../lib/page-builder-cms-rendering-preview'
import { deletePageBuilderProject, listPageBuilderProjects } from '../../lib/page-builder-project-service'
import {
  PageBuilderEditLockConflictError,
  pageBuilderEditLockService,
} from '../../lib/page-builder-edit-lock-service'
import { readPageBuilderPreviewBridgeScript } from '../../lib/page-builder-preview-bridge'
import { getAgentWorkspace } from '../../lib/workspace-service'
import {
  assertCmsBuilderApiAvailableInCmsMode,
  createCmsBuilderAccessMiddleware,
} from '../../lib/cms-integration/cms-builder-access-middleware'
import { HttpError } from '../errors'
import { json, noContent } from '../responses'
import type { HttpAppEnv } from '../types'
import {
  handlePageBuilderCmsAsset,
  handlePageBuilderCmsCatalogDetail,
  handlePageBuilderCmsCatalogs,
  handlePageBuilderCmsContents,
  handlePageBuilderCmsSites,
} from './page-builder-cms-browser-handlers'

export const pageBuilderRoutes = new Hono<HttpAppEnv>()

const previewScriptHeaders = {
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
  'content-type': 'application/javascript; charset=utf-8',
} as const

pageBuilderRoutes.get('/preview-bridge.js', async () => {
  return new Response(await readPageBuilderPreviewBridgeScript(), {
    headers: previewScriptHeaders,
  })
})

pageBuilderRoutes.get('/cms-rendering-preview.js', async () => {
  return new Response(await readPageBuilderCmsRenderingPreviewScript(), {
    headers: previewScriptHeaders,
  })
})

pageBuilderRoutes.get('/cms-rendering-vue.js', () => {
  return new Response(readPageBuilderCmsRenderingVueScript(), {
    headers: previewScriptHeaders,
  })
})

pageBuilderRoutes.get('/projects', (c) => {
  assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下不可读取全量 page-builder 项目列表', {
    allowDevStandaloneEntry: true,
  })
  return c.json(listPageBuilderProjects())
})

pageBuilderRoutes.delete('/projects/:workspaceId', (c) => {
  assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下不可删除 project binding 关联的 page-builder 项目', {
    allowDevStandaloneEntry: true,
  })
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

pageBuilderRoutes.use('/projects/:workspaceId/edit-lock', createCmsBuilderAccessMiddleware({
  workspaceId: (c) => c.req.param('workspaceId'),
  requireOrigin: (c) => c.req.method !== 'GET',
}))
pageBuilderRoutes.use('/projects/:workspaceId/edit-lock/*', createCmsBuilderAccessMiddleware({
  workspaceId: (c) => c.req.param('workspaceId'),
  requireOrigin: (c) => c.req.method !== 'GET',
}))

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
  assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下旧全局 CMS browser API 不可用')
  return handlePageBuilderCmsSites(c)
})

pageBuilderRoutes.get('/cms/catalogs', async (c) => {
  assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下旧全局 CMS browser API 不可用')
  return handlePageBuilderCmsCatalogs(c)
})

pageBuilderRoutes.get('/cms/catalogs/:catalogId', async (c) => {
  assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下旧全局 CMS browser API 不可用')
  return handlePageBuilderCmsCatalogDetail(c, c.req.param('catalogId'))
})

pageBuilderRoutes.get('/cms/contents', async (c) => {
  assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下旧全局 CMS browser API 不可用')
  return handlePageBuilderCmsContents(c)
})

pageBuilderRoutes.get('/cms/assets', async (c) => {
  assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下旧全局 CMS browser API 不可用')
  return handlePageBuilderCmsAsset(c)
})

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
