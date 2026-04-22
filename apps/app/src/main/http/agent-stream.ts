import type { AgentGenerateTitleInput, AgentSendInput } from '@proma/shared'
import type { AgentSendDiagnosticContext } from '../lib/diagnostic-logging'
import { agentEventBus, generateAgentTitle, isAgentSessionActive, runAgent, stopAgent } from '../lib/agent-service'
import { getAgentSessionMeta, updateAgentSessionMeta } from '../lib/agent-session-manager'
import {
  createSseConnectionTraceContext,
  getDiagnosticBackendLogger,
} from '../lib/diagnostic-logging'
import { sseManager } from '../sse-manager'
import { HttpError } from './errors'
import { json } from './responses'

const DEFAULT_AGENT_SESSION_TITLE = '新 Agent 会话'

function logAgentHttpLifecycle(
  level: 'info' | 'warn' | 'error',
  payload: Record<string, unknown>,
): void {
  const diagnosticLogger = getDiagnosticBackendLogger({
    component: 'agent_stream',
    category: 'turn_trace',
    requestId: payload.requestId ?? null,
    turnId: payload.turnId ?? null,
    sessionId: payload.sessionId ?? null,
    workspaceId: payload.workspaceId ?? null,
  })
  if (level === 'info') {
    diagnosticLogger.info(payload, 'Agent HTTP 生命周期')
  } else if (level === 'warn') {
    diagnosticLogger.warn(payload, 'Agent HTTP 生命周期')
  } else {
    diagnosticLogger.error(payload, 'Agent HTTP 生命周期')
  }

  const consoleLogger = level === 'info' ? console.info : level === 'warn' ? console.warn : console.error
  consoleLogger('[agent-stream]', payload)
}

interface SendResponseDeps {
  isAgentSessionActive: typeof isAgentSessionActive
  runAgent: typeof runAgent
  stopAgent: typeof stopAgent
  generateTitle: (input: AgentGenerateTitleInput) => Promise<string | null>
}

const defaultDeps: SendResponseDeps = {
  isAgentSessionActive,
  runAgent,
  stopAgent,
  generateTitle: generateAgentTitle,
}

export function createAgentStreamCallbacks(
  sessionId: string,
  diagnostic?: AgentSendDiagnosticContext,
) {
  return {
    onError: (message: string) => {
      logAgentHttpLifecycle('error', {
        phase: 'callbacks_error',
        requestId: diagnostic?.requestTrace?.requestId ?? null,
        turnId: diagnostic?.turnTrace?.turnId ?? null,
        sessionId,
        errorMessage: message,
      })
      agentEventBus.emit(sessionId, { type: 'error', message })
      sseManager.closeSession(sessionId, 'turn_error')
    },
    onComplete: () => {
      logAgentHttpLifecycle('info', {
        phase: 'callbacks_complete',
        requestId: diagnostic?.requestTrace?.requestId ?? null,
        turnId: diagnostic?.turnTrace?.turnId ?? null,
        sessionId,
      })
      sseManager.closeSession(sessionId, 'turn_complete')
    },
    onTitleUpdated: (title: string) => {
      logAgentHttpLifecycle('info', {
        phase: 'callbacks_title_updated',
        requestId: diagnostic?.requestTrace?.requestId ?? null,
        turnId: diagnostic?.turnTrace?.turnId ?? null,
        sessionId,
        title,
      })
      sseManager.emitTitleUpdated(sessionId, title)
    },
  }
}

export async function persistGeneratedSessionTitle(
  sessionId: string,
  userMessage: string,
  deps: Pick<SendResponseDeps, 'generateTitle'> = defaultDeps,
): Promise<void> {
  try {
    const meta = getAgentSessionMeta(sessionId)
    if (!meta || meta.title !== DEFAULT_AGENT_SESSION_TITLE) return

    const title = await deps.generateTitle({
      userMessage,
      channelId: '',
      modelId: '',
    })
    if (!title) return

    updateAgentSessionMeta(sessionId, { title })
  } catch (error) {
    console.warn(`[HTTP] 会话 ${sessionId} 预写入标题失败:`, error)
  }
}

export async function createSendResponse(
  sessionId: string,
  body: Pick<AgentSendInput, 'userMessage'> & Partial<AgentSendInput>,
  overrides: Partial<SendResponseDeps> = {},
  diagnostic?: AgentSendDiagnosticContext,
): Promise<Response> {
  const deps: SendResponseDeps = {
    ...defaultDeps,
    ...overrides,
  }

  if (deps.isAgentSessionActive(sessionId)) {
    logAgentHttpLifecycle('warn', {
      phase: 'send_rejected_busy',
      requestId: diagnostic?.requestTrace?.requestId ?? null,
      turnId: diagnostic?.turnTrace?.turnId ?? null,
      sessionId,
      workspaceId: body.workspaceId ?? null,
    })
    return json(
      {
        error: '上一条消息仍在处理中，请稍候再试',
      },
      409,
    )
  }

  if (!body.userMessage?.trim() && !body.attachments?.length) {
    throw new HttpError(400, '消息内容不能为空')
  }

  await persistGeneratedSessionTitle(sessionId, body.userMessage, deps)

  logAgentHttpLifecycle('info', {
    phase: 'send_accepted',
    requestId: diagnostic?.requestTrace?.requestId ?? null,
    turnId: diagnostic?.turnTrace?.turnId ?? null,
    sessionId,
    workspaceId: body.workspaceId ?? null,
    hasAttachments: Boolean(body.attachments?.length),
    mentionedSkills: body.mentionedSkills ?? [],
    mentionedMcpServers: body.mentionedMcpServers ?? [],
  })

  const input: AgentSendInput = {
    sessionId,
    userMessage: body.userMessage,
    ...(body.composedUserMessage ? { composedUserMessage: body.composedUserMessage } : {}),
    channelId: '',
    ...(body.workspaceId && { workspaceId: body.workspaceId }),
    ...(body.additionalDirectories && { additionalDirectories: body.additionalDirectories }),
    ...(body.customMcpServers && { customMcpServers: body.customMcpServers }),
    ...(body.permissionModeOverride && { permissionModeOverride: body.permissionModeOverride }),
    ...(body.mentionedSkills && { mentionedSkills: body.mentionedSkills }),
    ...(body.bootstrappedSkills && { bootstrappedSkills: body.bootstrappedSkills }),
    ...(body.mentionedMcpServers && { mentionedMcpServers: body.mentionedMcpServers }),
    ...(body.attachments && { attachments: body.attachments }),
  }

  const response = sseManager.createResponse(sessionId, {
    traceContext: createSseConnectionTraceContext({
      requestId: diagnostic?.requestTrace?.requestId,
      turnId: diagnostic?.turnTrace?.turnId,
      sessionId,
    }),
  })

  void deps.runAgent(input, createAgentStreamCallbacks(sessionId, diagnostic), diagnostic).catch((error) => {
    logAgentHttpLifecycle('error', {
      phase: 'send_run_failed',
      requestId: diagnostic?.requestTrace?.requestId ?? null,
      turnId: diagnostic?.turnTrace?.turnId ?? null,
      sessionId,
      workspaceId: body.workspaceId ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
    console.error(`[HTTP] 会话 ${sessionId} 流式执行失败:`, error)

    if (sseManager.hasSession(sessionId)) {
      const message = error instanceof Error ? error.message : String(error)
      agentEventBus.emit(sessionId, { type: 'error', message })
      sseManager.closeSession(sessionId, 'turn_error')
    }
  })

  return response
}
