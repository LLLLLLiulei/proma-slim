import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { useHydrateAtoms } from 'jotai/utils'
import { act, create } from 'react-test-renderer'
import type {
  AgentModelOptionsResponse,
  AgentSessionMeta,
  AgentWorkspace,
  PageBuilderCmsAutoAgentHandoffRequest,
  PageBuilderCmsAutoAgentHandoffSettledResult,
  WorkspaceDirectoryContext,
} from '@ai-page-builder/shared'
import {
  type AgentStreamState,
  agentSessionDraftsAtom,
  agentSessionsAtom,
  agentStreamingStatesAtom,
  agentWorkspacesAtom,
  workspaceDirectoryContextMapAtom,
} from '@/atoms/agent-atoms'

interface PlainTextInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onPasteFiles?: (files: File[]) => void
  placeholder?: string
  disabled?: boolean
  submitDisabled?: boolean
}

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function collectRenderedText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectRenderedText).join('')

  if (typeof node === 'object' && 'children' in node) {
    return collectRenderedText((node as { children?: unknown }).children)
  }

  return ''
}

function installLocalStorageMock(initial: Record<string, string> = {}): Map<string, string> {
  const store = new Map(Object.entries(initial))
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value))
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    },
  })
  return store
}

function createDefaultModelOptions(): AgentModelOptionsResponse {
  return {
    defaultModelOptionId: 'zhipu.glm',
    providers: [
      {
        providerId: 'zhipu',
        providerType: 'zhipu',
        providerLabel: '智谱',
        models: [
          {
            modelOptionId: 'zhipu.glm',
            providerId: 'zhipu',
            providerType: 'zhipu',
            providerLabel: '智谱',
            modelId: 'glm',
            label: 'GLM',
            model: 'glm-5.2[1m]',
            contextWindow: 1000000,
          },
        ],
      },
      {
        providerId: 'deepseek',
        providerType: 'deepseek',
        providerLabel: 'DeepSeek',
        models: [
          {
            modelOptionId: 'deepseek.chat',
            providerId: 'deepseek',
            providerType: 'deepseek',
            providerLabel: 'DeepSeek',
            modelId: 'chat',
            label: 'DeepSeek Chat',
            model: 'deepseek-chat',
          },
        ],
      },
    ],
  }
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
  getAgentModelOptions?: ReturnType<typeof mock>
  modelOptions?: AgentModelOptionsResponse
  toastError?: ReturnType<typeof mock>
  trackAgentMessagesRenders?: ReturnType<typeof mock>
  memoizeMockedAgentMessages?: boolean
}) {
  let lastPlainTextInputProps: PlainTextInputProps | null = null
  let lastPendingAttachments: unknown[] = []

  const reconcileSessionStreaming = options?.reconcileSessionStreaming ?? mock(async () => false)
  const sendMessage = options?.sendMessage ?? mock(async () => undefined)
  const stopSession = mock(async () => undefined)
  const getSessionMessages = options?.getSessionMessages ?? (async () => [])
  const getSessionActivity = options?.getSessionActivity ?? (async () => ({ active: false }))
  const getAgentModelOptions = options?.getAgentModelOptions ?? mock(async () => options?.modelOptions ?? createDefaultModelOptions())
  const toastError = options?.toastError ?? mock(() => {})

  mock.module('./AgentHeader', () => ({
    AgentHeader() {
      return React.createElement('div', { 'data-testid': 'agent-header' })
    },
  }))
  mock.module('./AgentMessages', () => {
    function MockAgentMessages(props: { sessionId: string; messages: unknown[]; streaming: boolean; streamState?: unknown }) {
      options?.trackAgentMessagesRenders?.(props)
      return React.createElement('div', { 'data-testid': 'agent-messages' })
    }

    return {
      AgentMessages: options?.memoizeMockedAgentMessages
        ? React.memo(MockAgentMessages)
        : MockAgentMessages,
    }
  })
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
  mock.module('@/components/ai-elements/plain-text-input', () => ({
    PlainTextInput(props: PlainTextInputProps) {
      lastPlainTextInputProps = props
      return React.createElement('div', {
        'data-testid': 'plain-text-input',
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
      getAgentModelOptions,
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
    getAgentModelOptions,
    getLastPlainTextInputProps() {
      return lastPlainTextInputProps
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
  delete (globalThis as { localStorage?: Storage }).localStorage
})

describe('AgentView rendering extension points', () => {
  test('passes a custom composer placeholder to the plain text input', async () => {
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
    const composerPlaceholder = '告诉我你想怎么调整页面，例如：优化首屏视觉、增加产品介绍区、修改文案或排查样式问题。'
    const { AgentView, getLastPlainTextInputProps } = await loadAgentView()

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView
              composerPlaceholder={composerPlaceholder}
              sessionId={session.id}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastPlainTextInputProps()?.placeholder).toBe(composerPlaceholder)
  })

  test('keeps the composer editable while streaming but blocks sending', async () => {
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

    const sendMessage = mock(async () => undefined)
    const { AgentView, getLastPlainTextInputProps } = await loadAgentView({ sendMessage })

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

    expect(getLastPlainTextInputProps()?.disabled).toBe(false)
    expect(attachmentButton.props.disabled).toBe(true)

    await act(async () => {
      getLastPlainTextInputProps()?.onChange('处理中先记录下一步修改')
      await Promise.resolve()
    })

    expect(getLastPlainTextInputProps()?.value).toBe('处理中先记录下一步修改')

    await act(async () => {
      getLastPlainTextInputProps()?.onSubmit()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sendMessage).not.toHaveBeenCalled()
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

    const { AgentView, getLastPlainTextInputProps } = await loadAgentView()

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
    expect(json).toContain('正在处理中，可继续输入；完成后可发送。')
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

    const { AgentView, getLastPlainTextInputProps } = await loadAgentView()

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
    const shortcutHint = renderer.root.findByProps({ 'data-agent-composer-shortcut-hint': true })
    expect(shortcutHint.children.join('')).toBe('Enter 发送，Shift+Enter 换行。')
    expect(shortcutHint.parent?.props['data-agent-composer-send-actions']).toBe(true)
  })

  test('renders a custom composer notice above the input area', async () => {
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

    const { AgentView, getLastPlainTextInputProps } = await loadAgentView()

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView
              sessionId={session.id}
              composerNotice={(
                <div title="#hero-banner">
                  #hero-banner
                </div>
              )}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const json = JSON.stringify(renderer.toJSON())
    expect(json).toContain('#hero-banner')
    const shortcutHint = renderer.root.findByProps({ 'data-agent-composer-shortcut-hint': true })
    expect(shortcutHint.children.join('')).toBe('Enter 发送，Shift+Enter 换行。')
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
    const { AgentView, sendMessage, getLastPlainTextInputProps } = await loadAgentView()

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
      getLastPlainTextInputProps()?.onChange('修改这个区块')
    })
    await act(async () => {
      getLastPlainTextInputProps()?.onSubmit()
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

  test('renders model selector when enabled and sends the selected model option id', async () => {
    const storage = installLocalStorageMock({ 'proma.agent.modelOptionId': 'missing.model' })
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
    const { AgentView, sendMessage, getLastPlainTextInputProps } = await loadAgentView()
    let renderer!: ReturnType<typeof create>

    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView
              composerLeadingActions={(
                <button type="button">
                  从页面中选择
                </button>
              )}
              enableModelSelector
              sessionId={session.id}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    const select = renderer.root.findByProps({ 'aria-label': '选择模型' })
    expect(select.props.value).toBe('zhipu.glm')
    expect(select.props.className).not.toContain('border')
    expect(select.props.className).toContain('appearance-none')
    expect(select.props.className).toContain('absolute')
    expect(select.props.className).toContain('opacity-0')
    expect(select.parent?.props.className).toContain('gap-1.5')
    expect(select.parent?.findByProps({ 'data-agent-model-selector-label': true }).children.join('')).toBe('GLM')

    const renderedJson = JSON.stringify(renderer.toJSON())
    expect(renderedJson).toContain('lucide-chevron-down')
    const attachmentIndex = renderedJson.indexOf('"aria-label":"添加附件"')
    const modelSelectorIndex = renderedJson.indexOf('"aria-label":"选择模型"')
    expect(attachmentIndex).toBeLessThan(modelSelectorIndex)
    expect(modelSelectorIndex).toBeLessThan(renderedJson.indexOf('从页面中选择'))
    expect(select.findAllByType('option').map((option) => option.children.join(''))).toEqual([
      'GLM',
      'DeepSeek Chat',
    ])

    await act(async () => {
      select.props.onChange({ target: { value: 'deepseek.chat' } })
    })
    expect(storage.get('proma.agent.modelOptionId')).toBe('deepseek.chat')

    await act(async () => {
      getLastPlainTextInputProps()?.onChange('生成专题页')
    })
    await act(async () => {
      getLastPlainTextInputProps()?.onSubmit()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sendMessage).toHaveBeenCalledWith(session.id, expect.objectContaining({
      userMessage: '生成专题页',
      modelOptionId: 'deepseek.chat',
      workspaceId: workspace.id,
    }))
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[1])).not.toContain('api.deepseek.com')
  })

  test('does not load or render model selector unless explicitly enabled', async () => {
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
    const getAgentModelOptions = mock(async () => createDefaultModelOptions())
    const { AgentView } = await loadAgentView({ getAgentModelOptions })
    let renderer!: ReturnType<typeof create>

    await act(async () => {
      renderer = create(
        <Provider store={createStore()}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView sessionId={session.id} />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getAgentModelOptions).not.toHaveBeenCalled()
    expect(() => renderer.root.findByProps({ 'aria-label': '选择模型' })).toThrow()
  })

  test('auto-sends the initial page-builder prompt only after resolving the selected model option', async () => {
    installLocalStorageMock({ 'proma.agent.modelOptionId': 'deepseek.chat' })
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
    const modelOptionsDeferred = createDeferred<AgentModelOptionsResponse>()
    const getAgentModelOptions = mock(async () => await modelOptionsDeferred.promise)
    const { AgentView, sendMessage } = await loadAgentView({ getAgentModelOptions })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView
              defaultMentionedSkills={['page-builder-guided-generation']}
              enableModelSelector
              initialUserMessage="生成一个企业官网"
              sessionId={session.id}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sendMessage).not.toHaveBeenCalled()

    await act(async () => {
      modelOptionsDeferred.resolve(createDefaultModelOptions())
      await modelOptionsDeferred.promise
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sendMessage).toHaveBeenCalledWith(session.id, expect.objectContaining({
      userMessage: '生成一个企业官网',
      mentionedSkills: ['page-builder-guided-generation'],
      modelOptionId: 'deepseek.chat',
      workspaceId: workspace.id,
    }))
  })

  test('programmatic sends wait for model options and forward the selected model option id', async () => {
    installLocalStorageMock({ 'proma.agent.modelOptionId': 'deepseek.chat' })
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
      requestId: 'handoff-model-1',
      userMessage: '请根据刚确认的 CMS 选择结果，判断如何应用到当前区块。',
      composedUserMessage: '<cms_binding_apply_input>{"version":1}</cms_binding_apply_input>',
      mentionedSkills: ['cms-binding-apply'],
      bootstrappedSkills: ['cms-binding-apply'],
    }
    const modelOptionsDeferred = createDeferred<AgentModelOptionsResponse>()
    const getAgentModelOptions = mock(async () => await modelOptionsDeferred.promise)
    const onProgrammaticSendSettled = mock((_result: PageBuilderCmsAutoAgentHandoffSettledResult) => {})
    const { AgentView, sendMessage } = await loadAgentView({ getAgentModelOptions })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView
              enableModelSelector
              onProgrammaticSendSettled={onProgrammaticSendSettled}
              programmaticSendRequest={request}
              sessionId={session.id}
            />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sendMessage).not.toHaveBeenCalled()

    await act(async () => {
      modelOptionsDeferred.resolve(createDefaultModelOptions())
      await modelOptionsDeferred.promise
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sendMessage).toHaveBeenCalledWith(session.id, expect.objectContaining({
      userMessage: request.userMessage,
      composedUserMessage: request.composedUserMessage,
      mentionedSkills: ['cms-binding-apply'],
      bootstrappedSkills: ['cms-binding-apply'],
      modelOptionId: 'deepseek.chat',
      workspaceId: workspace.id,
    }))
    expect(onProgrammaticSendSettled).toHaveBeenCalledWith({
      requestId: 'handoff-model-1',
      status: 'sent',
    })
  })

  test('falls back to service default sending semantics when model options fail to load', async () => {
    installLocalStorageMock({ 'proma.agent.modelOptionId': 'deepseek.chat' })
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
    const getAgentModelOptions = mock(async () => {
      throw new Error('model options unavailable')
    })
    const originalConsoleError = console.error
    console.error = mock(() => {}) as typeof console.error
    const { AgentView, sendMessage } = await loadAgentView({ getAgentModelOptions })

    try {
      await act(async () => {
        create(
          <Provider store={createStore()}>
            <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
              <AgentView
                enableModelSelector
                initialUserMessage="生成一个企业官网"
                sessionId={session.id}
              />
            </HydrateAgentViewState>
          </Provider>,
        )
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(sendMessage).toHaveBeenCalledWith(session.id, expect.objectContaining({
        userMessage: '生成一个企业官网',
        workspaceId: workspace.id,
      }))
      expect(sendMessage.mock.calls[0]?.[1]).not.toHaveProperty('modelOptionId')
    } finally {
      console.error = originalConsoleError
    }
  })

  test('shows visible copy that model switching only affects the next message while streaming', async () => {
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
            <AgentView enableModelSelector sessionId={session.id} />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(collectRenderedText(renderer.toJSON())).toContain('模型切换仅影响下一条消息')
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
    const { AgentView, getLastPlainTextInputProps } = await loadAgentView({ sendMessage })

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
        getLastPlainTextInputProps()?.onChange('修改这个区块')
      })
      await act(async () => {
        getLastPlainTextInputProps()?.onSubmit()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(onMessageSent).not.toHaveBeenCalled()
    } finally {
      console.error = originalConsoleError
    }
  })

  test('keeps transcript props stable while editing the current draft', async () => {
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
    const trackAgentMessagesRenders = mock((_props: unknown) => {})
    const { AgentView, getLastPlainTextInputProps } = await loadAgentView({
      trackAgentMessagesRenders,
      memoizeMockedAgentMessages: true,
      getSessionMessages: async () => [{
        id: 'assistant-1',
        role: 'assistant',
        content: '这是已经展示的历史助手消息。',
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

    const initialRenderCount = trackAgentMessagesRenders.mock.calls.length
    expect(initialRenderCount).toBeGreaterThan(0)

    await act(async () => {
      getLastPlainTextInputProps()?.onChange('继续修改草稿')
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(trackAgentMessagesRenders.mock.calls.length).toBe(initialRenderCount)
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
    const { AgentView, sendMessage, getLastPlainTextInputProps, getLastPendingAttachments } = await loadAgentView()
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
      getLastPlainTextInputProps()?.onPasteFiles?.([attachmentFile])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getLastPlainTextInputProps()?.value).toBe('已有草稿')
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
    expect(getLastPlainTextInputProps()?.value).toBe('已有草稿')
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

    const { AgentView, sendMessage, getLastPlainTextInputProps } = await loadAgentView()

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
      getLastPlainTextInputProps()?.onChange('把页面做得更年轻一些')
    })
    await act(async () => {
      getLastPlainTextInputProps()?.onSubmit()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sendMessage).toHaveBeenCalledWith(session.id, expect.objectContaining({
      userMessage: '把页面做得更年轻一些',
      mentionedSkills: ['page-builder-guided-generation'],
      workspaceId: workspace.id,
    }))
  })

  test('submits the latest visible draft even when input change and submit happen back-to-back', async () => {
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

    const { AgentView, sendMessage, getLastPlainTextInputProps } = await loadAgentView()

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

    const inputProps = getLastPlainTextInputProps()

    await act(async () => {
      inputProps?.onChange('最后几个字')
      inputProps?.onSubmit()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sendMessage).toHaveBeenCalledWith(session.id, expect.objectContaining({
      userMessage: '最后几个字',
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

    const { AgentView, sendMessage, getLastPlainTextInputProps } = await loadAgentView()

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
      getLastPlainTextInputProps()?.onChange('继续修改这个 CMS 区块')
    })
    await act(async () => {
      getLastPlainTextInputProps()?.onSubmit()
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
    const { AgentView, getLastPlainTextInputProps, getToastError } = await loadAgentView({
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
      getLastPlainTextInputProps()?.onChange('请继续')
    })
    await act(async () => {
      getLastPlainTextInputProps()?.onSubmit()
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

  test('surfaces page-builder edit-lock 409 responses without adopting a busy session', async () => {
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
    const editLockError = Object.assign(new Error('编辑锁已失效，请从首页重新进入编辑'), { status: 409 })
    const reconcileSessionStreaming = mock(async () => true)
    const sendMessage = mock(async () => {
      throw editLockError
    })
    const getSessionMessages = mock(async () => [])
    const toastError = mock(() => {})
    const onSendError = mock(() => {})
    const { AgentView, getLastPlainTextInputProps, getToastError } = await loadAgentView({
      reconcileSessionStreaming,
      sendMessage,
      getSessionMessages,
      toastError,
    })

    await act(async () => {
      create(
        <Provider store={createStore()}>
          <HydrateAgentViewState sessions={[session]} workspaces={[workspace]}>
            <AgentView sessionId={session.id} onSendError={onSendError} />
          </HydrateAgentViewState>
        </Provider>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      getLastPlainTextInputProps()?.onChange('请继续')
    })
    await act(async () => {
      getLastPlainTextInputProps()?.onSubmit()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(reconcileSessionStreaming).not.toHaveBeenCalled()
    expect(getToastError()).toHaveBeenCalledWith('编辑锁已失效，请从首页重新进入编辑')
    expect(onSendError).toHaveBeenCalledWith(editLockError)
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
    const { AgentView, sendMessage, getLastPlainTextInputProps } = await loadAgentView()

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
      getLastPlainTextInputProps()?.onChange('把这个列表换成另一个栏目')
    })
    await act(async () => {
      getLastPlainTextInputProps()?.onSubmit()
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
    expect(getLastPlainTextInputProps()?.value).toBe('')
  })
})
