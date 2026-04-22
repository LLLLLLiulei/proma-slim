import type { AgentSessionMeta, AgentWorkspace } from '@proma/shared'
import type { RequestTraceContext } from '../lib/diagnostic-logging'

export interface HttpRequestDiagnosticState {
  requestTrace: RequestTraceContext
  requestStartedAt: number
  resource: {
    sessionId?: string
    workspaceId?: string
    turnId?: string
    sseConnectionId?: string
  }
}

export interface HttpAppEnv {
  Variables: {
    sessionMeta: AgentSessionMeta
    workspace: AgentWorkspace
    diagnostic: HttpRequestDiagnosticState
  }
}
