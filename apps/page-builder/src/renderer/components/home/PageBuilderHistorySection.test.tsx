import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import type { AgentSessionMeta, PageBuilderProjectSummary } from '@proma/shared'
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
  const open = mock(() => ({}))

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
}) {
  const listPageBuilderProjects = mock(async () => options.projects ?? [])
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

  mock.module('@/lib/api', () => ({
    api: {
      listPageBuilderProjects,
      createSession,
      deletePageBuilderProject,
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

  const module = await import(`./PageBuilderHistorySection.tsx?test=${Date.now()}-${Math.random()}`)

  return {
    PageBuilderHistorySection: module.PageBuilderHistorySection,
    listPageBuilderProjects,
    createSession,
    deletePageBuilderProject,
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
    const project: PageBuilderProjectSummary = {
      workspaceId: 'workspace-1',
      workspaceName: 'History Project',
      workspaceSlug: 'history-project',
      createdAt: 1710000000000,
      lastActiveAt: 1710001000000,
      latestSessionId: 'session-1',
      previewUrl: '/api/workspaces/workspace-1/preview/',
    }

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
    const project: PageBuilderProjectSummary = {
      workspaceId: 'workspace-1',
      workspaceName: 'History Project',
      workspaceSlug: 'history-project',
      createdAt: 1710000000000,
      lastActiveAt: 1710001000000,
      latestSessionId: 'session-1',
      previewUrl: '/api/workspaces/workspace-1/preview/',
    }

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
    const project: PageBuilderProjectSummary = {
      workspaceId: 'workspace-1',
      workspaceName: 'History Project',
      workspaceSlug: 'history-project',
      createdAt: 1710000000000,
      lastActiveAt: 1710001000000,
      latestSessionId: 'session-1',
      previewUrl: '/api/workspaces/workspace-1/preview/',
    }

    const { PageBuilderHistorySection, createSession } = await loadHistorySection({
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

    expect(createSession).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith(buildBuilderPath(project.workspaceId, 'session-1'), '_blank', 'noopener,noreferrer')
    expect(location.pathname).toBe('/')
  })

  test('edit action creates a new session when the project has no latest session', async () => {
    const { location, open } = installWindowHarness()
    const project: PageBuilderProjectSummary = {
      workspaceId: 'workspace-1',
      workspaceName: 'History Project',
      workspaceSlug: 'history-project',
      createdAt: 1710000000000,
      lastActiveAt: 1710001000000,
      latestSessionId: null,
      previewUrl: null,
    }
    const createdSession: AgentSessionMeta = {
      id: 'session-new',
      title: '新 Agent 会话',
      workspaceId: project.workspaceId,
      createdAt: 2,
      updatedAt: 2,
    }

    const { PageBuilderHistorySection, createSession } = await loadHistorySection({
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

    expect(createSession).toHaveBeenCalledWith(undefined, project.workspaceId)
    expect(open).toHaveBeenCalledWith(buildBuilderPath(project.workspaceId, createdSession.id), '_blank', 'noopener,noreferrer')
    expect(location.pathname).toBe('/')
  })

  test('delete action removes the project card after confirmation', async () => {
    installWindowHarness()
    const project: PageBuilderProjectSummary = {
      workspaceId: 'workspace-1',
      workspaceName: 'History Project',
      workspaceSlug: 'history-project',
      createdAt: 1710000000000,
      lastActiveAt: 1710001000000,
      latestSessionId: 'session-1',
      previewUrl: '/api/workspaces/workspace-1/preview/',
    }

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

  test('delete confirmation dialog uses the dedicated compact layout classes', async () => {
    installWindowHarness()
    const project: PageBuilderProjectSummary = {
      workspaceId: 'workspace-1',
      workspaceName: 'History Project',
      workspaceSlug: 'history-project',
      createdAt: 1710000000000,
      lastActiveAt: 1710001000000,
      latestSessionId: 'session-1',
      previewUrl: '/api/workspaces/workspace-1/preview/',
    }

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
