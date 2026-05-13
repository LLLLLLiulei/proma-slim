import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import type { AgentSessionMeta, AgentWorkspace } from '@ai-page-builder/shared'
import { readBootstrapPayload } from '@page-builder/lib/bootstrap-cache'
import { buildBuilderPath } from '@page-builder/lib/routes'

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

function installWindowHarness(initialPathname = '/') {
  const sessionStorage = createMemoryStorage()
  const location = { pathname: initialPathname }
  const history = {
    pushState: (_state: unknown, _title: string, pathname: string | URL | null | undefined) => {
      if (!pathname) return
      const nextPathname = typeof pathname === 'string'
        ? new URL(pathname, 'http://localhost').pathname
        : pathname.pathname
      location.pathname = nextPathname
    },
  }
  const dispatchEvent = mock(() => true)

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sessionStorage,
      history,
      location,
      dispatchEvent,
    },
  })

  Object.defineProperty(globalThis, 'PopStateEvent', {
    configurable: true,
    value: class PopStateEvent {
      readonly type: string

      constructor(type: string) {
        this.type = type
      }
    },
  })

  return { dispatchEvent, location, sessionStorage }
}

async function loadHomePage(options: {
  createPageBuilderProjectImpl: (deps: unknown) => Promise<{ workspace: AgentWorkspace; session: AgentSessionMeta }>
  retryPageBuilderSessionImpl: (workspaceId: string, deps: unknown) => Promise<AgentSessionMeta>
  getCmsIntegrationStatusImpl?: () => Promise<{ integrationMode: 'standalone' | 'cms'; enabled: boolean }>
}) {
  const toastError = mock(() => {})
  let historyRenderCount = 0
  const createWorkspace = mock(async () => {
    throw new Error('createWorkspace should be provided through project-start mock')
  })
  const createSession = mock(async () => {
    throw new Error('createSession should be provided through project-start mock')
  })
  const getCmsIntegrationStatus = mock(options.getCmsIntegrationStatusImpl ?? (async () => ({
    integrationMode: 'standalone' as const,
    enabled: false,
  })))

  class MockPageBuilderProjectStartError extends Error {
    readonly workspace: AgentWorkspace
    readonly recoverable = true

    constructor(message: string, workspace: AgentWorkspace) {
      super(message)
      this.name = 'PageBuilderProjectStartError'
      this.workspace = workspace
    }
  }

  mock.module('sonner', () => ({
    toast: {
      error: toastError,
    },
  }))

  mock.module('@page-builder/components/home/PageBuilderHistorySection', () => ({
    PageBuilderHistorySection() {
      historyRenderCount += 1
      return React.createElement('div', {
        'data-testid': 'page-builder-history-section',
      }, 'history-section')
    },
  }))

  mock.module('@/lib/api', () => ({
    api: {
      createWorkspace,
      createSession,
      getCmsIntegrationStatus,
    },
  }))

  mock.module('@page-builder/lib/project-start', () => ({
    DEFAULT_PAGE_BUILDER_PROJECT_NAME: '未命名项目',
    PageBuilderProjectStartError: MockPageBuilderProjectStartError,
    createPageBuilderProject: options.createPageBuilderProjectImpl,
    retryPageBuilderSession: options.retryPageBuilderSessionImpl,
  }))

  const module = await import(`./HomePage.tsx?test=${Date.now()}-${Math.random()}`)

  return {
    HomePage: module.HomePage,
    PageBuilderProjectStartError: MockPageBuilderProjectStartError,
    createSession,
    createWorkspace,
    getCmsIntegrationStatus,
    getHistoryRenderCount: () => historyRenderCount,
    toastError,
  }
}

afterEach(() => {
  mock.restore()
  Reflect.deleteProperty(globalThis, 'window')
  Reflect.deleteProperty(globalThis, 'PopStateEvent')
})

describe('HomePage', () => {
  test('does not mount standalone entry or history while integration status is pending', async () => {
    installWindowHarness()
    const pendingStatus = new Promise<{ integrationMode: 'standalone'; enabled: false }>(() => {})
    const createPageBuilderProject = mock(async () => {
      throw new Error('should not create project')
    })
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }

    const { HomePage, getHistoryRenderCount } = await loadHomePage({
      createPageBuilderProjectImpl: createPageBuilderProject,
      retryPageBuilderSessionImpl: async () => session,
      getCmsIntegrationStatusImpl: async () => await pendingStatus,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(HomePage))
    })

    expect(renderer.root.findAllByType('textarea')).toHaveLength(0)
    expect(renderer.root.findAll((node) => node.props['data-testid'] === 'page-builder-history-section')).toHaveLength(0)
    expect(getHistoryRenderCount()).toBe(0)
    expect(createPageBuilderProject).toHaveBeenCalledTimes(0)
  })

  test('shows a restricted CMS entry page without local creation or history in CMS mode', async () => {
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
    const createPageBuilderProject = mock(async () => ({ workspace, session }))

    const { HomePage, getHistoryRenderCount } = await loadHomePage({
      createPageBuilderProjectImpl: createPageBuilderProject,
      retryPageBuilderSessionImpl: async () => session,
      getCmsIntegrationStatusImpl: async () => ({ integrationMode: 'cms', enabled: true }),
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(HomePage))
      await Promise.resolve()
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('请从 CMS 系统进入 PageBuilder')
    expect(renderer.root.findAllByType('textarea')).toHaveLength(0)
    expect(renderer.root.findAll((node) => node.props['data-testid'] === 'page-builder-history-section')).toHaveLength(0)
    expect(getHistoryRenderCount()).toBe(0)
    expect(createPageBuilderProject).toHaveBeenCalledTimes(0)
  })

  test('fails closed when integration status cannot be loaded', async () => {
    installWindowHarness()
    const session: AgentSessionMeta = {
      id: 'session-1',
      title: '新 Agent 会话',
      workspaceId: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }
    const createPageBuilderProject = mock(async () => {
      throw new Error('should not create project')
    })

    const { HomePage, getHistoryRenderCount } = await loadHomePage({
      createPageBuilderProjectImpl: createPageBuilderProject,
      retryPageBuilderSessionImpl: async () => session,
      getCmsIntegrationStatusImpl: async () => {
        throw new Error('status unavailable')
      },
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(HomePage))
      await Promise.resolve()
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('服务暂不可用')
    expect(json).toContain('重试')
    expect(renderer.root.findAllByType('textarea')).toHaveLength(0)
    expect(renderer.root.findAll((node) => node.props['data-testid'] === 'page-builder-history-section')).toHaveLength(0)
    expect(getHistoryRenderCount()).toBe(0)
    expect(createPageBuilderProject).toHaveBeenCalledTimes(0)
  })

  test('keeps the hero content inside a viewport-tall stage while placing history below the fold', async () => {
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

    const { HomePage } = await loadHomePage({
      createPageBuilderProjectImpl: async () => ({ workspace, session }),
      retryPageBuilderSessionImpl: async () => session,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(HomePage))
    })

    const shell = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-shell')
    )
    const scroll = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-scroll')
    )
    const stage = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-stage')
    )
    const historyShell = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-history-shell')
    )
    const ambient = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-ambient')
    )
    const surface = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-surface')
    )
    const animatedAmbient = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-ambient-animated')
    )

    expect(shell.props.className).toContain('h-[100dvh]')
    expect(shell.props.className).toContain('overflow-y-auto')
    expect(shell.props.className).toContain('overflow-x-hidden')
    expect(scroll.props.className).toContain('page-builder-home-scroll')
    expect(stage.props.className).toContain('min-h-[100dvh]')
    expect(stage.props.className).toContain('items-center')
    expect(stage.props.className).toContain('justify-center')
    expect(historyShell.props.className).toContain('page-builder-home-history-shell')
    expect(ambient.props['aria-hidden']).toBe(true)
    expect(animatedAmbient.props.className).toContain('page-builder-home-ambient')
    expect(surface.props.className).toContain('page-builder-home-panel-flat')
  })

  test('shows user-facing launch copy without implementation details', async () => {
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

    const { HomePage } = await loadHomePage({
      createPageBuilderProjectImpl: async () => ({ workspace, session }),
      retryPageBuilderSessionImpl: async () => session,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(HomePage))
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('Intelligent Page Builder')
    expect(json).not.toContain('Proma Page Builder')
    expect(json).toContain('输入你想要的内容和效果，回车后即可创建项目并进入构建页继续完善。')
    expect(json).not.toContain('提交后会创建“未命名项目”工作区与首个对话，并自动开始生成。')
  })

  test('renders a native textarea for plain-text-only input on the home prompt composer', async () => {
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

    const { HomePage } = await loadHomePage({
      createPageBuilderProjectImpl: async () => ({ workspace, session }),
      retryPageBuilderSessionImpl: async () => session,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(HomePage))
    })

    const textarea = renderer.root.findByType('textarea')
    expect(textarea.props['aria-label']).toBe('页面需求输入框')
    expect(textarea.props.rows).toBe(7)
    expect(textarea.props.spellCheck).toBe(false)
  })

  test('attaches focus highlight styling to the visible input surface', async () => {
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

    const { HomePage } = await loadHomePage({
      createPageBuilderProjectImpl: async () => ({ workspace, session }),
      retryPageBuilderSessionImpl: async () => session,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(HomePage))
    })

    const surface = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-surface')
    )

    expect(surface.props.className).toContain('page-builder-home-panel-focus')
  })

  test('mounts the independent history section below the viewport-tall hero stage', async () => {
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

    const { HomePage } = await loadHomePage({
      createPageBuilderProjectImpl: async () => ({ workspace, session }),
      retryPageBuilderSessionImpl: async () => session,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(HomePage))
    })

    const stage = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-stage')
    )
    const historyShell = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-history-shell')
    )
    const historySection = renderer.root.find((node) => node.props['data-testid'] === 'page-builder-history-section')

    expect(stage.findAll((node) => node.props['data-testid'] === 'page-builder-history-section')).toHaveLength(0)
    expect(historyShell.findAll((node) => node.props['data-testid'] === 'page-builder-history-section')).toHaveLength(1)
    expect(historySection.children).toContain('history-section')
  })

  test('creates a project, stores the bootstrap prompt, and navigates to the builder page', async () => {
    const { location, sessionStorage } = installWindowHarness()
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
    const createPageBuilderProject = mock(async () => ({ workspace, session }))
    const retryPageBuilderSession = mock(async () => session)

    const { HomePage } = await loadHomePage({
      createPageBuilderProjectImpl: createPageBuilderProject,
      retryPageBuilderSessionImpl: retryPageBuilderSession,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(HomePage))
    })

    const textarea = renderer.root.findByType('textarea')
    await act(async () => {
      textarea.props.onChange({ target: { value: '生成一个 AI 咨询公司官网' } })
    })

    const submitButton = renderer.root.findByType('button')
    await act(async () => {
      submitButton.props.onClick()
    })

    expect(createPageBuilderProject).toHaveBeenCalledTimes(1)
    expect(location.pathname).toBe(buildBuilderPath(workspace.id, session.id))
    expect(readBootstrapPayload(sessionStorage, session.id)).toEqual({
      sessionId: session.id,
      workspaceId: workspace.id,
      initialPrompt: '生成一个 AI 咨询公司官网',
    })
  })

  test('creates a project and preserves the public base path when navigating to builder', async () => {
    const { location } = installWindowHarness('/pagebuilder/')
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

    const originalBaseUrl = import.meta.env.BASE_URL
    import.meta.env.BASE_URL = '/pagebuilder/'
    try {
      const { HomePage } = await loadHomePage({
        createPageBuilderProjectImpl: async () => ({ workspace, session }),
        retryPageBuilderSessionImpl: async () => session,
      })

      let renderer!: ReturnType<typeof create>
      await act(async () => {
        renderer = create(React.createElement(HomePage))
      })

      const textarea = renderer.root.findByType('textarea')
      await act(async () => {
        textarea.props.onChange({ target: { value: '生成一个 AI 咨询公司官网' } })
      })

      const submitButton = renderer.root.findByType('button')
      await act(async () => {
        submitButton.props.onClick()
      })

      expect(location.pathname).toBe(buildBuilderPath(workspace.id, session.id, '/pagebuilder'))
    } finally {
      import.meta.env.BASE_URL = originalBaseUrl
    }
  })


  test('inserts pasted content as plain text only', async () => {
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

    const { HomePage } = await loadHomePage({
      createPageBuilderProjectImpl: async () => ({ workspace, session }),
      retryPageBuilderSessionImpl: async () => session,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(HomePage))
    })

    let textarea = renderer.root.findByType('textarea')
    await act(async () => {
      textarea.props.onChange({ target: { value: '生成一个' } })
    })

    const preventDefault = mock(() => {})
    await act(async () => {
      textarea.props.onPaste({
        preventDefault,
        clipboardData: {
          getData: (type: string) => {
            if (type === 'text/plain') return 'AI 咨询公司官网'
            if (type === 'text/html') return '<strong>AI 咨询公司官网</strong>'
            return ''
          },
        },
        currentTarget: {
          value: '生成一个',
          selectionStart: 4,
          selectionEnd: 4,
          setSelectionRange: () => {},
        },
      })
    })

    textarea = renderer.root.findByType('textarea')
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(textarea.props.value).toBe('生成一个AI 咨询公司官网')
  })

  test('submits the plain-text textarea on Enter without requiring the submit button', async () => {
    const { location, sessionStorage } = installWindowHarness()
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
    const createPageBuilderProject = mock(async () => ({ workspace, session }))

    const { HomePage } = await loadHomePage({
      createPageBuilderProjectImpl: createPageBuilderProject,
      retryPageBuilderSessionImpl: async () => session,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(HomePage))
    })

    const textarea = renderer.root.findByType('textarea')
    await act(async () => {
      textarea.props.onChange({ target: { value: '生成一个 AI 咨询公司官网' } })
    })

    const preventDefault = mock(() => {})
    await act(async () => {
      textarea.props.onKeyDown({
        key: 'Enter',
        shiftKey: false,
        nativeEvent: { isComposing: false },
        preventDefault,
      })
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(createPageBuilderProject).toHaveBeenCalledTimes(1)
    expect(location.pathname).toBe(buildBuilderPath(workspace.id, session.id))
    expect(readBootstrapPayload(sessionStorage, session.id)?.initialPrompt).toBe('生成一个 AI 咨询公司官网')
  })

  test('retries only session creation after a recoverable startup failure', async () => {
    const { location, sessionStorage } = installWindowHarness()
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }
    const retriedSession: AgentSessionMeta = {
      id: 'session-2',
      title: '新 Agent 会话',
      workspaceId: workspace.id,
      createdAt: 2,
      updatedAt: 2,
    }

    const createPageBuilderProject = mock(async () => {
      throw new Error('placeholder')
    })
    const retryPageBuilderSession = mock(async () => retriedSession)

    const {
      HomePage,
      PageBuilderProjectStartError,
    } = await loadHomePage({
      createPageBuilderProjectImpl: async () => {
        throw new PageBuilderProjectStartError('session failed', workspace)
      },
      retryPageBuilderSessionImpl: retryPageBuilderSession,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(HomePage))
    })

    const textarea = renderer.root.findByType('textarea')
    await act(async () => {
      textarea.props.onChange({ target: { value: '生成一个营销落地页' } })
    })

    const submitButton = renderer.root.findByType('button')
    await act(async () => {
      submitButton.props.onClick()
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('重试创建会话')

    const retryButton = renderer.root.findAllByType('button').find((button) => button.props.children === '重试创建会话')
    expect(retryButton).toBeDefined()

    await act(async () => {
      retryButton!.props.onClick()
    })

    expect(createPageBuilderProject).toHaveBeenCalledTimes(0)
    expect(retryPageBuilderSession).toHaveBeenCalledWith(workspace.id, expect.any(Object))
    expect(location.pathname).toBe(buildBuilderPath(workspace.id, retriedSession.id))
    expect(readBootstrapPayload(sessionStorage, retriedSession.id)).toEqual({
      sessionId: retriedSession.id,
      workspaceId: workspace.id,
      initialPrompt: '生成一个营销落地页',
    })
  })
})
