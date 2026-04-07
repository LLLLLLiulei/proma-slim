import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { AlertTriangle, LoaderCircle, MousePointerClick } from 'lucide-react'
import { toast } from 'sonner'
import type {
  PageBuilderBlockDeletionPayload,
  PageBuilderCmsAutoAgentHandoffRequest,
  PageBuilderCmsAutoAgentHandoffSettledResult,
  PageBuilderCmsSelectionRequestContext,
  PageBuilderCmsSelectionResult,
  PageBuilderImageReplacementPayload,
  PageBuilderInlineTextSaveRequest,
  PageBuilderInlineTextSaveResult,
  PageBuilderStaticExportJob,
} from '@proma/shared'
import { AgentView } from '@/components/agent'
import {
  agentStreamingStatesAtom,
  agentSessionsAtom,
  agentWorkspacesAtom,
  currentAgentSessionIdAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { clearBootstrapPayload, readBootstrapPayload } from '@page-builder/lib/bootstrap-cache'
import { resolveBuilderContext } from '@page-builder/lib/builder-context'
import { createPageBuilderCmsAutoAgentHandoffRequest } from '@page-builder/lib/cms-auto-agent-handoff'
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
import {
  clearWorkspacePreviewState,
  readWorkspacePreviewState,
  writeWorkspacePreviewState,
} from '@page-builder/lib/preview-state-cache'
import {
  decoratePageBuilderSelectionMessage,
  type PageBuilderPreviewSelectionEvent,
} from '@page-builder/lib/preview-selection'
import { CmsBrowserDialog } from '@page-builder/components/builder/CmsBrowserDialog'
import { PreviewPane } from '@page-builder/components/builder/PreviewPane'
import { ProjectTitleBar } from '@page-builder/components/builder/ProjectTitleBar'
import type { WorkspacePreviewState } from '@/lib/api'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; initialUserMessage: string | null }

type SelectionActionState = 'idle' | 'armed' | 'selected'

const PAGE_BUILDER_GUIDED_GENERATION_SKILL = 'page-builder-guided-generation'

export function BuilderPage({
  workspaceId,
  sessionId,
}: {
  workspaceId: string
  sessionId: string
}): React.ReactElement {
  const desktopGridRef = React.useRef<HTMLDivElement>(null)
  const imageFileInputRef = React.useRef<HTMLInputElement>(null)
  const hydratedPreviewWorkspaceRef = React.useRef(workspaceId)
  const pendingImageReplacementRef = React.useRef<PageBuilderImageReplacementPayload | null>(null)
  const suppressedInlinePreviewRevisionsRef = React.useRef<Set<string>>(new Set())
  const handledStaticExportJobsRef = React.useRef<Set<string>>(new Set())
  const setSessions = useSetAtom(agentSessionsAtom)
  const setWorkspaces = useSetAtom(agentWorkspacesAtom)
  const setCurrentSessionId = useSetAtom(currentAgentSessionIdAtom)
  const setCurrentWorkspaceId = useSetAtom(currentAgentWorkspaceIdAtom)
  const streamingState = useAtomValue(agentStreamingStatesAtom).get(sessionId)
  const [loadState, setLoadState] = React.useState<LoadState>({ status: 'loading' })
  const [previewState, setPreviewState] = React.useState<WorkspacePreviewState | null>(() => {
    if (typeof window === 'undefined') return null
    return readWorkspacePreviewState(window.sessionStorage, workspaceId)
  })
  const [desktopGridWidth, setDesktopGridWidth] = React.useState(0)
  const [desktopSplitRatio, setDesktopSplitRatio] = React.useState(() => {
    if (typeof window === 'undefined') return DEFAULT_BUILDER_SPLIT_RATIO
    return readStoredBuilderSplitRatio(window.localStorage) ?? DEFAULT_BUILDER_SPLIT_RATIO
  })
  const [isDraggingSplit, setIsDraggingSplit] = React.useState(false)
  const [selectionActionState, setSelectionActionState] = React.useState<SelectionActionState>('idle')
  const [hoveredSelector, setHoveredSelector] = React.useState<string | null>(null)
  const [selectedSelector, setSelectedSelector] = React.useState<string | null>(null)
  const [pendingDeleteSelector, setPendingDeleteSelector] = React.useState<string | null>(null)
  const [cmsBrowserOpen, setCmsBrowserOpen] = React.useState(false)
  const [cmsAutoHandoffRequest, setCmsAutoHandoffRequest] = React.useState<PageBuilderCmsAutoAgentHandoffRequest | null>(null)
  const [isDeletingBlock, setIsDeletingBlock] = React.useState(false)
  const [isReplacingImage, setIsReplacingImage] = React.useState(false)
  const [staticExportJob, setStaticExportJob] = React.useState<PageBuilderStaticExportJob | null>(null)
  const selectionModeEnabled = selectionActionState !== 'idle'
  const isAgentStreaming = streamingState?.running === true

  const clearSelection = React.useCallback(() => {
    setSelectionActionState('idle')
    setHoveredSelector(null)
    setSelectedSelector(null)
    pendingImageReplacementRef.current = null
  }, [])

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
    if (hydratedPreviewWorkspaceRef.current === workspaceId) {
      return
    }

    hydratedPreviewWorkspaceRef.current = workspaceId

    if (typeof window === 'undefined') {
      setPreviewState(null)
      return
    }

    setPreviewState(readWorkspacePreviewState(window.sessionStorage, workspaceId))
    setStaticExportJob(null)
  }, [workspaceId])

  React.useEffect(() => {
    if (!isAgentStreaming || typeof window === 'undefined') return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isAgentStreaming])

  React.useEffect(() => {
    if (loadState.status !== 'ready' || typeof window === 'undefined') return

    let cancelled = false
    const syncPreviewState = async () => {
      try {
        const nextState = await api.getWorkspacePreviewState(workspaceId)
        if (cancelled) return

        if (nextState.hasPreview && nextState.entryUrl && nextState.revision) {
          writeWorkspacePreviewState(window.sessionStorage, workspaceId, nextState)
        } else {
          clearWorkspacePreviewState(window.sessionStorage, workspaceId)
        }

        const suppressedRevisions = suppressedInlinePreviewRevisionsRef.current

        setPreviewState((previous) => (
          nextState.revision && suppressedRevisions.has(nextState.revision)
            ? previous
            : (() => {
                if (suppressedRevisions.size > 0) {
                  suppressedRevisions.clear()
                }

                return areWorkspacePreviewStatesEqual(previous, nextState) ? previous : nextState
              })()
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

  const handleInlineTextSaveRequest = React.useCallback(async (
    request: PageBuilderInlineTextSaveRequest,
  ): Promise<PageBuilderInlineTextSaveResult> => {
    try {
      const nextState = await api.savePageBuilderInlineText(workspaceId, {
        selector: request.selector,
        textTargetDescriptor: request.textTargetDescriptor,
        nextText: request.nextText,
      })

      if (nextState.revision) {
        suppressedInlinePreviewRevisionsRef.current.add(nextState.revision)
      }

      if (typeof window !== 'undefined') {
        if (nextState.hasPreview && nextState.entryUrl && nextState.revision) {
          writeWorkspacePreviewState(window.sessionStorage, workspaceId, nextState)
        } else {
          clearWorkspacePreviewState(window.sessionStorage, workspaceId)
        }
      }

      return {
        requestId: request.requestId,
        ok: true,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '内联文字保存失败'
      console.error('[BuilderPage] 内联文字保存失败:', error)
      toast.error(message)

      return {
        requestId: request.requestId,
        ok: false,
        error: message,
      }
    }
  }, [workspaceId])

  const writeNextPreviewState = React.useCallback((nextState: WorkspacePreviewState) => {
    if (typeof window !== 'undefined') {
      if (nextState.hasPreview && nextState.entryUrl && nextState.revision) {
        writeWorkspacePreviewState(window.sessionStorage, workspaceId, nextState)
      } else {
        clearWorkspacePreviewState(window.sessionStorage, workspaceId)
      }
    }

    setPreviewState((previous) => (
      areWorkspacePreviewStatesEqual(previous, nextState) ? previous : nextState
    ))
  }, [workspaceId])

  const handleStaticExportSettled = React.useCallback((job: PageBuilderStaticExportJob) => {
    if (handledStaticExportJobsRef.current.has(job.jobId)) {
      return
    }

    if (job.status === 'pending' || job.status === 'running') {
      return
    }

    handledStaticExportJobsRef.current.add(job.jobId)

    if (job.status === 'failed') {
      toast.error(job.errorMessage ?? '静态包导出失败')
      return
    }

    const downloadUrl = job.downloadUrl ?? api.getPageBuilderStaticExportDownloadUrl(workspaceId, job.jobId)
    window.open(downloadUrl, '_blank', 'noopener,noreferrer')

    if (job.reportSummary?.hasWarnings) {
      toast.success('静态包导出完成，但存在离线告警，请查看导出报告')
      return
    }

    toast.success('静态包导出成功')
  }, [workspaceId])

  const handleRequestExportStatic = React.useCallback(async (): Promise<void> => {
    if (!previewState?.hasPreview) {
      return
    }

    if (staticExportJob && (staticExportJob.status === 'pending' || staticExportJob.status === 'running')) {
      return
    }

    try {
      const job = await api.createPageBuilderStaticExportJob(workspaceId)
      setStaticExportJob(job)
      handleStaticExportSettled(job)
    } catch (error) {
      const message = error instanceof Error ? error.message : '静态包导出失败'
      console.error('[BuilderPage] 静态包导出失败:', error)
      toast.error(message)
    }
  }, [handleStaticExportSettled, previewState?.hasPreview, staticExportJob, workspaceId])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    if (!staticExportJob || (staticExportJob.status !== 'pending' && staticExportJob.status !== 'running')) {
      return
    }

    let cancelled = false
    const pollExportJob = async () => {
      try {
        const nextJob = await api.getPageBuilderStaticExportJob(workspaceId, staticExportJob.jobId)
        if (cancelled) return

        setStaticExportJob(nextJob)
        handleStaticExportSettled(nextJob)
      } catch (error) {
        if (!cancelled) {
          console.error('[BuilderPage] 读取静态导出任务失败:', error)
        }
      }
    }

    const intervalId = window.setInterval(() => {
      void pollExportJob()
    }, BUILDER_PREVIEW_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [handleStaticExportSettled, staticExportJob, workspaceId])

  const handleRequestReplaceImage = React.useCallback((request: PageBuilderImageReplacementPayload) => {
    pendingImageReplacementRef.current = request
    const input = imageFileInputRef.current
    if (!input) {
      return
    }

    input.value = ''
    input.click()
  }, [])

  const handleRequestDeleteBlock = React.useCallback((selector: string) => {
    setPendingDeleteSelector(selector)
  }, [])

  const handleDeleteDialogOpenChange = React.useCallback((open: boolean) => {
    if (!open) {
      setPendingDeleteSelector(null)
    }
  }, [])

  const handleConfirmDeleteBlock = React.useCallback(async (): Promise<void> => {
    const selector = pendingDeleteSelector
    if (!selector) {
      return
    }

    setIsDeletingBlock(true)

    try {
      const nextState = await api.deletePageBuilderBlock(workspaceId, {
        selector,
      } satisfies PageBuilderBlockDeletionPayload)

      setPendingDeleteSelector(null)
      clearSelection()
      writeNextPreviewState(nextState)
      toast.success('区块删除成功')
    } catch (error) {
      const message = error instanceof Error ? error.message : '区块删除失败'
      console.error('[BuilderPage] 区块删除失败:', error)
      setPendingDeleteSelector(null)
      toast.error(message)
    } finally {
      setIsDeletingBlock(false)
    }
  }, [clearSelection, pendingDeleteSelector, workspaceId, writeNextPreviewState])

  const handleImageFileChange = React.useCallback(async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const target = pendingImageReplacementRef.current
    const file = event.currentTarget.files?.[0] ?? null
    event.currentTarget.value = ''

    if (!target || !file) {
      pendingImageReplacementRef.current = null
      return
    }

    setIsReplacingImage(true)

    try {
      const nextState = await api.replacePageBuilderImage(workspaceId, {
        ...target,
        file,
      })

      pendingImageReplacementRef.current = null
      writeNextPreviewState(nextState)
      toast.success('图片替换成功')
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片替换失败'
      console.error('[BuilderPage] 图片替换失败:', error)
      toast.error(message)
    } finally {
      setIsReplacingImage(false)
    }
  }, [workspaceId, writeNextPreviewState])

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

  const handleSelectionEvent = React.useCallback((event: PageBuilderPreviewSelectionEvent) => {
    if (event.type === 'hover') {
      setHoveredSelector(event.selector)
      return
    }

    if (event.type === 'selected') {
      setSelectedSelector(event.selector)
      setSelectionActionState('selected')
      return
    }

    clearSelection()
  }, [clearSelection])

  const handleToggleSelectionMode = React.useCallback(() => {
    if (selectionActionState !== 'idle') {
      clearSelection()
      return
    }

    setSelectionActionState('armed')
    setHoveredSelector(null)
    setSelectedSelector(null)
  }, [clearSelection, selectionActionState])

  const handleMessageSent = React.useCallback(() => {
    if (selectionActionState === 'idle') return
  }, [selectionActionState])

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
  const exportStaticPending = staticExportJob?.status === 'pending' || staticExportJob?.status === 'running'
  React.useEffect(() => {
    clearSelection()
  }, [clearSelection, previewUrl])
  const cmsSelectionRequestContext = React.useMemo<PageBuilderCmsSelectionRequestContext | undefined>(() => {
    if (!selectedSelector) {
      return undefined
    }

    return {
      entryPoint: 'block-toolbar',
      targetBlock: {
        selector: selectedSelector,
      },
    }
  }, [selectedSelector])
  const handleCmsSelectionConfirm = React.useCallback((selection: PageBuilderCmsSelectionResult) => {
    setCmsAutoHandoffRequest(createPageBuilderCmsAutoAgentHandoffRequest(selection, {
      uiEntryPoint: cmsSelectionRequestContext?.entryPoint,
    }))
  }, [cmsSelectionRequestContext?.entryPoint])
  const handleCmsAutoHandoffSettled = React.useCallback((result: PageBuilderCmsAutoAgentHandoffSettledResult) => {
    if (!cmsAutoHandoffRequest || result.requestId !== cmsAutoHandoffRequest.requestId) {
      return
    }

    setCmsAutoHandoffRequest(null)

    if (result.status === 'sent') {
      setCmsBrowserOpen(false)
    }
  }, [cmsAutoHandoffRequest])
  const messageDecorator = React.useMemo(() => {
    if (!selectedSelector) return undefined

    return (userMessage: string) => decoratePageBuilderSelectionMessage(userMessage, {
      selector: selectedSelector,
    })
  }, [selectedSelector])
  const selectionActionLabel = selectionActionState === 'idle'
    ? '选择进行编辑'
    : selectionActionState === 'selected'
      ? '已选区域'
      : '从页面中选择'
  const selectionActionClassName = selectionActionState === 'selected'
    ? 'h-7 rounded-full border border-primary/70 bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground shadow-sm ring-2 ring-primary/20 ring-offset-1 ring-offset-background transition-all hover:bg-primary/92 hover:text-primary-foreground'
    : selectionActionState === 'armed'
      ? 'h-7 rounded-full border border-primary/35 bg-primary/10 px-2.5 text-[11px] font-medium text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] ring-1 ring-primary/15 ring-offset-1 ring-offset-background transition-all hover:border-primary/45 hover:bg-primary/14 hover:text-primary'
      : 'h-7 rounded-full border border-transparent bg-transparent px-2.5 text-[11px] font-medium text-muted-foreground transition-all hover:border-border/60 hover:bg-muted/70 hover:text-foreground'
  const composerLeadingActions = React.useMemo(() => (
    <div className="flex items-center gap-1.5">
      <Button
        aria-label={selectionActionLabel}
        aria-pressed={selectionModeEnabled}
        className={selectionActionClassName}
        disabled={isAgentStreaming}
        onClick={handleToggleSelectionMode}
        size="sm"
        type="button"
        variant="ghost"
      >
        <MousePointerClick className="mr-1 size-3.5" />
        {selectionActionLabel}
      </Button>
    </div>
  ), [handleToggleSelectionMode, isAgentStreaming, selectionActionClassName, selectionActionLabel, selectionModeEnabled])

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
        <PreviewPane
          exportStaticPending={exportStaticPending}
          imageReplacementPending={isReplacingImage}
          onInlineTextSaveRequest={handleInlineTextSaveRequest}
          onRequestDeleteBlock={handleRequestDeleteBlock}
          onRequestExportStatic={handleRequestExportStatic}
          onRequestOpenCmsBrowser={() => setCmsBrowserOpen(true)}
          onRequestReplaceImage={handleRequestReplaceImage}
          onSelectionEvent={handleSelectionEvent}
          previewUrl={previewUrl}
          selectionModeEnabled={selectionModeEnabled}
        />

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
              composerLeadingActions={composerLeadingActions}
              defaultMentionedSkills={[PAGE_BUILDER_GUIDED_GENERATION_SKILL]}
              initialUserMessage={loadState.initialUserMessage}
              onMessageSent={handleMessageSent}
              onInitialUserMessageHandled={handleInitialUserMessageHandled}
              onProgrammaticSendSettled={handleCmsAutoHandoffSettled}
              programmaticSendRequest={cmsAutoHandoffRequest}
              sessionId={sessionId}
              showComposerMeta={false}
              showHeader={false}
              {...(messageDecorator ? { messageDecorator } : {})}
            />
          </div>
        </section>
      </div>

      <input
        ref={imageFileInputRef}
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          void handleImageFileChange(event)
        }}
        type="file"
      />

      <AlertDialog
        onOpenChange={handleDeleteDialogOpenChange}
        open={pendingDeleteSelector !== null}
      >
        {pendingDeleteSelector ? (
          <AlertDialogContent className="rounded-[24px] border-border/60">
            <AlertDialogHeader>
              <AlertDialogTitle>删除区块</AlertDialogTitle>
              <AlertDialogDescription>
                删除后该区块会立即从当前页面移除，且无法恢复。确认继续吗？
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={isDeletingBlock}
                onClick={() => {
                  setPendingDeleteSelector(null)
                }}
              >
                取消
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isDeletingBlock}
                onClick={async () => {
                  await handleConfirmDeleteBlock()
                }}
              >
                {isDeletingBlock ? '删除中...' : '确认删除'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>

      <CmsBrowserDialog
        confirming={cmsAutoHandoffRequest !== null}
        onConfirmSelection={handleCmsSelectionConfirm}
        onOpenChange={setCmsBrowserOpen}
        open={cmsBrowserOpen}
        requestContext={cmsSelectionRequestContext}
      />
    </div>
  )
}
