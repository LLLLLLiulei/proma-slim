import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { useHydrateAtoms } from 'jotai/utils'
import { act, create } from 'react-test-renderer'
import type { AgentWorkspace } from '@ai-page-builder/shared'
import { builderActiveTabAtom } from '@page-builder/atoms/builder-code-atoms'
import { agentWorkspacesAtom } from '@/atoms/agent-atoms'
import { api } from '@/lib/api'
import { ProjectTitleBar } from './ProjectTitleBar'

const originalUpdateWorkspace = api.updateWorkspace

afterEach(() => {
  mock.restore()
  api.updateWorkspace = originalUpdateWorkspace
})

function HydrateWorkspaces({
  children,
  workspaces,
}: {
  children: React.ReactNode
  workspaces: AgentWorkspace[]
}): React.ReactElement {
  useHydrateAtoms([[agentWorkspacesAtom, workspaces]])
  return <>{children}</>
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


function findButtonByText(renderer: ReturnType<typeof create>, label: string) {
  return renderer.root.find((node) =>
    node.type === 'button'
    && flattenElementText(node.props.children).trim() === label,
  )
}

function findButtonByAriaLabel(renderer: ReturnType<typeof create>, label: string) {
  return renderer.root.find((node) =>
    node.type === 'button'
    && node.props['aria-label'] === label,
  )
}

describe('ProjectTitleBar', () => {
  test('renders tabs on the left and the current workspace name on the right', () => {
    const store = createStore()
    const workspaces: AgentWorkspace[] = [{
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }]

    const renderer = create(
      <Provider store={store}>
        <HydrateWorkspaces workspaces={workspaces}>
          <ProjectTitleBar workspaceId="workspace-1" />
        </HydrateWorkspaces>
      </Provider>,
    )

    const titleBar = renderer.toJSON() as unknown as {
      props: { className: string }
      children: Array<{ props: Record<string, unknown> }>
    }
    const [tabGroup, projectTitle] = titleBar.children
    const chatTab = findButtonByText(renderer, '对话')
    const codeTab = findButtonByText(renderer, '代码')
    const editButton = findButtonByAriaLabel(renderer, '编辑项目名')
    const titleBarClasses = String(titleBar.props.className).split(/\s+/)

    expect(titleBarClasses).toContain('min-h-11')
    expect(titleBarClasses).toContain('py-1.5')
    expect(titleBarClasses).not.toContain('h-11')
    expect(tabGroup?.props.role).toBe('tablist')
    expect(chatTab.props.className).toContain('h-8')
    expect(codeTab.props.className).toContain('h-8')
    expect(editButton.props.className).toContain('size-8')
    expect(JSON.stringify(projectTitle)).toContain('未命名项目')
    expect(JSON.stringify(renderer.toJSON())).not.toContain('另存模板')
  })

  test('updates the workspace name when project name editing is enabled', async () => {
    const store = createStore()
    const workspaces: AgentWorkspace[] = [{
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      createdAt: 1,
      updatedAt: 1,
    }]

    const updateWorkspace = mock(async (workspaceId: string, updates: { name?: string }) => ({
      id: workspaceId,
      name: updates.name ?? '未命名项目',
      slug: 'workspace-1',
      createdAt: 1,
      updatedAt: 2,
    }))
    api.updateWorkspace = updateWorkspace

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <HydrateWorkspaces workspaces={workspaces}>
            <ProjectTitleBar workspaceId="workspace-1" />
          </HydrateWorkspaces>
        </Provider>,
      )
    })

    await act(async () => {
      findButtonByAriaLabel(renderer, '编辑项目名').props.onClick()
    })

    const input = renderer.root.findByType('input')
    await act(async () => {
      input.props.onChange({ target: { value: '营销官网项目' } })
    })

    await act(async () => {
      input.props.onKeyDown({
        key: 'Enter',
        preventDefault() {},
      })
    })

    expect(updateWorkspace).toHaveBeenCalledWith('workspace-1', { name: '营销官网项目' })
    expect(store.get(agentWorkspacesAtom)[0]?.name).toBe('营销官网项目')
  })

  test('notifies parent when a page-builder title update is rejected by the edit lock', async () => {
    const store = createStore()
    const workspaces: AgentWorkspace[] = [{
      id: 'workspace-1',
      name: '未命名项目',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }]
    const editLockError = Object.assign(new Error('编辑锁已失效，请从首页重新进入编辑'), { status: 409 })
    const updateWorkspace = mock(async () => {
      throw editLockError
    })
    const onEditLockRejected = mock(() => {})
    api.updateWorkspace = updateWorkspace

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <HydrateWorkspaces workspaces={workspaces}>
            <ProjectTitleBar
              editLock={{ lockId: 'lock-1', holderId: 'holder-1' }}
              onEditLockRejected={onEditLockRejected}
              workspaceId="workspace-1"
            />
          </HydrateWorkspaces>
        </Provider>,
      )
    })

    await act(async () => {
      findButtonByAriaLabel(renderer, '编辑项目名').props.onClick()
    })

    const input = renderer.root.findByType('input')
    await act(async () => {
      input.props.onChange({ target: { value: '营销官网项目' } })
    })

    await act(async () => {
      input.props.onKeyDown({
        key: 'Enter',
        preventDefault() {},
      })
      await Promise.resolve()
    })

    expect(updateWorkspace).toHaveBeenCalledWith('workspace-1', { name: '营销官网项目' }, {
      editLock: { lockId: 'lock-1', holderId: 'holder-1' },
    })
    expect(onEditLockRejected).toHaveBeenCalledWith(editLockError)
    expect(store.get(agentWorkspacesAtom)[0]?.name).toBe('未命名项目')
  })

  test('keeps the workspace name read-only when project name editing is disabled', () => {
    const store = createStore()
    const workspaces: AgentWorkspace[] = [{
      id: 'workspace-1',
      name: 'CMS 专题',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }]

    const renderer = create(
      <Provider store={store}>
        <HydrateWorkspaces workspaces={workspaces}>
          <ProjectTitleBar
            projectNameEditable={false}
            workspaceId="workspace-1"
          />
        </HydrateWorkspaces>
      </Provider>,
    )

    expect(JSON.stringify(renderer.toJSON())).toContain('CMS 专题')
    expect(renderer.root.findAll((node) =>
      node.type === 'button' && node.props['aria-label'] === '编辑项目名'
    )).toHaveLength(0)
  })

  test('hides project name and edit affordance when projectName is hidden', () => {
    const store = createStore()
    const workspaces: AgentWorkspace[] = [{
      id: 'workspace-1',
      name: '营销专题',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }]

    const renderer = create(
      <Provider store={store}>
        <HydrateWorkspaces workspaces={workspaces}>
          <ProjectTitleBar
            hiddenToolbarItems={['projectName']}
            workspaceId="workspace-1"
          />
        </HydrateWorkspaces>
      </Provider>,
    )

    expect(JSON.stringify(renderer.toJSON())).not.toContain('营销专题')
    expect(renderer.root.findAll((node) =>
      node.type === 'button' && node.props['aria-label'] === '编辑项目名'
    )).toHaveLength(0)
  })

  test('falls back to code tab when chat tab is hidden', async () => {
    const store = createStore()
    store.set(builderActiveTabAtom, 'chat')
    const workspaces: AgentWorkspace[] = [{
      id: 'workspace-1',
      name: '营销专题',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }]

    await act(async () => {
      create(
        <Provider store={store}>
          <HydrateWorkspaces workspaces={workspaces}>
            <ProjectTitleBar
              hiddenToolbarItems={['chatTab']}
              workspaceId="workspace-1"
            />
          </HydrateWorkspaces>
        </Provider>,
      )
    })

    expect(store.get(builderActiveTabAtom)).toBe('code')
  })

  test('does not render an empty top bar when tabs and project name are hidden', () => {
    const store = createStore()
    const workspaces: AgentWorkspace[] = [{
      id: 'workspace-1',
      name: '营销专题',
      slug: 'workspace-1',
      template: 'page-builder',
      createdAt: 1,
      updatedAt: 1,
    }]

    const renderer = create(
      <Provider store={store}>
        <HydrateWorkspaces workspaces={workspaces}>
          <ProjectTitleBar
            hiddenToolbarItems={['chatTab', 'codeTab', 'projectName']}
            workspaceId="workspace-1"
          />
        </HydrateWorkspaces>
      </Provider>,
    )

    expect(renderer.toJSON()).toBeNull()
  })
})
