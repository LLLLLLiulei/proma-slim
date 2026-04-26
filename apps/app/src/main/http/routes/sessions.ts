import { Hono } from 'hono'
import type {
  AgentSendInput,
  AskUserResponse,
  FileAttachment,
  PermissionResponse,
} from '@proma/shared'
import { askUserService } from '../../lib/agent-ask-user-service'
import {
  deleteAgentSessionAttachments,
  getAgentSessionAttachmentContent,
  saveAgentSessionAttachments,
} from '../../lib/agent-attachment-service'
import { isAgentSessionActive, stopAgent } from '../../lib/agent-service'
import { permissionService } from '../../lib/agent-permission-service'
import {
  buildStructuredRequestPayload,
  createTurnTraceContext,
  getDiagnosticBackendLogger,
  type StructuredRequestPayload,
} from '../../lib/diagnostic-logging'
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

async function readSendRequestBody(
  request: Request,
  sessionId: string,
  sessionWorkspaceId?: string,
): Promise<{
  body: Pick<AgentSendInput, 'userMessage'> & Partial<AgentSendInput>
  attachments: FileAttachment[]
  structuredRequestPayload: StructuredRequestPayload
}> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    const body = await readJsonBody<Pick<AgentSendInput, 'userMessage'> & Partial<AgentSendInput>>(request)
    return {
      body,
      attachments: [],
      structuredRequestPayload: buildStructuredRequestPayload({
        contentType,
        body,
      }),
    }
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    throw new HttpError(400, '请求体必须是合法的 multipart/form-data')
  }

  const rawPayload = formData.get('payload')
  if (typeof rawPayload !== 'string') {
    throw new HttpError(400, 'multipart 请求缺少 payload 字段')
  }

  let parsedPayload: Record<string, unknown>
  try {
    const value = JSON.parse(rawPayload) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('invalid payload')
    }
    parsedPayload = value as Record<string, unknown>
  } catch {
    throw new HttpError(400, 'payload 必须是合法的 JSON 对象')
  }

  const files = formData
    .getAll('attachments')
    .filter((entry): entry is File => entry instanceof File)
  const attachments = await saveAgentSessionAttachments({
    sessionId,
    workspaceId: sessionWorkspaceId,
    files,
  })

  const body: Pick<AgentSendInput, 'userMessage'> & Partial<AgentSendInput> = {
    ...(parsedPayload as Pick<AgentSendInput, 'userMessage'> & Partial<AgentSendInput>),
    ...(sessionWorkspaceId ? { workspaceId: sessionWorkspaceId } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
  }

  return {
    body,
    attachments,
    structuredRequestPayload: buildStructuredRequestPayload({
      contentType,
      body: parsedPayload,
      files: attachments.map((attachment) => ({
        fieldName: 'attachments',
        filename: attachment.filename,
        mediaType: attachment.mediaType,
        size: attachment.size,
        localPath: attachment.localPath,
        attachmentId: attachment.id,
      })),
    }),
  }
}

function resolveRequestOrigin(request: Request): string | undefined {
  try {
    return new URL(request.url).origin
  } catch {
    return undefined
  }
}

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

sessionRoutes.get('/:sessionId/activity', (c) => {
  const active = isAgentSessionActive(c.var.sessionMeta.id)
  console.info('[sessions-route]', {
    phase: 'session_activity',
    sessionId: c.var.sessionMeta.id,
    active,
  })
  return c.json({
    active,
  })
})

sessionRoutes.get('/:sessionId/messages', (c) => {
  return c.json(getAgentSessionMessages(c.var.sessionMeta.id))
})

sessionRoutes.get('/:sessionId/attachments/:attachmentId/content', (c) => {
  const rawAttachmentId = c.req.param('attachmentId')
  if (!rawAttachmentId) {
    throw new HttpError(404, '附件不存在')
  }

  const { attachment, body } = getAgentSessionAttachmentContent(
    c.var.sessionMeta.id,
    decodeURIComponent(rawAttachmentId),
  )
  const payload = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer

  return new Response(payload, {
    headers: {
      'content-type': attachment.mediaType,
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
    },
  })
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
  sseManager.closeSession(c.var.sessionMeta.id, 'manual_stop')
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
  const { body, attachments, structuredRequestPayload } = await readSendRequestBody(
    c.req.raw,
    c.var.sessionMeta.id,
    c.var.sessionMeta.workspaceId,
  )
  const requestTrace = c.var.diagnostic.requestTrace
  const turnTrace = createTurnTraceContext({
    requestId: requestTrace.requestId,
    sessionId: c.var.sessionMeta.id,
    workspaceId: c.var.sessionMeta.workspaceId,
  })
  c.var.diagnostic.resource.turnId = turnTrace.turnId

  const turnLogger = getDiagnosticBackendLogger({
    component: 'sessions_route',
    category: 'turn_trace',
    requestId: requestTrace.requestId,
    turnId: turnTrace.turnId,
    sessionId: c.var.sessionMeta.id,
    workspaceId: c.var.sessionMeta.workspaceId ?? null,
  })

  turnLogger.info({
    phase: 'request_body_parsed',
    contentType: structuredRequestPayload.contentType,
    hasAttachments: attachments.length > 0,
    attachmentCount: attachments.length,
    bodyKeys: structuredRequestPayload.body
      && typeof structuredRequestPayload.body === 'object'
      && !Array.isArray(structuredRequestPayload.body)
      ? Object.keys(structuredRequestPayload.body as Record<string, unknown>)
      : [],
    attachmentIds: attachments.map((attachment) => attachment.id),
  }, '发送请求体已解析完成')

  try {
    const response = await createSendResponse(c.var.sessionMeta.id, body, {}, {
      requestTrace,
      turnTrace,
      structuredRequestPayload,
      appOrigin: resolveRequestOrigin(c.req.raw),
    })
    if (!response.ok && attachments.length > 0) {
      deleteAgentSessionAttachments({
        sessionId: c.var.sessionMeta.id,
        workspaceId: c.var.sessionMeta.workspaceId,
        attachments,
      })
    }
    return response
  } catch (error) {
    if (attachments.length > 0) {
      deleteAgentSessionAttachments({
        sessionId: c.var.sessionMeta.id,
        workspaceId: c.var.sessionMeta.workspaceId,
        attachments,
      })
    }
    throw error
  }
})
