import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { useHydrateAtoms } from 'jotai/utils'
import { act, create } from 'react-test-renderer'
import type {
  AgentSessionMeta,
  AgentWorkspace,
  PageBuilderCmsAutoAgentHandoffRequest,
  PageBuilderCmsAutoAgentHandoffSettledResult,
  WorkspaceDirectoryContext,
} from '@proma/shared'
import {
  type AgentStreamState,
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
  onPasteFiles?: (files: File[]) => void
  disabled?: boolean
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
  drafts,
  streamingStates,
}: {
  children: React.ReactNode
  sessions: AgentSessionMeta[]
  workspaces: AgentWorkspace[]
  drafts?: Map<string, string>
  streamingStates?: Map<string, AgentStreamState>
}): React.ReactElement {
  useHydrateAtoms([
    [agentSessionsAtom, sessions],
    [agentWorkspacesAtom, workspaces],
    [agentSessionDraftsAtom, drafts ?? new Map()],
    [agentStreamingStatesAtom, streamingStates ?? new Map()],
    [workspaceDirectoryContextMapAtom, new Map()],
  ])
  return <>{children}</>
}

async function loadAgentView(options?: {
  reconcileSessionStreaming?: ReturnType<typeof mock>
  sendMessage?: ReturnType<typeof mock>
  getSessionMessages?: () => Promise<unknown[]>
  getSessionActivity?: (sessionId: string) => Promise<{ active: boolean }>
  toastError?: ReturnType<typeof mock>
}) {
  let lastRichTextInputProps: RichTextInputProps | null = null
  let lastPendingAttachments: unknown[] = []

  const reconcileSessionStreaming = options?.reconcileSessionStreaming ?? mock(async () => false)
  const sendMessage = options?.sendMessage ?? mock(async () => undefined)
  const stopSession = mock(async () => undefined)
  const getSessionMessages = options?.getSessionMessages ?? (async () => [])
  const getSessionActivity = options?.getSessionActivity ?? (async () => ({ active: false }))
  const toastError = options?.toastError ?? mock(() => {})

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
    AgentPendingAttachments(props: { attachments?: unknown[] }) {
      lastPendingAttachments = props.attachments ?? []
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
        reconcileSessionStreaming,
        sendMessage,
        stopSession,
      }
    },
  }))
  mock.module('sonner', () => ({
    toast: {
      error: toastError,
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
      getSessionActivity,
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
    getLastPendingAttachments() {
      return lastPendingAttachments
    },
    getToastError() {
      return toastError
    },
  }
}

afterEach(() => {
  mock.restore()
})

describe('AgentView rendering extension points', () => {
  test('disables the attachment button while streaming', async () => {
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
    const streamingStates = new Map<string, AgentStreamState>([
      [session.id, { running: true, content: '', toolActivities: [], teammates: [], startedAt: 1 }],
    ])

    const { AgentView, getLastRichTextInputProps } = await loadAgentView()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <HydrateAgentViewState
            sessions={[session]}
            streamingStates={streamingStates}
            workspaces={[workspace]}
          >
            <AgentView allowAttachments sessionId={session.id} />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const attachmentButton = renderer.root.find((node) =>
      node.type === 'button' && node.props['aria-label'] === '添加附件',
    )

    expect(getLastRichTextInputProps()?.disabled).toBe(true)
    expect(attachmentButton.props.disabled).toBe(true)
  })

  test('keeps the composer processing copy while streaming', async () => {
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
    const streamingStates = new Map<string, AgentStreamState>([
      [session.id, { running: true, content: '', toolActivities: [], teammates: [], startedAt: 1 }],
    ])

    const { AgentView } = await loadAgentView()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <HydrateAgentViewState
            sessions={[session]}
            streamingStates={streamingStates}
            workspaces={[workspace]}
          >
            <AgentView sessionId={session.id} />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('正在处理中，输入框已锁定。')
  })

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

  test('programmatic send keeps current draft and attachments while forwarding hidden payload and mentioned skills', async () => {
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
    const onProgrammaticSendSettled = mock((_result: PageBuilderCmsAutoAgentHandoffSettledResult) => {})
    const request: PageBuilderCmsAutoAgentHandoffRequest = {
      requestId: 'handoff-1',
      userMessage: '请根据刚确认的 CMS 选择结果，判断如何应用到当前区块。',
      composedUserMessage: '<cms_binding_apply_input>{"version":1}</cms_binding_apply_input>',
      mentionedSkills: ['cms-binding-apply'],
      bootstrappedSkills: ['cms-binding-apply'],
      mentionedMcpServers: ['cms'],
    }
    const { AgentView, sendMessage, getLastRichTextInputProps, getLastPendingAttachments } = await loadAgentView()
    const store = createStore()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <HydrateAgentViewState
            drafts={new Map([[session.id, '已有草稿']])}
            sessions={[session]}
            workspaces={[workspace]}
          >
            <AgentView
              sessionId={session.id}
              allowAttachments
              onProgrammaticSendSettled={onProgrammaticSendSettled}
              programmaticSendRequest={null}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const attachmentFile = new File(['cms-bytes'], 'cms.png', { type: 'image/png' })

    await act(async () => {
      getLastRichTextInputProps()?.onPasteFiles?.([attachmentFile])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastRichTextInputProps()?.value).toBe('已有草稿')
    expect(getLastPendingAttachments()).toHaveLength(1)

    await act(async () => {
      renderer.update(
        <Provider store={store}>
          <HydrateAgentViewState
            drafts={new Map([[session.id, '已有草稿']])}
            sessions={[session]}
            workspaces={[workspace]}
          >
            <AgentView
              sessionId={session.id}
              allowAttachments
              onProgrammaticSendSettled={onProgrammaticSendSettled}
              programmaticSendRequest={request}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sendMessage).toHaveBeenCalledWith(session.id, expect.objectContaining({
      userMessage: request.userMessage,
      composedUserMessage: request.composedUserMessage,
      mentionedSkills: ['cms-binding-apply'],
      bootstrappedSkills: ['cms-binding-apply'],
      mentionedMcpServers: ['cms'],
      workspaceId: workspace.id,
    }))
    expect(onProgrammaticSendSettled).toHaveBeenCalledWith({
      requestId: 'handoff-1',
      status: 'sent',
    })
    expect(getLastRichTextInputProps()?.value).toBe('已有草稿')
    expect(getLastPendingAttachments()).toHaveLength(1)
  })

  test('auto-sends the initial page-builder prompt with default mentioned skills', async () => {
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

    const { AgentView, sendMessage } = await loadAgentView()

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView
              defaultMentionedSkills={['page-builder-guided-generation']}
              initialUserMessage="生成一个企业官网"
              sessionId={session.id}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sendMessage).toHaveBeenCalledWith(session.id, expect.objectContaining({
      userMessage: '生成一个企业官网',
      mentionedSkills: ['page-builder-guided-generation'],
      workspaceId: workspace.id,
    }))
  })

  test('merges default mentioned skills into ordinary user sends', async () => {
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

    const { AgentView, sendMessage, getLastRichTextInputProps } = await loadAgentView()

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView
              defaultMentionedSkills={['page-builder-guided-generation']}
              sessionId={session.id}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      getLastRichTextInputProps()?.onChange('把页面做得更年轻一些')
    })
    await act(async () => {
      getLastRichTextInputProps()?.onSubmit()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sendMessage).toHaveBeenCalledWith(session.id, expect.objectContaining({
      userMessage: '把页面做得更年轻一些',
      mentionedSkills: ['page-builder-guided-generation'],
      workspaceId: workspace.id,
    }))
  })

  test('forwards bootstrapped skills from prepared payload during ordinary user sends', async () => {
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
    const prepareSendPayload = mock(async ({ userMessage }: { userMessage: string }) => ({
      userMessage,
      mentionedSkills: ['page-builder-guided-generation'],
      bootstrappedSkills: ['page-builder-guided-generation', 'page-builder-cms-region-authoring-guidance'],
      mentionedMcpServers: [],
    }))

    const { AgentView, sendMessage, getLastRichTextInputProps } = await loadAgentView()

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView
              prepareSendPayload={prepareSendPayload}
              sessionId={session.id}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      getLastRichTextInputProps()?.onChange('继续修改这个 CMS 区块')
    })
    await act(async () => {
      getLastRichTextInputProps()?.onSubmit()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sendMessage).toHaveBeenCalledWith(session.id, expect.objectContaining({
      userMessage: '继续修改这个 CMS 区块',
      mentionedSkills: ['page-builder-guided-generation'],
      bootstrappedSkills: ['page-builder-guided-generation', 'page-builder-cms-region-authoring-guidance'],
      workspaceId: workspace.id,
    }))
  })

  test('does not append default mentioned skills to programmatic sends with explicit skill ownership', async () => {
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
    const request: PageBuilderCmsAutoAgentHandoffRequest = {
      requestId: 'handoff-guided-skip-1',
      userMessage: '请根据刚确认的 CMS 选择结果，判断如何应用到当前区块。',
      composedUserMessage: '<cms_binding_apply_input>{"version":1}</cms_binding_apply_input>',
      mentionedSkills: ['cms-binding-apply'],
      bootstrappedSkills: ['cms-binding-apply'],
    }
    const { AgentView, sendMessage } = await loadAgentView()
    const store = createStore()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView
              defaultMentionedSkills={['page-builder-guided-generation']}
              programmaticSendRequest={null}
              sessionId={session.id}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      renderer.update(
        <Provider store={store}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView
              defaultMentionedSkills={['page-builder-guided-generation']}
              programmaticSendRequest={request}
              sessionId={session.id}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sendMessage).toHaveBeenCalledWith(session.id, expect.objectContaining({
      userMessage: request.userMessage,
      mentionedSkills: ['cms-binding-apply'],
      bootstrappedSkills: ['cms-binding-apply'],
      workspaceId: workspace.id,
    }))
  })

  test('programmatic send recovers from a stale client streaming flag after probing session activity', async () => {
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
    const onProgrammaticSendSettled = mock((_result: PageBuilderCmsAutoAgentHandoffSettledResult) => {})
    const reconcileSessionStreaming = mock(async (_sessionId: string) => false)
    const request: PageBuilderCmsAutoAgentHandoffRequest = {
      requestId: 'handoff-stale-1',
      userMessage: '请根据刚确认的 CMS 选择结果，判断如何应用到当前区块。',
      composedUserMessage: '<cms_binding_apply_input>{"version":1}</cms_binding_apply_input>',
      mentionedSkills: ['cms-binding-apply'],
      bootstrappedSkills: ['cms-binding-apply'],
    }
    const { AgentView, sendMessage } = await loadAgentView({
      reconcileSessionStreaming,
    })
    const store = createStore()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <HydrateAgentViewState
            drafts={new Map([[session.id, '已有草稿']])}
            sessions={[session]}
            streamingStates={new Map([
              [session.id, { running: true, content: '', toolActivities: [], teammates: [], startedAt: 1 }],
            ])}
            workspaces={[workspace]}
          >
            <AgentView
              sessionId={session.id}
              allowAttachments
              onProgrammaticSendSettled={onProgrammaticSendSettled}
              programmaticSendRequest={null}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      renderer.update(
        <Provider store={store}>
          <HydrateAgentViewState
            drafts={new Map([[session.id, '已有草稿']])}
            sessions={[session]}
            streamingStates={new Map([
              [session.id, { running: true, content: '', toolActivities: [], teammates: [], startedAt: 1 }],
            ])}
            workspaces={[workspace]}
          >
            <AgentView
              sessionId={session.id}
              allowAttachments
              onProgrammaticSendSettled={onProgrammaticSendSettled}
              programmaticSendRequest={request}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(reconcileSessionStreaming).toHaveBeenCalledWith(session.id, expect.objectContaining({
      passive: true,
      reason: 'mount',
      source: 'agent-view',
      workspaceId: workspace.id,
    }))
    expect(reconcileSessionStreaming).toHaveBeenCalledWith(session.id, expect.objectContaining({
      reason: 'send-while-local-busy',
      source: 'programmatic-send',
      workspaceId: workspace.id,
    }))
    expect(sendMessage).toHaveBeenCalledWith(session.id, expect.objectContaining({
      userMessage: request.userMessage,
      composedUserMessage: request.composedUserMessage,
      mentionedSkills: ['cms-binding-apply'],
      bootstrappedSkills: ['cms-binding-apply'],
      workspaceId: workspace.id,
    }))
    expect(onProgrammaticSendSettled).toHaveBeenCalledWith({
      requestId: 'handoff-stale-1',
      status: 'sent',
    })
  })

  test('auto-reconciles a stale running session on mount without waiting for another send', async () => {
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
    const reconcileSessionStreaming = mock(async (_sessionId: string) => false)
    const { AgentView } = await loadAgentView({
      reconcileSessionStreaming,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <HydrateAgentViewState
            sessions={[session]}
            streamingStates={new Map([
              [session.id, { running: true, content: '', toolActivities: [], teammates: [], startedAt: 1 }],
            ])}
            workspaces={[workspace]}
          >
            <AgentView sessionId={session.id} />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(reconcileSessionStreaming).toHaveBeenCalled()
  })

  test('probes activity after reload when the last persisted message is still from the user', async () => {
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
    const reconcileSessionStreaming = mock(async (_sessionId: string) => false)
    const { AgentView } = await loadAgentView({
      reconcileSessionStreaming,
      getSessionMessages: async () => [{
        id: 'msg-user-1',
        role: 'user',
        content: '继续处理当前页面',
        createdAt: 1,
      }],
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView sessionId={session.id} />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(reconcileSessionStreaming).toHaveBeenCalledWith(session.id, expect.objectContaining({
      passive: true,
      recoverIfActive: true,
      reason: 'message-reload-last-user',
      source: 'agent-view',
      workspaceId: workspace.id,
    }))
  })

  test('adopts backend 409 busy responses as a recovered busy state instead of surfacing a generic send failure', async () => {
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
    const busyError = Object.assign(new Error('上一条消息仍在处理中，请稍候再试'), { status: 409 })
    const reconcileSessionStreaming = mock(async (_sessionId: string) => true)
    const sendMessage = mock(async () => {
      throw busyError
    })
    const getSessionMessages = mock(async () => [])
    const toastError = mock(() => {})
    const { AgentView, getLastRichTextInputProps, getToastError } = await loadAgentView({
      reconcileSessionStreaming,
      sendMessage,
      getSessionMessages,
      toastError,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView sessionId={session.id} />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      getLastRichTextInputProps()?.onChange('请继续')
    })
    await act(async () => {
      getLastRichTextInputProps()?.onSubmit()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(reconcileSessionStreaming).toHaveBeenCalledWith(session.id, expect.objectContaining({
      passive: true,
      recoverIfActive: true,
      reason: 'send-rejected-active-session',
      source: 'user-send',
      workspaceId: workspace.id,
    }))
    expect(getToastError()).toHaveBeenCalledWith('当前会话正在处理中，请稍候再试')
    expect(getSessionMessages).toHaveBeenCalledTimes(2)
  })

  test('allows host-side beforeSendMessage interception to reroute a draft without sending it to the agent runtime', async () => {
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
    const beforeSendMessage = mock(async () => ({
      handled: true,
      clearComposer: true,
    }))
    const onMessageSent = mock(() => {})
    const { AgentView, sendMessage, getLastRichTextInputProps } = await loadAgentView()

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView
              sessionId={session.id}
              beforeSendMessage={beforeSendMessage}
              onMessageSent={onMessageSent}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      getLastRichTextInputProps()?.onChange('把这个列表换成另一个栏目')
    })
    await act(async () => {
      getLastRichTextInputProps()?.onSubmit()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(beforeSendMessage).toHaveBeenCalledWith({
      userMessage: '把这个列表换成另一个栏目',
      workspaceId: workspace.id,
      sessionId: session.id,
    })
    expect(sendMessage).not.toHaveBeenCalled()
    expect(onMessageSent).not.toHaveBeenCalled()
    expect(getLastRichTextInputProps()?.value).toBe('')
  })
})
