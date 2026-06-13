import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { useHydrateAtoms } from 'jotai/utils'
import { act, create } from 'react-test-renderer'
import type {
  AgentSessionMeta,
  AgentWorkspace,
  PageBuilderCmsApplyTargetSnapshot,
  PageBuilderCmsAutoAgentHandoffRequest,
  PageBuilderCmsAutoAgentHandoffSettledResult,
  PageBuilderCmsSelectionResult,
  PageBuilderEditLockHolderRequest,
  PageBuilderEditLockLease,
  PageBuilderEditLockStatus,
  PageBuilderTargetSelection,
} from '@ai-page-builder/shared'
import {
  type AgentStreamState,
  agentSessionsAtom,
  agentStreamingStatesAtom,
  agentWorkspacesAtom,
  currentAgentSessionIdAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import { readBootstrapPayload, writeBootstrapPayload } from '@page-builder/lib/bootstrap-cache'
import { DEFAULT_BUILDER_SPLIT_RATIO } from '@page-builder/lib/desktop-split'
import {
  readStoredPageBuilderEditLock,
  writeStoredPageBuilderEditLock,
} from '@page-builder/lib/edit-lock-context'

interface WorkspacePreviewState {
  hasPreview: boolean
  entryUrl: string | null
  revision: string | null
  hasCmsRendering?: boolean
  requiresSameOrigin?: boolean
}

interface PageBuilderImageReplacementPayload {
  selector: string
  imageTargetDescriptor: {
    version: number
    tagName: string
    childPath: number[]
  }
  file: File
}

interface PageBuilderBlockDeletionPayload {
  selector: string
  targetSelection?: PageBuilderTargetSelection
}

function createBlockTargetSelection(selector: string): PageBuilderTargetSelection {
  return {
    kind: 'block',
    selector,
    parentBlockSelector: selector,
    editBoundary: 'block',
  }
}

function createCmsIslandTargetSelection(
  selector: string,
  parentBlockSelector: string,
  component: 'cms-catalog' | 'cms-content',
): PageBuilderTargetSelection {
  return {
    kind: 'cms-island',
    htmlPath: 'index.html',
    sourceSelector: selector,
    parentBlockSelector,
    component,
    editBoundary: 'source-atomic',
  }
}

function extractPageBuilderSelectionPayload(message: string): unknown {
  const match = message.match(/<page_builder_selection>\s*([\s\S]*?)\s*<\/page_builder_selection>/)
  if (!match) {
    throw new Error('missing page_builder_selection payload')
  }

  return JSON.parse(match[1]!)
}

function extractPageBuilderTurnRoutingPayload(message: string): unknown {
  const match = message.match(/<page_builder_turn_routing>\s*([\s\S]*?)\s*<\/page_builder_turn_routing>/)
  if (!match) {
    throw new Error('missing page_builder_turn_routing payload')
  }

  return JSON.parse(match[1]!)
}

function extractPageBuilderCmsRegionAuthoringPayload(message: string): unknown {
  const match = message.match(/<page_builder_cms_region_authoring>\s*([\s\S]*?)\s*<\/page_builder_cms_region_authoring>/)
  if (!match) {
    throw new Error('missing page_builder_cms_region_authoring payload')
  }

  return JSON.parse(match[1]!)
}

function extractPageBuilderCmsGuidanceNoticePayload(message: string): unknown {
  const match = message.match(/<page_builder_cms_guidance_notice>\s*([\s\S]*?)\s*<\/page_builder_cms_guidance_notice>/)
  if (!match) {
    throw new Error('missing page_builder_cms_guidance_notice payload')
  }

  return JSON.parse(match[1]!)
}

interface PageBuilderStaticExportJob {
  jobId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  phase: 'copying' | 'scanning' | 'downloading' | 'packaging' | 'completed'
  createdAt: string
  updatedAt: string
  expiresAt: string
  downloadUrl: string | null
  errorMessage: string | null
  failure: {
    code: string
    message: string
    component?: string
    props?: Record<string, string>
  } | null
  reportSummary: {
    localizedResourceCount: number
    retainedExternalLinkCount: number
    warningCount: number
    unsupportedRuntimeDependencyCount: number
    failureCount: number
    hasWarnings: boolean
  } | null
}

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const state = new Map(Object.entries(initial))

  return {
    get length() {
      return state.size
    },
    clear() {
      state.clear()
    },
    getItem(key) {
      return state.get(key) ?? null
    },
    key(index) {
      return Array.from(state.keys())[index] ?? null
    },
    removeItem(key) {
      state.delete(key)
    },
    setItem(key, value) {
      state.set(key, value)
    },
  }
}

function installWindowHarness(): {
  localStorage: Storage
  sessionStorage: Storage
  location: { pathname: string; search: string; hash: string }
  dispatchWindowEvent: (type: string, event?: unknown) => void
  getListenerCount: (type: string) => number
  runIntervalsOnce: () => Promise<void>
  open: ReturnType<typeof mock>
  pushState: ReturnType<typeof mock>
  replaceState: ReturnType<typeof mock>
} {
  const sessionStorage = createMemoryStorage()
  const localStorage = createMemoryStorage()
  const location = {
    pathname: '/builder/workspace-1/session-1',
    search: '',
    hash: '',
  }
  const listeners = new Map<string, Set<(event?: unknown) => void>>()
  const intervals = new Map<number, () => void | Promise<void>>()
  let nextIntervalId = 1
  const open = mock(() => {})
  const pushState = mock((_state: unknown, _title: string, url?: string | URL | null) => {
    if (!url) {
      location.hash = ''
      return
    }

    const parsed = new URL(String(url), 'http://localhost')
    location.pathname = parsed.pathname
    location.search = parsed.search
    location.hash = parsed.hash
  })
  const replaceState = mock((_state: unknown, _title: string, url?: string | URL | null) => {
    if (!url) {
      location.hash = ''
      return
    }

    const parsed = new URL(String(url), 'http://localhost')
    location.pathname = parsed.pathname
    location.search = parsed.search
    location.hash = parsed.hash
  })

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener(type: string, listener: (event?: unknown) => void) {
        const bucket = listeners.get(type) ?? new Set()
        bucket.add(listener)
        listeners.set(type, bucket)
      },
      removeEventListener(type: string, listener: (event?: unknown) => void) {
        listeners.get(type)?.delete(listener)
      },
      localStorage,
      sessionStorage,
      location,
      history: {
        pushState,
        replaceState,
      },
      setInterval(callback: () => void | Promise<void>) {
        const id = nextIntervalId++
        intervals.set(id, callback)
        return id
      },
      clearInterval(id: number) {
        intervals.delete(id)
      },
      open,
    },
  })

  return {
    localStorage,
    sessionStorage,
    location,
    open,
    pushState,
    replaceState,
    dispatchWindowEvent(type: string, event?: unknown) {
      for (const listener of listeners.get(type) ?? []) {
        listener(event)
      }
    },
    getListenerCount(type: string) {
      return listeners.get(type)?.size ?? 0
    },
    async runIntervalsOnce() {
      for (const callback of [...intervals.values()]) {
        await callback()
      }
      await Promise.resolve()
      await Promise.resolve()
    },
  }
}

async function loadBuilderPage(options: {
  sessions: AgentSessionMeta[]
  workspaces: AgentWorkspace[]
  getCmsIntegrationStatusImpl?: () => Promise<{
    integrationMode: 'standalone' | 'cms'
    enabled: boolean
    devStandaloneEntryEnabled?: boolean
  }>
  getCmsBuilderContextImpl?: (
    workspaceId: string,
    sessionId: string,
  ) => Promise<{
    projectId: string
    workspace: AgentWorkspace
    session: AgentSessionMeta
    access: { expiresAt: string }
  }>
  previewStates?: WorkspacePreviewState[]
  acquirePageBuilderEditLockImpl?: (
    workspaceId: string,
    payload?: { holderId?: string; sessionId?: string },
  ) => Promise<PageBuilderEditLockLease>
  renewPageBuilderEditLockImpl?: (
    workspaceId: string,
    lockId: string,
    payload: PageBuilderEditLockHolderRequest,
  ) => Promise<PageBuilderEditLockLease>
  getPageBuilderEditLockStatusImpl?: (workspaceId: string, lockId: string) => Promise<PageBuilderEditLockStatus>
  releasePageBuilderEditLockImpl?: (
    workspaceId: string,
    lockId: string,
    payload: PageBuilderEditLockHolderRequest,
  ) => Promise<void>
  listPageBuilderProjectsImpl?: () => Promise<Array<{
    workspaceId: string
    activeSessionId?: string | null
  }>>
  getWorkspacePreviewStateImpl?: () => Promise<WorkspacePreviewState>
  getPageBuilderCmsTargetSnapshotImpl?: (
    workspaceId: string,
    targetSelection: PageBuilderTargetSelection,
  ) => Promise<PageBuilderCmsApplyTargetSnapshot>
  savePageBuilderInlineTextImpl?: (
    workspaceId: string,
    payload: unknown,
    options?: unknown,
  ) => Promise<WorkspacePreviewState>
  createPageBuilderCmsAutoHandoffImpl?: (
    workspaceId: string,
    payload: {
      sessionId: string
      selection: PageBuilderCmsSelectionResult
      uiEntryPoint?: 'block-toolbar' | 'agent-flow'
    },
    options?: unknown,
  ) => Promise<PageBuilderCmsAutoAgentHandoffRequest>
  deletePageBuilderBlockImpl?: (
    workspaceId: string,
    payload: PageBuilderBlockDeletionPayload,
    options?: unknown,
  ) => Promise<WorkspacePreviewState>
  createPageBuilderStaticExportJobImpl?: (
    workspaceId: string,
    options?: { downloadCmsRemoteAssets?: boolean },
    requestOptions?: unknown,
  ) => Promise<PageBuilderStaticExportJob>
  getPageBuilderStaticExportJobImpl?: (workspaceId: string, jobId: string) => Promise<PageBuilderStaticExportJob>
  replacePageBuilderImageImpl?: (
    workspaceId: string,
    payload: PageBuilderImageReplacementPayload,
    options?: unknown,
  ) => Promise<WorkspacePreviewState>
  mockPreviewPane?: boolean
  mockCmsBrowserDialog?: boolean
  toastErrorImpl?: (message: string) => void
  toastSuccessImpl?: (message: string) => void
}) {
  let lastAgentViewProps: Record<string, unknown> | null = null
  let lastPreviewPaneProps: Record<string, unknown> | null = null
  let lastCmsBrowserDialogProps: Record<string, unknown> | null = null
  let previewStateIndex = 0
  class MockApiError extends Error {
    status: number

    constructor(message: string, status: number) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  }
  const toastError = options.toastErrorImpl ?? mock(() => {})
  const toastSuccess = options.toastSuccessImpl ?? mock(() => {})
  const listSessions = mock(async () => options.sessions)
  const listWorkspaces = mock(async () => options.workspaces)
  const getCmsIntegrationStatus = mock(options.getCmsIntegrationStatusImpl ?? (async () => ({
    integrationMode: 'standalone' as const,
    enabled: false,
  })))
  const getCmsBuilderContext = mock(options.getCmsBuilderContextImpl ?? (async (workspaceId: string, sessionId: string) => {
    const workspace = options.workspaces.find((item) => item.id === workspaceId)
    const session = options.sessions.find((item) => item.id === sessionId)
    if (!workspace || !session) {
      throw new MockApiError('访问已失效，请从 CMS 系统重新进入 PageBuilder', 401)
    }
    return {
      projectId: 'pbp_test',
      workspace,
      session,
      access: {
        expiresAt: '2026-05-13T00:00:00.000Z',
      },
    }
  }))
  const acquirePageBuilderEditLock = mock(
    options.acquirePageBuilderEditLockImpl
      ?? (async (workspaceId: string, payload?: { holderId?: string; sessionId?: string }) => ({
        workspaceId,
        lockId: 'lock-acquired',
        holderId: payload?.holderId ?? 'holder-acquired',
        expiresAt: 60_000,
        heartbeatIntervalMs: 15_000,
      })),
  )
  const renewPageBuilderEditLock = mock(
    options.renewPageBuilderEditLockImpl
      ?? (async (workspaceId: string, lockId: string, payload: PageBuilderEditLockHolderRequest) => ({
        workspaceId,
        lockId,
        holderId: payload.holderId,
        expiresAt: 75_000,
        heartbeatIntervalMs: 15_000,
      })),
  )
  const getPageBuilderEditLockStatus = mock(
    options.getPageBuilderEditLockStatusImpl
      ?? (async (workspaceId: string, lockId: string) => ({
        valid: true,
        lease: {
          workspaceId,
          lockId,
          holderId: 'holder-from-status',
          expiresAt: 60_000,
          heartbeatIntervalMs: 15_000,
        },
      })),
  )
  const releasePageBuilderEditLock = mock(options.releasePageBuilderEditLockImpl ?? (async () => {}))
  const listPageBuilderProjects = mock(options.listPageBuilderProjectsImpl ?? (async () => []))

  mock.module('@/components/agent', () => ({
    AgentView(props: Record<string, unknown>) {
      lastAgentViewProps = props
      return React.createElement('div', { 'data-testid': 'agent-view' })
    },
    prepareAgentSendPayload(
      userMessage: string,
      messageDecorator?: (message: string) => string,
      defaultMentionedSkills: string[] = [],
    ) {
      const composedUserMessage = messageDecorator ? messageDecorator(userMessage) : undefined
      const visibleMentionedSkills = [...userMessage.matchAll(/\/skill:(\S+)/g)]
        .map((match) => match[1])
        .filter(Boolean)
      const mentionedMcpServers = [...userMessage.matchAll(/#mcp:(\S+)/g)]
        .map((match) => match[1])
        .filter(Boolean)
      const mentionedSkills = Array.from(new Set([
        ...visibleMentionedSkills,
        ...defaultMentionedSkills.filter(Boolean),
      ]))

      return {
        userMessage,
        ...(composedUserMessage && composedUserMessage !== userMessage
          ? { composedUserMessage }
          : {}),
        mentionedSkills,
        mentionedMcpServers,
      }
    },
  }))

  mock.module('@/components/ui/alert-dialog', () => {
    const passthrough = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('div', props, children)

    return {
      AlertDialog: passthrough,
      AlertDialogAction: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('button', props, children),
      AlertDialogCancel: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('button', props, children),
      AlertDialogContent: passthrough,
      AlertDialogDescription: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('p', props, children),
      AlertDialogFooter: passthrough,
      AlertDialogHeader: passthrough,
      AlertDialogTitle: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('h2', props, children),
      AlertDialogTrigger: passthrough,
    }
  })

  if (options.mockPreviewPane) {
    mock.module('@page-builder/components/builder/PreviewPane', () => ({
      PreviewPane(props: Record<string, unknown>) {
        lastPreviewPaneProps = props
        return React.createElement('section', {
          className: 'page-builder-pane flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl lg:h-full lg:min-h-0',
          'data-testid': 'preview-pane',
        })
      },
    }))
  }

  if (options.mockCmsBrowserDialog) {
    mock.module('@page-builder/components/builder/CmsBrowserDialog', () => ({
      CmsBrowserDialog(props: Record<string, unknown>) {
        lastCmsBrowserDialogProps = props
        return React.createElement('div', { 'data-testid': 'cms-browser-dialog', 'data-open': props.open === true })
      },
    }))
  }

  mock.module('sonner', () => ({
    toast: {
      error: toastError,
      success: toastSuccess,
    },
  }))

  mock.module('@/lib/api', () => ({
    ApiError: MockApiError,
    resolveApiUrl: (url: string) => url,
    api: {
      getCmsBuilderContext,
      getCmsIntegrationStatus,
      listPageBuilderProjects,
      listSessions,
      listWorkspaces,
      acquirePageBuilderEditLock,
      renewPageBuilderEditLock,
      getPageBuilderEditLockStatus,
      releasePageBuilderEditLock,
      getWorkspacePreviewState: options.getWorkspacePreviewStateImpl ?? (async () => {
        const states = options.previewStates ?? [{
          hasPreview: false,
          entryUrl: null,
          revision: null,
          hasCmsRendering: false,
          requiresSameOrigin: false,
        }]
        const state = states[Math.min(previewStateIndex, states.length - 1)]!
        previewStateIndex += 1
        return state
      }),
      getPageBuilderCmsTargetSnapshot: options.getPageBuilderCmsTargetSnapshotImpl ?? (async (_workspaceId: string, targetSelection: PageBuilderTargetSelection) => {
        if (targetSelection.kind !== 'cms-island') {
          throw new Error('only cms-island target selections are supported in this mock')
        }

        return {
          kind: 'cms-island',
          htmlPath: targetSelection.htmlPath,
          sourceSelector: targetSelection.sourceSelector,
          parentBlockSelector: targetSelection.parentBlockSelector,
          component: targetSelection.component,
          targetOuterHtml: targetSelection.component === 'cms-catalog'
            ? '<cms-catalog site-id="14" level="children" parent-id="7"></cms-catalog>'
            : '<cms-content site-id="14" catalog-id="news" page-size="4"></cms-content>',
          parentBlockOuterHtml: '<section data-proma-block-id="pb_blk_region"></section>',
        }
      }),
      createPageBuilderCmsAutoHandoff: options.createPageBuilderCmsAutoHandoffImpl ?? (async (_workspaceId: string, payload: {
        sessionId: string
        selection: PageBuilderCmsSelectionResult
        uiEntryPoint?: 'block-toolbar' | 'agent-flow'
      }) => ({
        requestId: `auto-handoff:${payload.selection.targetBlock.selector}`,
        userMessage: '请根据刚确认的 CMS 选择结果，判断如何应用到当前目标。',
        composedUserMessage: [
          '<page_builder_turn_routing>{"sceneKind":"confirmed-cms-apply","ownerSkill":"cms-binding-apply","ownerLockedForTurn":true}</page_builder_turn_routing>',
          '<cms_binding_apply_input>{"version":8}</cms_binding_apply_input>',
        ].join('\n\n'),
        mentionedSkills: ['cms-binding-apply'],
        bootstrappedSkills: ['cms-binding-apply'],
        mentionedMcpServers: ['cms'],
      })),
      deletePageBuilderBlock: options.deletePageBuilderBlockImpl ?? (async () => {
        throw new Error('deletePageBuilderBlock 未在测试中模拟')
      }),
      createPageBuilderStaticExportJob: options.createPageBuilderStaticExportJobImpl ?? (async () => {
        throw new Error('createPageBuilderStaticExportJob 未在测试中模拟')
      }),
      getPageBuilderStaticExportJob: options.getPageBuilderStaticExportJobImpl ?? (async () => {
        throw new Error('getPageBuilderStaticExportJob 未在测试中模拟')
      }),
      getPageBuilderStaticExportDownloadUrl: (workspaceId: string, jobId: string) =>
        `/api/workspaces/${workspaceId}/page-builder/export-static-jobs/${jobId}/download`,
      savePageBuilderInlineText: options.savePageBuilderInlineTextImpl ?? (async () => {
        throw new Error('savePageBuilderInlineText 未在测试中模拟')
      }),
      replacePageBuilderImage: options.replacePageBuilderImageImpl ?? (async () => {
        throw new Error('replacePageBuilderImage 未在测试中模拟')
      }),
    },
  }))

  const module = await import(`./BuilderPage.tsx?test=${Date.now()}-${Math.random()}`)

  return {
    BuilderPage: module.BuilderPage,
    ApiError: MockApiError,
    getLastAgentViewProps() {
      return lastAgentViewProps
    },
    getLastPreviewPaneProps() {
      return lastPreviewPaneProps
    },
    getLastCmsBrowserDialogProps() {
      return lastCmsBrowserDialogProps
    },
    getToastError() {
      return toastError
    },
    getToastSuccess() {
      return toastSuccess
    },
    acquirePageBuilderEditLock,
    renewPageBuilderEditLock,
    getPageBuilderEditLockStatus,
    releasePageBuilderEditLock,
    getCmsBuilderContext,
    getCmsIntegrationStatus,
    listSessions,
    listWorkspaces,
    listPageBuilderProjects,
  }
}

function flattenElementText(node: React.ReactNode): string {
  return React.Children.toArray(node).map((child) => {
    if (typeof child === 'string') {
      return child
    }

    if (typeof child === 'number') {
      return String(child)
    }

    if (React.isValidElement(child)) {
      return flattenElementText(child.props.children)
    }

    return ''
  }).join('')
}

function findElementProp(node: React.ReactNode, propName: string): unknown {
  if (
    node === null
    || node === undefined
    || typeof node === 'string'
    || typeof node === 'number'
    || typeof node === 'boolean'
  ) {
    return undefined
  }

  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode } & Record<string, unknown>
    if (propName in props) {
      return props[propName]
    }

    return findElementProp(props.children, propName)
  }

  for (const child of React.Children.toArray(node)) {
    const value = findElementProp(child, propName)
    if (value !== undefined) {
      return value
    }
  }

  return undefined
}

function findElementPropsByAriaLabel(
  node: React.ReactNode,
  ariaLabel: string,
): Record<string, unknown> | null {
  if (
    node === null
    || node === undefined
    || typeof node === 'string'
    || typeof node === 'number'
    || typeof node === 'boolean'
  ) {
    return null
  }

  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode } & Record<string, unknown>
    if (props['aria-label'] === ariaLabel) {
      return props
    }

    return findElementPropsByAriaLabel(props.children, ariaLabel)
  }

  for (const child of React.Children.toArray(node)) {
    const props = findElementPropsByAriaLabel(child, ariaLabel)
    if (props) {
      return props
    }
  }

  return null
}

function getComposerNoticeText(agentViewProps: Record<string, unknown> | null): string | null {
  const composerNotice = agentViewProps?.composerNotice as React.ReactNode | undefined
  if (composerNotice === undefined) {
    return null
  }

  const text = flattenElementText(composerNotice).trim()
  return text.length > 0 ? text : null
}

function getComposerNoticeTitle(agentViewProps: Record<string, unknown> | null): string | null {
  const composerNotice = agentViewProps?.composerNotice as React.ReactNode | undefined
  if (composerNotice === undefined) {
    return null
  }

  const title = findElementProp(composerNotice, 'title')
  return typeof title === 'string' && title.length > 0 ? title : null
}

function getComposerNoticeRootProps(agentViewProps: Record<string, unknown> | null): Record<string, unknown> | null {
  const composerNotice = agentViewProps?.composerNotice as React.ReactNode | undefined
  if (composerNotice === undefined || !React.isValidElement(composerNotice)) {
    return null
  }

  return composerNotice.props as Record<string, unknown>
}

function clickComposerNoticeAction(agentViewProps: Record<string, unknown> | null, ariaLabel: string): void {
  const composerNotice = agentViewProps?.composerNotice as React.ReactNode | undefined
  if (composerNotice === undefined) {
    throw new Error('missing composerNotice')
  }

  const props = findElementPropsByAriaLabel(composerNotice, ariaLabel)
  if (!props || typeof props.onClick !== 'function') {
    throw new Error(`missing composerNotice action: ${ariaLabel}`)
  }

  ;(props.onClick as () => void)()
}

function getPreviewSelectionActionState(previewPaneProps: Record<string, unknown> | null): string | null {
  return typeof previewPaneProps?.selectionActionState === 'string'
    ? previewPaneProps.selectionActionState
    : null
}

function getPreviewSelectionToggle(
  previewPaneProps: Record<string, unknown> | null,
): (() => void) | null {
  return typeof previewPaneProps?.onToggleSelectionMode === 'function'
    ? previewPaneProps.onToggleSelectionMode as () => void
    : null
}

function findButtonByText(renderer: ReturnType<typeof create>, label: string) {
  return renderer.root.find((node) =>
    node.type === 'button'
    && flattenElementText(node.props.children).trim() === label,
  )
}

function findButtonsByText(renderer: ReturnType<typeof create>, label: string) {
  return renderer.root.findAll((node) =>
    node.type === 'button'
    && flattenElementText(node.props.children).trim() === label,
  )
}

function findCheckbox(renderer: ReturnType<typeof create>) {
  return renderer.root.find((node) =>
    node.type === 'input'
    && node.props.type === 'checkbox',
  )
}

function HydrateBuilderPageState({
  children,
  streamingStates,
}: {
  children: React.ReactNode
  streamingStates?: Map<string, AgentStreamState>
}): React.ReactElement {
  const values = React.useMemo(() => {
    if (!streamingStates) {
      return new Map()
    }

    return new Map([[agentStreamingStatesAtom, streamingStates]])
  }, [streamingStates])

  useHydrateAtoms(values)
  return <>{children}</>
}

function setStreamingStatesForTest(
  store: ReturnType<typeof createStore>,
  states: Map<string, AgentStreamState>,
): void {
  ;(store as { set: (atom: unknown, value: unknown) => void }).set(agentStreamingStatesAtom, states)
}

afterEach(() => {
  mock.restore()
  Reflect.deleteProperty(globalThis, 'window')
})

describe('BuilderPage', () => {
  test('loads CMS builder context before project APIs and hydrates the current project', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: 'CMS 专题',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const store = createStore()

    const {
      BuilderPage,
      acquirePageBuilderEditLock,
      getCmsBuilderContext,
      getLastAgentViewProps,
      getLastCmsBrowserDialogProps,
      listSessions,
      listWorkspaces,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      getCmsIntegrationStatusImpl: async () => ({ integrationMode: 'cms', enabled: true }),
      mockPreviewPane: true,
      mockCmsBrowserDialog: true,
    })

    await act(async () => {
      create(
        <Provider store={store}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getCmsBuilderContext).toHaveBeenCalledWith(workspace.id, session.id)
    expect(listSessions).not.toHaveBeenCalled()
    expect(listWorkspaces).not.toHaveBeenCalled()
    expect(acquirePageBuilderEditLock).toHaveBeenCalledWith(workspace.id, expect.objectContaining({
      sessionId: session.id,
    }))
    expect(store.get(agentSessionsAtom)).toEqual([session])
    expect(store.get(agentWorkspacesAtom)).toEqual([workspace])
    expect(store.get(currentAgentSessionIdAtom)).toBe(session.id)
    expect(store.get(currentAgentWorkspaceIdAtom)).toBe(workspace.id)
    expect(getLastAgentViewProps()).toMatchObject({
      sessionId: session.id,
      initialUserMessage: null,
    })
    expect(getLastCmsBrowserDialogProps()).toMatchObject({
      cmsDataUnavailableReason: null,
      workspaceId: workspace.id,
    })
  })

  test('uses standalone direct builder loading while keeping CMS block actions in dev CMS mode', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '开发态 CMS 项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const store = createStore()

    const {
      BuilderPage,
      acquirePageBuilderEditLock,
      getCmsBuilderContext,
      getLastAgentViewProps,
      getLastCmsBrowserDialogProps,
      getLastPreviewPaneProps,
      listSessions,
      listWorkspaces,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      getCmsIntegrationStatusImpl: async () => ({
        integrationMode: 'cms',
        enabled: true,
        devStandaloneEntryEnabled: true,
      }),
      mockPreviewPane: true,
      mockCmsBrowserDialog: true,
    })

    await act(async () => {
      create(
        <Provider store={store}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getCmsBuilderContext).not.toHaveBeenCalled()
    expect(listSessions).toHaveBeenCalledTimes(1)
    expect(listWorkspaces).toHaveBeenCalledTimes(1)
    expect(acquirePageBuilderEditLock).toHaveBeenCalledWith(workspace.id, expect.objectContaining({
      sessionId: session.id,
    }))
    expect(store.get(agentSessionsAtom)).toEqual([session])
    expect(store.get(agentWorkspacesAtom)).toEqual([workspace])
    expect(store.get(currentAgentSessionIdAtom)).toBe(session.id)
    expect(store.get(currentAgentWorkspaceIdAtom)).toBe(workspace.id)
    expect(getLastAgentViewProps()).toMatchObject({
      sessionId: session.id,
      initialUserMessage: null,
    })
    expect(typeof (getLastPreviewPaneProps() as {
      onRequestOpenCmsBrowser?: () => void
    }).onRequestOpenCmsBrowser).toBe('function')

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createBlockTargetSelection('#hero-banner'),
      })
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestOpenCmsBrowser?: () => void
      }).onRequestOpenCmsBrowser?.()
    })

    expect(getLastCmsBrowserDialogProps()).toMatchObject({
      open: true,
      requestContext: {
        entryPoint: 'block-toolbar',
        targetSelection: {
          kind: 'block',
          selector: '#hero-banner',
        },
      },
      workspaceId: workspace.id,
    })
  })

  test('disables CMS browser entry and dialog in standalone mode', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastCmsBrowserDialogProps, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      mockCmsBrowserDialog: true,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      onRequestOpenCmsBrowser: undefined,
    })
    expect(getLastCmsBrowserDialogProps()).toMatchObject({
      open: false,
      workspaceId: null,
    })
  })

  test('switches a stale standalone builder URL to the active Agent session', async () => {
    const { location, pushState, replaceState } = installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const staleSession: AgentSessionMeta = {
      id: 'session-stale',
      title: '旧会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const activeSession: AgentSessionMeta = {
      id: 'session-active',
      title: '处理中会话',
      workspaceId: workspace.id,
      createdAt: 2,
      updatedAt: 2,
    }

    const {
      BuilderPage,
      acquirePageBuilderEditLock,
      getLastAgentViewProps,
      listPageBuilderProjects,
    } = await loadBuilderPage({
      sessions: [activeSession, staleSession],
      workspaces: [workspace],
      listPageBuilderProjectsImpl: async () => [{
        workspaceId: workspace.id,
        activeSessionId: activeSession.id,
      }],
      mockPreviewPane: true,
      mockCmsBrowserDialog: true,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={staleSession.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(listPageBuilderProjects).toHaveBeenCalledTimes(1)
    expect(pushState).toHaveBeenCalledWith(null, '', `/builder/${workspace.id}/${activeSession.id}`)
    expect(replaceState).not.toHaveBeenCalled()
    expect(location.pathname).toBe(`/builder/${workspace.id}/${activeSession.id}`)
    expect(acquirePageBuilderEditLock).not.toHaveBeenCalled()
    expect(getLastAgentViewProps()).toBeNull()
  })

  test('recovers the same active Agent session in standalone mode', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const activeSession: AgentSessionMeta = {
      id: 'session-active',
      title: '处理中会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      BuilderPage,
      acquirePageBuilderEditLock,
      getLastAgentViewProps,
    } = await loadBuilderPage({
      sessions: [activeSession],
      workspaces: [workspace],
      listPageBuilderProjectsImpl: async () => [{
        workspaceId: workspace.id,
        activeSessionId: activeSession.id,
      }],
      mockPreviewPane: true,
      mockCmsBrowserDialog: true,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={activeSession.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(acquirePageBuilderEditLock).toHaveBeenCalledWith(workspace.id, expect.objectContaining({
      sessionId: activeSession.id,
    }))
    expect(getLastAgentViewProps()).toMatchObject({
      sessionId: activeSession.id,
    })
  })

  test('does not mount project UI or acquire edit lock when CMS builder context fails', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: 'CMS 专题',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      ApiError,
      BuilderPage,
      acquirePageBuilderEditLock,
      getLastAgentViewProps,
      getLastCmsBrowserDialogProps,
      getLastPreviewPaneProps,
      listSessions,
      listWorkspaces,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      getCmsIntegrationStatusImpl: async () => ({ integrationMode: 'cms', enabled: true }),
      getCmsBuilderContextImpl: async () => {
        throw new ApiError('请先通过 CMS handoff 重新进入 PageBuilder', 401)
      },
      mockPreviewPane: true,
      mockCmsBrowserDialog: true,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('访问已失效，请从 CMS 系统重新进入 PageBuilder')
    expect(json).toContain('重试')
    expect(json).not.toContain('返回首页')
    expect(acquirePageBuilderEditLock).not.toHaveBeenCalled()
    expect(listSessions).not.toHaveBeenCalled()
    expect(listWorkspaces).not.toHaveBeenCalled()
    expect(getLastAgentViewProps()).toBeNull()
    expect(getLastPreviewPaneProps()).toBeNull()
    expect(getLastCmsBrowserDialogProps()).toBeNull()
  })

  test('fails closed when BuilderPage cannot load integration status', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: 'CMS 专题',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      BuilderPage,
      acquirePageBuilderEditLock,
      getCmsBuilderContext,
      listSessions,
      listWorkspaces,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      getCmsIntegrationStatusImpl: async () => {
        throw new Error('status unavailable')
      },
      mockPreviewPane: true,
      mockCmsBrowserDialog: true,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('服务暂不可用')
    expect(json).toContain('重试')
    expect(acquirePageBuilderEditLock).not.toHaveBeenCalled()
    expect(getCmsBuilderContext).not.toHaveBeenCalled()
    expect(listSessions).not.toHaveBeenCalled()
    expect(listWorkspaces).not.toHaveBeenCalled()
  })

  test('registers a beforeunload guard only while the agent is processing', async () => {
    const { dispatchWindowEvent, getListenerCount } = installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const store = createStore()

    const { BuilderPage } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
    })

    expect(getListenerCount('beforeunload')).toBe(0)

    const runningStreamState: AgentStreamState = {
      running: true,
      content: '',
      toolActivities: [],
      teammates: [],
      startedAt: 1,
    }

    await act(async () => {
      setStreamingStatesForTest(store, new Map([
        [session.id, runningStreamState],
      ]))
      await Promise.resolve()
    })

    expect(getListenerCount('beforeunload')).toBe(1)

    const preventDefault = mock(() => {})
    const event = {
      preventDefault,
      returnValue: undefined as string | undefined,
    }

    dispatchWindowEvent('beforeunload', event)

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(event.returnValue).toBe('')

    const idleStreamState: AgentStreamState = {
      running: false,
      content: '',
      toolActivities: [],
      teammates: [],
      startedAt: 1,
    }

    await act(async () => {
      setStreamingStatesForTest(store, new Map([
        [session.id, idleStreamState],
      ]))
      await Promise.resolve()
    })

    expect(getListenerCount('beforeunload')).toBe(0)

    await act(async () => {
      renderer.unmount()
    })

    expect(getListenerCount('beforeunload')).toBe(0)
  })

  test('renews edit lock from the URL fragment and passes credentials to AgentView', async () => {
    const windowHarness = installWindowHarness()
    windowHarness.location.hash = '#editLock=lock-from-home&editHolder=holder-from-home'
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      BuilderPage,
      acquirePageBuilderEditLock,
      renewPageBuilderEditLock,
      getLastAgentViewProps,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      renewPageBuilderEditLockImpl: async (workspaceId, lockId, payload) => ({
        workspaceId,
        lockId,
        holderId: payload.holderId,
        expiresAt: 75_000,
        heartbeatIntervalMs: 15_000,
      }),
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(acquirePageBuilderEditLock).not.toHaveBeenCalled()
    expect(renewPageBuilderEditLock).toHaveBeenCalledWith(workspace.id, 'lock-from-home', {
      holderId: 'holder-from-home',
    })
    expect(windowHarness.location.hash).toBe('')
    expect(getLastAgentViewProps()).toMatchObject({
      sendMessageOptions: {
        editLock: {
          lockId: 'lock-from-home',
          holderId: 'holder-from-home',
        },
      },
    })
  })

  test('keeps fragment edit-lock credentials available across a remount while renewal is still pending', async () => {
    const windowHarness = installWindowHarness()
    windowHarness.location.hash = '#editLock=lock-from-home&editHolder=holder-from-home'
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const renewResolvers: Array<(lease: PageBuilderEditLockLease) => void> = []

    const {
      BuilderPage,
      acquirePageBuilderEditLock,
      renewPageBuilderEditLock,
      getLastAgentViewProps,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      acquirePageBuilderEditLockImpl: async () => {
        throw Object.assign(new Error('该项目当前有其他编辑会话正在进行，请稍后再试'), { status: 409 })
      },
      renewPageBuilderEditLockImpl: async (workspaceId, lockId, payload) => await new Promise<PageBuilderEditLockLease>((resolve) => {
        renewResolvers.push(resolve)
      }).then((lease) => ({
        ...lease,
        workspaceId,
        lockId,
        holderId: payload.holderId,
      })),
    })

    let firstRenderer!: ReturnType<typeof create>
    await act(async () => {
      firstRenderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(renewPageBuilderEditLock).toHaveBeenCalledTimes(1)

    await act(async () => {
      firstRenderer.unmount()
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(acquirePageBuilderEditLock).not.toHaveBeenCalled()
    expect(renewPageBuilderEditLock).toHaveBeenCalledTimes(1)

    await act(async () => {
      for (const resolve of renewResolvers) {
        resolve({
          workspaceId: workspace.id,
          lockId: 'lock-from-home',
          holderId: 'holder-from-home',
          expiresAt: 75_000,
          heartbeatIntervalMs: 15_000,
        })
      }
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(windowHarness.location.hash).toBe('')
    expect(getLastAgentViewProps()).toMatchObject({
      sendMessageOptions: {
        editLock: {
          lockId: 'lock-from-home',
          holderId: 'holder-from-home',
        },
      },
    })
  })

  test('renews stored edit-lock credentials with the original holder', async () => {
    const windowHarness = installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    writeStoredPageBuilderEditLock(windowHarness.sessionStorage, workspace.id, session.id, {
      workspaceId: workspace.id,
      lockId: 'lock-stored',
      holderId: 'holder-stored',
      expiresAt: 60_000,
      heartbeatIntervalMs: 15_000,
    })

    const {
      BuilderPage,
      acquirePageBuilderEditLock,
      renewPageBuilderEditLock,
      getLastAgentViewProps,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      renewPageBuilderEditLockImpl: async (workspaceId, lockId, payload) => ({
        workspaceId,
        lockId,
        holderId: payload.holderId,
        expiresAt: 75_000,
        heartbeatIntervalMs: 15_000,
      }),
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(acquirePageBuilderEditLock).not.toHaveBeenCalled()
    expect(renewPageBuilderEditLock).toHaveBeenCalledWith(workspace.id, 'lock-stored', {
      holderId: 'holder-stored',
    })
    expect(getLastAgentViewProps()).toMatchObject({
      sendMessageOptions: {
        editLock: {
          lockId: 'lock-stored',
          holderId: 'holder-stored',
        },
      },
    })
  })

  test('direct page-builder URL access acquires a new edit lock before enabling editing', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      BuilderPage,
      acquirePageBuilderEditLock,
      getLastAgentViewProps,
      getLastPreviewPaneProps,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      acquirePageBuilderEditLockImpl: async (workspaceId, payload) => ({
        workspaceId,
        lockId: 'lock-direct',
        holderId: payload?.holderId ?? 'holder-direct',
        expiresAt: 60_000,
        heartbeatIntervalMs: 15_000,
      }),
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(acquirePageBuilderEditLock).toHaveBeenCalledTimes(1)
    expect(acquirePageBuilderEditLock.mock.calls[0]?.[0]).toBe(workspace.id)
    expect(acquirePageBuilderEditLock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      sessionId: session.id,
      holderId: expect.any(String),
    }))
    expect(getLastPreviewPaneProps()).toMatchObject({
      interactionLocked: false,
      selectionToggleDisabled: false,
    })
    expect(getLastAgentViewProps()).toMatchObject({
      sendMessageOptions: {
        editLock: {
          lockId: 'lock-direct',
        },
      },
    })
  })

  test('deduplicates direct URL edit-lock acquisition across a remount while acquisition is still pending', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    let resolveAcquire!: (lease: PageBuilderEditLockLease) => void

    const {
      BuilderPage,
      acquirePageBuilderEditLock,
      getLastAgentViewProps,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      acquirePageBuilderEditLockImpl: async (workspaceId, payload) => await new Promise<PageBuilderEditLockLease>((resolve) => {
        resolveAcquire = resolve
      }).then((lease) => ({
        ...lease,
        workspaceId,
        holderId: payload?.holderId ?? lease.holderId,
      })),
    })

    let firstRenderer!: ReturnType<typeof create>
    await act(async () => {
      firstRenderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(acquirePageBuilderEditLock).toHaveBeenCalledTimes(1)

    await act(async () => {
      firstRenderer.unmount()
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(acquirePageBuilderEditLock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveAcquire({
        workspaceId: workspace.id,
        lockId: 'lock-direct',
        holderId: 'holder-direct',
        expiresAt: 60_000,
        heartbeatIntervalMs: 15_000,
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastAgentViewProps()).toMatchObject({
      sendMessageOptions: {
        editLock: {
          lockId: 'lock-direct',
        },
      },
    })
  })

  test('heartbeat renewal failure disables page-builder editing interactions', async () => {
    const windowHarness = installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      BuilderPage,
      getLastAgentViewProps,
      getLastPreviewPaneProps,
      getToastError,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
      }],
      renewPageBuilderEditLockImpl: async () => {
        throw new Error('编辑锁已失效')
      },
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      await windowHarness.runIntervalsOnce()
    })

    expect(getToastError()).toHaveBeenCalledWith('编辑锁已失效，请从首页重新进入编辑')
    expect(getLastPreviewPaneProps()).toMatchObject({
      interactionLocked: true,
      selectionToggleDisabled: true,
    })
    const beforeSendMessage = (getLastAgentViewProps() as {
      beforeSendMessage?: (input: { userMessage: string; sessionId: string; workspaceId?: string }) => unknown
    }).beforeSendMessage
    expect(beforeSendMessage?.({
      userMessage: '继续修改',
      sessionId: session.id,
      workspaceId: workspace.id,
    })).toEqual({
      handled: true,
    })

    await act(async () => {
      await (getLastPreviewPaneProps() as {
        onRequestExportStatic?: () => Promise<void>
      }).onRequestExportStatic?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(findButtonsByText(renderer, '确认导出')).toHaveLength(1)
    expect(getToastError()).toHaveBeenCalledTimes(2)
  })

  test('blocks opening the cms browser after the edit lock is lost', async () => {
    const windowHarness = installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      BuilderPage,
      getLastCmsBrowserDialogProps,
      getLastPreviewPaneProps,
      getToastError,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockCmsBrowserDialog: true,
      mockPreviewPane: true,
      renewPageBuilderEditLockImpl: async () => {
        throw new Error('编辑锁已失效')
      },
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      await windowHarness.runIntervalsOnce()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      interactionLocked: true,
      selectionToggleDisabled: true,
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestOpenCmsBrowser?: () => void
      }).onRequestOpenCmsBrowser?.()
    })

    expect(getLastCmsBrowserDialogProps()).toMatchObject({
      open: false,
      confirming: false,
    })
    expect(getToastError()).toHaveBeenCalledWith('编辑锁已失效，请从首页重新进入编辑')
  })

  test('page-builder edit-lock write rejection immediately disables editing interactions', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      ApiError,
      BuilderPage,
      getLastAgentViewProps,
      getLastPreviewPaneProps,
      getToastError,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      acquirePageBuilderEditLockImpl: async (workspaceId) => ({
        workspaceId,
        lockId: 'lock-write',
        holderId: 'holder-write',
        expiresAt: 60_000,
        heartbeatIntervalMs: 15_000,
      }),
      savePageBuilderInlineTextImpl: async () => {
        throw new ApiError('编辑锁已失效，请从首页重新进入编辑', 409)
      },
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      interactionLocked: false,
      selectionToggleDisabled: false,
    })

    await act(async () => {
      await (getLastPreviewPaneProps() as {
        onInlineTextSaveRequest?: (request: {
          requestId: string
          selector: string
          textTargetDescriptor: { version: number; tagName: string; childPath: number[] }
          previousText: string
          nextText: string
        }) => Promise<unknown>
      }).onInlineTextSaveRequest?.({
        requestId: 'save-lock-rejected',
        selector: '#hero',
        textTargetDescriptor: {
          version: 1,
          tagName: 'h1',
          childPath: [0],
        },
        previousText: '旧标题',
        nextText: '新标题',
      })
      await Promise.resolve()
    })

    expect(getToastError()).toHaveBeenCalledWith('编辑锁已失效，请从首页重新进入编辑')
    expect(getLastPreviewPaneProps()).toMatchObject({
      interactionLocked: true,
      selectionToggleDisabled: true,
    })
    const beforeSendMessage = (getLastAgentViewProps() as {
      beforeSendMessage?: (input: { userMessage: string; sessionId: string; workspaceId?: string }) => unknown
    }).beforeSendMessage
    expect(beforeSendMessage?.({
      userMessage: '继续修改',
      sessionId: session.id,
      workspaceId: workspace.id,
    })).toEqual({
      handled: true,
    })
  })

  test('page-builder edit-lock send rejection from AgentView disables editing interactions', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      ApiError,
      BuilderPage,
      getLastAgentViewProps,
      getLastPreviewPaneProps,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      interactionLocked: false,
      selectionToggleDisabled: false,
    })

    await act(async () => {
      ;(getLastAgentViewProps() as {
        onSendError?: (error: unknown) => void
      }).onSendError?.(new ApiError('编辑锁已失效，请从首页重新进入编辑', 409))
      await Promise.resolve()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      interactionLocked: true,
      selectionToggleDisabled: true,
    })
  })

  test('direct page-builder URL lock conflict offers a home navigation action', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { ApiError, BuilderPage } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      acquirePageBuilderEditLockImpl: async () => {
        throw new ApiError('该项目当前有其他编辑会话正在进行，请稍后再试', 409)
      },
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('无法打开构建页')
    expect(json).toContain('返回首页')
  })

  test('releases the current page-builder edit lock on unmount', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      BuilderPage,
      releasePageBuilderEditLock,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      acquirePageBuilderEditLockImpl: async (workspaceId, payload) => ({
        workspaceId,
        lockId: 'lock-release',
        holderId: payload?.holderId ?? 'holder-release',
        expiresAt: 60_000,
        heartbeatIntervalMs: 15_000,
      }),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      renderer.unmount()
      await Promise.resolve()
    })

    expect(releasePageBuilderEditLock).toHaveBeenCalledWith(workspace.id, 'lock-release', {
      holderId: expect.any(String),
    })
  })

  test('sends page-builder edit lock release on pagehide without clearing refresh lock context', async () => {
    const windowHarness = installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      BuilderPage,
      releasePageBuilderEditLock,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      acquirePageBuilderEditLockImpl: async (workspaceId, payload) => ({
        workspaceId,
        lockId: 'lock-pagehide',
        holderId: payload?.holderId ?? 'holder-pagehide',
        expiresAt: 60_000,
        heartbeatIntervalMs: 15_000,
      }),
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(readStoredPageBuilderEditLock(windowHarness.sessionStorage, workspace.id, session.id)).toMatchObject({
      lockId: 'lock-pagehide',
    })

    await act(async () => {
      windowHarness.dispatchWindowEvent('pagehide')
      await Promise.resolve()
    })

    expect(releasePageBuilderEditLock).toHaveBeenCalledWith(workspace.id, 'lock-pagehide', {
      holderId: expect.any(String),
    })
    expect(readStoredPageBuilderEditLock(windowHarness.sessionStorage, workspace.id, session.id)).toMatchObject({
      lockId: 'lock-pagehide',
    })
  })

  test('page-builder inline edit requests include the current edit lock credentials', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const savePageBuilderInlineText = mock(async () => ({
      hasPreview: true,
      entryUrl: `/api/workspaces/${workspace.id}/preview/`,
      revision: 'rev-2',
    }))

    const { BuilderPage, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      acquirePageBuilderEditLockImpl: async (workspaceId) => ({
        workspaceId,
        lockId: 'lock-write',
        holderId: 'holder-write',
        expiresAt: 60_000,
        heartbeatIntervalMs: 15_000,
      }),
      savePageBuilderInlineTextImpl: savePageBuilderInlineText,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      await (getLastPreviewPaneProps() as {
        onInlineTextSaveRequest?: (request: {
          requestId: string
          selector: string
          textTargetDescriptor: { version: number; tagName: string; childPath: number[] }
          previousText: string
          nextText: string
        }) => Promise<unknown>
      }).onInlineTextSaveRequest?.({
        requestId: 'save-lock',
        selector: '#hero',
        textTargetDescriptor: {
          version: 1,
          tagName: 'h1',
          childPath: [0],
        },
        previousText: '旧标题',
        nextText: '新标题',
      })
    })

    expect(savePageBuilderInlineText).toHaveBeenCalledWith(workspace.id, expect.objectContaining({
      selector: '#hero',
      nextText: '新标题',
    }), {
      editLock: {
        lockId: 'lock-write',
        holderId: 'holder-write',
      },
    })
  })

  test('keeps the desktop builder shell height-bounded so the embedded chat can scroll internally', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
    })

    const workbench = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-workbench')
    )
    const grid = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-builder-grid')
    )
    const panes = renderer.root.findAll((node) =>
      node.type === 'section'
      && typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-pane')
    )

    expect(workbench.props.className).toContain('h-[100dvh]')
    expect(workbench.props.className).toContain('overflow-y-auto')
    expect(workbench.props.className).toContain('lg:overflow-hidden')
    expect(grid.props.className).toContain('lg:h-full')
    expect(grid.props.style['--page-builder-preview-size']).toBe(`${DEFAULT_BUILDER_SPLIT_RATIO}fr`)
    expect(panes.length).toBe(2)
    expect(panes.every((pane) => pane.props.className.includes('lg:h-full'))).toBe(true)
    expect(panes.every((pane) => pane.props.className.includes('lg:min-h-0'))).toBe(true)
  })

  test('renders a draggable separator and persists desktop width changes from keyboard nudges', async () => {
    const { localStorage } = installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
    })

    const gridBefore = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-builder-grid')
    )
    const separator = renderer.root.find((node) =>
      node.props['aria-label'] === '调整预览与对话宽度'
    )
    const initialPreviewSize = gridBefore.props.style['--page-builder-preview-size']

    await act(async () => {
      separator.props.onKeyDown({
        key: 'ArrowLeft',
        preventDefault() {},
      })
    })

    const gridAfter = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-builder-grid')
    )

    expect(initialPreviewSize).toBe(`${DEFAULT_BUILDER_SPLIT_RATIO}fr`)
    expect(gridAfter.props.style['--page-builder-preview-size']).not.toBe(initialPreviewSize)
    expect(localStorage.length).toBeGreaterThan(0)
  })

  test('updates the desktop split live during pointer dragging but persists only after pointerup', async () => {
    const windowHarness = installWindowHarness()
    const localStorageSetItem = mock(windowHarness.localStorage.setItem.bind(windowHarness.localStorage))
    windowHarness.localStorage.setItem = localStorageSetItem
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const inlineStyleState = new Map<string, string>()
    const gridNode = {
      getBoundingClientRect() {
        return {
          left: 100,
          width: 1200,
          top: 0,
          right: 1300,
          bottom: 800,
          height: 800,
        }
      },
      style: {
        setProperty: mock((name: string, value: string) => {
          inlineStyleState.set(name, value)
        }),
        removeProperty: mock((name: string) => {
          inlineStyleState.delete(name)
        }),
      },
    }
    const separatorNode = {
      setPointerCapture: mock(() => {}),
      releasePointerCapture: mock(() => {}),
    }

    const { BuilderPage } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
        {
          createNodeMock(element) {
            if (
              element.type === 'div'
              && typeof element.props.className === 'string'
              && element.props.className.includes('page-builder-builder-grid')
            ) {
              return gridNode
            }

            if (element.type === 'div' && element.props['aria-label'] === '调整预览与对话宽度') {
              return separatorNode
            }

            return {}
          },
        },
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    const persistedCallCountBeforeDrag = localStorageSetItem.mock.calls.length

    const separator = renderer.root.find((node) =>
      node.props['aria-label'] === '调整预览与对话宽度'
    )

    await act(async () => {
      separator.props.onPointerDown({
        button: 0,
        clientX: 760,
        pointerId: 1,
        currentTarget: separatorNode,
        preventDefault() {},
      })
    })

    expect(separatorNode.setPointerCapture).toHaveBeenCalledWith(1)
    expect(windowHarness.getListenerCount('pointermove')).toBe(1)
    expect(localStorageSetItem.mock.calls.length).toBe(persistedCallCountBeforeDrag)

    await act(async () => {
      windowHarness.dispatchWindowEvent('pointermove', {
        clientX: 900,
        pointerId: 1,
      })
    })

    expect(gridNode.style.setProperty).toHaveBeenCalled()
    expect(inlineStyleState.get('--page-builder-preview-size')).toBeDefined()
    expect(localStorageSetItem.mock.calls.length).toBe(persistedCallCountBeforeDrag)

    await act(async () => {
      windowHarness.dispatchWindowEvent('pointerup', {
        pointerId: 1,
      })
    })

    expect(separatorNode.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(localStorageSetItem.mock.calls.length).toBe(persistedCallCountBeforeDrag + 1)
    expect(windowHarness.getListenerCount('pointermove')).toBe(0)
  })

  test('hydrates the builder runtime and passes the bootstrap prompt into the embedded AgentView', async () => {
    const { sessionStorage } = installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    writeBootstrapPayload(sessionStorage, {
      sessionId: session.id,
      workspaceId: workspace.id,
      initialPrompt: '生成一个企业官网',
    })

    const { BuilderPage, getLastAgentViewProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
    })

    const store = createStore()
    await act(async () => {
      create(
        <Provider store={store}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
    })

    expect(store.get(agentSessionsAtom)).toEqual([session])
    expect(store.get(agentWorkspacesAtom)).toEqual([workspace])
    expect(store.get(currentAgentSessionIdAtom)).toBe(session.id)
    expect(store.get(currentAgentWorkspaceIdAtom)).toBe(workspace.id)
    expect(getLastAgentViewProps()).toMatchObject({
      sessionId: session.id,
      allowAttachments: true,
      showHeader: false,
      showComposerMeta: false,
      defaultMentionedSkills: ['page-builder-guided-generation'],
      initialUserMessage: '生成一个企业官网',
    })
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')

    await act(async () => {
      const props = getLastAgentViewProps() as { onInitialUserMessageHandled?: () => void }
      props.onInitialUserMessageHandled?.()
    })

    expect(readBootstrapPayload(sessionStorage, session.id)).toBeNull()
  })

  test('loads the workspace preview state and passes a cache-busted preview url into PreviewPane', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
      }],
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-1`,
    })
  })

  test('rehydrates the last successful preview url across a full builder remount before preview-state polling resolves', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const previewState: WorkspacePreviewState = {
      hasPreview: true,
      entryUrl: `/api/workspaces/${workspace.id}/preview/`,
      revision: 'rev-1',
    }

    const firstLoad = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      getWorkspacePreviewStateImpl: async () => previewState,
    })

    let firstRenderer!: ReturnType<typeof create>
    await act(async () => {
      firstRenderer = create(
        <Provider store={createStore()}>
          <firstLoad.BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(firstLoad.getLastPreviewPaneProps()).toMatchObject({
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-1`,
    })

    await act(async () => {
      firstRenderer.unmount()
    })

    const secondLoad = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      getWorkspacePreviewStateImpl: () => new Promise<WorkspacePreviewState>(() => {}),
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <secondLoad.BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(secondLoad.getLastPreviewPaneProps()).toMatchObject({
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-1`,
    })
  })

  test('polls for preview updates and clears the preview when the workspace no longer has an entry page', async () => {
    const { runIntervalsOnce } = installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [
        {
          hasPreview: true,
          entryUrl: `/api/workspaces/${workspace.id}/preview/`,
          revision: 'rev-1',
        },
        {
          hasPreview: true,
          entryUrl: `/api/workspaces/${workspace.id}/preview/`,
          revision: 'rev-2',
        },
        {
          hasPreview: false,
          entryUrl: null,
          revision: null,
        },
      ],
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-1`,
    })

    await act(async () => {
      await runIntervalsOnce()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-2`,
    })

    await act(async () => {
      await runIntervalsOnce()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      previewUrl: null,
    })
  })

  test('passes requiresSameOrigin metadata through to PreviewPane when CMS preview state is detected', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
        hasCmsRendering: true,
        requiresSameOrigin: true,
      }],
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-1`,
      requiresSameOrigin: true,
    })
  })

  test('keeps the current preview document mounted after inline text saves when polling observes suppressed saved revisions', async () => {
    const { runIntervalsOnce } = installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const saveResponses = [
      {
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-2',
      },
      {
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-3',
      },
    ] as const
    let saveIndex = 0
    const savePageBuilderInlineText = mock(async () => {
      const next = saveResponses[Math.min(saveIndex, saveResponses.length - 1)]!
      saveIndex += 1
      return next
    })

    const { BuilderPage, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [
        {
          hasPreview: true,
          entryUrl: `/api/workspaces/${workspace.id}/preview/`,
          revision: 'rev-1',
        },
        {
          hasPreview: true,
          entryUrl: `/api/workspaces/${workspace.id}/preview/`,
          revision: 'rev-2',
        },
        {
          hasPreview: true,
          entryUrl: `/api/workspaces/${workspace.id}/preview/`,
          revision: 'rev-3',
        },
      ],
      savePageBuilderInlineTextImpl: savePageBuilderInlineText,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-1`,
    })

    await act(async () => {
      await (getLastPreviewPaneProps() as {
        onInlineTextSaveRequest?: (request: {
          requestId: string
          selector: string
          textTargetDescriptor: { version: number; tagName: string; childPath: number[] }
          previousText: string
          nextText: string
        }) => Promise<unknown>
      }).onInlineTextSaveRequest?.({
        requestId: 'save-1',
        selector: '#hero',
        textTargetDescriptor: {
          version: 1,
          tagName: 'h1',
          childPath: [0],
        },
        previousText: '旧标题',
        nextText: '新标题',
      })
    })

    expect(savePageBuilderInlineText).toHaveBeenCalledTimes(1)

    await act(async () => {
      await runIntervalsOnce()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-1`,
    })

    await act(async () => {
      await (getLastPreviewPaneProps() as {
        onInlineTextSaveRequest?: (request: {
          requestId: string
          selector: string
          textTargetDescriptor: { version: number; tagName: string; childPath: number[] }
          previousText: string
          nextText: string
        }) => Promise<unknown>
      }).onInlineTextSaveRequest?.({
        requestId: 'save-2',
        selector: '#hero',
        textTargetDescriptor: {
          version: 1,
          tagName: 'p',
          childPath: [1],
        },
        previousText: '旧描述',
        nextText: '新描述',
      })
    })

    expect(savePageBuilderInlineText).toHaveBeenCalledTimes(2)

    await act(async () => {
      await runIntervalsOnce()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-1`,
    })
  })

  test('drops a stale bootstrap prompt when it belongs to another workspace', async () => {
    const { sessionStorage } = installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    writeBootstrapPayload(sessionStorage, {
      sessionId: session.id,
      workspaceId: 'workspace-other',
      initialPrompt: '不应继续沿用的初始化消息',
    })

    const { BuilderPage, getLastAgentViewProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
    })

    expect(getLastAgentViewProps()).toMatchObject({
      sessionId: session.id,
      showHeader: false,
      initialUserMessage: null,
    })
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')
    expect(readBootstrapPayload(sessionStorage, session.id)).toBeNull()
  })

  test('cycles the shared selection action through idle, armed, selected, and back to idle states', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastAgentViewProps, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
        hasCmsRendering: true,
        requiresSameOrigin: true,
      }],
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: false,
      selectionActionState: 'idle',
      selectionToggleDisabled: false,
    })
    expect(typeof getPreviewSelectionToggle(getLastPreviewPaneProps())).toBe('function')
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('idle')
    expect(getLastAgentViewProps()).not.toHaveProperty('composerLeadingActions')
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')

    await act(async () => {
      getPreviewSelectionToggle(getLastPreviewPaneProps())?.()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: true,
      selectionActionState: 'armed',
    })
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('armed')
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')

    await act(async () => {
      getPreviewSelectionToggle(getLastPreviewPaneProps())?.()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: false,
      selectionActionState: 'idle',
    })
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('idle')
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')

    await act(async () => {
      getPreviewSelectionToggle(getLastPreviewPaneProps())?.()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: true,
      selectionActionState: 'armed',
    })
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('armed')

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection; displayLabel?: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createBlockTargetSelection('#hero'),
        displayLabel: 'Header1',
      })
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: true,
      selectionActionState: 'selected',
    })
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')
    expect(getComposerNoticeText(getLastAgentViewProps())).toBe('当前选中：Header1')
    expect(getComposerNoticeText(getLastAgentViewProps())).not.toContain('#hero')
    expect(getComposerNoticeTitle(getLastAgentViewProps())).toBe('Header1')
    expect((getComposerNoticeRootProps(getLastAgentViewProps())?.className as string | undefined) ?? '').toContain('inline-flex')
    expect((getComposerNoticeRootProps(getLastAgentViewProps())?.className as string | undefined) ?? '').toContain('py-1')
    expect((findElementPropsByAriaLabel(
      (getLastAgentViewProps()?.composerNotice as React.ReactNode | undefined) ?? null,
      '取消选中',
    )?.className as string | undefined) ?? '').toContain('size-[18px]')
    expect((findElementPropsByAriaLabel(
      (getLastAgentViewProps()?.composerNotice as React.ReactNode | undefined) ?? null,
      '取消选中',
    )?.className as string | undefined) ?? '').toContain('opacity-0')
    expect((findElementPropsByAriaLabel(
      (getLastAgentViewProps()?.composerNotice as React.ReactNode | undefined) ?? null,
      '取消选中',
    )?.className as string | undefined) ?? '').toContain('group-hover:opacity-100')

    const decorated = (getLastAgentViewProps() as {
      messageDecorator?: (message: string) => string
    }).messageDecorator?.('修改这里的标题')

    expect(decorated).toContain('修改这里的标题')
    expect(extractPageBuilderSelectionPayload(decorated ?? '')).toMatchObject({
      targetSelection: createBlockTargetSelection('#hero'),
    })

    await act(async () => {
      clickComposerNoticeAction(getLastAgentViewProps(), '取消选中')
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: false,
      selectionActionState: 'idle',
    })
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('idle')
    expect(getLastAgentViewProps()).not.toHaveProperty('composerNotice')
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')
  })

  test('shows the preview label for the current selected target and clears it from the composer notice action', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastAgentViewProps, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
        hasCmsRendering: true,
        requiresSameOrigin: true,
      }],
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      getPreviewSelectionToggle(getLastPreviewPaneProps())?.()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: 'selected'; targetSelection: PageBuilderTargetSelection; displayLabel?: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createBlockTargetSelection('#hero-banner'),
        displayLabel: 'HeroBanner',
      })
    })

    expect(getComposerNoticeText(getLastAgentViewProps())).toBe('当前选中：HeroBanner')
    expect(getComposerNoticeText(getLastAgentViewProps())).not.toContain('#hero-banner')
    expect(getComposerNoticeTitle(getLastAgentViewProps())).toBe('HeroBanner')

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: 'selected'; targetSelection: PageBuilderTargetSelection; displayLabel?: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createCmsIslandTargetSelection(
          'section:nth-of-type(2) > cms-content:nth-of-type(1)',
          '[data-proma-block-id="pb_blk_news"]',
          'cms-content',
        ),
        displayLabel: 'cms-content',
      })
    })

    expect(getComposerNoticeText(getLastAgentViewProps())).toBe('当前选中：cms-content')
    expect(getComposerNoticeText(getLastAgentViewProps())).not.toContain('section:nth-of-type(2) > cms-content:nth-of-type(1)')
    expect(getComposerNoticeText(getLastAgentViewProps())).not.toContain('[data-proma-block-id="pb_blk_news"]')
    expect(getComposerNoticeTitle(getLastAgentViewProps())).toBe('cms-content')

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: 'selected'; targetSelection: PageBuilderTargetSelection; displayLabel?: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createBlockTargetSelection('#pricing'),
        displayLabel: 'Pricing',
      })
    })

    expect(getComposerNoticeText(getLastAgentViewProps())).toBe('当前选中：Pricing')
    expect(getComposerNoticeText(getLastAgentViewProps())).not.toContain('#pricing')
    expect(getComposerNoticeText(getLastAgentViewProps())).not.toContain('cms-content')
    expect(getComposerNoticeTitle(getLastAgentViewProps())).toBe('Pricing')

    await act(async () => {
      clickComposerNoticeAction(getLastAgentViewProps(), '取消选中')
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: false,
      selectionActionState: 'idle',
    })
    expect(getLastAgentViewProps()).not.toHaveProperty('composerNotice')
  })

  test('passes the guided generation skill as the default mentioned skill for builder conversations', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastAgentViewProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastAgentViewProps()).toMatchObject({
      defaultMentionedSkills: ['page-builder-guided-generation'],
      sessionId: session.id,
    })
  })

  test('locks the shared selection action while the agent is streaming', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const streamingStates = new Map<string, AgentStreamState>([
      [session.id, { running: true, content: '', toolActivities: [], teammates: [], startedAt: 1 }],
    ])

    const { BuilderPage, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <HydrateBuilderPageState streamingStates={streamingStates}>
            <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
          </HydrateBuilderPageState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionToggleDisabled: true,
    })
  })

  test('preserves the current target and blocks block-level actions while the agent is streaming', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastAgentViewProps, getLastCmsBrowserDialogProps, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      mockCmsBrowserDialog: true,
    })

    const store = createStore()
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      getPreviewSelectionToggle(getLastPreviewPaneProps())?.()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: 'selected'; targetSelection: PageBuilderTargetSelection }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createBlockTargetSelection('#hero'),
      })
    })

    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')
    expect(extractPageBuilderSelectionPayload((getLastAgentViewProps() as {
      messageDecorator?: (message: string) => string
    }).messageDecorator?.('继续修改') ?? '')).toMatchObject({
      targetSelection: createBlockTargetSelection('#hero'),
    })

    await act(async () => {
      setStreamingStatesForTest(store, new Map([
        [session.id, { running: true, content: '', toolActivities: [], teammates: [], startedAt: 1 }],
      ]))
      await Promise.resolve()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      interactionLocked: true,
      selectionModeEnabled: true,
      selectionToggleDisabled: true,
      selectionActionState: 'selected',
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: 'selected'; targetSelection: PageBuilderTargetSelection }) => void
        onRequestDeleteBlock?: (selector: string) => void
        onRequestOpenCmsBrowser?: () => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createBlockTargetSelection('#pricing'),
      })
      ;(getLastPreviewPaneProps() as {
        onRequestDeleteBlock?: (selector: string) => void
      }).onRequestDeleteBlock?.('#hero')
      ;(getLastPreviewPaneProps() as {
        onRequestOpenCmsBrowser?: () => void
      }).onRequestOpenCmsBrowser?.()
      await Promise.resolve()
    })

    expect(extractPageBuilderSelectionPayload((getLastAgentViewProps() as {
      messageDecorator?: (message: string) => string
    }).messageDecorator?.('继续修改') ?? '')).toMatchObject({
      targetSelection: createBlockTargetSelection('#hero'),
    })
    expect(extractPageBuilderSelectionPayload((getLastAgentViewProps() as {
      messageDecorator?: (message: string) => string
    }).messageDecorator?.('继续修改') ?? '')).not.toMatchObject({
      targetSelection: createBlockTargetSelection('#pricing'),
    })
    expect(JSON.stringify(renderer.toJSON())).not.toContain('删除区块')
    expect(getLastCmsBrowserDialogProps()).toMatchObject({ open: false })
  })

  test('keeps the selected block for retry until a success callback or preview reset clears it', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastAgentViewProps, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
        hasCmsRendering: true,
        requiresSameOrigin: true,
      }],
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      getPreviewSelectionToggle(getLastPreviewPaneProps())?.()
    })
    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createBlockTargetSelection('#pricing'),
      })
    })

    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')
    expect(extractPageBuilderSelectionPayload((getLastAgentViewProps() as {
      messageDecorator?: (message: string) => string
    }).messageDecorator?.('改成更紧凑') ?? '')).toMatchObject({
      targetSelection: createBlockTargetSelection('#pricing'),
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string }) => void
      }).onSelectionEvent?.({
        type: 'reset',
      })
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: false,
      selectionActionState: 'idle',
    })
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('idle')
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')
  })

  test('clears the visible selection after sending and does not retain an implicit follow-up target', async () => {
    const { runIntervalsOnce } = installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastAgentViewProps, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [
        {
          hasPreview: true,
          entryUrl: `/api/workspaces/${workspace.id}/preview/`,
          revision: 'rev-1',
        },
        {
          hasPreview: true,
          entryUrl: `/api/workspaces/${workspace.id}/preview/`,
          revision: 'rev-2',
        },
      ],
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      getPreviewSelectionToggle(getLastPreviewPaneProps())?.()
    })
    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createBlockTargetSelection('#hero-banner'),
      })
    })

    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')

    await act(async () => {
      (getLastAgentViewProps() as {
        onMessageSent?: (userMessage: string) => void
      }).onMessageSent?.('帮我微调这个区块')
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: false,
      selectionActionState: 'idle',
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-1`,
    })
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('idle')
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')

    const followUpPayload = await (getLastAgentViewProps() as {
      prepareSendPayload?: (input: { userMessage: string; sessionId: string; workspaceId?: string }) => Promise<{
        composedUserMessage?: string
      }>
    }).prepareSendPayload?.({
      userMessage: '再把间距收紧一点',
      sessionId: session.id,
      workspaceId: workspace.id,
    })

    expect(followUpPayload?.composedUserMessage).not.toContain('<page_builder_selection>')

    await act(async () => {
      await runIntervalsOnce()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: false,
      selectionActionState: 'idle',
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-2`,
    })
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('idle')
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')
  })

  test('uses only the current explicit selection when the user re-selects another block before sending', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastAgentViewProps, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
      }],
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      getPreviewSelectionToggle(getLastPreviewPaneProps())?.()
      await Promise.resolve()
    })
    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createBlockTargetSelection('#hero-banner'),
      })
    })
    await act(async () => {
      getPreviewSelectionToggle(getLastPreviewPaneProps())?.()
      await Promise.resolve()
    })
    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createBlockTargetSelection('#pricing'),
      })
    })

    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')
    expect(extractPageBuilderSelectionPayload((getLastAgentViewProps() as {
      messageDecorator?: (message: string) => string
    }).messageDecorator?.('继续微调这个区块') ?? '')).toMatchObject({
      targetSelection: createBlockTargetSelection('#pricing'),
    })
    expect(extractPageBuilderSelectionPayload((getLastAgentViewProps() as {
      messageDecorator?: (message: string) => string
    }).messageDecorator?.('继续微调这个区块') ?? '')).not.toMatchObject({
      targetSelection: createBlockTargetSelection('#hero-banner'),
    })
  })

  test('opens the cms browser dialog from preview block actions with the selected block context', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      BuilderPage,
      getLastAgentViewProps,
      getLastCmsBrowserDialogProps,
      getLastPreviewPaneProps,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      getCmsIntegrationStatusImpl: async () => ({ integrationMode: 'cms', enabled: true }),
      mockPreviewPane: true,
      mockCmsBrowserDialog: true,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastAgentViewProps()).not.toHaveProperty('composerLeadingActions')
    expect(getLastCmsBrowserDialogProps()).toMatchObject({ open: false })
    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: false,
      selectionActionState: 'idle',
    })
    expect(typeof (getLastPreviewPaneProps() as {
      onRequestOpenCmsBrowser?: () => void
    }).onRequestOpenCmsBrowser).toBe('function')
    expect(typeof (getLastPreviewPaneProps() as {
      onToggleSelectionMode?: () => void
    }).onToggleSelectionMode).toBe('function')
    expect(typeof (getLastCmsBrowserDialogProps() as {
      onConfirmSelection?: (selection: PageBuilderCmsSelectionResult) => void
    }).onConfirmSelection).toBe('function')

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createBlockTargetSelection('#hero-banner'),
      })
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestOpenCmsBrowser?: () => void
      }).onRequestOpenCmsBrowser?.()
    })

    expect(getLastCmsBrowserDialogProps()).toMatchObject({
      open: true,
      requestContext: {
        entryPoint: 'block-toolbar',
        targetSelection: {
          kind: 'block',
          selector: '#hero-banner',
          parentBlockSelector: '#hero-banner',
          editBoundary: 'block',
        },
        targetBlock: {
          selector: '#hero-banner',
        },
      },
    })
    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: true,
      selectionActionState: 'selected',
    })
  })

  test('opens the cms browser dialog with cms-island target semantics and preserves the parent block as compatibility context', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      BuilderPage,
      getLastAgentViewProps,
      getLastCmsBrowserDialogProps,
      getLastPreviewPaneProps,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      getCmsIntegrationStatusImpl: async () => ({ integrationMode: 'cms', enabled: true }),
      mockPreviewPane: true,
      mockCmsBrowserDialog: true,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection; displayLabel?: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createCmsIslandTargetSelection(
          'section:nth-of-type(2) > cms-content:nth-of-type(1)',
          '[data-proma-block-id="pb_blk_news"]',
          'cms-content',
        ),
        displayLabel: 'cms-content',
      })
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestOpenCmsBrowser?: () => void
      }).onRequestOpenCmsBrowser?.()
    })

    expect(getLastCmsBrowserDialogProps()).toMatchObject({
      open: true,
      requestContext: {
        entryPoint: 'block-toolbar',
        targetSelection: {
          kind: 'cms-island',
          htmlPath: 'index.html',
          sourceSelector: 'section:nth-of-type(2) > cms-content:nth-of-type(1)',
          parentBlockSelector: '[data-proma-block-id="pb_blk_news"]',
          component: 'cms-content',
          editBoundary: 'source-atomic',
        },
        targetBlock: {
          selector: '[data-proma-block-id="pb_blk_news"]',
        },
      },
    })

    expect(extractPageBuilderSelectionPayload((getLastAgentViewProps() as {
      messageDecorator?: (message: string) => string
    }).messageDecorator?.('继续调整这里') ?? '')).toMatchObject({
      targetSelection: {
        kind: 'cms-island',
        htmlPath: 'index.html',
        sourceSelector: 'section:nth-of-type(2) > cms-content:nth-of-type(1)',
        parentBlockSelector: '[data-proma-block-id="pb_blk_news"]',
        component: 'cms-content',
        editBoundary: 'source-atomic',
      },
      selectionSemantics: {
        previewSurface: 'cms-rendered-output',
        updateRule: 'replace-whole-source-component',
        forbidRenderedChildWrites: true,
        sourceFirst: true,
        forbidCrossBlockMutation: true,
        forbidCmsSiblingInsertion: true,
        forbidSiblingInsertion: true,
        forbidDangerousSlotTags: ['script', 'style'],
      },
    })
  })

  test('does not inject cms-region guidance for ordinary static block edits', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastAgentViewProps, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createBlockTargetSelection('#hero'),
      })
    })

    const payload = await (getLastAgentViewProps() as {
      prepareSendPayload?: (input: { userMessage: string; sessionId: string; workspaceId?: string }) => Promise<{
        mentionedSkills: string[]
        bootstrappedSkills?: string[]
        composedUserMessage?: string
      }>
    }).prepareSendPayload?.({
      userMessage: '继续修改这里',
      sessionId: session.id,
      workspaceId: workspace.id,
    })

    expect(payload).toMatchObject({
      mentionedSkills: ['page-builder-guided-generation'],
      bootstrappedSkills: ['page-builder-guided-generation'],
    })
    expect(extractPageBuilderTurnRoutingPayload(payload?.composedUserMessage ?? '')).toEqual({
      sceneKind: 'ordinary-page-flow',
      ownerSkill: 'page-builder-guided-generation',
      ownerLockedForTurn: true,
    })
    expect(payload?.composedUserMessage).toContain('<page_builder_selection>')
    expect(payload?.composedUserMessage).not.toContain('<page_builder_cms_region_authoring>')
  })

  test('injects a lightweight page-level cms notice when the current page already contains cms regions', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastAgentViewProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
        hasCmsRendering: true,
        requiresSameOrigin: true,
      }],
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const payload = await (getLastAgentViewProps() as {
      prepareSendPayload?: (input: { userMessage: string; sessionId: string; workspaceId?: string }) => Promise<{
        mentionedSkills: string[]
        composedUserMessage?: string
      }>
    }).prepareSendPayload?.({
      userMessage: '继续调整页面的版式',
      sessionId: session.id,
      workspaceId: workspace.id,
    })

    expect(payload).toMatchObject({
      mentionedSkills: ['page-builder-guided-generation'],
      bootstrappedSkills: ['page-builder-guided-generation'],
    })
    expect(extractPageBuilderTurnRoutingPayload(payload?.composedUserMessage ?? '')).toEqual({
      sceneKind: 'ordinary-page-flow',
      ownerSkill: 'page-builder-guided-generation',
      ownerLockedForTurn: true,
    })
    expect(extractPageBuilderCmsGuidanceNoticePayload(payload?.composedUserMessage ?? '')).toMatchObject({
      mode: 'page-has-existing-cms-regions',
      consultSkill: 'page-builder-cms-region-authoring-guidance',
      currentPageHasExistingCmsRegions: true,
      sourceHtmlIsAuthoringSourceOnly: true,
      hostInjectsPreviewRuntime: true,
      inspectPreviewBeforeDiagnosingRuntime: true,
    })
    expect(payload?.composedUserMessage).not.toContain('<page_builder_cms_region_authoring>')
  })

  test('injects cms-region guidance skill and digest for ordinary cms-island edits', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastAgentViewProps, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
        hasCmsRendering: true,
        requiresSameOrigin: true,
      }],
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection; displayLabel?: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createCmsIslandTargetSelection(
          'section:nth-of-type(2) > cms-content:nth-of-type(1)',
          '[data-proma-block-id="pb_blk_news"]',
          'cms-content',
        ),
        displayLabel: 'cms-content',
      })
    })

    const payload = await (getLastAgentViewProps() as {
      prepareSendPayload?: (input: { userMessage: string; sessionId: string; workspaceId?: string }) => Promise<{
        mentionedSkills: string[]
        bootstrappedSkills?: string[]
        composedUserMessage?: string
      }>
    }).prepareSendPayload?.({
      userMessage: '继续修改这个区块',
      sessionId: session.id,
      workspaceId: workspace.id,
    })

    expect(payload).toMatchObject({
      mentionedSkills: ['page-builder-guided-generation'],
      bootstrappedSkills: ['page-builder-guided-generation', 'page-builder-cms-region-authoring-guidance'],
    })
    expect(extractPageBuilderTurnRoutingPayload(payload?.composedUserMessage ?? '')).toEqual({
      sceneKind: 'existing-cms-region-ordinary-edit',
      ownerSkill: 'page-builder-guided-generation',
      ownerLockedForTurn: true,
      consultSkills: ['page-builder-cms-region-authoring-guidance'],
    })
    expect(extractPageBuilderSelectionPayload(payload?.composedUserMessage ?? '')).toMatchObject({
      targetSelection: {
        kind: 'cms-island',
        component: 'cms-content',
      },
    })
    expect(extractPageBuilderCmsRegionAuthoringPayload(payload?.composedUserMessage ?? '')).toMatchObject({
      mode: 'ordinary-existing-region',
      component: 'cms-content',
      sourceType: 'contents-by-catalog',
      boundary: {
        editBoundary: 'source-atomic',
        sourceFirst: true,
        queryPropsChangeRequiresConfirmedApply: true,
      },
    })
    expect(extractPageBuilderCmsGuidanceNoticePayload(payload?.composedUserMessage ?? '')).toMatchObject({
      mode: 'page-has-existing-cms-regions',
      sourceHtmlIsAuthoringSourceOnly: true,
      hostInjectsPreviewRuntime: true,
      inspectPreviewBeforeDiagnosingRuntime: true,
    })
  })

  test('clears a cms-island selection after send and does not reuse it implicitly on later messages', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastAgentViewProps, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
        hasCmsRendering: true,
        requiresSameOrigin: true,
      }],
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection; displayLabel?: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createCmsIslandTargetSelection(
          'section:nth-of-type(2) > cms-content:nth-of-type(1)',
          '[data-proma-block-id="pb_blk_news"]',
          'cms-content',
        ),
        displayLabel: 'cms-content',
      })
    })
    await act(async () => {
      (getLastAgentViewProps() as {
        onMessageSent?: (userMessage: string) => void
      }).onMessageSent?.('继续修改这个区块')
    })

    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('idle')

    const payload = await (getLastAgentViewProps() as {
      prepareSendPayload?: (input: { userMessage: string; sessionId: string; workspaceId?: string }) => Promise<{
        mentionedSkills: string[]
        bootstrappedSkills?: string[]
        composedUserMessage?: string
      }>
    }).prepareSendPayload?.({
      userMessage: '再把列表间距收紧一点',
      sessionId: session.id,
      workspaceId: workspace.id,
    })

    expect(payload).toMatchObject({
      mentionedSkills: ['page-builder-guided-generation'],
      bootstrappedSkills: ['page-builder-guided-generation'],
    })
    expect(extractPageBuilderTurnRoutingPayload(payload?.composedUserMessage ?? '')).toEqual({
      sceneKind: 'ordinary-page-flow',
      ownerSkill: 'page-builder-guided-generation',
      ownerLockedForTurn: true,
    })
    expect(payload?.composedUserMessage).not.toContain('<page_builder_selection>')
    expect(payload?.composedUserMessage).not.toContain('<page_builder_cms_region_authoring>')
    expect(extractPageBuilderCmsGuidanceNoticePayload(payload?.composedUserMessage ?? '')).toMatchObject({
      mode: 'page-has-existing-cms-regions',
    })
  })

  test('does not reinterpret an explicit selection based on free-form user wording', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastAgentViewProps, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
      }],
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      getPreviewSelectionToggle(getLastPreviewPaneProps())?.()
      await Promise.resolve()
    })
    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createBlockTargetSelection('#hero-banner'),
      })
    })

    const redoPayload = await (getLastAgentViewProps() as {
      prepareSendPayload?: (input: { userMessage: string; sessionId: string; workspaceId?: string }) => Promise<{
        composedUserMessage?: string
      }>
    }).prepareSendPayload?.({
      userMessage: '把整个页面重做一版',
      sessionId: session.id,
      workspaceId: workspace.id,
    })

    expect(extractPageBuilderSelectionPayload(redoPayload?.composedUserMessage ?? '')).toMatchObject({
      targetSelection: createBlockTargetSelection('#hero-banner'),
    })
    expect(extractPageBuilderTurnRoutingPayload(redoPayload?.composedUserMessage ?? '')).toEqual({
      sceneKind: 'ordinary-page-flow',
      ownerSkill: 'page-builder-guided-generation',
      ownerLockedForTurn: true,
    })

    await act(async () => {
      (getLastAgentViewProps() as {
        onMessageSent?: (userMessage: string) => void
      }).onMessageSent?.('把整个页面重做一版')
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: false,
      selectionActionState: 'idle',
    })
    expect(getLastAgentViewProps()).not.toHaveProperty('composerNotice')
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')

    const nextPayload = await (getLastAgentViewProps() as {
      prepareSendPayload?: (input: { userMessage: string; sessionId: string; workspaceId?: string }) => Promise<{
        composedUserMessage?: string
      }>
    }).prepareSendPayload?.({
      userMessage: '继续微调这个区块',
      sessionId: session.id,
      workspaceId: workspace.id,
    })

    expect(nextPayload?.composedUserMessage).not.toContain('<page_builder_selection>')
  })

  test('degrades to cms guidance instead of silently falling back to ordinary flow when sourceType cannot be resolved', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, getLastAgentViewProps, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      getPageBuilderCmsTargetSnapshotImpl: async (_workspaceId, targetSelection) => ({
        kind: 'cms-island',
        htmlPath: 'index.html',
        sourceSelector: targetSelection.kind === 'cms-island' ? targetSelection.sourceSelector : '',
        parentBlockSelector: targetSelection.kind === 'cms-island' ? targetSelection.parentBlockSelector : '',
        component: 'cms-content',
        targetOuterHtml: '<cms-content site-id="14" catalog-id="news" ids="c-1" page-size="4"></cms-content>',
        parentBlockOuterHtml: '<section data-proma-block-id="pb_blk_news"></section>',
      }),
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection; displayLabel?: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createCmsIslandTargetSelection(
          'section:nth-of-type(2) > cms-content:nth-of-type(1)',
          '[data-proma-block-id="pb_blk_news"]',
          'cms-content',
        ),
        displayLabel: 'cms-content',
      })
    })

    const payload = await (getLastAgentViewProps() as {
      prepareSendPayload?: (input: { userMessage: string; sessionId: string; workspaceId?: string }) => Promise<{
        mentionedSkills: string[]
        bootstrappedSkills?: string[]
        composedUserMessage?: string
      }>
    }).prepareSendPayload?.({
      userMessage: '继续修改这个区块',
      sessionId: session.id,
      workspaceId: workspace.id,
    })

    expect(payload).toMatchObject({
      mentionedSkills: ['page-builder-guided-generation'],
      bootstrappedSkills: ['page-builder-guided-generation', 'page-builder-cms-region-authoring-guidance'],
    })
    expect(extractPageBuilderTurnRoutingPayload(payload?.composedUserMessage ?? '')).toEqual({
      sceneKind: 'existing-cms-region-ordinary-edit',
      ownerSkill: 'page-builder-guided-generation',
      ownerLockedForTurn: true,
      consultSkills: ['page-builder-cms-region-authoring-guidance'],
    })
    expect(extractPageBuilderCmsGuidanceNoticePayload(payload?.composedUserMessage ?? '')).toMatchObject({
      mode: 'targeted-cms-region-guidance-degraded',
      component: 'cms-content',
      reason: 'source-type-unresolved',
      allowOnlyNonBindingEdits: true,
      sourceHtmlIsAuthoringSourceOnly: true,
      hostInjectsPreviewRuntime: true,
      inspectPreviewBeforeDiagnosingRuntime: true,
    })
    expect(payload?.composedUserMessage).not.toContain('<page_builder_cms_region_authoring>')
  })

  test('blocks the send when the selected cms-island target identity is stale', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const { BuilderPage, ApiError, getLastAgentViewProps, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      getPageBuilderCmsTargetSnapshotImpl: async () => {
        throw new ApiError('未找到当前 CMS 源标签', 409)
      },
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection; displayLabel?: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createCmsIslandTargetSelection(
          'section:nth-of-type(2) > cms-content:nth-of-type(1)',
          '[data-proma-block-id="pb_blk_news"]',
          'cms-content',
        ),
        displayLabel: 'cms-content',
      })
    })

    const payload = await (getLastAgentViewProps() as {
      prepareSendPayload?: (input: { userMessage: string; sessionId: string; workspaceId?: string }) => Promise<unknown>
    }).prepareSendPayload?.({
      userMessage: '继续修改这个区块',
      sessionId: session.id,
      workspaceId: workspace.id,
    })

    expect(payload).toEqual({
      blocked: true,
      errorMessage: '当前已选 CMS 区域已失效或无法确认，请重新选择该区域后再修改。 未找到当前 CMS 源标签',
    })
    expect(getComposerNoticeText(getLastAgentViewProps())).toBe('当前选中：cms-content')
    expect(getComposerNoticeTitle(getLastAgentViewProps())).toBe('cms-content')
  })

  test('creates a programmatic CMS handoff request and closes the dialog only after send settles successfully', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const createPageBuilderCmsAutoHandoff = mock(async () => ({
      requestId: 'auto-handoff-1',
      userMessage: '请根据刚确认的 CMS 选择结果，判断如何应用到当前目标。',
      composedUserMessage: [
        '<page_builder_turn_routing>{"sceneKind":"confirmed-cms-apply","ownerSkill":"cms-binding-apply","ownerLockedForTurn":true}</page_builder_turn_routing>',
        '<cms_binding_apply_input>{"version":8,"handoffId":"auto-handoff-1","authoringRevision":"rev-1","targetSnapshot":{"targetOuterHtml":"<section id=\\"hero-banner\\" data-proma-block-id=\\"pb_blk_hero\\"><h1>Hero</h1></section>"}}</cms_binding_apply_input>',
        '优先让 cms-* 标签作为动态区域源码根节点，并把 ul、nav、section、article 等主要动态容器写进 slot。',
      ].join('\n\n'),
      mentionedSkills: ['cms-binding-apply'],
      bootstrappedSkills: ['cms-binding-apply'],
      mentionedMcpServers: ['cms'],
    }))

    const {
      BuilderPage,
      getLastAgentViewProps,
      getLastCmsBrowserDialogProps,
      getLastPreviewPaneProps,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      getCmsIntegrationStatusImpl: async () => ({ integrationMode: 'cms', enabled: true }),
      createPageBuilderCmsAutoHandoffImpl: createPageBuilderCmsAutoHandoff,
      mockCmsBrowserDialog: true,
      mockPreviewPane: true,
    })

    const store = createStore()
    await act(async () => {
      create(
        <Provider store={store}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection }) => void
      }).onSelectionEvent?.({ type: 'selected', targetSelection: createBlockTargetSelection('#hero-banner') })
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestOpenCmsBrowser?: () => void
      }).onRequestOpenCmsBrowser?.()
    })

    const selection: PageBuilderCmsSelectionResult = {
      version: 6,
      siteId: '14',
      targetSelection: createBlockTargetSelection('#hero-banner'),
      targetBlock: {
        selector: '#hero-banner',
      },
      selectionKind: 'contents',
      sourceType: 'contents-by-ids',
      selectionMode: 'fixed-items',
      catalogId: '101',
      contentIds: ['501'],
      snapshot: {
        contents: [],
      },
    }

    await act(async () => {
      await (getLastCmsBrowserDialogProps() as {
        onConfirmSelection?: (value: PageBuilderCmsSelectionResult) => void
      }).onConfirmSelection?.(selection)
    })

    const request = (getLastAgentViewProps()?.programmaticSendRequest ?? null) as {
      requestId: string
      composedUserMessage?: string
    } | null
    expect(request?.requestId).toBeTruthy()
    expect(getLastAgentViewProps()).toMatchObject({
      programmaticSendRequest: expect.objectContaining({
        userMessage: '请根据刚确认的 CMS 选择结果，判断如何应用到当前目标。',
        mentionedSkills: ['cms-binding-apply'],
        bootstrappedSkills: ['cms-binding-apply'],
        mentionedMcpServers: ['cms'],
      }),
    })
    expect(createPageBuilderCmsAutoHandoff).toHaveBeenCalledTimes(1)
    expect(createPageBuilderCmsAutoHandoff).toHaveBeenCalledWith(workspace.id, {
      sessionId: session.id,
      selection,
      uiEntryPoint: 'block-toolbar',
    }, {
      editLock: expect.objectContaining({
        lockId: 'lock-acquired',
        holderId: expect.any(String),
      }),
    })
    expect(request?.composedUserMessage).toContain(
      '优先让 cms-* 标签作为动态区域源码根节点，并把 ul、nav、section、article 等主要动态容器写进 slot。',
    )
    expect(request?.composedUserMessage).toContain('targetSnapshot')
    expect(request?.composedUserMessage).toContain('pb_blk_hero')
    expect(getLastCmsBrowserDialogProps()).toMatchObject({
      open: true,
      confirming: true,
    })

    await act(async () => {
      (getLastAgentViewProps() as {
        onProgrammaticSendSettled?: (result: PageBuilderCmsAutoAgentHandoffSettledResult) => void
      }).onProgrammaticSendSettled?.({
        requestId: request!.requestId,
        status: 'sent',
      })
    })

    expect(getLastCmsBrowserDialogProps()).toMatchObject({
      open: false,
      confirming: false,
    })
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('idle')
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')
  })

  test('keeps the dialog open and reports an error when the authoring target snapshot cannot be loaded', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const createPageBuilderCmsAutoHandoff = mock(async () => {
      throw new Error('无法读取当前目标的作者态源码快照')
    })

    const {
      BuilderPage,
      getLastAgentViewProps,
      getLastCmsBrowserDialogProps,
      getLastPreviewPaneProps,
      getToastError,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      getCmsIntegrationStatusImpl: async () => ({ integrationMode: 'cms', enabled: true }),
      createPageBuilderCmsAutoHandoffImpl: createPageBuilderCmsAutoHandoff,
      mockCmsBrowserDialog: true,
      mockPreviewPane: true,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection }) => void
      }).onSelectionEvent?.({ type: 'selected', targetSelection: createBlockTargetSelection('#hero-banner') })
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestOpenCmsBrowser?: () => void
      }).onRequestOpenCmsBrowser?.()
    })

    await act(async () => {
      await (getLastCmsBrowserDialogProps() as {
        onConfirmSelection?: (value: PageBuilderCmsSelectionResult) => void
      }).onConfirmSelection?.({
        version: 6,
        siteId: '14',
        targetSelection: createBlockTargetSelection('#hero-banner'),
        targetBlock: {
          selector: '#hero-banner',
        },
        selectionKind: 'contents',
        sourceType: 'contents-by-ids',
        selectionMode: 'fixed-items',
        catalogId: '101',
        contentIds: ['501'],
        snapshot: {
          contents: [],
        },
      })
    })

    expect(createPageBuilderCmsAutoHandoff).toHaveBeenCalledTimes(1)
    expect(getLastAgentViewProps()?.programmaticSendRequest ?? null).toBeNull()
    expect(getLastCmsBrowserDialogProps()).toMatchObject({
      open: true,
      confirming: false,
    })
    expect(getToastError()).toHaveBeenCalledWith('无法读取当前目标的作者态源码快照')
  })

  test('blocks opening the cms browser from preview block actions while the session is already streaming', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      BuilderPage,
      getLastAgentViewProps,
      getLastCmsBrowserDialogProps,
      getLastPreviewPaneProps,
      getToastError,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      getCmsIntegrationStatusImpl: async () => ({ integrationMode: 'cms', enabled: true }),
      mockCmsBrowserDialog: true,
      mockPreviewPane: true,
    })

    const store = createStore()
    const streamingStates = new Map<string, AgentStreamState>([
      [session.id, { running: true, content: '', toolActivities: [], teammates: [], startedAt: 1 }],
    ])

    await act(async () => {
      create(
        <Provider store={store}>
          <HydrateBuilderPageState streamingStates={streamingStates}>
            <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
          </HydrateBuilderPageState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; selector?: string }) => void
      }).onSelectionEvent?.({ type: 'selected', selector: '#hero-banner' })
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestOpenCmsBrowser?: () => void
      }).onRequestOpenCmsBrowser?.()
    })

    expect(getToastError()).not.toHaveBeenCalled()
    expect(getLastCmsBrowserDialogProps()).toMatchObject({
      open: false,
      confirming: false,
    })
    expect(getLastAgentViewProps()?.programmaticSendRequest ?? null).toBeNull()
  })

  test('re-applies builder interaction locks when the session busy state is restored after mount', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      BuilderPage,
      getLastAgentViewProps,
      getLastCmsBrowserDialogProps,
      getLastPreviewPaneProps,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      getCmsIntegrationStatusImpl: async () => ({ integrationMode: 'cms', enabled: true }),
      mockCmsBrowserDialog: true,
      mockPreviewPane: true,
    })

    const store = createStore()
    await act(async () => {
      create(
        <Provider store={store}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    act(() => {
      setStreamingStatesForTest(store, new Map([
        [session.id, {
          running: true,
          content: '',
          toolActivities: [],
          teammates: [],
          startedAt: 1,
        }],
      ]))
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; selector?: string }) => void
      }).onSelectionEvent?.({ type: 'selected', selector: '#hero-banner' })
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestOpenCmsBrowser?: () => void
      }).onRequestOpenCmsBrowser?.()
    })

    expect(getLastCmsBrowserDialogProps()).toMatchObject({
      open: false,
      confirming: false,
    })
    expect(getLastAgentViewProps()?.programmaticSendRequest ?? null).toBeNull()
  })

  test('keeps the dialog open after auto handoff send failure so the user can retry in place', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      BuilderPage,
      getLastAgentViewProps,
      getLastCmsBrowserDialogProps,
      getLastPreviewPaneProps,
      getToastError,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      getCmsIntegrationStatusImpl: async () => ({ integrationMode: 'cms', enabled: true }),
      mockCmsBrowserDialog: true,
      mockPreviewPane: true,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; selector?: string }) => void
      }).onSelectionEvent?.({ type: 'selected', selector: '#hero-banner' })
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestOpenCmsBrowser?: () => void
      }).onRequestOpenCmsBrowser?.()
    })

    const selection: PageBuilderCmsSelectionResult = {
      version: 6,
      siteId: '14',
      targetSelection: createBlockTargetSelection('#hero-banner'),
      targetBlock: {
        selector: '#hero-banner',
      },
      selectionKind: 'contents',
      sourceType: 'contents-by-ids',
      selectionMode: 'fixed-items',
      catalogId: '101',
      contentIds: ['501'],
      snapshot: {
        contents: [],
      },
    }

    await act(async () => {
      await (getLastCmsBrowserDialogProps() as {
        onConfirmSelection?: (value: PageBuilderCmsSelectionResult) => void
      }).onConfirmSelection?.(selection)
    })

    const request = (getLastAgentViewProps()?.programmaticSendRequest ?? null) as { requestId: string } | null

    await act(async () => {
      (getLastAgentViewProps() as {
        onProgrammaticSendSettled?: (result: PageBuilderCmsAutoAgentHandoffSettledResult) => void
      }).onProgrammaticSendSettled?.({
        requestId: request!.requestId,
        status: 'failed',
        errorMessage: 'send failed',
      })
    })

    expect(getLastCmsBrowserDialogProps()).toMatchObject({
      open: true,
      confirming: false,
    })
    expect(getToastError()).toHaveBeenCalledWith('send failed')
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')
  })

  test('does not install cms-island natural-language rebind interception and keeps rebinding on explicit CMS entry points only', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const {
      BuilderPage,
      getLastAgentViewProps,
      getLastCmsBrowserDialogProps,
      getLastPreviewPaneProps,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockCmsBrowserDialog: true,
      mockPreviewPane: true,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; targetSelection?: PageBuilderTargetSelection }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        targetSelection: createCmsIslandTargetSelection(
          'section:nth-of-type(2) > cms-content:nth-of-type(1)',
          '[data-proma-block-id="pb_blk_news"]',
          'cms-content',
        ),
      })
    })

    expect(getLastCmsBrowserDialogProps()).toMatchObject({
      open: false,
      requestContext: {
        entryPoint: 'block-toolbar',
        targetSelection: {
          kind: 'cms-island',
          htmlPath: 'index.html',
          sourceSelector: 'section:nth-of-type(2) > cms-content:nth-of-type(1)',
          parentBlockSelector: '[data-proma-block-id="pb_blk_news"]',
          component: 'cms-content',
          editBoundary: 'source-atomic',
        },
        targetBlock: {
          selector: '[data-proma-block-id="pb_blk_news"]',
        },
      },
      confirming: false,
    })
    expect(getLastAgentViewProps()).toHaveProperty('beforeSendMessage')
    expect(getLastAgentViewProps()).toMatchObject({
      programmaticSendRequest: null,
    })
  })

  test('opens an image-only file picker for replace-image actions and ignores canceled selections', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const replacePageBuilderImage = mock(async () => ({
      hasPreview: true,
      entryUrl: `/api/workspaces/${workspace.id}/preview/`,
      revision: 'rev-2',
    }))
    const fileInputNode = {
      click: mock(() => {}),
      value: '',
    }

    const { BuilderPage, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
      }],
      replacePageBuilderImageImpl: replacePageBuilderImage,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
        {
          createNodeMock(element) {
            if (element.type === 'input' && element.props.type === 'file') {
              return fileInputNode
            }

            return {}
          },
        },
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestReplaceImage?: (request: {
          selector: string
          imageTargetDescriptor: { version: number; tagName: string; childPath: number[] }
        }) => void
      }).onRequestReplaceImage?.({
        selector: '#hero-image',
        imageTargetDescriptor: {
          version: 1,
          tagName: 'img',
          childPath: [],
        },
      })
    })

    expect(fileInputNode.click).toHaveBeenCalledTimes(1)

    const fileInput = renderer.root.find((node) =>
      node.type === 'input'
      && node.props.type === 'file'
    )

    expect(fileInput.props.accept).toBe('image/*')
    expect(fileInput.props.multiple).not.toBe(true)

    await act(async () => {
      fileInput.props.onChange({
        currentTarget: {
          files: null,
          value: 'C:/fakepath/banner.png',
        },
      })
    })

    expect(replacePageBuilderImage).toHaveBeenCalledTimes(0)
  })

  test('uploads the selected image and refreshes PreviewPane to the new revision on success', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const nextPreviewState = {
      hasPreview: true,
      entryUrl: `/api/workspaces/${workspace.id}/preview/`,
      revision: 'rev-2',
    } satisfies WorkspacePreviewState
    const replacePageBuilderImage = mock(async (_workspaceId: string, payload: PageBuilderImageReplacementPayload) => {
      expect(payload.selector).toBe('#hero-image')
      expect(payload.imageTargetDescriptor).toEqual({
        version: 1,
        tagName: 'img',
        childPath: [],
      })
      expect(payload.file.name).toBe('replacement.png')
      expect(payload.file.type).toBe('image/png')
      return nextPreviewState
    })
    const fileInputNode = {
      click: mock(() => {}),
      value: '',
    }

    const {
      BuilderPage,
      getLastPreviewPaneProps,
      getToastError,
      getToastSuccess,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
      }],
      replacePageBuilderImageImpl: replacePageBuilderImage,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
        {
          createNodeMock(element) {
            if (element.type === 'input' && element.props.type === 'file') {
              return fileInputNode
            }

            return {}
          },
        },
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestReplaceImage?: (request: {
          selector: string
          imageTargetDescriptor: { version: number; tagName: string; childPath: number[] }
        }) => void
      }).onRequestReplaceImage?.({
        selector: '#hero-image',
        imageTargetDescriptor: {
          version: 1,
          tagName: 'img',
          childPath: [],
        },
      })
    })

    const fileInput = renderer.root.find((node) =>
      node.type === 'input'
      && node.props.type === 'file'
    )
    const file = new File(['new-image'], 'replacement.png', { type: 'image/png' })

    await act(async () => {
      await fileInput.props.onChange({
        currentTarget: {
          files: [file],
          value: 'C:/fakepath/replacement.png',
        },
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(replacePageBuilderImage).toHaveBeenCalledTimes(1)
    expect(getLastPreviewPaneProps()).toMatchObject({
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-2`,
    })
    expect(getToastError()).toHaveBeenCalledTimes(0)
    expect(getToastSuccess()).toHaveBeenCalledTimes(1)
    expect(getToastSuccess()).toHaveBeenCalledWith('图片替换成功')
  })

  test('shows a failure toast and keeps the previous preview revision when image replacement fails', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const replacePageBuilderImage = mock(async () => {
      throw new Error('图片上传失败')
    })
    const toastError = mock(() => {})
    const fileInputNode = {
      click: mock(() => {}),
      value: '',
    }

    const { BuilderPage, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
      }],
      replacePageBuilderImageImpl: replacePageBuilderImage,
      toastErrorImpl: toastError,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
        {
          createNodeMock(element) {
            if (element.type === 'input' && element.props.type === 'file') {
              return fileInputNode
            }

            return {}
          },
        },
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestReplaceImage?: (request: {
          selector: string
          imageTargetDescriptor: { version: number; tagName: string; childPath: number[] }
        }) => void
      }).onRequestReplaceImage?.({
        selector: '#hero-image',
        imageTargetDescriptor: {
          version: 1,
          tagName: 'img',
          childPath: [],
        },
      })
    })

    const fileInput = renderer.root.find((node) =>
      node.type === 'input'
      && node.props.type === 'file'
    )
    const file = new File(['new-image'], 'replacement.png', { type: 'image/png' })

    await act(async () => {
      await fileInput.props.onChange({
        currentTarget: {
          files: [file],
          value: 'C:/fakepath/replacement.png',
        },
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(replacePageBuilderImage).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledWith('图片上传失败')
    expect(getLastPreviewPaneProps()).toMatchObject({
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-1`,
    })
  })

  test('opens a deletion confirmation dialog and keeps the current selection when deletion is canceled', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const deletePageBuilderBlock = mock(async () => ({
      hasPreview: true,
      entryUrl: `/api/workspaces/${workspace.id}/preview/`,
      revision: 'rev-2',
    }))

    const { BuilderPage, getLastAgentViewProps, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
      }],
      deletePageBuilderBlockImpl: deletePageBuilderBlock,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: 'selected'; selector: string; targetSelection: PageBuilderTargetSelection }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        selector: '#hero',
        targetSelection: createBlockTargetSelection('#hero'),
      })
    })

    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestDeleteBlock?: (selector: string) => void
      }).onRequestDeleteBlock?.('#hero')
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('删除区块')

    await act(async () => {
      findButtonByText(renderer, '取消').props.onClick()
    })

    expect(deletePageBuilderBlock).toHaveBeenCalledTimes(0)
    expect(JSON.stringify(renderer.toJSON())).not.toContain('删除区块')
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')
  })

  test('deletes the selected block after confirmation and clears the current selection', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const deletePageBuilderBlock = mock(async () => ({
      hasPreview: true,
      entryUrl: `/api/workspaces/${workspace.id}/preview/`,
      revision: 'rev-2',
    }))

    const {
      BuilderPage,
      getLastAgentViewProps,
      getLastPreviewPaneProps,
      getToastError,
      getToastSuccess,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
      }],
      deletePageBuilderBlockImpl: deletePageBuilderBlock,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: 'selected'; selector: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        selector: '#hero',
      })
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestDeleteBlock?: (selector: string) => void
      }).onRequestDeleteBlock?.('#hero')
    })

    await act(async () => {
      await findButtonByText(renderer, '确认删除').props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(deletePageBuilderBlock).toHaveBeenCalledTimes(1)
    expect(deletePageBuilderBlock).toHaveBeenCalledWith(workspace.id, {
      selector: '#hero',
      targetSelection: createBlockTargetSelection('#hero'),
    }, {
      editLock: expect.objectContaining({
        lockId: 'lock-acquired',
        holderId: expect.any(String),
      }),
    })
    expect(getToastError()).toHaveBeenCalledTimes(0)
    expect(getToastSuccess()).toHaveBeenCalledTimes(1)
    expect(getToastSuccess()).toHaveBeenCalledWith('区块删除成功')
    expect(getLastPreviewPaneProps()).toMatchObject({
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-2`,
      selectionModeEnabled: false,
      selectionActionState: 'idle',
    })
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('idle')
  })

  test('shows an error toast and preserves the current selection when block deletion fails', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const deletePageBuilderBlock = mock(async () => {
      throw new Error('区块删除失败')
    })
    const toastError = mock(() => {})

    const { BuilderPage, getLastAgentViewProps, getLastPreviewPaneProps } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
      }],
      deletePageBuilderBlockImpl: deletePageBuilderBlock,
      toastErrorImpl: toastError,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: 'selected'; selector: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        selector: '#hero',
      })
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestDeleteBlock?: (selector: string) => void
      }).onRequestDeleteBlock?.('#hero')
    })

    await act(async () => {
      await findButtonByText(renderer, '确认删除').props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(deletePageBuilderBlock).toHaveBeenCalledTimes(1)
    expect(deletePageBuilderBlock).toHaveBeenCalledWith(workspace.id, {
      selector: '#hero',
      targetSelection: createBlockTargetSelection('#hero'),
    }, {
      editLock: expect.objectContaining({
        lockId: 'lock-acquired',
        holderId: expect.any(String),
      }),
    })
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledWith('区块删除失败')
    expect(getLastPreviewPaneProps()).toMatchObject({
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-1`,
      selectionModeEnabled: true,
      selectionActionState: 'selected',
    })
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')
  })

  test('opens an export confirmation dialog, submits the default cms export option, polls until completion, and opens the downloaded package', async () => {
    const windowHarness = installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    let resolveCreatePageBuilderStaticExportJob!: (value: PageBuilderStaticExportJob) => void
    const createPageBuilderStaticExportJob = mock(async () => await new Promise<PageBuilderStaticExportJob>((resolve) => {
      resolveCreatePageBuilderStaticExportJob = resolve
    }))
    const getPageBuilderStaticExportJob = mock(async () => ({
      jobId: 'job-1',
      status: 'completed',
      phase: 'completed',
      createdAt: '2026-04-07T10:00:00.000Z',
      updatedAt: '2026-04-07T10:00:02.000Z',
      expiresAt: '2026-04-07T11:00:00.000Z',
      downloadUrl: `/api/workspaces/${workspace.id}/page-builder/export-static-jobs/job-1/download`,
      errorMessage: null,
      failure: null,
      reportSummary: {
        localizedResourceCount: 4,
        retainedExternalLinkCount: 0,
        warningCount: 0,
        unsupportedRuntimeDependencyCount: 0,
        failureCount: 0,
        hasWarnings: false,
      },
    } satisfies PageBuilderStaticExportJob))

    const {
      BuilderPage,
      getLastPreviewPaneProps,
      getToastSuccess,
      getToastError,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
      }],
      createPageBuilderStaticExportJobImpl: createPageBuilderStaticExportJob,
      getPageBuilderStaticExportJobImpl: getPageBuilderStaticExportJob,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      exportStaticPending: false,
    })

    await act(async () => {
      await (getLastPreviewPaneProps() as {
        onRequestExportStatic?: () => Promise<void>
      }).onRequestExportStatic?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createPageBuilderStaticExportJob).toHaveBeenCalledTimes(0)

    const checkbox = findCheckbox(renderer)
    expect(checkbox.props.checked).toBe(true)

    await act(async () => {
      findButtonByText(renderer, '确认导出').props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(findButtonsByText(renderer, '确认导出')).toHaveLength(0)
    expect(findButtonsByText(renderer, '正在导出...')).toHaveLength(1)
    expect(findButtonByText(renderer, '正在导出...').props.disabled).toBe(true)
    expect(findButtonByText(renderer, '取消').props.disabled).toBe(true)
    expect(findCheckbox(renderer).props.disabled).toBe(true)
    expect(getLastPreviewPaneProps()).toMatchObject({
      exportStaticPending: true,
    })

    await act(async () => {
      resolveCreatePageBuilderStaticExportJob({
        jobId: 'job-1',
        status: 'running',
        phase: 'scanning',
        createdAt: '2026-04-07T10:00:00.000Z',
        updatedAt: '2026-04-07T10:00:00.000Z',
        expiresAt: '2026-04-07T11:00:00.000Z',
        downloadUrl: null,
        errorMessage: null,
        failure: null,
        reportSummary: null,
      } satisfies PageBuilderStaticExportJob)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createPageBuilderStaticExportJob).toHaveBeenCalledTimes(1)
    expect(createPageBuilderStaticExportJob).toHaveBeenCalledWith(workspace.id, {
      downloadCmsRemoteAssets: true,
    })
    expect(getLastPreviewPaneProps()).toMatchObject({
      exportStaticPending: true,
    })

    await act(async () => {
      await windowHarness.runIntervalsOnce()
    })

    expect(getPageBuilderStaticExportJob).toHaveBeenCalledTimes(1)
    expect(getPageBuilderStaticExportJob).toHaveBeenCalledWith(workspace.id, 'job-1')
    expect(windowHarness.open).toHaveBeenCalledWith(
      `/api/workspaces/${workspace.id}/page-builder/export-static-jobs/job-1/download`,
      '_blank',
      'noopener,noreferrer',
    )
    expect(getToastError()).toHaveBeenCalledTimes(0)
    expect(getToastSuccess()).toHaveBeenCalledWith('静态包导出成功')
    expect(getLastPreviewPaneProps()).toMatchObject({
      exportStaticPending: false,
    })
    expect(findButtonsByText(renderer, '正在导出...')).toHaveLength(0)

    await act(async () => {
      await (getLastPreviewPaneProps() as {
        onRequestExportStatic?: () => Promise<void>
      }).onRequestExportStatic?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(findButtonsByText(renderer, '确认导出')).toHaveLength(1)
    expect(findButtonByText(renderer, '确认导出').props.disabled).toBe(false)
    expect(findCheckbox(renderer).props.checked).toBe(true)
    expect(findCheckbox(renderer).props.disabled).toBe(false)
  })

  test('cancels the export confirmation dialog without creating a static export job', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const createPageBuilderStaticExportJob = mock(async () => {
      throw new Error('cancelled export should not create a job')
    })

    const {
      BuilderPage,
      getLastPreviewPaneProps,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
      }],
      createPageBuilderStaticExportJobImpl: createPageBuilderStaticExportJob,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      await (getLastPreviewPaneProps() as {
        onRequestExportStatic?: () => Promise<void>
      }).onRequestExportStatic?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      findButtonByText(renderer, '取消').props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createPageBuilderStaticExportJob).toHaveBeenCalledTimes(0)
    expect(getLastPreviewPaneProps()).toMatchObject({
      exportStaticPending: false,
    })
  })

  test('shows a warning-flavored success toast when the static export report contains warnings and submits an explicit false cms export option', async () => {
    const windowHarness = installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }

    const createPageBuilderStaticExportJob = mock(async () => ({
      jobId: 'job-2',
      status: 'completed',
      phase: 'completed',
      createdAt: '2026-04-07T10:00:00.000Z',
      updatedAt: '2026-04-07T10:00:02.000Z',
      expiresAt: '2026-04-07T11:00:00.000Z',
      downloadUrl: `/api/workspaces/${workspace.id}/page-builder/export-static-jobs/job-2/download`,
      errorMessage: null,
      failure: null,
      reportSummary: {
        localizedResourceCount: 3,
        retainedExternalLinkCount: 1,
        warningCount: 1,
        unsupportedRuntimeDependencyCount: 0,
        failureCount: 0,
        hasWarnings: true,
      },
    } satisfies PageBuilderStaticExportJob))

    const {
      BuilderPage,
      getLastPreviewPaneProps,
      getToastSuccess,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
      }],
      createPageBuilderStaticExportJobImpl: createPageBuilderStaticExportJob,
      getPageBuilderStaticExportJobImpl: async () => {
        throw new Error('completed job should not poll again')
      },
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      await (getLastPreviewPaneProps() as {
        onRequestExportStatic?: () => Promise<void>
      }).onRequestExportStatic?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      findCheckbox(renderer).props.onChange({
        currentTarget: {
          checked: false,
        },
        target: {
          checked: false,
        },
      })
      await Promise.resolve()
    })

    expect(findCheckbox(renderer).props.checked).toBe(false)

    await act(async () => {
      findButtonByText(renderer, '确认导出').props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createPageBuilderStaticExportJob).toHaveBeenCalledTimes(1)
    expect(createPageBuilderStaticExportJob).toHaveBeenCalledWith(workspace.id, {
      downloadCmsRemoteAssets: false,
    })

    expect(windowHarness.open).toHaveBeenCalledWith(
      `/api/workspaces/${workspace.id}/page-builder/export-static-jobs/job-2/download`,
      '_blank',
      'noopener,noreferrer',
    )
    expect(getToastSuccess()).toHaveBeenCalledWith('静态包导出完成，但存在离线告警，请查看导出报告')
  })

  test('shows a failure toast when the static export job ends in a failed state', async () => {
    installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 1,
      updatedAt: 1,
    }
    const createPageBuilderStaticExportJob = mock(async () => ({
      jobId: 'job-3',
      status: 'failed',
      phase: 'downloading',
      createdAt: '2026-04-07T10:00:00.000Z',
      updatedAt: '2026-04-07T10:00:02.000Z',
      expiresAt: '2026-04-07T11:00:00.000Z',
      downloadUrl: null,
      errorMessage: '关键图片下载失败',
      failure: {
        code: 'export-failed',
        message: '关键图片下载失败',
      },
      reportSummary: {
        localizedResourceCount: 1,
        retainedExternalLinkCount: 0,
        warningCount: 0,
        unsupportedRuntimeDependencyCount: 0,
        failureCount: 1,
        hasWarnings: false,
      },
    } satisfies PageBuilderStaticExportJob))

    const {
      BuilderPage,
      getLastPreviewPaneProps,
      getToastError,
    } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
      mockPreviewPane: true,
      previewStates: [{
        hasPreview: true,
        entryUrl: `/api/workspaces/${workspace.id}/preview/`,
        revision: 'rev-1',
      }],
      createPageBuilderStaticExportJobImpl: createPageBuilderStaticExportJob,
      getPageBuilderStaticExportJobImpl: async () => {
        throw new Error('failed job should not poll again')
      },
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <BuilderPage sessionId={session.id} workspaceId={workspace.id} />
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      await (getLastPreviewPaneProps() as {
        onRequestExportStatic?: () => Promise<void>
      }).onRequestExportStatic?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      findButtonByText(renderer, '确认导出').props.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createPageBuilderStaticExportJob).toHaveBeenCalledTimes(1)
    expect(createPageBuilderStaticExportJob).toHaveBeenCalledWith(workspace.id, {
      downloadCmsRemoteAssets: true,
    })
    expect(getToastError()).toHaveBeenCalledWith('关键图片下载失败')
  })
})
