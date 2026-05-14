import type { AgentSessionMeta, AgentWorkspace } from '@ai-page-builder/shared'
import type { RequestTraceContext } from '../lib/diagnostic-logging'
import type { BuilderAccessSessionRecord } from '../lib/cms-integration/builder-access-session-service'

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
    cmsBuilderAccess: BuilderAccessSessionRecord
    diagnostic: HttpRequestDiagnosticState
  }
}
