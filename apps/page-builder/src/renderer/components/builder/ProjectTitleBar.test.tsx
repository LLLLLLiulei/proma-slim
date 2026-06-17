import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { useHydrateAtoms } from 'jotai/utils'
import { act, create } from 'react-test-renderer'
import type { AgentWorkspace } from '@ai-page-builder/shared'
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

describe('ProjectTitleBar', () => {
  test('renders the current workspace name as the project title', () => {
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

    const json = renderer.toJSON()
    expect(JSON.stringify(json)).toContain('未命名项目')
  })

  test('updates the workspace name instead of touching session metadata', async () => {
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

    const buttons = renderer.root.findAll((node) => node.type === 'button')

    await act(async () => {
      buttons[0]!.props.onClick()
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

    const buttons = renderer.root.findAll((node) => node.type === 'button')
    await act(async () => {
      buttons[0]!.props.onClick()
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

  test('renders the save-template action and invokes the callback', async () => {
    const store = createStore()
    const onRequestSaveTemplate = mock(() => {})
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
            onRequestSaveTemplate={onRequestSaveTemplate}
            workspaceId="workspace-1"
          />
        </HydrateWorkspaces>
      </Provider>,
    )

    await act(async () => {
      findButtonByText(renderer, '另存模板').props.onClick()
    })

    expect(onRequestSaveTemplate).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(renderer.toJSON())).toContain('营销专题')
  })

  test('does not invoke the save-template action when it is disabled', async () => {
    const store = createStore()
    const onRequestSaveTemplate = mock(() => {})
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
            onRequestSaveTemplate={onRequestSaveTemplate}
            saveTemplateDisabled
            workspaceId="workspace-1"
          />
        </HydrateWorkspaces>
      </Provider>,
    )

    const button = findButtonByText(renderer, '另存模板')
    expect(button.props.disabled).toBe(true)

    await act(async () => {
      button.props.onClick()
    })

    expect(onRequestSaveTemplate).not.toHaveBeenCalled()
  })
})
