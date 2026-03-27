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
import {
  BUILDER_SPLIT_GAP,
  BUILDER_SPLIT_RAIL_WIDTH,
  DEFAULT_BUILDER_SPLIT_RATIO,
  clampBuilderSplitRatio,
  deriveBuilderSplitRatioFromPointer,
  readStoredBuilderSplitRatio,
  resolveBuilderDesktopTrackWidths,
  writeStoredBuilderSplitRatio,
} from '@page-builder/lib/desktop-split'
import {
  BUILDER_PREVIEW_POLL_INTERVAL_MS,
  areWorkspacePreviewStatesEqual,
  resolveWorkspacePreviewUrl,
} from '@page-builder/lib/preview-state'
import { PreviewPane } from '@page-builder/components/builder/PreviewPane'
import { ProjectTitleBar } from '@page-builder/components/builder/ProjectTitleBar'
import type { WorkspacePreviewState } from '@/lib/api'

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
  const desktopGridRef = React.useRef<HTMLDivElement>(null)
  const setSessions = useSetAtom(agentSessionsAtom)
  const setWorkspaces = useSetAtom(agentWorkspacesAtom)
  const setCurrentSessionId = useSetAtom(currentAgentSessionIdAtom)
  const setCurrentWorkspaceId = useSetAtom(currentAgentWorkspaceIdAtom)
  const [loadState, setLoadState] = React.useState<LoadState>({ status: 'loading' })
  const [previewState, setPreviewState] = React.useState<WorkspacePreviewState | null>(null)
  const [desktopGridWidth, setDesktopGridWidth] = React.useState(0)
  const [desktopSplitRatio, setDesktopSplitRatio] = React.useState(() => {
    if (typeof window === 'undefined') return DEFAULT_BUILDER_SPLIT_RATIO
    return readStoredBuilderSplitRatio(window.localStorage) ?? DEFAULT_BUILDER_SPLIT_RATIO
  })
  const [isDraggingSplit, setIsDraggingSplit] = React.useState(false)

  const persistDesktopSplitRatio = React.useCallback((nextRatio: number) => {
    const containerWidth = desktopGridRef.current?.getBoundingClientRect().width
    const clamped = clampBuilderSplitRatio(nextRatio, containerWidth)

    setDesktopSplitRatio(clamped)

    if (typeof window !== 'undefined') {
      writeStoredBuilderSplitRatio(window.localStorage, clamped)
    }
  }, [])

  const updateDesktopSplitRatioFromPointer = React.useCallback((clientX: number) => {
    const rect = desktopGridRef.current?.getBoundingClientRect()
    if (!rect) return

    const nextRatio = deriveBuilderSplitRatioFromPointer(clientX, rect)
    persistDesktopSplitRatio(nextRatio)
  }, [persistDesktopSplitRatio])

  const loadBuilderRuntime = React.useCallback(async (): Promise<void> => {
    setLoadState({ status: 'loading' })
    setPreviewState(null)

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

  React.useEffect(() => {
    if (loadState.status !== 'ready' || typeof window === 'undefined') return

    let cancelled = false
    const syncPreviewState = async () => {
      try {
        const nextState = await api.getWorkspacePreviewState(workspaceId)
        if (cancelled) return

        setPreviewState((previous) => (
          areWorkspacePreviewStatesEqual(previous, nextState) ? previous : nextState
        ))
      } catch (error) {
        if (!cancelled) {
          console.error('[BuilderPage] 读取预览状态失败:', error)
        }
      }
    }

    void syncPreviewState()

    const intervalId = window.setInterval(() => {
      void syncPreviewState()
    }, BUILDER_PREVIEW_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [loadState.status, workspaceId])

  React.useEffect(() => {
    const element = desktopGridRef.current
    if (!element) return

    const updateWidth = () => {
      setDesktopGridWidth(element.getBoundingClientRect().width)
    }

    updateWidth()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateWidth())
      observer.observe(element)
      return () => observer.disconnect()
    }

    if (typeof window === 'undefined') return
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  React.useEffect(() => {
    if (!isDraggingSplit || typeof window === 'undefined') return

    const handlePointerMove = (event: PointerEvent) => {
      updateDesktopSplitRatioFromPointer(event.clientX)
    }
    const handlePointerUp = () => {
      setIsDraggingSplit(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [isDraggingSplit, updateDesktopSplitRatioFromPointer])

  const handleInitialUserMessageHandled = React.useCallback(() => {
    if (typeof window === 'undefined') return
    clearBootstrapPayload(window.sessionStorage, sessionId)
    setLoadState((prev) => prev.status === 'ready'
      ? { ...prev, initialUserMessage: null }
      : prev)
  }, [sessionId])

  const handleSplitPointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    updateDesktopSplitRatioFromPointer(event.clientX)
    setIsDraggingSplit(true)
  }, [updateDesktopSplitRatioFromPointer])

  const handleSplitKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()

    const delta = event.key === 'ArrowLeft' ? -0.03 : 0.03
    persistDesktopSplitRatio(desktopSplitRatio + delta)
  }, [desktopSplitRatio, persistDesktopSplitRatio])

  const desktopGridStyle = React.useMemo(() => ({
    '--page-builder-preview-size': `${desktopSplitRatio}fr`,
    '--page-builder-chat-size': `${1 - desktopSplitRatio}fr`,
    '--page-builder-grid-gap': `${BUILDER_SPLIT_GAP}px`,
    '--page-builder-split-rail-width': `${BUILDER_SPLIT_RAIL_WIDTH}px`,
    ...(desktopGridWidth > 0
      ? (() => {
          const layout = resolveBuilderDesktopTrackWidths(desktopSplitRatio, desktopGridWidth)
          return {
            '--page-builder-preview-width': `${layout.previewWidth}px`,
            '--page-builder-chat-width': `${layout.chatWidth}px`,
          }
        })()
      : {}),
  }) as React.CSSProperties, [desktopGridWidth, desktopSplitRatio])
  const previewUrl = React.useMemo(
    () => resolveWorkspacePreviewUrl(previewState),
    [previewState],
  )

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
      <div
        ref={desktopGridRef}
        className="page-builder-builder-grid grid min-h-0 flex-1 grid-cols-1 gap-3 lg:h-full"
        style={desktopGridStyle}
      >
        <PreviewPane previewUrl={previewUrl} />

        <div className="page-builder-split-rail hidden lg:flex" aria-hidden>
          <div
            aria-label="调整预览与对话宽度"
            aria-orientation="vertical"
            aria-valuemax={80}
            aria-valuemin={28}
            aria-valuenow={Math.round(desktopSplitRatio * 100)}
            className={`page-builder-split-handle ${isDraggingSplit ? 'is-dragging' : ''}`}
            onKeyDown={handleSplitKeyDown}
            onPointerDown={handleSplitPointerDown}
            role="separator"
            tabIndex={0}
          />
        </div>

        <section className="page-builder-pane flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl lg:h-full lg:min-h-0">
          <ProjectTitleBar workspaceId={workspaceId} />
          <div className="min-h-0 flex-1 overflow-hidden bg-background/40">
            <AgentView
              allowAttachments
              initialUserMessage={loadState.initialUserMessage}
              onInitialUserMessageHandled={handleInitialUserMessageHandled}
              sessionId={sessionId}
              showComposerMeta={false}
              showHeader={false}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
