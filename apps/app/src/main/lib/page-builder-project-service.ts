import { rmSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentSessionMeta, AgentWorkspace, PageBuilderProjectSummary } from '@ai-page-builder/shared'
import { listAgentSessions, deleteAgentSession } from './agent-session-manager'
import { getAgentWorkspacesDir } from './config-paths'
import { pageBuilderEditLockService } from './page-builder-edit-lock-service'
import { getWorkspacePreviewState } from './workspace-preview-service'
import { deleteAgentWorkspace, getAgentWorkspace, listAgentWorkspaces } from './workspace-service'

function getLatestSessionByWorkspaceId(): Map<string, AgentSessionMeta> {
  const sessions = listAgentSessions()
  const latestByWorkspaceId = new Map<string, AgentSessionMeta>()

  for (const session of sessions) {
    if (!session.workspaceId) continue
    if (!latestByWorkspaceId.has(session.workspaceId)) {
      latestByWorkspaceId.set(session.workspaceId, session)
    }
  }

  return latestByWorkspaceId
}

function toProjectSummary(
  workspace: AgentWorkspace,
  latestSession: AgentSessionMeta | null,
): PageBuilderProjectSummary {
  const previewState = getWorkspacePreviewState(workspace)

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceSlug: workspace.slug,
    createdAt: workspace.createdAt,
    latestSessionId: latestSession?.id ?? null,
    lastActiveAt: latestSession?.updatedAt ?? workspace.updatedAt ?? workspace.createdAt,
    previewUrl: previewState.hasPreview ? previewState.entryUrl : null,
    editState: pageBuilderEditLockService.getEditState(workspace.id),
  }
}

export function listPageBuilderProjects(): PageBuilderProjectSummary[] {
  const latestSessionByWorkspaceId = getLatestSessionByWorkspaceId()

  return listAgentWorkspaces()
    .filter((workspace) => workspace.template === 'page-builder')
    .map((workspace) => toProjectSummary(
      workspace,
      latestSessionByWorkspaceId.get(workspace.id) ?? null,
    ))
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
}

export function deletePageBuilderProject(workspaceId: string): void {
  const workspace = getAgentWorkspace(workspaceId)

  if (!workspace || workspace.template !== 'page-builder') {
    throw new Error(`page-builder 项目不存在: ${workspaceId}`)
  }

  pageBuilderEditLockService.assertProjectAvailable(workspaceId)

  const workspaceSessions = listAgentSessions().filter((session) => session.workspaceId === workspaceId)
  for (const session of workspaceSessions) {
    deleteAgentSession(session.id)
  }

  rmSync(join(getAgentWorkspacesDir(), workspace.slug), { recursive: true, force: true })
  deleteAgentWorkspace(workspaceId)
}
