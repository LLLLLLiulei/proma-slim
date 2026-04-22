import { createMiddleware } from 'hono/factory'
import { getAgentSessionMeta } from '../../lib/agent-session-manager'
import { HttpError } from '../errors'
import type { HttpAppEnv } from '../types'

export const sessionMiddleware = createMiddleware<HttpAppEnv>(async (c, next) => {
  const rawSessionId = c.req.param('sessionId')
  if (!rawSessionId) {
    throw new HttpError(404, '会话不存在')
  }

  const sessionId = decodeURIComponent(rawSessionId)
  const sessionMeta = getAgentSessionMeta(sessionId)

  if (!sessionMeta) {
    throw new HttpError(404, `会话不存在: ${sessionId}`)
  }

  c.set('sessionMeta', sessionMeta)
  c.var.diagnostic.resource.sessionId = sessionMeta.id
  if (sessionMeta.workspaceId) {
    c.var.diagnostic.resource.workspaceId = sessionMeta.workspaceId
  }
  await next()
})
