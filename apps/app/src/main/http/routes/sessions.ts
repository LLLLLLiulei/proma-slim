import { Hono } from 'hono'
import type {
  AgentSendInput,
  AskUserResponse,
  PermissionResponse,
} from '@proma/shared'
import { askUserService } from '../../lib/agent-ask-user-service'
import { isAgentSessionActive, stopAgent } from '../../lib/agent-service'
import { permissionService } from '../../lib/agent-permission-service'
import {
  createAgentSession,
  deleteAgentSession,
  getAgentSessionMessages,
  listAgentSessions,
  moveSessionToWorkspace,
  updateAgentSessionMeta,
} from '../../lib/agent-session-manager'
import { sseManager } from '../../sse-manager'
import { createSendResponse } from '../agent-stream'
import { HttpError } from '../errors'
import { noContent, readJsonBody } from '../responses'
import type { HttpAppEnv } from '../types'
import { sessionMiddleware } from '../middleware/session'

export const sessionRoutes = new Hono<HttpAppEnv>()

sessionRoutes.get('/', (c) => {
  return c.json(listAgentSessions())
})

sessionRoutes.post('/', async (c) => {
  const body = await readJsonBody<{ title?: string; workspaceId?: string }>(c.req.raw)
  return c.json(createAgentSession(body.title, undefined, body.workspaceId), 201)
})

sessionRoutes.use('/:sessionId', sessionMiddleware)
sessionRoutes.use('/:sessionId/*', sessionMiddleware)

sessionRoutes.delete('/:sessionId', (c) => {
  if (isAgentSessionActive(c.var.sessionMeta.id)) {
    stopAgent(c.var.sessionMeta.id)
  }

  deleteAgentSession(c.var.sessionMeta.id)
  return noContent()
})

sessionRoutes.patch('/:sessionId', async (c) => {
  const body = await readJsonBody<{ title?: string }>(c.req.raw)
  if (!body.title || !body.title.trim()) {
    throw new HttpError(400, '标题不能为空')
  }

  return c.json(updateAgentSessionMeta(c.var.sessionMeta.id, { title: body.title.trim() }))
})

sessionRoutes.get('/:sessionId/messages', (c) => {
  return c.json(getAgentSessionMessages(c.var.sessionMeta.id))
})

sessionRoutes.post('/:sessionId/move-workspace', async (c) => {
  const body = await readJsonBody<{ workspaceId?: string; targetWorkspaceId?: string }>(c.req.raw)
  const targetWorkspaceId = body.workspaceId ?? body.targetWorkspaceId
  if (!targetWorkspaceId) {
    throw new HttpError(400, '目标工作区不能为空')
  }

  return c.json(moveSessionToWorkspace(c.var.sessionMeta.id, targetWorkspaceId))
})

sessionRoutes.post('/:sessionId/stop', (c) => {
  stopAgent(c.var.sessionMeta.id)
  sseManager.closeSession(c.var.sessionMeta.id)
  return noContent()
})

sessionRoutes.post('/:sessionId/permission-respond', async (c) => {
  const body = await readJsonBody<PermissionResponse>(c.req.raw)
  const resolvedSessionId = permissionService.respondToPermission(
    body.requestId,
    body.behavior,
    body.alwaysAllow,
  )

  if (!resolvedSessionId) {
    throw new HttpError(404, `权限请求不存在: ${body.requestId}`)
  }

  return noContent()
})

sessionRoutes.post('/:sessionId/ask-user-respond', async (c) => {
  const body = await readJsonBody<AskUserResponse>(c.req.raw)
  const resolvedSessionId = askUserService.respondToAskUser(body.requestId, body.answers)

  if (!resolvedSessionId) {
    throw new HttpError(404, `AskUser 请求不存在: ${body.requestId}`)
  }

  return noContent()
})

sessionRoutes.post('/:sessionId/send', async (c) => {
  const body = await readJsonBody<Pick<AgentSendInput, 'userMessage'> & Partial<AgentSendInput>>(c.req.raw)
  return createSendResponse(c.var.sessionMeta.id, body)
})
