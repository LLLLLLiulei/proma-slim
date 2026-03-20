import type { AgentSessionMeta, AgentWorkspace } from '@proma/shared'

export interface HttpAppEnv {
  Variables: {
    sessionMeta: AgentSessionMeta
    workspace: AgentWorkspace
  }
}
