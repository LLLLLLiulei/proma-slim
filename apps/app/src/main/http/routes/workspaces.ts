import { Hono } from 'hono'
import {
  DEFAULT_WORKSPACE_SLUG,
  createAgentWorkspace,
  deleteAgentWorkspace,
  getWorkspaceCapabilities,
  getWorkspaceDirectoryContext,
  listAgentWorkspaces,
  searchWorkspaceFiles,
  updateAgentWorkspace,
} from '../../lib/workspace-service'
import {
  createWorkspacePreviewResponse,
  getWorkspacePreviewState,
} from '../../lib/workspace-preview-service'
import { listAgentSessions } from '../../lib/agent-session-manager'
import { HttpError } from '../errors'
import { json, noContent, readJsonBody } from '../responses'
import type { HttpAppEnv } from '../types'
import { workspaceMiddleware } from '../middleware/workspace'

export const workspaceRoutes = new Hono<HttpAppEnv>()

function getWorkspacePreviewRequestPath(url: string, workspaceId: string): string {
  const pathname = new URL(url).pathname
  const prefix = `/api/workspaces/${encodeURIComponent(workspaceId)}/preview`
  const suffix = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '/'

  return suffix || '/'
}

workspaceRoutes.get('/', (c) => {
  return c.json(listAgentWorkspaces())
})

workspaceRoutes.post('/', async (c) => {
  const body = await readJsonBody<{ name?: string; template?: string }>(c.req.raw)
  if (!body.name || !body.name.trim()) {
    throw new HttpError(400, '工作区名称不能为空')
  }

  if (body.template && body.template !== 'page-builder') {
    throw new HttpError(400, '不支持的工作区模板')
  }

  const template = body.template === 'page-builder'
    ? 'page-builder'
    : undefined

  return c.json(createAgentWorkspace(
    body.name.trim(),
    template ? { template } : undefined,
  ), 201)
})

workspaceRoutes.use('/:workspaceId', workspaceMiddleware)
workspaceRoutes.use('/:workspaceId/*', workspaceMiddleware)

workspaceRoutes.patch('/:workspaceId', async (c) => {
  const body = await readJsonBody<{ name?: string }>(c.req.raw)
  if (!body.name || !body.name.trim()) {
    throw new HttpError(400, '工作区名称不能为空')
  }

  return c.json(updateAgentWorkspace(c.var.workspace.id, { name: body.name.trim() }))
})

workspaceRoutes.delete('/:workspaceId', (c) => {
  if (c.var.workspace.slug === DEFAULT_WORKSPACE_SLUG) {
    throw new HttpError(409, '默认工作区不可删除')
  }

  const workspaceSessions = listAgentSessions().filter((session) => session.workspaceId === c.var.workspace.id)
  if (workspaceSessions.length > 0) {
    throw new HttpError(409, '请先迁移或删除该工作区下的会话后再删除工作区')
  }

  deleteAgentWorkspace(c.var.workspace.id)
  return noContent()
})

workspaceRoutes.get('/:workspaceId/capabilities', (c) => {
  return c.json(getWorkspaceCapabilities(c.var.workspace.slug))
})

workspaceRoutes.get('/:workspaceId/directory-context', (c) => {
  return c.json(getWorkspaceDirectoryContext(c.var.workspace.id))
})

workspaceRoutes.get('/:workspaceId/preview-state', (c) => {
  return json(getWorkspacePreviewState(c.var.workspace))
})

const handleWorkspacePreview = (c: { req: { raw: Request }; var: { workspace: HttpAppEnv['Variables']['workspace'] } }) => {
  const requestPath = getWorkspacePreviewRequestPath(c.req.raw.url, c.var.workspace.id)
  return createWorkspacePreviewResponse(c.var.workspace, requestPath)
}

workspaceRoutes.get('/:workspaceId/preview', handleWorkspacePreview)
workspaceRoutes.get('/:workspaceId/preview/', handleWorkspacePreview)
workspaceRoutes.get('/:workspaceId/preview/*', handleWorkspacePreview)

workspaceRoutes.get('/:workspaceId/file-search', (c) => {
  const query = c.req.query('q') ?? ''
  const limitParam = c.req.query('limit')
  const limit = limitParam ? Math.max(1, Number.parseInt(limitParam, 10) || 20) : 20
  const extraDirectories = (c.req.queries('dir') ?? []).filter(Boolean)

  return c.json(searchWorkspaceFiles(c.var.workspace.id, query, limit, extraDirectories))
})
