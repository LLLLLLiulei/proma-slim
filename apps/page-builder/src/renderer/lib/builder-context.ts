import type { AgentSessionMeta, AgentWorkspace } from '@proma/shared'

export type BuilderContextError =
  | 'workspace-not-found'
  | 'session-not-found'
  | 'workspace-mismatch'

export function resolveBuilderContext({
  workspaceId,
  sessionId,
  workspaces,
  sessions,
}: {
  workspaceId: string
  sessionId: string
  workspaces: AgentWorkspace[]
  sessions: AgentSessionMeta[]
}): {
  workspace: AgentWorkspace | null
  session: AgentSessionMeta | null
  error: BuilderContextError | null
} {
  const workspace = workspaces.find((item) => item.id === workspaceId) ?? null
  if (!workspace) {
    return { workspace: null, session: null, error: 'workspace-not-found' }
  }

  const session = sessions.find((item) => item.id === sessionId) ?? null
  if (!session) {
    return { workspace: null, session: null, error: 'session-not-found' }
  }

  if (session.workspaceId !== workspaceId) {
    return { workspace: null, session: null, error: 'workspace-mismatch' }
  }

  return { workspace, session, error: null }
}
