import type { AgentSessionMeta, AgentWorkspace } from '@proma/shared'

export const DEFAULT_PAGE_BUILDER_PROJECT_NAME = '未命名项目'

interface CreatePageBuilderProjectDeps {
  createWorkspace: (
    name: string,
    options?: { template?: 'page-builder' },
  ) => Promise<AgentWorkspace>
  createSession: (title?: string, workspaceId?: string) => Promise<AgentSessionMeta>
}

interface RetryPageBuilderSessionDeps {
  createSession: (title?: string, workspaceId?: string) => Promise<AgentSessionMeta>
}

export class PageBuilderProjectStartError extends Error {
  readonly workspace: AgentWorkspace
  readonly recoverable = true

  constructor(message: string, workspace: AgentWorkspace, cause?: unknown) {
    super(message, cause ? { cause } : undefined)
    this.name = 'PageBuilderProjectStartError'
    this.workspace = workspace
  }
}

export async function createPageBuilderProject(
  deps: CreatePageBuilderProjectDeps,
): Promise<{ workspace: AgentWorkspace; session: AgentSessionMeta }> {
  const workspace = await deps.createWorkspace(DEFAULT_PAGE_BUILDER_PROJECT_NAME, {
    template: 'page-builder',
  })

  try {
    const session = await deps.createSession(undefined, workspace.id)
    return { workspace, session }
  } catch (error) {
    throw new PageBuilderProjectStartError(
      error instanceof Error ? error.message : '创建首个会话失败',
      workspace,
      error,
    )
  }
}

export function retryPageBuilderSession(
  workspaceId: string,
  deps: RetryPageBuilderSessionDeps,
): Promise<AgentSessionMeta> {
  return deps.createSession(undefined, workspaceId)
}
