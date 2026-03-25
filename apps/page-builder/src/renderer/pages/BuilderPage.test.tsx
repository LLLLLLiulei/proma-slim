import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { act, create } from 'react-test-renderer'
import type { AgentSessionMeta, AgentWorkspace } from '@proma/shared'
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
}) {
  let lastAgentViewProps: Record<string, unknown> | null = null
  let previewStateIndex = 0

  mock.module('@/components/agent', () => ({
    AgentView(props: Record<string, unknown>) {
      lastAgentViewProps = props
      return React.createElement('div', { 'data-testid': 'agent-view' })
    },
  }))

  mock.module('@/lib/api', () => ({
    api: {
      listSessions: async () => options.sessions,
      listWorkspaces: async () => options.workspaces,
      getWorkspacePreviewState: async () => {
        const states = options.previewStates ?? [{ hasPreview: false, entryUrl: null, revision: null }]
        const state = states[Math.min(previewStateIndex, states.length - 1)]!
        previewStateIndex += 1
        return state
      },
    },
  }))

  const module = await import(`./BuilderPage.tsx?test=${Date.now()}-${Math.random()}`)

  return {
    BuilderPage: module.BuilderPage,
    getLastAgentViewProps() {
      return lastAgentViewProps
    },
  }
}

afterEach(() => {
  mock.restore()
  Reflect.deleteProperty(globalThis, 'window')
})

describe('BuilderPage', () => {
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
      showHeader: false,
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
    })

    const iframe = renderer.root.findByType('iframe')
    expect(iframe.props.src).toBe(`/api/workspaces/${workspace.id}/preview/?v=rev-1`)
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

    const { BuilderPage } = await loadBuilderPage({
      sessions: [session],
      workspaces: [workspace],
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

    expect(renderer.root.findByType('iframe').props.src).toBe(`/api/workspaces/${workspace.id}/preview/?v=rev-1`)

    await act(async () => {
      await runIntervalsOnce()
    })

    expect(renderer.root.findByType('iframe').props.src).toBe(`/api/workspaces/${workspace.id}/preview/?v=rev-2`)

    await act(async () => {
      await runIntervalsOnce()
    })

    expect(renderer.root.findAllByType('iframe')).toHaveLength(0)
    expect(JSON.stringify(renderer.toJSON())).toContain('预览尚未生成')
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
})
