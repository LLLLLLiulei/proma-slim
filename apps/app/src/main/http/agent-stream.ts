import type { AgentGenerateTitleInput, AgentSendInput } from '@proma/shared'
import { agentEventBus, generateAgentTitle, isAgentSessionActive, runAgent, stopAgent } from '../lib/agent-service'
import { getAgentSessionMeta, updateAgentSessionMeta } from '../lib/agent-session-manager'
import { sseManager } from '../sse-manager'
import { HttpError } from './errors'
import { json } from './responses'

const DEFAULT_AGENT_SESSION_TITLE = '新 Agent 会话'

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

export function createAgentStreamCallbacks(sessionId: string) {
  return {
    onError: (message: string) => {
      agentEventBus.emit(sessionId, { type: 'error', message })
      sseManager.closeSession(sessionId)
    },
    onComplete: () => {
      sseManager.closeSession(sessionId)
    },
    onTitleUpdated: (title: string) => {
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
): Promise<Response> {
  const deps: SendResponseDeps = {
    ...defaultDeps,
    ...overrides,
  }

  if (deps.isAgentSessionActive(sessionId)) {
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

  const input: AgentSendInput = {
    sessionId,
    userMessage: body.userMessage,
    channelId: '',
    ...(body.workspaceId && { workspaceId: body.workspaceId }),
    ...(body.additionalDirectories && { additionalDirectories: body.additionalDirectories }),
    ...(body.customMcpServers && { customMcpServers: body.customMcpServers }),
    ...(body.permissionModeOverride && { permissionModeOverride: body.permissionModeOverride }),
    ...(body.mentionedSkills && { mentionedSkills: body.mentionedSkills }),
    ...(body.mentionedMcpServers && { mentionedMcpServers: body.mentionedMcpServers }),
    ...(body.attachments && { attachments: body.attachments }),
  }

  const response = sseManager.createResponse(sessionId)

  void deps.runAgent(input, createAgentStreamCallbacks(sessionId)).catch((error) => {
    console.error(`[HTTP] 会话 ${sessionId} 流式执行失败:`, error)

    if (sseManager.hasSession(sessionId)) {
      const message = error instanceof Error ? error.message : String(error)
      agentEventBus.emit(sessionId, { type: 'error', message })
      sseManager.closeSession(sessionId)
    }
  })

  return response
}
