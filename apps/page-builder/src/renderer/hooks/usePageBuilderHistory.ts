import * as React from 'react'
import type { PageBuilderProjectSummary } from '@proma/shared'
import { api } from '@/lib/api'
import { buildBuilderPath } from '@page-builder/lib/routes'
import { openUrlInNewWindow } from '@page-builder/lib/open-url'

export function usePageBuilderHistory() {
  const [projects, setProjects] = React.useState<PageBuilderProjectSummary[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

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
      let sessionId = project.latestSessionId
      if (!sessionId) {
        const session = await api.createSession(undefined, project.workspaceId)
        sessionId = session.id
        setProjects((current) => current.map((entry) => (
          entry.workspaceId === project.workspaceId
            ? {
                ...entry,
                latestSessionId: session.id,
                lastActiveAt: session.updatedAt,
              }
            : entry
        )))
      }

      openUrlInNewWindow(buildBuilderPath(project.workspaceId, sessionId))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '打开项目失败')
      throw nextError
    }
  }, [])

  const removeProject = React.useCallback(async (workspaceId: string): Promise<void> => {
    try {
      await api.deletePageBuilderProject(workspaceId)
      setProjects((current) => current.filter((project) => project.workspaceId !== workspaceId))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '删除项目失败')
      throw nextError
    }
  }, [])

  return {
    error,
    loading,
    openProject,
    projects,
    refreshProjects: loadProjects,
    removeProject,
  }
}
