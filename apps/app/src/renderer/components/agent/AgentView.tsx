import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { AlertTriangle, CornerDownLeft, Square } from 'lucide-react'
import { toast } from 'sonner'
import { AgentHeader } from './AgentHeader'
import { AgentMessages } from './AgentMessages'
import { AskUserBanner } from './AskUserBanner'
import { loadSessionMessagesWithCatchup } from './message-catchup'
import { PermissionBanner } from './PermissionBanner'
import { RichTextInput } from '@/components/ai-elements/rich-text-input'
import { Button } from '@/components/ui/button'
import {
  agentMessageRefreshAtom,
  agentSessionsAtom,
  agentSessionDraftsAtom,
  agentStreamErrorsAtom,
  agentStreamingStatesAtom,
  agentWorkspacesAtom,
  workspaceDirectoryContextMapAtom,
} from '@/atoms/agent-atoms'
import { api, type AppStatus } from '@/lib/api'
import { useGlobalAgentListeners } from '@/hooks/useGlobalAgentListeners'
import { cn } from '@/lib/utils'
import type { AgentMessage } from '@proma/shared'

interface SyncSessionMessagesDeps {
  loadSessionMessagesWithCatchup: typeof loadSessionMessagesWithCatchup
}

const defaultSyncSessionMessagesDeps: SyncSessionMessagesDeps = {
  loadSessionMessagesWithCatchup,
}

export function getMessagesForSession(
  messagesBySession: Map<string, AgentMessage[]>,
  sessionId: string,
): AgentMessage[] {
  return messagesBySession.get(sessionId) ?? []
}

export function replaceMessagesForSession(
  messagesBySession: Map<string, AgentMessage[]>,
  sessionId: string,
  messages: AgentMessage[],
): Map<string, AgentMessage[]> {
  const next = new Map(messagesBySession)
  next.set(sessionId, messages)
  return next
}

export function appendMessageForSession(
  messagesBySession: Map<string, AgentMessage[]>,
  sessionId: string,
  message: AgentMessage,
): Map<string, AgentMessage[]> {
  return replaceMessagesForSession(
    messagesBySession,
    sessionId,
    [...getMessagesForSession(messagesBySession, sessionId), message],
  )
}

function haveSameMessages(
  currentMessages: AgentMessage[],
  nextMessages: AgentMessage[],
): boolean {
  if (currentMessages.length !== nextMessages.length) return false

  return currentMessages.every((message, index) => {
    const nextMessage = nextMessages[index]
    return nextMessage
      && message.id === nextMessage.id
      && message.role === nextMessage.role
      && message.content === nextMessage.content
      && message.createdAt === nextMessage.createdAt
  })
}

export async function syncSessionMessages(
  loadMessages: () => Promise<AgentMessage[]>,
  onMessages: (messages: AgentMessage[]) => void,
  deps: SyncSessionMessagesDeps = defaultSyncSessionMessagesDeps,
): Promise<void> {
  const initialMessages = await loadMessages()
  onMessages(initialMessages)

  if (initialMessages.at(-1)?.role !== 'user') {
    return
  }

  const nextMessages = await deps.loadSessionMessagesWithCatchup(loadMessages, {
    initialMessages,
  })

  if (!haveSameMessages(initialMessages, nextMessages)) {
    onMessages(nextMessages)
  }
}

function StatusNotice({ status }: { status: AppStatus }): React.ReactElement | null {
  if (status.ok) return null

  let message = '后端服务尚未就绪。'
  if (!status.apiKeyConfigured) {
    message = '未检测到 ANTHROPIC_API_KEY，当前会话无法发送。'
  } else if (!status.sdkCliAvailable) {
    message = '后端未检测到 Claude Agent SDK CLI。请先执行 bun install 安装依赖，并确认 Claude Code CLI 可用后重启服务。'
  }

  return (
    <div className="mx-4 mb-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
      {message}
    </div>
  )
}

export interface AgentViewProps {
  sessionId: string
  showHeader?: boolean
  showComposerMeta?: boolean
  initialUserMessage?: string | null
  onInitialUserMessageHandled?: () => void
  messageDecorator?: AgentMessageDecorator
}

export type AgentMessageDecorator = (userMessage: string) => string

export interface PreparedAgentSendPayload {
  userMessage: string
  mentionedSkills: string[]
  mentionedMcpServers: string[]
}

export function resolveShouldRenderAgentHeader(showHeader = true): boolean {
  return showHeader
}

export function resolveShouldAutoSendInitialMessage({
  initialMessageLoaded,
  initialUserMessage,
  hasMessages,
  alreadyTriggered,
  streaming,
}: {
  initialMessageLoaded: boolean
  initialUserMessage: string | null | undefined
  hasMessages: boolean
  alreadyTriggered: boolean
  streaming: boolean
}): boolean {
  return Boolean(
    initialMessageLoaded
      && initialUserMessage?.trim()
      && !hasMessages
      && !alreadyTriggered
      && !streaming,
  )
}

export function prepareAgentSendPayload(
  userMessage: string,
  messageDecorator?: AgentMessageDecorator,
): PreparedAgentSendPayload {
  const mentionedSkills = [...userMessage.matchAll(/\/skill:(\S+)/g)]
    .map((match) => match[1])
    .filter(Boolean) as string[]
  const mentionedMcpServers = [...userMessage.matchAll(/#mcp:(\S+)/g)]
    .map((match) => match[1])
    .filter(Boolean) as string[]

  return {
    userMessage: messageDecorator ? messageDecorator(userMessage) : userMessage,
    mentionedSkills,
    mentionedMcpServers,
  }
}

export function AgentView({
  sessionId,
  showHeader = true,
  showComposerMeta = true,
  initialUserMessage = null,
  onInitialUserMessageHandled,
  messageDecorator,
}: AgentViewProps): React.ReactElement {
  const [messagesBySession, setMessagesBySession] = React.useState<Map<string, AgentMessage[]>>(() => new Map())
  const [status, setStatus] = React.useState<AppStatus | null>(null)
  const [initialMessageLoaded, setInitialMessageLoaded] = React.useState(false)
  const streamingState = useAtomValue(agentStreamingStatesAtom).get(sessionId)
  const streamError = useAtomValue(agentStreamErrorsAtom).get(sessionId) ?? null
  const refreshVersion = useAtomValue(agentMessageRefreshAtom).get(sessionId) ?? 0
  const sessions = useAtomValue(agentSessionsAtom)
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const setSessions = useSetAtom(agentSessionsAtom)
  const setStreamErrors = useSetAtom(agentStreamErrorsAtom)
  const setWorkspaceDirectoryContextMap = useSetAtom(workspaceDirectoryContextMapAtom)
  const draftsMap = useAtomValue(agentSessionDraftsAtom)
  const workspaceDirectoryContextMap = useAtomValue(workspaceDirectoryContextMapAtom)
  const setDraftsMap = useSetAtom(agentSessionDraftsAtom)
  const { sendMessage, stopSession } = useGlobalAgentListeners()
  const initialMessageTriggeredRef = React.useRef(false)
  const messages = React.useMemo(
    () => getMessagesForSession(messagesBySession, sessionId),
    [messagesBySession, sessionId],
  )

  const inputValue = draftsMap.get(sessionId) ?? ''
  const streaming = streamingState?.running ?? false
  const session = sessions.find((item) => item.id === sessionId) ?? null
  const sessionWorkspaceId = session?.workspaceId ?? null
  const sessionWorkspace = workspaces.find((item) => item.id === sessionWorkspaceId) ?? null
  const workspaceContext = sessionWorkspaceId
    ? workspaceDirectoryContextMap.get(sessionWorkspaceId) ?? null
    : null
  const latestAssistantModel = React.useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant')?.model ?? null,
    [messages],
  )
  const attachedDirectories = React.useMemo(
    () => Array.from(new Set([
      ...(workspaceContext?.attachedDirectories ?? []),
      ...(session?.attachedDirectories ?? []),
    ])),
    [session?.attachedDirectories, workspaceContext?.attachedDirectories],
  )

  const setInputValue = React.useCallback((value: string) => {
    setDraftsMap((prev) => {
      const map = new Map(prev)
      if (value.trim() === '') {
        map.delete(sessionId)
      } else {
        map.set(sessionId, value)
      }
      return map
    })
  }, [sessionId, setDraftsMap])

  React.useEffect(() => {
    let cancelled = false

    void api.getStatus().then((nextStatus) => {
      if (!cancelled) {
        setStatus(nextStatus)
      }
    }).catch((error) => {
      console.error('[AgentView] 读取状态失败:', error)
      if (!cancelled) {
        setStatus({ ok: false, apiKeyConfigured: false, sdkCliAvailable: false })
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    initialMessageTriggeredRef.current = false
    setInitialMessageLoaded(false)
  }, [sessionId])

  React.useEffect(() => {
    let cancelled = false

    void syncSessionMessages(
      () => api.getSessionMessages(sessionId),
      (nextMessages) => {
        if (!cancelled) {
          setMessagesBySession((prev) => replaceMessagesForSession(prev, sessionId, nextMessages))
        }
      }
    ).catch((error) => {
      console.error('[AgentView] 读取消息失败:', error)
    }).finally(() => {
      if (!cancelled) {
        setInitialMessageLoaded(true)
      }
    })

    return () => {
      cancelled = true
    }
  }, [sessionId, refreshVersion])

  React.useEffect(() => {
    if (!sessionWorkspaceId) return

    let cancelled = false

    void api.getWorkspaceContext(sessionWorkspaceId).then((context) => {
      if (cancelled) return

      setWorkspaceDirectoryContextMap((prev) => {
        const next = new Map(prev)
        next.set(sessionWorkspaceId, context)
        return next
      })
    }).catch((error) => {
      console.error('[AgentView] 读取工作区上下文失败:', error)
    })

    return () => {
      cancelled = true
    }
  }, [sessionWorkspaceId, setWorkspaceDirectoryContextMap])

  const sendDraftMessage = React.useCallback(async (nextUserMessage: string): Promise<boolean> => {
    const userMessage = nextUserMessage.trim()
    if (!userMessage) return false
    if (streaming) return false

    if (status && !status.ok) {
      toast.error('后端未就绪，当前无法发送消息')
      return false
    }

    const optimisticMessage: AgentMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: userMessage,
      createdAt: Date.now(),
    }

    setMessagesBySession((prev) => appendMessageForSession(prev, sessionId, optimisticMessage))
    setInputValue('')
    setStreamErrors((prev) => {
      const map = new Map(prev)
      map.delete(sessionId)
      return map
    })

    if (session && (!session.title || session.title === '新 Agent 会话')) {
      setSessions((prev) => prev.map((item) => item.id === sessionId ? {
        ...item,
        title: userMessage.slice(0, 50),
      } : item))
    }

    try {
      const payload = prepareAgentSendPayload(userMessage, messageDecorator)

      await sendMessage(sessionId, {
        userMessage: payload.userMessage,
        ...(sessionWorkspaceId && { workspaceId: sessionWorkspaceId }),
        ...(attachedDirectories.length > 0 && { additionalDirectories: attachedDirectories }),
        ...(payload.mentionedSkills.length > 0 && { mentionedSkills: payload.mentionedSkills }),
        ...(payload.mentionedMcpServers.length > 0 && { mentionedMcpServers: payload.mentionedMcpServers }),
      })
      return true
    } catch (error) {
      console.error('[AgentView] 发送消息失败:', error)
      toast.error(error instanceof Error ? error.message : '发送消息失败')
      const nextMessages = await api.getSessionMessages(sessionId)
      setMessagesBySession((prev) => replaceMessagesForSession(prev, sessionId, nextMessages))
      return false
    }
  }, [
    attachedDirectories,
    sendMessage,
    session,
    sessionId,
    sessionWorkspaceId,
    setInputValue,
    setSessions,
    setStreamErrors,
    status,
    streaming,
    messageDecorator,
  ])

  const handleSend = React.useCallback(async (): Promise<void> => {
    await sendDraftMessage(inputValue)
  }, [inputValue, sendDraftMessage])

  React.useEffect(() => {
    const shouldAutoSend = resolveShouldAutoSendInitialMessage({
      initialMessageLoaded,
      initialUserMessage,
      hasMessages: messages.length > 0,
      alreadyTriggered: initialMessageTriggeredRef.current,
      streaming,
    })

    if (!shouldAutoSend) {
      if (initialMessageLoaded && messages.length > 0 && initialUserMessage?.trim() && !initialMessageTriggeredRef.current) {
        initialMessageTriggeredRef.current = true
        onInitialUserMessageHandled?.()
      }
      return
    }

    initialMessageTriggeredRef.current = true

    void sendDraftMessage(initialUserMessage!).then((didSend) => {
      if (didSend) {
        onInitialUserMessageHandled?.()
      }
    })
  }, [
    initialMessageLoaded,
    initialUserMessage,
    messages.length,
    onInitialUserMessageHandled,
    sendDraftMessage,
    streaming,
  ])

  const handleStop = React.useCallback(async (): Promise<void> => {
    try {
      await stopSession(sessionId)
    } catch (error) {
      console.error('[AgentView] 停止会话失败:', error)
      toast.error('停止生成失败')
    }
  }, [sessionId, stopSession])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {resolveShouldRenderAgentHeader(showHeader) && <AgentHeader sessionId={sessionId} />}

      <div className="min-h-0 flex-1 overflow-hidden">
        <AgentMessages
          sessionId={sessionId}
          messages={messages}
          streaming={streaming}
          streamState={streamingState}
        />
      </div>

      {status && <StatusNotice status={status} />}
      {streamError && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4" />
          <span>{streamError}</span>
        </div>
      )}

      <PermissionBanner sessionId={sessionId} />
      <AskUserBanner sessionId={sessionId} />

      <div className="px-2.5 pb-2.5 pt-2 md:px-[18px] md:pb-[18px]">
        <div className="rounded-[17px] border-[0.5px] border-border bg-background/70 pt-2 backdrop-blur-sm transition-all duration-200 focus-within:border-foreground/20">
          <RichTextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={() => { void handleSend() }}
            disabled={streaming || Boolean(status && !status.ok)}
            autoFocusTrigger={sessionId}
            placeholder={status && !status.ok ? '请先修复后端状态，再发送消息' : '输入消息...'}
            workspaceId={sessionWorkspaceId}
            workspacePath={workspaceContext?.workspacePath ?? null}
            workspaceSlug={workspaceContext?.workspaceSlug ?? sessionWorkspace?.slug ?? null}
            attachedDirs={attachedDirectories}
          />

          <div className="flex h-[40px] items-center justify-between gap-4 px-2 py-[5px]">
            <div className="flex min-w-0 flex-1 items-center gap-2 px-1 text-xs text-muted-foreground">
              {showComposerMeta && (
                <>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground/75">
                    Agent
                  </span>
                  {(workspaceContext?.workspaceName || sessionWorkspace?.name) && (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground/75">
                      {workspaceContext?.workspaceName ?? sessionWorkspace?.name}
                    </span>
                  )}
                  {latestAssistantModel && (
                    <span className="truncate text-[11px] text-muted-foreground/80">
                      {latestAssistantModel}
                    </span>
                  )}
                </>
              )}
              <span className="truncate">
                {streaming
                  ? '正在流式输出，输入框已锁定。'
                  : 'Enter 发送，Shift+Enter 换行。'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {streaming ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-[30px] rounded-full text-destructive hover:bg-destructive/10"
                  onClick={() => { void handleStop() }}
                >
                  <Square className="size-[22px]" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'size-[30px] rounded-full',
                    inputValue.trim() && !(status && !status.ok)
                      ? 'text-primary hover:bg-primary/10'
                      : 'cursor-not-allowed text-foreground/30',
                  )}
                  onClick={() => { void handleSend() }}
                  disabled={!inputValue.trim() || Boolean(status && !status.ok)}
                >
                  <CornerDownLeft className="size-[22px]" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
