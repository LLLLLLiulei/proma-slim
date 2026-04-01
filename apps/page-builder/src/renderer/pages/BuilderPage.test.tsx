import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { act, create } from 'react-test-renderer'
import type {
  AgentSessionMeta,
  AgentWorkspace,
  PageBuilderCmsSelectionResult,
} from '@proma/shared'
import {
  agentSessionsAtom,
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
} {
  const sessionStorage = createMemoryStorage()
  const localStorage = createMemoryStorage()
  const listeners = new Map<string, Set<(event?: unknown) => void>>()
  const intervals = new Map<number, () => void | Promise<void>>()
  let nextIntervalId = 1

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
    },
  })

  return {
    localStorage,
    sessionStorage,
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
  mockPreviewPane?: boolean
  mockCmsBrowserDialog?: boolean
}) {
  let lastAgentViewProps: Record<string, unknown> | null = null
  let lastPreviewPaneProps: Record<string, unknown> | null = null
  let lastCmsBrowserDialogProps: Record<string, unknown> | null = null
  let previewStateIndex = 0

  mock.module('@/components/agent', () => ({
    AgentView(props: Record<string, unknown>) {
      lastAgentViewProps = props
      return React.createElement('div', { 'data-testid': 'agent-view' })
    },
  }))

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
  }
}

function getComposerActionRoot(agentViewProps: Record<string, unknown> | null): React.ReactElement | null {
  const action = agentViewProps?.composerLeadingActions
  return React.isValidElement(action) ? action : null
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

function findComposerActionElement(
  agentViewProps: Record<string, unknown> | null,
  matcher: (element: React.ReactElement) => boolean,
): React.ReactElement | null {
  const root = getComposerActionRoot(agentViewProps)
  if (!root) return null

  const queue: React.ReactElement[] = [root]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (matcher(current)) {
      return current
    }

    for (const child of React.Children.toArray(current.props.children)) {
      if (React.isValidElement(child)) {
        queue.push(child)
      }
    }
  }

  return null
}

function getComposerActionElement(agentViewProps: Record<string, unknown> | null): React.ReactElement | null {
  const selectionLabels = new Set(['选择进行编辑', '从页面中选择', '已选区域'])
  return findComposerActionElement(agentViewProps, (element) =>
    typeof element.props.onClick === 'function'
      && selectionLabels.has(flattenElementText(element.props.children).trim()),
  )
}

function getComposerActionElementByLabel(
  agentViewProps: Record<string, unknown> | null,
  label: string,
): React.ReactElement | null {
  return findComposerActionElement(agentViewProps, (element) =>
    typeof element.props.onClick === 'function'
      && flattenElementText(element.props.children).trim() === label,
  )
}

function getComposerActionLabel(agentViewProps: Record<string, unknown> | null): string | null {
  const action = getComposerActionElement(agentViewProps)
  if (!action) return null

  return flattenElementText(action.props.children).trim() || null
}

function getComposerActionClassName(agentViewProps: Record<string, unknown> | null): string {
  const action = getComposerActionElement(agentViewProps)
  return typeof action?.props.className === 'string' ? action.props.className : ''
}

afterEach(() => {
  mock.restore()
  Reflect.deleteProperty(globalThis, 'window')
})

describe('BuilderPage', () => {
  test('registers a beforeunload guard that prevents accidental refresh or close on the builder page', async () => {
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

    expect(getListenerCount('beforeunload')).toBe(1)

    const preventDefault = mock(() => {})
    const event = {
      preventDefault,
      returnValue: undefined as string | undefined,
    }

    dispatchWindowEvent('beforeunload', event)

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(event.returnValue).toBe('')

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

    const { BuilderPage } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
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

    const iframe = renderer.root.findByType('iframe')
    expect(iframe.props.src).toBe(`http://localhost/api/workspaces/${workspace.id}/preview/?v=rev-1&page-builder-bridge=1`)
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
    })
    expect(getComposerActionLabel(getLastAgentViewProps())).toBe('选择进行编辑')
    expect(getComposerActionClassName(getLastAgentViewProps())).toContain('border-transparent')
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')

    await act(async () => {
      getComposerActionElement(getLastAgentViewProps())?.props.onClick()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: true,
    })
    expect(getComposerActionLabel(getLastAgentViewProps())).toBe('从页面中选择')
    expect(getComposerActionClassName(getLastAgentViewProps())).toContain('border-primary/35')
    expect(getComposerActionClassName(getLastAgentViewProps())).toContain('ring-1')
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')

    await act(async () => {
      getComposerActionElement(getLastAgentViewProps())?.props.onClick()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: false,
    })
    expect(getComposerActionLabel(getLastAgentViewProps())).toBe('选择进行编辑')
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')

    await act(async () => {
      getComposerActionElement(getLastAgentViewProps())?.props.onClick()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: true,
    })
    expect(getComposerActionLabel(getLastAgentViewProps())).toBe('从页面中选择')

    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; selector?: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        selector: '#hero',
      })
    })

    expect(getComposerActionLabel(getLastAgentViewProps())).toBe('已选区域')
    expect(getComposerActionClassName(getLastAgentViewProps())).toContain('bg-primary')
    expect(getComposerActionClassName(getLastAgentViewProps())).toContain('ring-2')

    const decorated = (getLastAgentViewProps() as {
      messageDecorator?: (message: string) => string
    }).messageDecorator?.('修改这里的标题')

    expect(decorated).toContain('#hero')
    expect(decorated).toContain('修改这里的标题')

    await act(async () => {
      getComposerActionElement(getLastAgentViewProps())?.props.onClick()
    })

    expect(getLastPreviewPaneProps()).toMatchObject({
      selectionModeEnabled: false,
    })
    expect(getComposerActionLabel(getLastAgentViewProps())).toBe('选择进行编辑')
    expect(getLastAgentViewProps()).not.toHaveProperty('messageDecorator')
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
      getComposerActionElement(getLastAgentViewProps())?.props.onClick()
    })
    await act(async () => {
      (getLastPreviewPaneProps() as {
        onSelectionEvent?: (event: { type: string; selector?: string }) => void
      }).onSelectionEvent?.({
        type: 'selected',
        selector: '#pricing',
      })
    })

    expect(getComposerActionLabel(getLastAgentViewProps())).toBe('已选区域')
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
    })
    expect(getComposerActionLabel(getLastAgentViewProps())).toBe('选择进行编辑')
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

    expect(getComposerActionElementByLabel(getLastAgentViewProps(), '浏览 CMS')).toBeNull()
    expect(getLastCmsBrowserDialogProps()).toMatchObject({ open: false })
    expect(getLastPreviewPaneProps()).toMatchObject({ selectionModeEnabled: false })
    expect(typeof (getLastPreviewPaneProps() as {
      onRequestOpenCmsBrowser?: () => void
    }).onRequestOpenCmsBrowser).toBe('function')
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
    expect(getLastPreviewPaneProps()).toMatchObject({ selectionModeEnabled: true })
    expect(getComposerActionLabel(getLastAgentViewProps())).toBe('已选区域')
  })

  test('logs the structured cms selection result when the dialog confirms', async () => {
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
    const consoleInfo = mock(() => {})
    const originalConsoleInfo = console.info
    console.info = consoleInfo as typeof console.info

    try {
      const {
        BuilderPage,
        getLastCmsBrowserDialogProps,
      } = await loadBuilderPage({
        sessions: [session],
        workspaces: [workspace],
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

      const selection: PageBuilderCmsSelectionResult = {
        version: 1,
        targetBlock: {
          selector: '#hero-banner',
        },
        selectionKind: 'contents',
        sourceType: 'contents-fixed',
        selectionMode: 'fixed-items',
        catalogIds: ['101'],
        contentIds: ['501', '502'],
        snapshot: {
          contents: [],
        },
      }

      await act(async () => {
        (getLastCmsBrowserDialogProps() as {
          onConfirmSelection?: (value: PageBuilderCmsSelectionResult) => void
        }).onConfirmSelection?.(selection)
      })

      expect(consoleInfo).toHaveBeenCalledTimes(1)
      expect(consoleInfo).toHaveBeenCalledWith('[BuilderPage] CMS 选择结果:', selection)
    } finally {
      console.info = originalConsoleInfo
    }
  })
})
