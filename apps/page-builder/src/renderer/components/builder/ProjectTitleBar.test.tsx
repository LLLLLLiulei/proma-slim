import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { useHydrateAtoms } from 'jotai/utils'
import { act, create } from 'react-test-renderer'
import type { AgentWorkspace } from '@proma/shared'
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
})
