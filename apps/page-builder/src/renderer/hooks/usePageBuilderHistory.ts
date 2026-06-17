import * as React from 'react'
import type { PageBuilderProjectSummary } from '@ai-page-builder/shared'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { getPageBuilderPublicBasePath } from '@page-builder/lib/public-base-path'
import { buildBuilderPath } from '@page-builder/lib/routes'
import { openUrlInNewWindow } from '@page-builder/lib/open-url'

function isProjectLocked(project: PageBuilderProjectSummary): boolean {
  return project.editState.status === 'locked'
}

export function usePageBuilderHistory() {
  const [projects, setProjects] = React.useState<PageBuilderProjectSummary[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [renamingProjectId, setRenamingProjectId] = React.useState<string | null>(null)
  const renamingProjectIdRef = React.useRef<string | null>(null)
  const publicBasePath = getPageBuilderPublicBasePath()

  const loadProjects = React.useCallback(async (): Promise<void> => {
    setError(null)
    setLoading(true)

    try {
      const nextProjects = await api.listPageBuilderProjects()
      setProjects(nextProjects)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '加载历史记录失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  const openProject = React.useCallback(async (project: PageBuilderProjectSummary): Promise<void> => {
    try {
      let sessionId = project.activeSessionId ?? project.latestSessionId
      if (!sessionId) {
        const session = await api.createSession(undefined, project.workspaceId)
        sessionId = session.id
        setProjects((current) => current.map((entry) => (
          entry.workspaceId === project.workspaceId
            ? {
                ...entry,
                latestSessionId: session.id,
                activeSessionId: entry.activeSessionId ?? null,
                lastActiveAt: session.updatedAt,
              }
            : entry
        )))
      }

      openUrlInNewWindow(buildBuilderPath(project.workspaceId, sessionId, publicBasePath))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '打开项目失败')
      throw nextError
    }
  }, [publicBasePath])

  const removeProject = React.useCallback(async (workspaceId: string): Promise<void> => {
    const project = projects.find((entry) => entry.workspaceId === workspaceId)
    if (project && isProjectLocked(project)) {
      toast.error('项目正在编辑或构建中，暂不能删除')
      return
    }

    try {
      await api.deletePageBuilderProject(workspaceId)
      setProjects((current) => current.filter((project) => project.workspaceId !== workspaceId))
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : '删除项目失败')
    }
  }, [projects])

  const renameProject = React.useCallback(async (workspaceId: string, name: string): Promise<void> => {
    if (renamingProjectIdRef.current !== null) {
      return
    }

    renamingProjectIdRef.current = workspaceId
    setRenamingProjectId(workspaceId)
    try {
      const workspace = await api.updateWorkspace(workspaceId, { name })
      setProjects((current) => current.map((project) => (
        project.workspaceId === workspaceId
          ? { ...project, workspaceName: workspace.name }
          : project
      )))
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : '重命名项目失败'
      toast.error(message)
      throw new Error(message)
    } finally {
      renamingProjectIdRef.current = null
      setRenamingProjectId(null)
    }
  }, [])

  return {
    error,
    loading,
    openProject,
    projects,
    renameProject,
    renamingProjectId,
    refreshProjects: loadProjects,
    removeProject,
  }
}
