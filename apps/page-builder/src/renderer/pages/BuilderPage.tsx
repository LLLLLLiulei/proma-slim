import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { AlertTriangle, LoaderCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import type {
  AgentSessionMeta,
  AgentWorkspace,
  PageBuilderBlockDeletionPayload,
  PageBuilderCmsAuthoringComponent,
  PageBuilderCmsAutoAgentHandoffRequest,
  PageBuilderCmsAutoAgentHandoffSettledResult,
  PageBuilderCmsSelectionEntryPoint,
  PageBuilderCmsSelectionRequestContext,
  PageBuilderCmsSelectionResult,
  PageBuilderEditLockCredentials,
  PageBuilderEditLockLease,
  PageBuilderImageReplacementPayload,
  PageBuilderInlineTextSaveRequest,
  PageBuilderInlineTextSaveResult,
  PageBuilderStaticExportJobCreateOptions,
  PageBuilderStaticExportJob,
  PageBuilderTemplateSaveRequest,
  PageBuilderTurnRoutingMetadata,
  PageBuilderTargetSelection,
} from '@ai-page-builder/shared'
import {
  buildPageBuilderCmsOrdinaryAuthoringDigest,
  createPageBuilderBlockTargetSelection,
  tryResolvePageBuilderCmsAuthoringSourceTypeFromSourceTag,
} from '@ai-page-builder/shared'
import {
  AgentView,
  prepareAgentSendPayload,
  type AgentSendPayloadPreparationResult,
} from '@/components/agent'
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
import { ApiError, api } from '@/lib/api'
import { clearBootstrapPayload, readBootstrapPayload } from '@page-builder/lib/bootstrap-cache'
import { resolveBuilderContext } from '@page-builder/lib/builder-context'
import { getPageBuilderHiddenToolbarItems, getPageBuilderPublicBasePath } from '@page-builder/lib/public-base-path'
import { buildBuilderPath, buildHomePath } from '@page-builder/lib/routes'
import {
  clearPageBuilderEditLockFragment,
  clearStoredPageBuilderEditLock,
  createPageBuilderEditLockHolderId,
  readPageBuilderEditLockFragment,
  readStoredPageBuilderEditLock,
  writeStoredPageBuilderEditLock,
} from '@page-builder/lib/edit-lock-context'
import { isPageBuilderEditLockRejected } from '@page-builder/lib/edit-lock-errors'
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
  composePageBuilderAuthoringMessage,
  decoratePageBuilderSelectionMessage,
  type PageBuilderCmsGuidanceNotice,
  type PageBuilderPreviewSelectionEvent,
} from '@page-builder/lib/preview-selection'
import { BuilderCodeTab } from '@page-builder/components/builder/BuilderCodeTab'
import { BuilderRightPanel } from '@page-builder/components/builder/BuilderRightPanel'
import { CmsBrowserDialog } from '@page-builder/components/builder/CmsBrowserDialog'
import { PreviewPane } from '@page-builder/components/builder/PreviewPane'
import { ProjectTitleBar } from '@page-builder/components/builder/ProjectTitleBar'
import { SaveTemplateDialog } from '@page-builder/components/builder/SaveTemplateDialog'
import type { CmsBuilderContext, CmsIntegrationStatus, WorkspacePreviewState } from '@/lib/api'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string; recovery: 'home-and-retry' | 'retry-only' }
  | { status: 'ready'; initialUserMessage: string | null }

type SelectionActionState = 'idle' | 'armed' | 'selected'
type BuilderSourceMode = 'standalone' | 'cms-integrated'

const PAGE_BUILDER_GUIDED_GENERATION_SKILL = 'page-builder-guided-generation'
const PAGE_BUILDER_CMS_REGION_AUTHORING_GUIDANCE_SKILL = 'page-builder-cms-region-authoring-guidance'
const PAGE_BUILDER_COMPOSER_PLACEHOLDER = '告诉我你想怎么调整页面，例如：优化首屏视觉、增加产品介绍区、修改文案或排查样式问题。'
const CMS_REGION_BLOCKED_ERROR_MESSAGE = '当前已选 CMS 区域已失效或无法确认，请重新选择该区域后再修改。'
const EDIT_LOCK_LOST_MESSAGE = '编辑锁已失效，请从首页重新进入编辑'
const CMS_BUILDER_CONTEXT_EXPIRED_MESSAGE = '访问已失效，请从 CMS 系统重新进入 PageBuilder'
const INTEGRATION_STATUS_UNAVAILABLE_MESSAGE = '服务暂不可用，请稍后重试。'
const pendingInitialEditLockResolutions = new Map<string, Promise<PageBuilderEditLockLease>>()

function isCmsIntegrationEnabled(status: CmsIntegrationStatus): boolean {
  return status.integrationMode === 'cms' && status.enabled
}

function shouldLoadCmsBuilderContext(status: CmsIntegrationStatus): boolean {
  return status.integrationMode === 'cms' && status.enabled && status.devStandaloneEntryEnabled !== true
}

function normalizeCmsBuilderWorkspace(workspace: CmsBuilderContext['workspace']): AgentWorkspace {
  const now = Date.now()
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    ...(workspace.template ? { template: workspace.template } : {}),
    createdAt: workspace.createdAt ?? now,
    updatedAt: workspace.updatedAt ?? workspace.createdAt ?? now,
  }
}

function normalizeCmsBuilderSession(
  session: CmsBuilderContext['session'],
  workspaceId: string,
): AgentSessionMeta {
  const now = Date.now()
  return {
    id: session.id,
    title: session.title,
    ...(session.workspaceId ? { workspaceId: session.workspaceId } : { workspaceId }),
    createdAt: session.createdAt ?? now,
    updatedAt: session.updatedAt ?? session.createdAt ?? now,
  }
}

function toEditLockCredentials(lease: PageBuilderEditLockLease | null): PageBuilderEditLockCredentials | null {
  return lease
    ? {
        lockId: lease.lockId,
        holderId: lease.holderId,
      }
    : null
}

async function resolveActivePageBuilderSessionId(workspaceId: string): Promise<string | null> {
  try {
    const projects = await api.listPageBuilderProjects()
    return projects.find((project) => project.workspaceId === workspaceId)?.activeSessionId ?? null
  } catch {
    return null
  }
}

async function resolveInitialPageBuilderEditLock(
  workspaceId: string,
  sessionId: string,
): Promise<PageBuilderEditLockLease> {
  const resolutionKey = `${workspaceId}:${sessionId}`
  const pendingResolution = pendingInitialEditLockResolutions.get(resolutionKey)
  if (pendingResolution) {
    return await pendingResolution
  }

  const resolution = resolveInitialPageBuilderEditLockUncached(workspaceId, sessionId)
    .finally(() => {
      pendingInitialEditLockResolutions.delete(resolutionKey)
    })
  pendingInitialEditLockResolutions.set(resolutionKey, resolution)
  return await resolution
}

async function resolveInitialPageBuilderEditLockUncached(
  workspaceId: string,
  sessionId: string,
): Promise<PageBuilderEditLockLease> {
  const storage = typeof window === 'undefined' ? null : window.sessionStorage
  const fragmentCredentials = typeof window === 'undefined'
    ? null
    : readPageBuilderEditLockFragment(window.location.hash)

  if (fragmentCredentials) {
    try {
      const lease = await api.renewPageBuilderEditLock(workspaceId, fragmentCredentials.lockId, {
        holderId: fragmentCredentials.holderId,
      })
      if (storage) {
        writeStoredPageBuilderEditLock(storage, workspaceId, sessionId, lease)
      }
      clearPageBuilderEditLockFragment()
      return lease
    } catch {
      clearPageBuilderEditLockFragment()
      if (storage) {
        clearStoredPageBuilderEditLock(storage, workspaceId, sessionId)
      }
    }
  }

  const storedLock = storage
    ? readStoredPageBuilderEditLock(storage, workspaceId, sessionId)
    : null
  if (storedLock && storage) {
    try {
      const lease = await api.renewPageBuilderEditLock(workspaceId, storedLock.lockId, {
        holderId: storedLock.holderId,
      })
      writeStoredPageBuilderEditLock(storage, workspaceId, sessionId, lease)
      return lease
    } catch {
      clearStoredPageBuilderEditLock(storage, workspaceId, sessionId)
    }
  }

  const lease = await api.acquirePageBuilderEditLock(workspaceId, {
    sessionId,
    holderId: createPageBuilderEditLockHolderId(),
  })
  if (storage) {
    writeStoredPageBuilderEditLock(storage, workspaceId, sessionId, lease)
  }
  return lease
}

function buildPageBuilderCmsGlobalGuidanceNotice(): PageBuilderCmsGuidanceNotice {
  return {
    mode: 'page-has-existing-cms-regions',
    consultSkill: 'page-builder-cms-region-authoring-guidance',
    currentPageHasExistingCmsRegions: true,
    doNotInventCmsTags: true,
    doNotGuessBindingProps: true,
    doNotAddPageWideVueRuntime: true,
    queryPropsChangeRequiresConfirmedApply: true,
    sourceHtmlIsAuthoringSourceOnly: true,
    hostInjectsPreviewRuntime: true,
    inspectPreviewBeforeDiagnosingRuntime: true,
  }
}

function buildPageBuilderDegradedCmsRegionNotice(
  component: 'cms-catalog' | 'cms-content',
  reason: 'target-snapshot-fetch-failed' | 'source-type-unresolved',
): PageBuilderCmsGuidanceNotice {
  return {
    ...buildPageBuilderCmsGlobalGuidanceNotice(),
    mode: 'targeted-cms-region-guidance-degraded',
    currentTargetIsExistingCmsRegion: true,
    component,
    allowOnlyNonBindingEdits: true,
    reason,
  }
}

function buildConsultBootstrappedSkills(needsCmsGuidance: boolean): string[] | undefined {
  return needsCmsGuidance
    ? [PAGE_BUILDER_GUIDED_GENERATION_SKILL, PAGE_BUILDER_CMS_REGION_AUTHORING_GUIDANCE_SKILL]
    : [PAGE_BUILDER_GUIDED_GENERATION_SKILL]
}

function buildPageBuilderTurnRouting(
  targetSelection: PageBuilderTargetSelection | null,
): PageBuilderTurnRoutingMetadata {
  if (targetSelection?.kind === 'cms-island') {
    return {
      sceneKind: 'existing-cms-region-ordinary-edit',
      ownerSkill: PAGE_BUILDER_GUIDED_GENERATION_SKILL,
      ownerLockedForTurn: true,
      consultSkills: [PAGE_BUILDER_CMS_REGION_AUTHORING_GUIDANCE_SKILL],
    }
  }

  return {
    sceneKind: 'ordinary-page-flow',
    ownerSkill: PAGE_BUILDER_GUIDED_GENERATION_SKILL,
    ownerLockedForTurn: true,
  }
}

function shouldBlockCmsTargetSendPreparation(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 409)
}

function buildCmsTargetSendBlockedResult(error: unknown): AgentSendPayloadPreparationResult {
  const rawMessage = error instanceof Error ? error.message.trim() : ''
  const errorMessage = rawMessage.length > 0 && rawMessage !== CMS_REGION_BLOCKED_ERROR_MESSAGE
    ? `${CMS_REGION_BLOCKED_ERROR_MESSAGE} ${rawMessage}`
    : CMS_REGION_BLOCKED_ERROR_MESSAGE

  return {
    blocked: true,
    errorMessage,
  }
}

function resolvePageBuilderTargetBlockSelector(targetSelection: PageBuilderTargetSelection): string {
  return targetSelection.kind === 'cms-island'
    ? targetSelection.parentBlockSelector
    : targetSelection.selector
}

function navigateToPageBuilderHome(): void {
  if (typeof window === 'undefined') return
  const homePath = buildHomePath(getPageBuilderPublicBasePath())

  if (typeof window.history.pushState === 'function') {
    window.history.pushState(null, '', homePath)
  } else {
    window.history.replaceState(null, '', homePath)
  }

  if (typeof window.dispatchEvent === 'function') {
    const event = typeof PopStateEvent === 'function'
      ? new PopStateEvent('popstate')
      : new Event('popstate')
    window.dispatchEvent(event)
  }
}

function navigateToPageBuilderBuilder(workspaceId: string, sessionId: string): void {
  if (typeof window === 'undefined') return
  const builderPath = buildBuilderPath(workspaceId, sessionId, getPageBuilderPublicBasePath())

  if (typeof window.history.pushState === 'function') {
    window.history.pushState(null, '', builderPath)
  } else {
    window.history.replaceState(null, '', builderPath)
  }

  if (typeof window.dispatchEvent === 'function') {
    const event = typeof PopStateEvent === 'function'
      ? new PopStateEvent('popstate')
      : new Event('popstate')
    window.dispatchEvent(event)
  }
}

export function BuilderPage({
  workspaceId,
  sessionId,
}: {
  workspaceId: string
  sessionId: string
}): React.ReactElement {
  const desktopGridRef = React.useRef<HTMLDivElement>(null)
  const splitHandleRef = React.useRef<HTMLDivElement>(null)
  const imageFileInputRef = React.useRef<HTMLInputElement>(null)
  const hydratedPreviewWorkspaceRef = React.useRef(workspaceId)
  const pendingImageReplacementRef = React.useRef<PageBuilderImageReplacementPayload | null>(null)
  const editLockLeaseRef = React.useRef<PageBuilderEditLockLease | null>(null)
  const releasedEditLockKeysRef = React.useRef<Set<string>>(new Set())
  const suppressedInlinePreviewRevisionsRef = React.useRef<Set<string>>(new Set())
  const handledStaticExportJobsRef = React.useRef<Set<string>>(new Set())
  const desktopSplitRatioRef = React.useRef(DEFAULT_BUILDER_SPLIT_RATIO)
  const draggingSplitPointerIdRef = React.useRef<number | null>(null)
  const draggingSplitRatioRef = React.useRef<number | null>(null)
  const setSessions = useSetAtom(agentSessionsAtom)
  const setWorkspaces = useSetAtom(agentWorkspacesAtom)
  const setCurrentSessionId = useSetAtom(currentAgentSessionIdAtom)
  const setCurrentWorkspaceId = useSetAtom(currentAgentWorkspaceIdAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const streamingState = useAtomValue(agentStreamingStatesAtom).get(sessionId)
  const [loadState, setLoadState] = React.useState<LoadState>({ status: 'loading' })
  const [editLockRequired, setEditLockRequired] = React.useState(false)
  const [editLockLease, setEditLockLease] = React.useState<PageBuilderEditLockLease | null>(null)
  const [editLockLostMessage, setEditLockLostMessage] = React.useState<string | null>(null)
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
  const [selectedTargetSelection, setSelectedTargetSelection] = React.useState<PageBuilderTargetSelection | null>(null)
  const [selectedTargetDisplayLabel, setSelectedTargetDisplayLabel] = React.useState<string | null>(null)
  const [pendingDeleteSelector, setPendingDeleteSelector] = React.useState<string | null>(null)
  const [builderSourceMode, setBuilderSourceMode] = React.useState<BuilderSourceMode>('standalone')
  const [cmsIntegrationEnabled, setCmsIntegrationEnabled] = React.useState(false)
  const [cmsBrowserOpen, setCmsBrowserOpen] = React.useState(false)
  const [cmsDataUnavailableReason, setCmsDataUnavailableReason] = React.useState<string | null>(null)
  const [cmsBrowserWorkspaceId, setCmsBrowserWorkspaceId] = React.useState<string | null>(null)
  const [cmsSelectionEntryPoint, setCmsSelectionEntryPoint] = React.useState<PageBuilderCmsSelectionEntryPoint>('block-toolbar')
  const [cmsAutoHandoffRequest, setCmsAutoHandoffRequest] = React.useState<PageBuilderCmsAutoAgentHandoffRequest | null>(null)
  const [cmsSelectionSubmitting, setCmsSelectionSubmitting] = React.useState(false)
  const [isDeletingBlock, setIsDeletingBlock] = React.useState(false)
  const [isReplacingImage, setIsReplacingImage] = React.useState(false)
  const [staticExportJob, setStaticExportJob] = React.useState<PageBuilderStaticExportJob | null>(null)
  const [staticExportDialogOpen, setStaticExportDialogOpen] = React.useState(false)
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = React.useState(false)
  const [saveTemplateError, setSaveTemplateError] = React.useState<string | null>(null)
  const [isSavingTemplate, setIsSavingTemplate] = React.useState(false)
  const [downloadCmsRemoteAssets, setDownloadCmsRemoteAssets] = React.useState(true)
  const [isCreatingStaticExportJob, setIsCreatingStaticExportJob] = React.useState(false)
  const selectionModeEnabled = selectionActionState !== 'idle'
  const isAgentStreaming = streamingState?.running === true
  const editLockCredentials = React.useMemo(() => toEditLockCredentials(editLockLease), [editLockLease])
  const editLockRequestOptions = React.useMemo(() => (
    editLockCredentials ? { editLock: editLockCredentials } : undefined
  ), [editLockCredentials])
  const editingEnabled = !editLockRequired || (editLockCredentials !== null && editLockLostMessage === null)
  const currentWorkspaceName = React.useMemo(() => (
    workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? '未命名项目'
  ), [workspaces, workspaceId])
  const hiddenToolbarItems = React.useMemo(() => getPageBuilderHiddenToolbarItems(), [])

  React.useEffect(() => {
    editLockLeaseRef.current = editLockLease
  }, [editLockLease])

  const clearVisibleSelection = React.useCallback(() => {
    setSelectionActionState('idle')
    setHoveredSelector(null)
    setSelectedTargetSelection(null)
    setSelectedTargetDisplayLabel(null)
    pendingImageReplacementRef.current = null
  }, [])

  const clearSelection = clearVisibleSelection

  const applyDesktopGridSplitStyle = React.useCallback((nextRatio: number, containerWidth: number) => {
    const element = desktopGridRef.current
    if (!element) return nextRatio

    const layout = resolveBuilderDesktopTrackWidths(nextRatio, containerWidth)
    element.style.setProperty('--page-builder-preview-size', `${layout.clampedRatio}fr`)
    element.style.setProperty('--page-builder-chat-size', `${1 - layout.clampedRatio}fr`)

    if (layout.previewWidth > 0 && layout.chatWidth > 0) {
      element.style.setProperty('--page-builder-preview-width', `${layout.previewWidth}px`)
      element.style.setProperty('--page-builder-chat-width', `${layout.chatWidth}px`)
    } else {
      element.style.removeProperty('--page-builder-preview-width')
      element.style.removeProperty('--page-builder-chat-width')
    }

    return layout.clampedRatio
  }, [])

  const commitDesktopSplitRatio = React.useCallback((
    nextRatio: number,
    options?: { persist?: boolean; containerWidth?: number },
  ) => {
    const containerWidth = options?.containerWidth ?? desktopGridRef.current?.getBoundingClientRect().width
    const clamped = clampBuilderSplitRatio(nextRatio, containerWidth)
    desktopSplitRatioRef.current = clamped

    setDesktopSplitRatio(clamped)

    if (options?.persist !== false && typeof window !== 'undefined') {
      writeStoredBuilderSplitRatio(window.localStorage, clamped)
    }

    return clamped
  }, [])

  const previewDesktopSplitRatioFromPointer = React.useCallback((clientX: number) => {
    const rect = desktopGridRef.current?.getBoundingClientRect()
    if (!rect) return null

    const nextRatio = deriveBuilderSplitRatioFromPointer(clientX, rect)
    const clamped = applyDesktopGridSplitStyle(nextRatio, rect.width)
    draggingSplitRatioRef.current = clamped
    return clamped
  }, [applyDesktopGridSplitStyle])

  React.useEffect(() => {
    desktopSplitRatioRef.current = desktopSplitRatio
  }, [desktopSplitRatio])

  const loadBuilderRuntime = React.useCallback(async (): Promise<void> => {
    setLoadState({ status: 'loading' })
    setEditLockRequired(false)
    setEditLockLease(null)
    setEditLockLostMessage(null)
    setBuilderSourceMode('standalone')
    setCmsIntegrationEnabled(false)
    setCmsBrowserOpen(false)
    setCmsDataUnavailableReason(null)
    setCmsBrowserWorkspaceId(null)
    setCmsSelectionSubmitting(false)

    let integrationStatus: CmsIntegrationStatus
    try {
      integrationStatus = await api.getCmsIntegrationStatus()
    } catch {
      setLoadState({
        status: 'error',
        message: INTEGRATION_STATUS_UNAVAILABLE_MESSAGE,
        recovery: 'retry-only',
      })
      return
    }

    const nextCmsIntegrationEnabled = isCmsIntegrationEnabled(integrationStatus)
    const nextShouldLoadCmsBuilderContext = shouldLoadCmsBuilderContext(integrationStatus)
    setCmsIntegrationEnabled(nextCmsIntegrationEnabled)

    if (nextShouldLoadCmsBuilderContext) {
      let context: CmsBuilderContext
      try {
        context = await api.getCmsBuilderContext(workspaceId, sessionId)
      } catch {
        setLoadState({
          status: 'error',
          message: CMS_BUILDER_CONTEXT_EXPIRED_MESSAGE,
          recovery: 'retry-only',
        })
        return
      }

      try {
        const cmsWorkspace = normalizeCmsBuilderWorkspace(context.workspace)
        const cmsSession = normalizeCmsBuilderSession(context.session, cmsWorkspace.id)
        const targetSessionId = cmsSession.id
        const needsEditLock = cmsWorkspace.template === 'page-builder'
        setEditLockRequired(needsEditLock)
        if (needsEditLock) {
          const lease = await resolveInitialPageBuilderEditLock(cmsWorkspace.id, targetSessionId)
          setEditLockLease(lease)
          setEditLockLostMessage(null)
        }

        setSessions([cmsSession])
        setWorkspaces([cmsWorkspace])
        setCurrentSessionId(targetSessionId)
        setCurrentWorkspaceId(cmsWorkspace.id)
        setBuilderSourceMode('cms-integrated')
        setCmsBrowserWorkspaceId(cmsWorkspace.id)
        setLoadState({ status: 'ready', initialUserMessage: null })
        return
      } catch (error) {
        setLoadState({
          status: 'error',
          message: error instanceof Error ? error.message : '加载构建页失败',
          recovery: 'retry-only',
        })
      }
      return
    }

    setCmsDataUnavailableReason(null)
    setCmsBrowserWorkspaceId(null)

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

        setLoadState({
          status: 'error',
          message: messageMap[resolved.error],
          recovery: 'home-and-retry',
        })
        return
      }

      const resolvedWorkspace = resolved.workspace
      const resolvedSession = resolved.session
      if (!resolvedWorkspace || !resolvedSession) {
        setLoadState({
          status: 'error',
          message: '当前项目或对话不存在，无法进入构建页。',
          recovery: 'home-and-retry',
        })
        return
      }

      const activeSessionId = resolvedWorkspace.template === 'page-builder'
        ? await resolveActivePageBuilderSessionId(resolvedWorkspace.id)
        : null
      if (activeSessionId && activeSessionId !== sessionId) {
        navigateToPageBuilderBuilder(resolvedWorkspace.id, activeSessionId)
        return
      }

      const targetSessionId = activeSessionId ?? sessionId
      const needsEditLock = resolvedWorkspace.template === 'page-builder'
      setEditLockRequired(needsEditLock)
      if (needsEditLock) {
        const lease = await resolveInitialPageBuilderEditLock(workspaceId, targetSessionId)
        setEditLockLease(lease)
        setEditLockLostMessage(null)
      } else {
        setEditLockLease(null)
        setEditLockLostMessage(null)
      }

      setSessions(sessions)
      setWorkspaces(workspaces)
      setCurrentSessionId(targetSessionId)
      setCurrentWorkspaceId(workspaceId)
      setCmsBrowserWorkspaceId(nextCmsIntegrationEnabled ? resolvedWorkspace.id : null)

      let initialUserMessage: string | null = null
      if (typeof window !== 'undefined') {
        const payload = readBootstrapPayload(window.sessionStorage, targetSessionId)
        if (payload?.workspaceId === workspaceId) {
          initialUserMessage = payload.initialPrompt
        } else if (payload) {
          clearBootstrapPayload(window.sessionStorage, targetSessionId)
        }
      }

      setLoadState({ status: 'ready', initialUserMessage })
    } catch (error) {
      setLoadState({
        status: 'error',
        message: error instanceof Error ? error.message : '加载构建页失败',
        recovery: 'home-and-retry',
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

  const releaseCurrentEditLock = React.useCallback((options: {
    clearStoredLock?: boolean
  } = {}): void => {
    if (!editLockRequired) {
      return
    }

    const clearStoredLock = options.clearStoredLock ?? true
    const lease = editLockLeaseRef.current
    if (!lease) {
      return
    }

    const releaseKey = `${lease.lockId}:${lease.holderId}`
    if (releasedEditLockKeysRef.current.has(releaseKey)) {
      return
    }

    releasedEditLockKeysRef.current.add(releaseKey)
    if (clearStoredLock && typeof window !== 'undefined') {
      clearStoredPageBuilderEditLock(window.sessionStorage, workspaceId, sessionId)
    }

    void api.releasePageBuilderEditLock(workspaceId, lease.lockId, {
      holderId: lease.holderId,
    }).catch((error) => {
      console.warn('[BuilderPage] 释放 page-builder 编辑锁失败:', error)
    })
  }, [editLockRequired, sessionId, workspaceId])

  const markEditLockLost = React.useCallback((): void => {
    if (!editLockRequired) {
      return
    }

    if (typeof window !== 'undefined') {
      clearStoredPageBuilderEditLock(window.sessionStorage, workspaceId, sessionId)
    }

    editLockLeaseRef.current = null
    setEditLockLease(null)
    setEditLockLostMessage(EDIT_LOCK_LOST_MESSAGE)
    clearVisibleSelection()
    setPendingDeleteSelector(null)
    pendingImageReplacementRef.current = null
  }, [clearVisibleSelection, editLockRequired, sessionId, workspaceId])

  const handlePageBuilderEditLockRejected = React.useCallback((error: unknown): boolean => {
    if (!editLockRequired || !isPageBuilderEditLockRejected(error)) {
      return false
    }

    markEditLockLost()
    return true
  }, [editLockRequired, markEditLockLost])

  React.useEffect(() => {
    if (!editLockRequired) {
      return
    }

    return () => {
      releaseCurrentEditLock()
    }
  }, [editLockRequired, releaseCurrentEditLock])

  React.useEffect(() => {
    if (!editLockRequired || typeof window === 'undefined') {
      return
    }

    const handlePageHide = () => {
      releaseCurrentEditLock({ clearStoredLock: false })
    }

    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [editLockRequired, releaseCurrentEditLock])

  React.useEffect(() => {
    if (!editLockRequired || !editLockLease || typeof window === 'undefined') {
      return
    }

    const intervalId = window.setInterval(async () => {
      try {
        const renewed = await api.renewPageBuilderEditLock(workspaceId, editLockLease.lockId, {
          holderId: editLockLease.holderId,
        })
        writeStoredPageBuilderEditLock(window.sessionStorage, workspaceId, sessionId, renewed)
        setEditLockLease(renewed)
        setEditLockLostMessage(null)
      } catch (error) {
        console.warn('[BuilderPage] 续约 page-builder 编辑锁失败:', error)
        clearStoredPageBuilderEditLock(window.sessionStorage, workspaceId, sessionId)
        setEditLockLease(null)
        setEditLockLostMessage(EDIT_LOCK_LOST_MESSAGE)
        toast.error(EDIT_LOCK_LOST_MESSAGE)
      }
    }, editLockLease.heartbeatIntervalMs)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [editLockLease, editLockRequired, sessionId, workspaceId])

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
    if (!editingEnabled) {
      toast.error(editLockLostMessage ?? EDIT_LOCK_LOST_MESSAGE)
      return {
        requestId: request.requestId,
        ok: false,
        error: EDIT_LOCK_LOST_MESSAGE,
      }
    }

    try {
      const nextState = await api.savePageBuilderInlineText(workspaceId, {
        selector: request.selector,
        textTargetDescriptor: request.textTargetDescriptor,
        nextText: request.nextText,
      }, editLockRequestOptions)

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
      handlePageBuilderEditLockRejected(error)
      toast.error(message)

      return {
        requestId: request.requestId,
        ok: false,
        error: message,
      }
    }
  }, [editLockLostMessage, editLockRequestOptions, editingEnabled, handlePageBuilderEditLockRejected, workspaceId])

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

  const handleCodeFileSaved = React.useCallback((nextState: WorkspacePreviewState) => {
    writeNextPreviewState(nextState)
  }, [writeNextPreviewState])

  const handleStaticExportSettled = React.useCallback((job: PageBuilderStaticExportJob) => {
    if (handledStaticExportJobsRef.current.has(job.jobId)) {
      return
    }

    if (job.status === 'pending' || job.status === 'running') {
      return
    }

    handledStaticExportJobsRef.current.add(job.jobId)
    setIsCreatingStaticExportJob(false)

    if (job.status === 'failed') {
      toast.error(job.failure?.message ?? job.errorMessage ?? '静态包导出失败')
      return
    }

    setStaticExportDialogOpen(false)
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

    setDownloadCmsRemoteAssets(true)
    setStaticExportDialogOpen(true)
  }, [previewState?.hasPreview, staticExportJob])

  const handleStaticExportDialogOpenChange = React.useCallback((open: boolean) => {
    if (!isCreatingStaticExportJob) {
      setStaticExportDialogOpen(open)
    }
  }, [isCreatingStaticExportJob])

  const handleConfirmStaticExport = React.useCallback(async (): Promise<void> => {
    if (!previewState?.hasPreview) {
      return
    }

    if (isCreatingStaticExportJob) {
      return
    }

    if (staticExportJob && (staticExportJob.status === 'pending' || staticExportJob.status === 'running')) {
      return
    }

    setIsCreatingStaticExportJob(true)

    try {
      const options: PageBuilderStaticExportJobCreateOptions = {
        downloadCmsRemoteAssets,
      }
      const job = await api.createPageBuilderStaticExportJob(workspaceId, options)
      setStaticExportJob(job)
      handleStaticExportSettled(job)
    } catch (error) {
      const message = error instanceof Error ? error.message : '静态包导出失败'
      console.error('[BuilderPage] 静态包导出失败:', error)
      toast.error(message)
      setIsCreatingStaticExportJob(false)
    }
  }, [downloadCmsRemoteAssets, handleStaticExportSettled, isCreatingStaticExportJob, previewState?.hasPreview, staticExportJob, workspaceId])

  const handleRequestSaveTemplate = React.useCallback((): void => {
    if (isAgentStreaming) {
      toast.error('当前项目正在生成中，请稍后再另存模板')
      return
    }

    if (!editingEnabled) {
      toast.error(editLockLostMessage ?? EDIT_LOCK_LOST_MESSAGE)
      return
    }

    setSaveTemplateError(null)
    setSaveTemplateDialogOpen(true)
  }, [editLockLostMessage, editingEnabled, isAgentStreaming])

  const handleSaveTemplateDialogOpenChange = React.useCallback((open: boolean): void => {
    if (isSavingTemplate) {
      return
    }

    setSaveTemplateDialogOpen(open)
    if (open) {
      setSaveTemplateError(null)
    }
  }, [isSavingTemplate])

  const handleConfirmSaveTemplate = React.useCallback(async (payload: PageBuilderTemplateSaveRequest): Promise<void> => {
    if (isSavingTemplate) {
      return
    }

    if (isAgentStreaming) {
      toast.error('当前项目正在生成中，请稍后再另存模板')
      return
    }

    if (!editingEnabled) {
      toast.error(editLockLostMessage ?? EDIT_LOCK_LOST_MESSAGE)
      return
    }

    setIsSavingTemplate(true)
    setSaveTemplateError(null)

    try {
      await api.savePageBuilderWorkspaceAsTemplate(workspaceId, payload, editLockRequestOptions)
      setSaveTemplateDialogOpen(false)
      toast.success('模板已保存，可在首页模板库查看')
    } catch (error) {
      const message = error instanceof Error ? error.message : '模板保存失败'
      console.error('[BuilderPage] 另存模板失败:', error)
      handlePageBuilderEditLockRejected(error)
      setSaveTemplateError(message)
      toast.error(message)
    } finally {
      setIsSavingTemplate(false)
    }
  }, [editLockLostMessage, editLockRequestOptions, editingEnabled, handlePageBuilderEditLockRejected, isAgentStreaming, isSavingTemplate, workspaceId])

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
    if (isAgentStreaming || !editingEnabled) {
      if (!editingEnabled) {
        toast.error(editLockLostMessage ?? EDIT_LOCK_LOST_MESSAGE)
      }
      return
    }

    pendingImageReplacementRef.current = request
    const input = imageFileInputRef.current
    if (!input) {
      return
    }

    input.value = ''
    input.click()
  }, [editLockLostMessage, editingEnabled, isAgentStreaming])

  const handleRequestDeleteBlock = React.useCallback((selector: string) => {
    if (isAgentStreaming || !editingEnabled) {
      if (!editingEnabled) {
        toast.error(editLockLostMessage ?? EDIT_LOCK_LOST_MESSAGE)
      }
      return
    }

    setPendingDeleteSelector(selector)
  }, [editLockLostMessage, editingEnabled, isAgentStreaming])

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
        ...(selectedTargetSelection && resolvePageBuilderTargetBlockSelector(selectedTargetSelection) === selector
          ? { targetSelection: selectedTargetSelection }
          : {}),
      } satisfies PageBuilderBlockDeletionPayload, editLockRequestOptions)

      setPendingDeleteSelector(null)
      clearSelection()
      writeNextPreviewState(nextState)
      toast.success('区块删除成功')
    } catch (error) {
      const message = error instanceof Error ? error.message : '区块删除失败'
      console.error('[BuilderPage] 区块删除失败:', error)
      handlePageBuilderEditLockRejected(error)
      setPendingDeleteSelector(null)
      toast.error(message)
    } finally {
      setIsDeletingBlock(false)
    }
  }, [clearSelection, editLockRequestOptions, handlePageBuilderEditLockRejected, pendingDeleteSelector, selectedTargetSelection, workspaceId, writeNextPreviewState])

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
      }, editLockRequestOptions)

      pendingImageReplacementRef.current = null
      writeNextPreviewState(nextState)
      toast.success('图片替换成功')
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片替换失败'
      console.error('[BuilderPage] 图片替换失败:', error)
      handlePageBuilderEditLockRejected(error)
      toast.error(message)
    } finally {
      setIsReplacingImage(false)
    }
  }, [editLockRequestOptions, handlePageBuilderEditLockRejected, workspaceId, writeNextPreviewState])

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
      if (
        draggingSplitPointerIdRef.current !== null
        && event.pointerId !== draggingSplitPointerIdRef.current
      ) {
        return
      }

      previewDesktopSplitRatioFromPointer(event.clientX)
    }
    const handlePointerUp = (event: PointerEvent) => {
      if (
        draggingSplitPointerIdRef.current !== null
        && event.pointerId !== draggingSplitPointerIdRef.current
      ) {
        return
      }

      const activePointerId = draggingSplitPointerIdRef.current
      if (activePointerId !== null) {
        splitHandleRef.current?.releasePointerCapture?.(activePointerId)
      }

      const nextRatio = draggingSplitRatioRef.current ?? desktopSplitRatioRef.current
      draggingSplitPointerIdRef.current = null
      draggingSplitRatioRef.current = null
      commitDesktopSplitRatio(nextRatio)
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
  }, [commitDesktopSplitRatio, isDraggingSplit, previewDesktopSplitRatioFromPointer])

  const handleInitialUserMessageHandled = React.useCallback(() => {
    if (typeof window === 'undefined') return
    clearBootstrapPayload(window.sessionStorage, sessionId)
    setLoadState((prev) => prev.status === 'ready'
      ? { ...prev, initialUserMessage: null }
      : prev)
  }, [sessionId])

  const handleSelectionEvent = React.useCallback((event: PageBuilderPreviewSelectionEvent) => {
    if ((isAgentStreaming || !editingEnabled) && event.type !== 'reset') {
      return
    }

    if (event.type === 'hover') {
      setHoveredSelector(
        event.targetSelection
          ? resolvePageBuilderTargetBlockSelector(event.targetSelection)
          : event.selector ?? null,
      )
      return
    }

    if (event.type === 'selected') {
      const nextTargetSelection = event.targetSelection
        ?? (event.selector ? createPageBuilderBlockTargetSelection(event.selector) : null)
      const nextDisplayLabel = typeof event.displayLabel === 'string'
        ? event.displayLabel.trim()
        : ''

      setSelectedTargetSelection(nextTargetSelection)
      setSelectedTargetDisplayLabel(nextDisplayLabel.length > 0 ? nextDisplayLabel : null)
      setSelectionActionState('selected')
      return
    }

    clearSelection()
  }, [clearSelection, editingEnabled, isAgentStreaming])

  const handleToggleSelectionMode = React.useCallback(() => {
    if (isAgentStreaming || !editingEnabled) {
      if (!editingEnabled) {
        toast.error(editLockLostMessage ?? EDIT_LOCK_LOST_MESSAGE)
      }
      return
    }

    if (selectionActionState !== 'idle') {
      clearSelection()
      return
    }

    setSelectionActionState('armed')
    setHoveredSelector(null)
    setSelectedTargetSelection(null)
    setSelectedTargetDisplayLabel(null)
  }, [clearSelection, editLockLostMessage, editingEnabled, isAgentStreaming, selectionActionState])

  const handleMessageSent = React.useCallback(() => {
    if (selectionActionState !== 'idle') {
      clearVisibleSelection()
    }
  }, [clearVisibleSelection, selectionActionState])

  const handleSplitPointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    draggingSplitPointerIdRef.current = event.pointerId
    draggingSplitRatioRef.current = desktopSplitRatioRef.current
    event.currentTarget.setPointerCapture?.(event.pointerId)
    previewDesktopSplitRatioFromPointer(event.clientX)
    setIsDraggingSplit(true)
  }, [previewDesktopSplitRatioFromPointer])

  const handleSplitKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()

    const delta = event.key === 'ArrowLeft' ? -0.03 : 0.03
    commitDesktopSplitRatio(desktopSplitRatio + delta)
  }, [commitDesktopSplitRatio, desktopSplitRatio])

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
  const exportStaticPending = isCreatingStaticExportJob || staticExportJob?.status === 'pending' || staticExportJob?.status === 'running'
  React.useEffect(() => {
    clearSelection()
  }, [clearSelection, previewUrl])
  const cmsSelectionRequestContext = React.useMemo<PageBuilderCmsSelectionRequestContext | undefined>(() => {
    if (!selectedTargetSelection) {
      return undefined
    }

    const targetBlockSelector = selectedTargetSelection.kind === 'cms-island'
      ? selectedTargetSelection.parentBlockSelector
      : selectedTargetSelection.selector

    return {
      entryPoint: cmsSelectionEntryPoint,
      targetSelection: selectedTargetSelection,
      targetBlock: {
        selector: targetBlockSelector,
      },
    }
  }, [cmsSelectionEntryPoint, selectedTargetSelection])
  const handleCmsSelectionConfirm = React.useCallback(async (selection: PageBuilderCmsSelectionResult) => {
    if (!editingEnabled) {
      toast.error(editLockLostMessage ?? EDIT_LOCK_LOST_MESSAGE)
      return
    }

    if (cmsSelectionSubmitting) {
      return
    }

    setCmsSelectionSubmitting(true)
    try {
      const request = await api.createPageBuilderCmsAutoHandoff(workspaceId, {
        sessionId,
        selection,
        ...(cmsSelectionRequestContext?.entryPoint ? { uiEntryPoint: cmsSelectionRequestContext.entryPoint } : {}),
      }, editLockRequestOptions)
      setCmsAutoHandoffRequest(request)
      clearSelection()
      setCmsBrowserOpen(false)
    } catch (error) {
      handlePageBuilderEditLockRejected(error)
      toast.error(error instanceof Error ? error.message : '无法读取当前目标的作者态源码快照')
    } finally {
      setCmsSelectionSubmitting(false)
    }
  }, [clearSelection, cmsSelectionRequestContext?.entryPoint, cmsSelectionSubmitting, editLockLostMessage, editLockRequestOptions, editingEnabled, handlePageBuilderEditLockRejected, sessionId, workspaceId])
  const handleCmsAutoHandoffSettled = React.useCallback((result: PageBuilderCmsAutoAgentHandoffSettledResult) => {
    if (!cmsAutoHandoffRequest || result.requestId !== cmsAutoHandoffRequest.requestId) {
      return
    }

    setCmsAutoHandoffRequest(null)

    if (result.status === 'sent') {
      clearSelection()
      setCmsBrowserOpen(false)
      return
    }

    toast.error(result.errorMessage ?? 'CMS 自动交接发送失败')
  }, [clearSelection, cmsAutoHandoffRequest])
  const messageDecorator = React.useMemo(() => {
    if (!selectedTargetSelection) return undefined

    return (userMessage: string) => decoratePageBuilderSelectionMessage(userMessage, {
      ...selectedTargetSelection,
    })
  }, [selectedTargetSelection])
  const composerNotice = React.useMemo(() => {
    if (!selectedTargetDisplayLabel) {
      return undefined
    }

    return (
      <div
        className="group inline-flex max-w-full items-center gap-1 self-start rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 ring-1 ring-emerald-500/15"
        title={selectedTargetDisplayLabel}
      >
        <span
          aria-hidden="true"
          className="relative flex size-1.5 shrink-0 items-center justify-center"
        >
          <span className="absolute inset-0 rounded-full bg-emerald-400/25 motion-safe:animate-ping" />
          <span className="relative size-1 rounded-full bg-emerald-500" />
        </span>
        <span className="shrink-0 text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
          当前选中：
        </span>
        <span className="min-w-0 truncate text-[11px] font-medium text-emerald-950 dark:text-emerald-50">
          {selectedTargetDisplayLabel}
        </span>
        <button
          aria-label="取消选中"
          className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-emerald-700 opacity-0 transition-all duration-150 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto hover:bg-emerald-500/12 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:opacity-100 focus-visible:pointer-events-auto dark:text-emerald-200 dark:hover:bg-emerald-400/14 dark:hover:text-emerald-50"
          title="取消选中"
          type="button"
          onClick={clearSelection}
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      </div>
    )
  }, [clearSelection, selectedTargetDisplayLabel])
  const prepareSendPayload = React.useCallback(async ({
    userMessage,
    sessionId: _sessionId,
    workspaceId: _preparedWorkspaceId,
  }: {
    userMessage: string
    sessionId: string
    workspaceId?: string
  }): Promise<AgentSendPayloadPreparationResult> => {
    const targetSelectionForSend = selectedTargetSelection
    const basePayload = prepareAgentSendPayload(
      userMessage,
      messageDecorator,
      [PAGE_BUILDER_GUIDED_GENERATION_SKILL],
    )
    const turnRouting = buildPageBuilderTurnRouting(targetSelectionForSend)
    const ordinaryBootstrappedSkills = buildConsultBootstrappedSkills(
      turnRouting.sceneKind === 'existing-cms-region-ordinary-edit',
    )
    const pageHasExistingCmsRegions = previewState?.hasCmsRendering === true
    const pageLevelCmsNotice = pageHasExistingCmsRegions
      ? buildPageBuilderCmsGlobalGuidanceNotice()
      : undefined

    if (!targetSelectionForSend) {
      return {
        ...basePayload,
        bootstrappedSkills: ordinaryBootstrappedSkills,
        composedUserMessage: composePageBuilderAuthoringMessage(userMessage, {
          turnRouting,
          ...(pageLevelCmsNotice ? { cmsGuidanceNotice: pageLevelCmsNotice } : {}),
        }),
      }
    }

    if (targetSelectionForSend.kind !== 'cms-island') {
      return {
        ...basePayload,
        bootstrappedSkills: ordinaryBootstrappedSkills,
        composedUserMessage: decoratePageBuilderSelectionMessage(userMessage, {
          ...targetSelectionForSend,
        }, {
          turnRouting,
          cmsGuidanceNotice: pageLevelCmsNotice,
        }),
      }
    }

    try {
      const targetSnapshot = await api.getPageBuilderCmsTargetSnapshot(workspaceId, targetSelectionForSend)
      if (targetSnapshot.kind !== 'cms-island') {
        return buildCmsTargetSendBlockedResult(new Error(CMS_REGION_BLOCKED_ERROR_MESSAGE))
      }

      const component = targetSelectionForSend.component as PageBuilderCmsAuthoringComponent
      const sourceTypeResolution = tryResolvePageBuilderCmsAuthoringSourceTypeFromSourceTag(
        component,
        targetSnapshot.targetOuterHtml,
      )

      if (sourceTypeResolution.status !== 'resolved') {
        return {
          ...basePayload,
          composedUserMessage: decoratePageBuilderSelectionMessage(userMessage, {
            ...targetSelectionForSend,
          }, {
            turnRouting,
            cmsGuidanceNotice: buildPageBuilderDegradedCmsRegionNotice(component, 'source-type-unresolved'),
          }),
          bootstrappedSkills: ordinaryBootstrappedSkills,
        }
      }

      const ordinaryDigest = buildPageBuilderCmsOrdinaryAuthoringDigest(component, sourceTypeResolution.sourceType)

      return {
        ...basePayload,
        composedUserMessage: decoratePageBuilderSelectionMessage(userMessage, {
          ...targetSelectionForSend,
        }, {
          turnRouting,
          ...(pageLevelCmsNotice ? { cmsGuidanceNotice: pageLevelCmsNotice } : {}),
          ordinaryCmsRegionDigest: ordinaryDigest,
        }),
        bootstrappedSkills: ordinaryBootstrappedSkills,
      }
    } catch (error) {
      if (shouldBlockCmsTargetSendPreparation(error)) {
        return buildCmsTargetSendBlockedResult(error)
      }

      console.warn('[BuilderPage] 准备已有 CMS 区域 guidance 注入失败，回退到降级 CMS guidance', error)
      return {
        ...basePayload,
        composedUserMessage: decoratePageBuilderSelectionMessage(userMessage, {
          ...targetSelectionForSend,
        }, {
          turnRouting,
          cmsGuidanceNotice: buildPageBuilderDegradedCmsRegionNotice(targetSelectionForSend.component, 'target-snapshot-fetch-failed'),
        }),
        bootstrappedSkills: ordinaryBootstrappedSkills,
      }
    }
  }, [messageDecorator, previewState?.hasCmsRendering, selectedTargetSelection, workspaceId])
  const handleBeforeSendMessage = React.useCallback(() => {
    if (editingEnabled) {
      return undefined
    }

    toast.error(editLockLostMessage ?? EDIT_LOCK_LOST_MESSAGE)
    return { handled: true as const }
  }, [editLockLostMessage, editingEnabled])
  const handleAgentSendError = React.useCallback((error: unknown): void => {
    handlePageBuilderEditLockRejected(error)
  }, [handlePageBuilderEditLockRejected])

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
          <div className="mt-6 flex justify-center gap-2">
            {loadState.recovery === 'home-and-retry' && (
              <Button variant="outline" onClick={navigateToPageBuilderHome} type="button">
                返回首页
              </Button>
            )}
            <Button onClick={() => { void loadBuilderRuntime() }} type="button">
              重试
            </Button>
          </div>
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
          hiddenToolbarItems={hiddenToolbarItems}
          imageReplacementPending={isReplacingImage}
          interactionLocked={isAgentStreaming || !editingEnabled}
          onInlineTextSaveRequest={handleInlineTextSaveRequest}
          onRequestDeleteBlock={handleRequestDeleteBlock}
          onRequestExportStatic={handleRequestExportStatic}
          onRequestOpenCmsBrowser={cmsIntegrationEnabled ? () => {
            if (isAgentStreaming || !editingEnabled) {
              if (!editingEnabled) {
                toast.error(editLockLostMessage ?? EDIT_LOCK_LOST_MESSAGE)
              }
              return
            }

            setCmsSelectionEntryPoint('block-toolbar')
            setCmsBrowserOpen(true)
          } : undefined}
          onRequestSaveTemplate={handleRequestSaveTemplate}
          onRequestReplaceImage={handleRequestReplaceImage}
          onSelectionEvent={handleSelectionEvent}
          previewUrl={previewUrl}
          requiresSameOrigin={previewState?.requiresSameOrigin === true}
          saveTemplateDisabled={isAgentStreaming || !editingEnabled || isSavingTemplate}
          saveTemplateTitle={
            !editingEnabled
              ? (editLockLostMessage ?? EDIT_LOCK_LOST_MESSAGE)
              : isAgentStreaming
                ? '当前项目正在生成中，请稍后再另存模板'
                : '另存为模板'
          }
          selectionActionState={selectionActionState}
          selectionModeEnabled={selectionModeEnabled}
          selectionToggleDisabled={isAgentStreaming || !editingEnabled}
          onToggleSelectionMode={handleToggleSelectionMode}
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
            ref={splitHandleRef}
            role="separator"
            tabIndex={0}
          />
        </div>

        <section className="page-builder-pane flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl lg:h-full lg:min-h-0">
          <ProjectTitleBar
            editLock={editLockCredentials ?? undefined}
            editingDisabled={!editingEnabled}
            hiddenToolbarItems={hiddenToolbarItems}
            onEditLockRejected={handlePageBuilderEditLockRejected}
            workspaceId={workspaceId}
          />
          <div className="min-h-0 flex-1 overflow-hidden bg-background/40">
            <BuilderRightPanel
              hiddenToolbarItems={hiddenToolbarItems}
              chatContent={
                <AgentView
                  allowAttachments
                  beforeSendMessage={handleBeforeSendMessage}
                  composerPlaceholder={PAGE_BUILDER_COMPOSER_PLACEHOLDER}
                  defaultMentionedSkills={[PAGE_BUILDER_GUIDED_GENERATION_SKILL]}
                  initialUserMessage={loadState.initialUserMessage}
                  onSendError={handleAgentSendError}
                  onMessageSent={handleMessageSent}
                  onInitialUserMessageHandled={handleInitialUserMessageHandled}
                  onProgrammaticSendSettled={handleCmsAutoHandoffSettled}
                  prepareSendPayload={prepareSendPayload}
                  programmaticSendRequest={cmsAutoHandoffRequest}
                  sendMessageOptions={editLockRequestOptions}
                  sessionId={sessionId}
                  showComposerMeta={false}
                  showHeader={false}
                  {...(composerNotice ? { composerNotice } : {})}
                  {...(messageDecorator ? { messageDecorator } : {})}
                />
              }
              codeTab={
                <BuilderCodeTab
                  workspaceId={workspaceId}
                  readOnly={isAgentStreaming || !editingEnabled}
                  editLock={editLockCredentials ?? undefined}
                  onSaved={handleCodeFileSaved}
                  onEditLockRejected={handlePageBuilderEditLockRejected}
                />
              }
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

      <SaveTemplateDialog
        cmsIntegrated={builderSourceMode === 'cms-integrated'}
        defaultName={currentWorkspaceName}
        errorMessage={saveTemplateError}
        onOpenChange={handleSaveTemplateDialogOpenChange}
        onSubmit={handleConfirmSaveTemplate}
        open={saveTemplateDialogOpen}
        submitting={isSavingTemplate}
      />

      <AlertDialog
        onOpenChange={handleStaticExportDialogOpenChange}
        open={staticExportDialogOpen}
      >
        {staticExportDialogOpen ? (
          <AlertDialogContent className="rounded-[24px] border-border/60">
            <AlertDialogHeader>
              <AlertDialogTitle>导出静态包</AlertDialogTitle>
              <AlertDialogDescription>
                你可以选择是否一并下载 CMS 远程资源。未勾选时，导出页面会直接使用 CMS 源站资源地址。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
              <label className="flex items-start gap-3 text-sm text-foreground">
                <input
                  aria-label="导出 CMS 远程资源"
                  checked={downloadCmsRemoteAssets}
                  className="mt-0.5 size-4 rounded border-border"
                  disabled={isCreatingStaticExportJob}
                  onChange={(event) => {
                    setDownloadCmsRemoteAssets(event.currentTarget.checked)
                  }}
                  type="checkbox"
                />
                <span className="space-y-1">
                  <span className="block font-medium">导出 CMS 远程资源</span>
                  <span className="block text-xs text-muted-foreground">
                    勾选后会把 CMS 图片、附件等远程资源下载进静态包；未勾选时页面将继续引用 CMS 提供的源站地址。
                  </span>
                </span>
              </label>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={isCreatingStaticExportJob}
                onClick={() => {
                  setStaticExportDialogOpen(false)
                }}
              >
                取消
              </AlertDialogCancel>
              <Button
                disabled={isCreatingStaticExportJob}
                onClick={() => {
                  void handleConfirmStaticExport()
                }}
                type="button"
              >
                {isCreatingStaticExportJob ? (
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle className="size-4 animate-spin" />
                    <span>正在导出...</span>
                  </span>
                ) : '确认导出'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>

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
        cmsDataUnavailableReason={cmsDataUnavailableReason}
        confirming={cmsSelectionSubmitting}
        onConfirmSelection={handleCmsSelectionConfirm}
        onOpenChange={cmsIntegrationEnabled ? setCmsBrowserOpen : () => setCmsBrowserOpen(false)}
        open={cmsIntegrationEnabled && cmsBrowserOpen}
        requestContext={cmsSelectionRequestContext}
        workspaceId={cmsBrowserWorkspaceId}
      />
    </div>
  )
}
