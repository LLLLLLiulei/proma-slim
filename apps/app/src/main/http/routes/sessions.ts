import { Hono } from 'hono'
import type {
  AgentSendInput,
  AskUserResponse,
  FileAttachment,
  PermissionResponse,
  ResolvedAgentModelSelection,
} from '@ai-page-builder/shared'
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
import { getAgentWorkspace } from '../../lib/workspace-service'
import { sseManager } from '../../sse-manager'
import { createSendResponse } from '../agent-stream'
import { HttpError } from '../errors'
import { noContent, readJsonBody } from '../responses'
import type { HttpAppEnv } from '../types'
import { sessionMiddleware } from '../middleware/session'
import { assertPageBuilderEditLockForWorkspace } from '../page-builder-edit-lock-auth'
import {
  assertCmsBuilderApiAvailableInCmsMode,
  createCmsBuilderAccessMiddleware,
} from '../../lib/cms-integration/cms-builder-access-middleware'
import { builderAccessMismatch } from '../../lib/cms-integration/cms-integration-errors'
import { resolveAgentModelProviderRegistry } from '../../lib/agent-model-provider-config'

export const sessionRoutes = new Hono<HttpAppEnv>()

type SendRequestBody = Pick<AgentSendInput, 'userMessage'> & Partial<AgentSendInput> & {
  resolvedModelSelection?: ResolvedAgentModelSelection
}

export function resolveSendModelSelection(
  body: Partial<AgentSendInput>,
): ResolvedAgentModelSelection | undefined {
  const modelOptionId = typeof body.modelOptionId === 'string' ? body.modelOptionId.trim() : ''
  if (!modelOptionId) {
    return undefined
  }

  const registry = resolveAgentModelProviderRegistry()
  const selection = registry.resolveModelOption(modelOptionId)
  if (selection) {
    return selection
  }

  if (!registry.hasAvailableModelOptions) {
    throw new HttpError(503, '模型服务未配置完整，请联系管理员检查模型提供商配置')
  }

  throw new HttpError(400, '模型选项不可用，请刷新页面后重新选择模型')
}

async function readSendRequestBody(
  request: Request,
  sessionId: string,
  sessionWorkspaceId?: string,
): Promise<{
  body: SendRequestBody
  attachments: FileAttachment[]
  structuredRequestPayload: StructuredRequestPayload
}> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    const body = await readJsonBody<SendRequestBody>(request)
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

  const body: SendRequestBody = {
    ...(parsedPayload as SendRequestBody),
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
  assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下不可读取全量 session 列表', {
    allowDevStandaloneEntry: true,
  })
  return c.json(listAgentSessions())
})

sessionRoutes.post('/', async (c) => {
  assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下不可从浏览器本地创建 session', {
    allowDevStandaloneEntry: true,
  })
  const body = await readJsonBody<{ title?: string; workspaceId?: string }>(c.req.raw)
  return c.json(createAgentSession(body.title, undefined, body.workspaceId), 201)
})

sessionRoutes.use('/:sessionId', sessionMiddleware)
sessionRoutes.use('/:sessionId/*', sessionMiddleware)
sessionRoutes.use('/:sessionId', async (c, next) => {
  if (c.req.method === 'DELETE') {
    assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下不可删除 project binding 关联的 session')
  }
  await next()
})
sessionRoutes.use('/:sessionId/*', async (c, next) => {
  if (c.req.method === 'POST' && new URL(c.req.raw.url).pathname.endsWith('/move-workspace')) {
    assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下不可迁移 project binding 关联的 session')
  }
  await next()
})
sessionRoutes.use('/:sessionId', createCmsBuilderAccessMiddleware({
  workspaceId: (c) => c.var.sessionMeta.workspaceId,
  sessionId: (c) => c.var.sessionMeta.id,
  requireOrigin: (c) => c.req.method === 'POST' || c.req.method === 'PATCH',
}))
sessionRoutes.use('/:sessionId/*', createCmsBuilderAccessMiddleware({
  workspaceId: (c) => c.var.sessionMeta.workspaceId,
  sessionId: (c) => c.var.sessionMeta.id,
  requireOrigin: (c) => c.req.method === 'POST' || c.req.method === 'PATCH',
}))

sessionRoutes.delete('/:sessionId', (c) => {
  assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下不可删除 project binding 关联的 session')
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
  assertCmsBuilderApiAvailableInCmsMode('CMS 集成模式下不可迁移 project binding 关联的 session')
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
  assertPendingRequestBelongsToSession(
    permissionService.getPendingPermissionSessionId(body.requestId),
    c.var.sessionMeta.id,
    `权限请求不存在: ${body.requestId}`,
  )
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
  assertPendingRequestBelongsToSession(
    askUserService.getPendingAskUserSessionId(body.requestId),
    c.var.sessionMeta.id,
    `AskUser 请求不存在: ${body.requestId}`,
  )
  const resolvedSessionId = askUserService.respondToAskUser(body.requestId, body.answers)

  if (!resolvedSessionId) {
    throw new HttpError(404, `AskUser 请求不存在: ${body.requestId}`)
  }

  return noContent()
})

sessionRoutes.post('/:sessionId/send', async (c) => {
  if (c.var.sessionMeta.workspaceId) {
    const workspace = getAgentWorkspace(c.var.sessionMeta.workspaceId)
    if (workspace) {
      assertPageBuilderEditLockForWorkspace(workspace, c.req.raw)
    }
  }

  const { body, attachments, structuredRequestPayload } = await readSendRequestBody(
    c.req.raw,
    c.var.sessionMeta.id,
    c.var.sessionMeta.workspaceId,
  )
  const cmsBuilderAccess = c.var.cmsBuilderAccess
  if (cmsBuilderAccess) {
    const requestedWorkspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : ''
    if (requestedWorkspaceId && requestedWorkspaceId !== cmsBuilderAccess.workspaceId) {
      throw builderAccessMismatch('当前消息请求的 workspace 与 CMS access session 不匹配，请从 CMS 重新进入')
    }

    body.workspaceId = cmsBuilderAccess.workspaceId
  }
  const resolvedModelSelection = resolveSendModelSelection(body)
  if (resolvedModelSelection) {
    body.resolvedModelSelection = resolvedModelSelection
  }

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

function assertPendingRequestBelongsToSession(
  pendingSessionId: string | null,
  sessionId: string,
  notFoundMessage: string,
): void {
  if (!pendingSessionId) {
    throw new HttpError(404, notFoundMessage)
  }

  if (pendingSessionId !== sessionId) {
    throw new HttpError(403, '当前响应请求不属于 URL 中的会话')
  }
}
