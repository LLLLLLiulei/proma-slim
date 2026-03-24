import { createMiddleware } from 'hono/factory'
import { getAgentWorkspace } from '../../lib/workspace-service'
import { HttpError } from '../errors'
import type { HttpAppEnv } from '../types'

export const workspaceMiddleware = createMiddleware<HttpAppEnv>(async (c, next) => {
  const rawWorkspaceId = c.req.param('workspaceId')
  if (!rawWorkspaceId) {
    throw new HttpError(404, '工作区不存在')
  }

  const workspaceId = decodeURIComponent(rawWorkspaceId)
  const workspace = getAgentWorkspace(workspaceId)

  if (!workspace) {
    throw new HttpError(404, `工作区不存在: ${workspaceId}`)
  }

  c.set('workspace', workspace)
  await next()
})
