import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import type { AgentSessionMeta, PageBuilderProjectSummary } from '@ai-page-builder/shared'
import { buildBuilderPath } from '@page-builder/lib/routes'

function installWindowHarness(initialPathname = '/') {
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
  const open = mock((_url?: string | URL, _target?: string, _features?: string) => ({}))

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      history,
      location,
      dispatchEvent,
      open,
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

  return { location, open }
}

async function loadHistorySection(options: {
  projects?: PageBuilderProjectSummary[]
  createSessionImpl?: (title?: string, workspaceId?: string) => Promise<AgentSessionMeta>
  deleteProjectImpl?: (workspaceId: string) => Promise<void>
  releaseLockImpl?: (workspaceId: string, lockId: string, payload: { holderId: string }) => Promise<void>
  toastErrorImpl?: (message: string) => void
}) {
  const listPageBuilderProjects = mock(async () => options.projects ?? [])
  const acquirePageBuilderEditLock = mock(async () => {
    throw new Error('首页不应直接获取 page-builder 编辑锁')
  })
  const createSession = mock(
    options.createSessionImpl
      ?? (async (title?: string, workspaceId?: string) => ({
        id: 'session-created',
        title: title ?? '新 Agent 会话',
        workspaceId,
        createdAt: 1,
        updatedAt: 1,
      })),
  )
  const deletePageBuilderProject = mock(options.deleteProjectImpl ?? (async () => {}))
  const releasePageBuilderEditLock = mock(options.releaseLockImpl ?? (async () => {}))
  const toastError = options.toastErrorImpl ?? mock(() => {})

  mock.module('@/lib/api', () => ({
    api: {
      listPageBuilderProjects,
      acquirePageBuilderEditLock,
      createSession,
      deletePageBuilderProject,
      releasePageBuilderEditLock,
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

  mock.module('sonner', () => ({
    toast: {
      error: toastError,
    },
  }))

  const module = await import(`./PageBuilderHistorySection.tsx?test=${Date.now()}-${Math.random()}`)

  return {
    PageBuilderHistorySection: module.PageBuilderHistorySection,
    listPageBuilderProjects,
    acquirePageBuilderEditLock,
    createSession,
    deletePageBuilderProject,
    releasePageBuilderEditLock,
    toastError,
  }
}

function createProject(overrides: Partial<PageBuilderProjectSummary> = {}): PageBuilderProjectSummary {
  return {
    workspaceId: 'workspace-1',
    workspaceName: 'History Project',
    workspaceSlug: 'history-project',
    createdAt: 1710000000000,
    lastActiveAt: 1710001000000,
    latestSessionId: 'session-1',
    activeSessionId: null,
    previewUrl: '/api/workspaces/workspace-1/preview/',
    editState: { status: 'available' },
    ...overrides,
  }
}

afterEach(() => {
  mock.restore()
  Reflect.deleteProperty(globalThis, 'window')
  Reflect.deleteProperty(globalThis, 'PopStateEvent')
})

describe('PageBuilderHistorySection', () => {
  test('renders project cards from page-builder history summaries', async () => {
    installWindowHarness()
    const project = createProject()

    const { PageBuilderHistorySection, listPageBuilderProjects } = await loadHistorySection({
      projects: [project],
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderHistorySection))
    })

    const historyGrid = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-history-grid')
    )

    expect(listPageBuilderProjects).toHaveBeenCalledTimes(1)
    expect(historyGrid.props.className).toContain('md:grid-cols-3')
    expect(historyGrid.props.className).not.toContain('md:grid-cols-2')
    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('历史记录')
    expect(json).toContain('History Project')
  })

  test('preview action opens the project preview url in a new window', async () => {
    const { open } = installWindowHarness()
    const project = createProject()

    const { PageBuilderHistorySection } = await loadHistorySection({
      projects: [project],
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderHistorySection))
    })

    const previewButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '预览项目')
    expect(previewButton).toBeDefined()

    await act(async () => {
      previewButton!.props.onClick()
    })

    expect(open).toHaveBeenCalledWith(project.previewUrl, '_blank', 'noopener,noreferrer')
  })

  test('edit action reuses the latest session when one exists', async () => {
    const { location, open } = installWindowHarness()
    const project = createProject()

    const { PageBuilderHistorySection, acquirePageBuilderEditLock, createSession } = await loadHistorySection({
      projects: [project],
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderHistorySection))
    })

    const editButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '编辑项目')
    expect(editButton).toBeDefined()

    await act(async () => {
      await editButton!.props.onClick()
    })

    expect(acquirePageBuilderEditLock).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith(buildBuilderPath(project.workspaceId, 'session-1'), '_blank', 'noopener,noreferrer')
    expect(location.pathname).toBe('/')
  })

  test('edit action prefers the active session over the latest session', async () => {
    const { location, open } = installWindowHarness()
    const project = createProject({
      latestSessionId: 'session-latest',
      activeSessionId: 'session-active',
      editState: {
        status: 'locked',
        reason: 'agent',
        activeSessionId: 'session-active',
      },
    })

    const { PageBuilderHistorySection, acquirePageBuilderEditLock, createSession } = await loadHistorySection({
      projects: [project],
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderHistorySection))
    })

    const editButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '编辑项目')
    expect(editButton).toBeDefined()

    await act(async () => {
      await editButton!.props.onClick()
    })

    expect(acquirePageBuilderEditLock).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith(buildBuilderPath(project.workspaceId, 'session-active'), '_blank', 'noopener,noreferrer')
    expect(location.pathname).toBe('/')
  })

  test('edit action preserves the public base path when opening an existing project', async () => {
    const { open } = installWindowHarness('/pagebuilder/')
    const project = createProject()
    const originalBaseUrl = import.meta.env.BASE_URL
    import.meta.env.BASE_URL = '/pagebuilder/'

    try {
      const { PageBuilderHistorySection } = await loadHistorySection({
        projects: [project],
      })

      let renderer!: ReturnType<typeof create>
      await act(async () => {
        renderer = create(React.createElement(PageBuilderHistorySection))
      })

      const editButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '编辑项目')
      expect(editButton).toBeDefined()

      await act(async () => {
        await editButton!.props.onClick()
      })

      expect(open).toHaveBeenCalledWith(
        buildBuilderPath(project.workspaceId, 'session-1', '/pagebuilder'),
        '_blank',
        'noopener,noreferrer',
      )
    } finally {
      import.meta.env.BASE_URL = originalBaseUrl
    }
  })


  test('edit action creates a new session when the project has no latest session', async () => {
    const { location, open } = installWindowHarness()
    const project = createProject({
      latestSessionId: null,
      previewUrl: null,
    })
    const createdSession: AgentSessionMeta = {
      id: 'session-new',
      title: '新 Agent 会话',
      workspaceId: project.workspaceId,
      createdAt: 2,
      updatedAt: 2,
    }

    const { PageBuilderHistorySection, acquirePageBuilderEditLock, createSession } = await loadHistorySection({
      projects: [project],
      createSessionImpl: async () => createdSession,
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderHistorySection))
    })

    const editButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '编辑项目')
    expect(editButton).toBeDefined()

    await act(async () => {
      await editButton!.props.onClick()
    })

    expect(acquirePageBuilderEditLock).not.toHaveBeenCalled()
    expect(createSession).toHaveBeenCalledWith(undefined, project.workspaceId)
    expect(open).toHaveBeenCalledWith(buildBuilderPath(project.workspaceId, createdSession.id), '_blank', 'noopener,noreferrer')
    expect(location.pathname).toBe('/')
  })

  test('edit action does not acquire or release a lock when session creation fails', async () => {
    const { open } = installWindowHarness()
    const project = createProject({
      latestSessionId: null,
      previewUrl: null,
    })
    const createError = new Error('创建会话失败')

    const {
      PageBuilderHistorySection,
      acquirePageBuilderEditLock,
      releasePageBuilderEditLock,
    } = await loadHistorySection({
      projects: [project],
      createSessionImpl: async () => {
        throw createError
      },
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderHistorySection))
    })

    const editButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '编辑项目')
    expect(editButton).toBeDefined()

    await act(async () => {
      await expect(editButton!.props.onClick()).rejects.toThrow(createError)
    })

    expect(acquirePageBuilderEditLock).not.toHaveBeenCalled()
    expect(releasePageBuilderEditLock).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  test('locked project edit action opens the builder instead of intercepting on the home page', async () => {
    const { open } = installWindowHarness()
    const project = createProject({
      editState: {
        status: 'locked',
        reason: 'editor',
      },
    })

    const {
      PageBuilderHistorySection,
      acquirePageBuilderEditLock,
      listPageBuilderProjects,
    } = await loadHistorySection({
      projects: [project],
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderHistorySection))
    })

    const editButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '编辑项目')
    expect(editButton).toBeDefined()
    expect(editButton!.props.disabled).not.toBe(true)

    await act(async () => {
      await editButton!.props.onClick()
    })

    expect(acquirePageBuilderEditLock).not.toHaveBeenCalled()
    expect(listPageBuilderProjects).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith(buildBuilderPath(project.workspaceId, 'session-1'), '_blank', 'noopener,noreferrer')
  })

  test('locked project preview action still opens preview without acquiring a lock', async () => {
    const { open } = installWindowHarness()
    const project = createProject({
      editState: {
        status: 'locked',
        reason: 'editor',
      },
    })

    const {
      PageBuilderHistorySection,
      acquirePageBuilderEditLock,
      listPageBuilderProjects,
    } = await loadHistorySection({
      projects: [project],
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderHistorySection))
    })

    const editButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '编辑项目')
    expect(editButton).toBeDefined()
    expect(editButton!.props.disabled).not.toBe(true)

    const previewButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '查看项目')
    expect(previewButton).toBeDefined()

    await act(async () => {
      previewButton!.props.onClick()
    })

    expect(acquirePageBuilderEditLock).not.toHaveBeenCalled()
    expect(listPageBuilderProjects).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith(project.previewUrl, '_blank', 'noopener,noreferrer')
  })

  test('delete action removes the project card after confirmation', async () => {
    installWindowHarness()
    const project = createProject()

    const { PageBuilderHistorySection, deletePageBuilderProject } = await loadHistorySection({
      projects: [project],
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderHistorySection))
    })

    const deleteButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '删除项目')
    expect(deleteButton).toBeDefined()

    await act(async () => {
      deleteButton!.props.onClick()
    })

    const confirmButton = renderer.root.findAllByType('button').find((button) => button.props.children === '删除项目')
    expect(confirmButton).toBeDefined()

    await act(async () => {
      await confirmButton!.props.onClick()
    })

    expect(deletePageBuilderProject).toHaveBeenCalledWith(project.workspaceId)
    expect(JSON.stringify(renderer.toJSON())).not.toContain('History Project')
  })

  test('delete failure uses a lightweight toast instead of the inline history error banner', async () => {
    installWindowHarness()
    const project = createProject()
    const deleteError = new Error('该项目当前有其他编辑会话正在进行，请稍后再试')

    const { PageBuilderHistorySection, deletePageBuilderProject, toastError } = await loadHistorySection({
      projects: [project],
      deleteProjectImpl: async () => {
        throw deleteError
      },
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderHistorySection))
    })

    const deleteButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '删除项目')
    expect(deleteButton).toBeDefined()

    await act(async () => {
      deleteButton!.props.onClick()
    })

    const confirmButton = renderer.root.findAllByType('button').find((button) => button.props.children === '删除项目')
    expect(confirmButton).toBeDefined()

    await act(async () => {
      await confirmButton!.props.onClick()
    })

    expect(deletePageBuilderProject).toHaveBeenCalledWith(project.workspaceId)
    expect(toastError).toHaveBeenCalledWith('该项目当前有其他编辑会话正在进行，请稍后再试')
    expect(JSON.stringify(renderer.toJSON())).not.toContain('page-builder-home-history-feedback')
  })

  test('delete confirmation dialog uses the dedicated compact layout classes', async () => {
    installWindowHarness()
    const project = createProject()

    const { PageBuilderHistorySection } = await loadHistorySection({
      projects: [project],
    })

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(React.createElement(PageBuilderHistorySection))
    })

    const deleteButton = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === '删除项目')
    expect(deleteButton).toBeDefined()

    await act(async () => {
      deleteButton!.props.onClick()
    })

    const dialogSurface = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-delete-dialog')
    )
    const dialogHeader = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-delete-dialog-header')
    )
    const dialogTitle = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-delete-dialog-title')
    )
    const dialogDescription = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-delete-dialog-description')
    )
    const dialogFooter = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-delete-dialog-footer')
    )
    const cancelButton = renderer.root.findAllByType('button').find((button) => button.props.children === '取消')
    const confirmButton = renderer.root.findAllByType('button').find((button) => button.props.children === '删除项目')

    expect(dialogSurface.props.className).toContain('page-builder-home-delete-dialog')
    expect(dialogHeader.props.className).toContain('page-builder-home-delete-dialog-header')
    expect(dialogTitle.props.className).toContain('page-builder-home-delete-dialog-title')
    expect(dialogDescription.props.className).toContain('page-builder-home-delete-dialog-description')
    expect(dialogFooter.props.className).toContain('page-builder-home-delete-dialog-footer')
    expect(cancelButton!.props.className).toContain('page-builder-home-delete-dialog-cancel')
    expect(confirmButton!.props.className).toContain('page-builder-home-delete-dialog-confirm')
  })
})
