import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { useHydrateAtoms } from 'jotai/utils'
import { act, create } from 'react-test-renderer'
import type {
  AgentSessionMeta,
  AgentWorkspace,
  PageBuilderCmsAutoAgentHandoffSettledResult,
  PageBuilderCmsSelectionResult,
} from '@proma/shared'
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

interface WorkspacePreviewState {
  hasPreview: boolean
  entryUrl: string | null
  revision: string | null
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
  dispatchWindowEvent: (type: string, event?: unknown) => void
  getListenerCount: (type: string) => number
  runIntervalsOnce: () => Promise<void>
  open: ReturnType<typeof mock>
} {
  const sessionStorage = createMemoryStorage()
  const localStorage = createMemoryStorage()
  const listeners = new Map<string, Set<(event?: unknown) => void>>()
  const intervals = new Map<number, () => void | Promise<void>>()
  let nextIntervalId = 1
  const open = mock(() => {})

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
    open,
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
  previewStates?: WorkspacePreviewState[]
  getWorkspacePreviewStateImpl?: () => Promise<WorkspacePreviewState>
  savePageBuilderInlineTextImpl?: (workspaceId: string, payload: unknown) => Promise<WorkspacePreviewState>
  deletePageBuilderBlockImpl?: (
    workspaceId: string,
    payload: PageBuilderBlockDeletionPayload,
  ) => Promise<WorkspacePreviewState>
  createPageBuilderStaticExportJobImpl?: (workspaceId: string) => Promise<PageBuilderStaticExportJob>
  getPageBuilderStaticExportJobImpl?: (workspaceId: string, jobId: string) => Promise<PageBuilderStaticExportJob>
  replacePageBuilderImageImpl?: (
    workspaceId: string,
    payload: PageBuilderImageReplacementPayload,
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
  const toastError = options.toastErrorImpl ?? mock(() => {})
  const toastSuccess = options.toastSuccessImpl ?? mock(() => {})

  mock.module('@/components/agent', () => ({
    AgentView(props: Record<string, unknown>) {
      lastAgentViewProps = props
      return React.createElement('div', { 'data-testid': 'agent-view' })
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
        return React.createElement('div', { 'data-testid': 'preview-pane' })
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
    api: {
      listSessions: async () => options.sessions,
      listWorkspaces: async () => options.workspaces,
      getWorkspacePreviewState: options.getWorkspacePreviewStateImpl ?? (async () => {
        const states = options.previewStates ?? [{ hasPreview: false, entryUrl: null, revision: null }]
        const state = states[Math.min(previewStateIndex, states.length - 1)]!
        previewStateIndex += 1
        return state
      }),
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
        onSelectionEvent?: (event: { type: string; selector?: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        selector: '#hero',
      })
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: true,
      selectionActionState: 'selected',
    })
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')

    const decorated = (getLastAgentViewProps() as {
      messageDecorator?: (message: string) => string
    }).messageDecorator?.('修改这里的标题')

    expect(decorated).toContain('#hero')
    expect(decorated).toContain('修改这里的标题')

    await act(async () => {
      getPreviewSelectionToggle(getLastPreviewPaneProps())?.()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: false,
      selectionActionState: 'idle',
    })
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('idle')
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')
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
        onSelectionEvent?: (event: { type: 'selected'; selector: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        selector: '#hero',
      })
    })

    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')
    expect((getLastAgentViewProps() as {
      messageDecorator?: (message: string) => string
    }).messageDecorator?.('继续修改')).toContain('#hero')

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
        onSelectionEvent?: (event: { type: 'selected'; selector: string }) => void
        onRequestDeleteBlock?: (selector: string) => void
        onRequestOpenCmsBrowser?: () => void
      }).onSelectionEvent?.({
        type: 'selected',
        selector: '#pricing',
      })
      ;(getLastPreviewPaneProps() as {
        onRequestDeleteBlock?: (selector: string) => void
      }).onRequestDeleteBlock?.('#hero')
      ;(getLastPreviewPaneProps() as {
        onRequestOpenCmsBrowser?: () => void
      }).onRequestOpenCmsBrowser?.()
      await Promise.resolve()
    })

    expect((getLastAgentViewProps() as {
      messageDecorator?: (message: string) => string
    }).messageDecorator?.('继续修改')).toContain('#hero')
    expect((getLastAgentViewProps() as {
      messageDecorator?: (message: string) => string
    }).messageDecorator?.('继续修改')).not.toContain('#pricing')
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
        onSelectionEvent?: (event: { type: string; selector?: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        selector: '#pricing',
      })
    })

    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')
    expect((getLastAgentViewProps() as {
      messageDecorator?: (message: string) => string
    }).messageDecorator?.('改成更紧凑')).toContain('#pricing')

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

  test('keeps the selected block after sending a micro-adjustment message until preview refresh completes', async () => {
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
        onSelectionEvent?: (event: { type: string; selector?: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        selector: '#hero-banner',
      })
    })

    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')

    await act(async () => {
      (getLastAgentViewProps() as {
        onMessageSent?: (userMessage: string) => void
      }).onMessageSent?.('帮我微调这个区块')
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: true,
      selectionActionState: 'selected',
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-1`,
    })
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')
    expect((getLastAgentViewProps() as {
      messageDecorator?: (message: string) => string
    }).messageDecorator?.('帮我微调这个区块')).toContain('#hero-banner')

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
        onSelectionEvent?: (event: { type: string; selector?: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        selector: '#hero-banner',
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
        onSelectionEvent?: (event: { type: string; selector?: string }) => void
      }).onSelectionEvent?.({ type: 'selected', selector: '#hero-banner' })
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestOpenCmsBrowser?: () => void
      }).onRequestOpenCmsBrowser?.()
    })

    const selection: PageBuilderCmsSelectionResult = {
      version: 1,
      targetBlock: {
        selector: '#hero-banner',
      },
      selectionKind: 'contents',
      sourceType: 'contents-fixed',
      selectionMode: 'fixed-items',
      catalogIds: ['101'],
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
    expect(request?.requestId).toBeTruthy()
    expect(getLastAgentViewProps()).toMatchObject({
      programmaticSendRequest: expect.objectContaining({
        userMessage: '请根据刚确认的 CMS 选择结果，判断如何应用到当前区块。',
        mentionedSkills: ['cms-binding-apply'],
      }),
    })
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
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')
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
        onSelectionEvent?: (event: { type: string; selector?: string }) => void
      }).onSelectionEvent?.({ type: 'selected', selector: '#hero-banner' })
    })

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onRequestOpenCmsBrowser?: () => void
      }).onRequestOpenCmsBrowser?.()
    })

    const selection: PageBuilderCmsSelectionResult = {
      version: 1,
      targetBlock: {
        selector: '#hero-banner',
      },
      selectionKind: 'contents',
      sourceType: 'contents-fixed',
      selectionMode: 'fixed-items',
      catalogIds: ['101'],
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
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')
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
        onSelectionEvent?: (event: { type: 'selected'; selector: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        selector: '#hero',
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
    expect(deletePageBuilderBlock).toHaveBeenCalledWith(workspace.id, { selector: '#hero' })
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
    expect(deletePageBuilderBlock).toHaveBeenCalledWith(workspace.id, { selector: '#hero' })
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledWith('区块删除失败')
    expect(getLastPreviewPaneProps()).toMatchObject({
      previewUrl: `/api/workspaces/${workspace.id}/preview/?v=rev-1`,
      selectionModeEnabled: true,
      selectionActionState: 'selected',
    })
    expect(getPreviewSelectionActionState(getLastPreviewPaneProps())).toBe('selected')
  })

  test('starts a static export job from PreviewPane, polls until completion, and opens the downloaded package', async () => {
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
      jobId: 'job-1',
      status: 'running',
      phase: 'scanning',
      createdAt: '2026-04-07T10:00:00.000Z',
      updatedAt: '2026-04-07T10:00:00.000Z',
      expiresAt: '2026-04-07T11:00:00.000Z',
      downloadUrl: null,
      errorMessage: null,
      reportSummary: null,
    } satisfies PageBuilderStaticExportJob))
    const getPageBuilderStaticExportJob = mock(async () => ({
      jobId: 'job-1',
      status: 'completed',
      phase: 'completed',
      createdAt: '2026-04-07T10:00:00.000Z',
      updatedAt: '2026-04-07T10:00:02.000Z',
      expiresAt: '2026-04-07T11:00:00.000Z',
      downloadUrl: `/api/workspaces/${workspace.id}/page-builder/export-static-jobs/job-1/download`,
      errorMessage: null,
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
      exportStaticPending: false,
    })

    await act(async () => {
      await (getLastPreviewPaneProps() as {
        onRequestExportStatic?: () => Promise<void>
      }).onRequestExportStatic?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createPageBuilderStaticExportJob).toHaveBeenCalledTimes(1)
    expect(createPageBuilderStaticExportJob).toHaveBeenCalledWith(workspace.id)
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
  })

  test('shows a warning-flavored success toast when the static export report contains warnings', async () => {
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
      createPageBuilderStaticExportJobImpl: async () => ({
        jobId: 'job-2',
        status: 'completed',
        phase: 'completed',
        createdAt: '2026-04-07T10:00:00.000Z',
        updatedAt: '2026-04-07T10:00:02.000Z',
        expiresAt: '2026-04-07T11:00:00.000Z',
        downloadUrl: `/api/workspaces/${workspace.id}/page-builder/export-static-jobs/job-2/download`,
        errorMessage: null,
        reportSummary: {
          localizedResourceCount: 3,
          retainedExternalLinkCount: 1,
          warningCount: 1,
          unsupportedRuntimeDependencyCount: 0,
          failureCount: 0,
          hasWarnings: true,
        },
      }),
      getPageBuilderStaticExportJobImpl: async () => {
        throw new Error('completed job should not poll again')
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
      await (getLastPreviewPaneProps() as {
        onRequestExportStatic?: () => Promise<void>
      }).onRequestExportStatic?.()
      await Promise.resolve()
      await Promise.resolve()
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
        onRequestExportStatic?: () => Promise<void>
      }).onRequestExportStatic?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createPageBuilderStaticExportJob).toHaveBeenCalledTimes(1)
    expect(getToastError()).toHaveBeenCalledWith('关键图片下载失败')
  })
})
