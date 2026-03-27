import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { useHydrateAtoms } from 'jotai/utils'
import { act, create } from 'react-test-renderer'
import type { AgentSessionMeta, AgentWorkspace, WorkspaceDirectoryContext } from '@proma/shared'
import {
  agentSessionDraftsAtom,
  agentSessionsAtom,
  agentStreamingStatesAtom,
  agentWorkspacesAtom,
  workspaceDirectoryContextMapAtom,
} from '@/atoms/agent-atoms'

interface RichTextInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}

function createWorkspaceContext(workspaceId: string): WorkspaceDirectoryContext {
  return {
    workspaceId,
    workspaceName: 'Page Builder Project',
    workspaceSlug: 'page-builder-project',
    workspacePath: '/tmp/page-builder-project',
    workspaceFilesPath: '/tmp/page-builder-project/workspace-files',
    skillsPath: '/tmp/page-builder-project/skills',
    mcpConfigPath: '/tmp/page-builder-project/mcp.json',
    memoryFilePath: '/tmp/page-builder-project/memory/MEMORY.md',
    attachedDirectories: [],
  }
}

function HydrateAgentViewState({
  children,
  sessions,
  workspaces,
}: {
  children: React.ReactNode
  sessions: AgentSessionMeta[]
  workspaces: AgentWorkspace[]
}): React.ReactElement {
  useHydrateAtoms([
    [agentSessionsAtom, sessions],
    [agentWorkspacesAtom, workspaces],
    [agentSessionDraftsAtom, new Map()],
    [agentStreamingStatesAtom, new Map()],
    [workspaceDirectoryContextMapAtom, new Map()],
  ])
  return <>{children}</>
}

async function loadAgentView(options?: {
  sendMessage?: ReturnType<typeof mock>
  getSessionMessages?: () => Promise<unknown[]>
}) {
  let lastRichTextInputProps: RichTextInputProps | null = null

  const sendMessage = options?.sendMessage ?? mock(async () => undefined)
  const stopSession = mock(async () => undefined)
  const getSessionMessages = options?.getSessionMessages ?? (async () => [])

  mock.module('./AgentHeader', () => ({
    AgentHeader() {
      return React.createElement('div', { 'data-testid': 'agent-header' })
    },
  }))
  mock.module('./AgentMessages', () => ({
    AgentMessages() {
      return React.createElement('div', { 'data-testid': 'agent-messages' })
    },
  }))
  mock.module('./PermissionBanner', () => ({
    PermissionBanner() {
      return React.createElement('div', { 'data-testid': 'permission-banner' })
    },
  }))
  mock.module('./AskUserBanner', () => ({
    AskUserBanner() {
      return React.createElement('div', { 'data-testid': 'ask-user-banner' })
    },
  }))
  mock.module('./AgentPendingAttachments', () => ({
    AgentPendingAttachments() {
      return React.createElement('div', { 'data-testid': 'agent-pending-attachments' })
    },
  }))
  mock.module('@/components/ai-elements/rich-text-input', () => ({
    RichTextInput(props: RichTextInputProps) {
      lastRichTextInputProps = props
      return React.createElement('div', {
        'data-testid': 'rich-text-input',
        'data-value': props.value,
      })
    },
  }))
  mock.module('@/hooks/useGlobalAgentListeners', () => ({
    useGlobalAgentListeners() {
      return {
        sendMessage,
        stopSession,
      }
    },
  }))
  mock.module('@/lib/api', () => ({
    api: {
      getStatus: async () => ({
        ok: true,
        apiKeyConfigured: true,
        sdkCliAvailable: true,
      }),
      getSessionMessages,
      getWorkspaceContext: async (workspaceId: string) => createWorkspaceContext(workspaceId),
    },
  }))

  const module = await import(`./AgentView.tsx?test=${Date.now()}-${Math.random()}`)

  return {
    AgentView: module.AgentView,
    sendMessage,
    stopSession,
    getLastRichTextInputProps() {
      return lastRichTextInputProps
    },
  }
}

afterEach(() => {
  mock.restore()
})

describe('AgentView rendering extension points', () => {
  test('renders custom leading composer actions without replacing the shared composer shell', async () => {
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: 'Page Builder Project',
      slug: 'page-builder-project',
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

    const { AgentView } = await loadAgentView()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView
              sessionId={session.id}
              composerLeadingActions={(
                <button type="button">
                  从页面中选择
                </button>
              )}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('从页面中选择')
    expect(json).toContain('Enter 发送，Shift+Enter 换行。')
  })

  test('calls onMessageSent only after a decorated message is sent successfully', async () => {
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: 'Page Builder Project',
      slug: 'page-builder-project',
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
    const onMessageSent = mock(() => {})
    const { AgentView, sendMessage, getLastRichTextInputProps } = await loadAgentView()

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView
              sessionId={session.id}
              messageDecorator={(userMessage: string) => `Hidden selector: #hero\n\n${userMessage}`}
              onMessageSent={onMessageSent}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      getLastRichTextInputProps()?.onChange('修改这个区块')
    })
    await act(async () => {
      getLastRichTextInputProps()?.onSubmit()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sendMessage).toHaveBeenCalledWith(session.id, expect.objectContaining({
      userMessage: '修改这个区块',
      composedUserMessage: 'Hidden selector: #hero\n\n修改这个区块',
      workspaceId: workspace.id,
    }))
    expect(onMessageSent).toHaveBeenCalledWith('修改这个区块')
  })

  test('does not call onMessageSent when the send request fails', async () => {
    const workspace: AgentWorkspace = {
      id: 'workspace-1',
      name: 'Page Builder Project',
      slug: 'page-builder-project',
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
    const onMessageSent = mock(() => {})
    const sendMessage = mock(async () => {
      throw new Error('send failed')
    })
    const originalConsoleError = console.error
    console.error = mock(() => {}) as typeof console.error
    const { AgentView, getLastRichTextInputProps } = await loadAgentView({ sendMessage })

    try {
      await act(async () => {
        create(
          <Provider store={createStore()}>
            <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
              <AgentView
                sessionId={session.id}
                onMessageSent={onMessageSent}
              />
            </HydrateAgentViewState>
          </Provider>,
        )
        await Promise.resolve()
        await Promise.resolve()
      })

      await act(async () => {
        getLastRichTextInputProps()?.onChange('修改这个区块')
      })
      await act(async () => {
        getLastRichTextInputProps()?.onSubmit()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(onMessageSent).not.toHaveBeenCalled()
    } finally {
      console.error = originalConsoleError
    }
  })
})
