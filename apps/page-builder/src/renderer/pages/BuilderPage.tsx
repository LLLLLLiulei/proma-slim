import * as React from 'react'
import { useSetAtom } from 'jotai'
import { AlertTriangle, LoaderCircle } from 'lucide-react'
import { AgentView } from '@/components/agent'
import {
  agentSessionsAtom,
  agentWorkspacesAtom,
  currentAgentSessionIdAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { clearBootstrapPayload, readBootstrapPayload } from '@page-builder/lib/bootstrap-cache'
import { resolveBuilderContext } from '@page-builder/lib/builder-context'
import { PreviewPane } from '@page-builder/components/builder/PreviewPane'
import { ProjectTitleBar } from '@page-builder/components/builder/ProjectTitleBar'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; initialUserMessage: string | null }

export function BuilderPage({
  workspaceId,
  sessionId,
}: {
  workspaceId: string
  sessionId: string
}): React.ReactElement {
  const setSessions = useSetAtom(agentSessionsAtom)
  const setWorkspaces = useSetAtom(agentWorkspacesAtom)
  const setCurrentSessionId = useSetAtom(currentAgentSessionIdAtom)
  const setCurrentWorkspaceId = useSetAtom(currentAgentWorkspaceIdAtom)
  const [loadState, setLoadState] = React.useState<LoadState>({ status: 'loading' })

  const loadBuilderRuntime = React.useCallback(async (): Promise<void> => {
    setLoadState({ status: 'loading' })

    try {
      const [sessions, workspaces] = await Promise.all([
        api.listSessions(),
        api.listWorkspaces(),
      ])

      const resolved = resolveBuilderContext({
        workspaceId,
        sessionId,
        workspaces,
        sessions,
      })

      if (resolved.error) {
        const messageMap = {
          'workspace-not-found': '当前项目不存在或已被删除。',
          'session-not-found': '当前对话不存在或已被删除。',
          'workspace-mismatch': '当前对话不属于该项目，无法进入构建页。',
        } as const

        setLoadState({ status: 'error', message: messageMap[resolved.error] })
        return
      }

      setSessions(sessions)
      setWorkspaces(workspaces)
      setCurrentSessionId(sessionId)
      setCurrentWorkspaceId(workspaceId)

      let initialUserMessage: string | null = null
      if (typeof window !== 'undefined') {
        const payload = readBootstrapPayload(window.sessionStorage, sessionId)
        if (payload?.workspaceId === workspaceId) {
          initialUserMessage = payload.initialPrompt
        } else if (payload) {
          clearBootstrapPayload(window.sessionStorage, sessionId)
        }
      }

      setLoadState({ status: 'ready', initialUserMessage })
    } catch (error) {
      setLoadState({
        status: 'error',
        message: error instanceof Error ? error.message : '加载构建页失败',
      })
    }
  }, [sessionId, setCurrentSessionId, setCurrentWorkspaceId, setSessions, setWorkspaces, workspaceId])

  React.useEffect(() => {
    void loadBuilderRuntime()
  }, [loadBuilderRuntime])

  const handleInitialUserMessageHandled = React.useCallback(() => {
    if (typeof window === 'undefined') return
    clearBootstrapPayload(window.sessionStorage, sessionId)
    setLoadState((prev) => prev.status === 'ready'
      ? { ...prev, initialUserMessage: null }
      : prev)
  }, [sessionId])

  if (loadState.status === 'loading') {
    return (
      <div className="page-builder-workbench flex min-h-[100dvh] items-center justify-center px-6 py-10">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <LoaderCircle className="size-7 animate-spin" />
          <p className="text-sm">正在准备项目工作台...</p>
        </div>
      </div>
    )
  }

  if (loadState.status === 'error') {
    return (
      <div className="page-builder-workbench flex min-h-[100dvh] items-center justify-center px-6 py-10">
        <div className="page-builder-pane max-w-md rounded-2xl p-8 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground">无法打开构建页</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{loadState.message}</p>
          <Button className="mt-6" onClick={() => { void loadBuilderRuntime() }} type="button">
            重试
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-builder-workbench flex h-[100dvh] min-h-[100dvh] flex-col overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 lg:overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:h-full lg:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.92fr)]">
        <PreviewPane previewUrl={null} />

        <section className="page-builder-pane flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl lg:h-full lg:min-h-0">
          <ProjectTitleBar workspaceId={workspaceId} />
          <div className="min-h-0 flex-1 overflow-hidden bg-background/40">
            <AgentView
              initialUserMessage={loadState.initialUserMessage}
              onInitialUserMessageHandled={handleInitialUserMessageHandled}
              sessionId={sessionId}
              showHeader={false}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
