import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { AlertTriangle, CornerDownLeft, Paperclip, Square } from 'lucide-react'
import { toast } from 'sonner'
import { AgentHeader } from './AgentHeader'
import { AgentPendingAttachments } from './AgentPendingAttachments'
import { AgentMessages } from './AgentMessages'
import { AskUserBanner } from './AskUserBanner'
import { loadSessionMessagesWithCatchup } from './message-catchup'
import { PermissionBanner } from './PermissionBanner'
import {
  mergePendingAgentAttachments,
  releasePendingAgentAttachment,
  releasePendingAgentAttachments,
  type PendingAgentAttachment,
} from './agent-attachments'
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
import type {
  AgentMessage,
  PageBuilderCmsAutoAgentHandoffRequest,
  PageBuilderCmsAutoAgentHandoffSettledResult,
} from '@proma/shared'

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
  allowAttachments?: boolean
  defaultMentionedSkills?: string[]
  initialUserMessage?: string | null
  onInitialUserMessageHandled?: () => void
  messageDecorator?: AgentMessageDecorator
  composerLeadingActions?: React.ReactNode
  onMessageSent?: (userMessage: string) => void
  programmaticSendRequest?: PageBuilderCmsAutoAgentHandoffRequest | null
  onProgrammaticSendSettled?: (result: PageBuilderCmsAutoAgentHandoffSettledResult) => void
}

export type AgentMessageDecorator = (userMessage: string) => string

export interface PreparedAgentSendPayload {
  userMessage: string
  composedUserMessage?: string
  mentionedSkills: string[]
  mentionedMcpServers: string[]
}

interface AgentSendExecutionResult {
  ok: boolean
  errorMessage?: string
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
  defaultMentionedSkills: string[] = [],
): PreparedAgentSendPayload {
  const composedUserMessage = messageDecorator ? messageDecorator(userMessage) : undefined
  const visibleMentionedSkills = [...userMessage.matchAll(/\/skill:(\S+)/g)]
    .map((match) => match[1])
    .filter(Boolean) as string[]
  const mentionedMcpServers = [...userMessage.matchAll(/#mcp:(\S+)/g)]
    .map((match) => match[1])
    .filter(Boolean) as string[]
  const mentionedSkills = Array.from(new Set([
    ...visibleMentionedSkills,
    ...defaultMentionedSkills.filter(Boolean),
  ]))

  return {
    userMessage,
    ...(composedUserMessage && composedUserMessage !== userMessage
      ? { composedUserMessage }
      : {}),
    mentionedSkills,
    mentionedMcpServers,
  }
}

export function createOptimisticUserMessage({
  userMessage,
  pendingAttachments,
  messageId,
  createdAt,
}: {
  userMessage: string
  pendingAttachments: ReadonlyArray<PendingAgentAttachment>
  messageId: string
  createdAt: number
}): AgentMessage {
  const attachments = pendingAttachments.map((attachment) => ({
    id: attachment.id,
    filename: attachment.file.name,
    mediaType: attachment.file.type || 'application/octet-stream',
    localPath: attachment.previewUrl ?? '',
    size: attachment.file.size,
  }))

  return {
    id: messageId,
    role: 'user',
    content: userMessage,
    createdAt,
    ...(attachments.length > 0 ? { attachments } : {}),
  }
}

export function AgentView({
  sessionId,
  showHeader = true,
  showComposerMeta = true,
  allowAttachments = false,
  defaultMentionedSkills = [],
  initialUserMessage = null,
  onInitialUserMessageHandled,
  messageDecorator,
  composerLeadingActions,
  onMessageSent,
  programmaticSendRequest = null,
  onProgrammaticSendSettled,
}: AgentViewProps): React.ReactElement {
  const [messagesBySession, setMessagesBySession] = React.useState<Map<string, AgentMessage[]>>(() => new Map())
  const [status, setStatus] = React.useState<AppStatus | null>(null)
  const [initialMessageLoaded, setInitialMessageLoaded] = React.useState(false)
  const [pendingAttachments, setPendingAttachments] = React.useState<PendingAgentAttachment[]>([])
  const [isDragOver, setIsDragOver] = React.useState(false)
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
  const { reconcileSessionStreaming, sendMessage, stopSession } = useGlobalAgentListeners()
  const initialMessageTriggeredRef = React.useRef(false)
  const lastProgrammaticRequestIdRef = React.useRef<string | null>(null)
  const pendingAttachmentsRef = React.useRef(pendingAttachments)
  pendingAttachmentsRef.current = pendingAttachments
  const fileInputRef = React.useRef<HTMLInputElement>(null)
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
  const composerInteractionLocked = streaming || Boolean(status && !status.ok)
  const canSend = (inputValue.trim().length > 0 || pendingAttachments.length > 0) && !(status && !status.ok)
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
    setPendingAttachments((current) => {
      releasePendingAgentAttachments(current)
      return []
    })
  }, [sessionId])

  React.useEffect(() => () => {
    releasePendingAgentAttachments(pendingAttachmentsRef.current)
  }, [])

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

  const executeSend = React.useCallback(async ({
    userMessage,
    composedUserMessage,
    mentionedSkills = [],
    mentionedMcpServers = [],
    optimisticAttachments = [],
    attachmentFiles = [],
    clearComposerOnSuccess,
    clearAttachmentsOnSuccess,
    emitMessageSent,
  }: {
    userMessage: string
    composedUserMessage?: string
    mentionedSkills?: string[]
    mentionedMcpServers?: string[]
    optimisticAttachments?: ReadonlyArray<PendingAgentAttachment>
    attachmentFiles?: File[]
    clearComposerOnSuccess: boolean
    clearAttachmentsOnSuccess: boolean
    emitMessageSent: boolean
  }): Promise<AgentSendExecutionResult> => {
    const trimmedUserMessage = userMessage.trim()
    if (!trimmedUserMessage && optimisticAttachments.length === 0) {
      return { ok: false }
    }

    if (streaming) {
      const stillBusy = await reconcileSessionStreaming(sessionId)
      if (stillBusy) {
        const errorMessage = '当前会话正在处理中，请稍候再试'
        toast.error(errorMessage)
        return { ok: false, errorMessage }
      }
    }

    if (status && !status.ok) {
      toast.error('后端未就绪，当前无法发送消息')
      return { ok: false, errorMessage: '后端未就绪，当前无法发送消息' }
    }

    const optimisticCreatedAt = Date.now()
    if (trimmedUserMessage || optimisticAttachments.length > 0) {
      const optimisticMessage = createOptimisticUserMessage({
        userMessage: trimmedUserMessage,
        pendingAttachments: optimisticAttachments,
        messageId: `local-${optimisticCreatedAt}`,
        createdAt: optimisticCreatedAt,
      })
      setMessagesBySession((prev) => appendMessageForSession(prev, sessionId, optimisticMessage))
    }

    setStreamErrors((prev) => {
      const map = new Map(prev)
      map.delete(sessionId)
      return map
    })

    if (session && (!session.title || session.title === '新 Agent 会话')) {
      setSessions((prev) => prev.map((item) => item.id === sessionId ? {
        ...item,
        title: trimmedUserMessage.slice(0, 50),
      } : item))
    }

    try {
      await sendMessage(sessionId, {
        userMessage: trimmedUserMessage,
        ...(composedUserMessage ? { composedUserMessage } : {}),
        ...(attachmentFiles.length > 0 ? { attachmentFiles } : {}),
        ...(sessionWorkspaceId && { workspaceId: sessionWorkspaceId }),
        ...(attachedDirectories.length > 0 && { additionalDirectories: attachedDirectories }),
        ...(mentionedSkills.length > 0 && { mentionedSkills }),
        ...(mentionedMcpServers.length > 0 && { mentionedMcpServers }),
      })

      if (clearComposerOnSuccess) {
        setInputValue('')
      }

      if (clearAttachmentsOnSuccess) {
        setPendingAttachments((current) => {
          releasePendingAgentAttachments(current)
          return []
        })
      }

      if (emitMessageSent) {
        onMessageSent?.(trimmedUserMessage)
      }

      return { ok: true }
    } catch (error) {
      console.error('[AgentView] 发送消息失败:', error)
      const errorMessage = error instanceof Error ? error.message : '发送消息失败'
      toast.error(errorMessage)
      const nextMessages = await api.getSessionMessages(sessionId)
      setMessagesBySession((prev) => replaceMessagesForSession(prev, sessionId, nextMessages))
      return {
        ok: false,
        errorMessage,
      }
    }
  }, [
    attachedDirectories,
    onMessageSent,
    reconcileSessionStreaming,
    sendMessage,
    session,
    sessionId,
    sessionWorkspaceId,
    setInputValue,
    setSessions,
    setStreamErrors,
    status,
    streaming,
  ])

  const sendDraftMessage = React.useCallback(async (nextUserMessage: string): Promise<boolean> => {
    const payload = prepareAgentSendPayload(nextUserMessage.trim(), messageDecorator, defaultMentionedSkills)
    const result = await executeSend({
      userMessage: payload.userMessage,
      ...(payload.composedUserMessage ? { composedUserMessage: payload.composedUserMessage } : {}),
      mentionedSkills: payload.mentionedSkills,
      mentionedMcpServers: payload.mentionedMcpServers,
      optimisticAttachments: pendingAttachments,
      attachmentFiles: pendingAttachments.map((attachment) => attachment.file),
      clearComposerOnSuccess: true,
      clearAttachmentsOnSuccess: true,
      emitMessageSent: true,
    })

    return result.ok
  }, [defaultMentionedSkills, executeSend, messageDecorator, pendingAttachments])

  const handleSend = React.useCallback(async (): Promise<void> => {
    await sendDraftMessage(inputValue)
  }, [inputValue, sendDraftMessage])

  const handleAddFiles = React.useCallback((files: File[]): void => {
    if (!allowAttachments || files.length === 0) return

    const result = mergePendingAgentAttachments(pendingAttachments, files)
    setPendingAttachments(result.attachments)

    for (const error of result.errors) {
      toast.error(error)
    }
  }, [allowAttachments, pendingAttachments])

  const handleOpenFilePicker = React.useCallback((): void => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
    handleAddFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }, [handleAddFiles])

  const handleRemoveAttachment = React.useCallback((attachmentId: string): void => {
    setPendingAttachments((current) => {
      const attachment = current.find((item) => item.id === attachmentId)
      if (attachment) {
        releasePendingAgentAttachment(attachment)
      }
      return current.filter((item) => item.id !== attachmentId)
    })
  }, [])

  const handleDragOver = React.useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    if (!allowAttachments || event.dataTransfer.files.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(true)
  }, [allowAttachments])

  const handleDragLeave = React.useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    if (!allowAttachments) return
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)
  }, [allowAttachments])

  const handleDrop = React.useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    if (!allowAttachments) return
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)
    handleAddFiles(Array.from(event.dataTransfer.files))
  }, [allowAttachments, handleAddFiles])

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

  React.useEffect(() => {
    if (!programmaticSendRequest) {
      return
    }

    if (lastProgrammaticRequestIdRef.current === programmaticSendRequest.requestId) {
      return
    }

    lastProgrammaticRequestIdRef.current = programmaticSendRequest.requestId

    void executeSend({
      userMessage: programmaticSendRequest.userMessage,
      composedUserMessage: programmaticSendRequest.composedUserMessage,
      mentionedSkills: programmaticSendRequest.mentionedSkills,
      optimisticAttachments: [],
      attachmentFiles: [],
      clearComposerOnSuccess: false,
      clearAttachmentsOnSuccess: false,
      emitMessageSent: false,
    }).then((result) => {
      onProgrammaticSendSettled?.({
        requestId: programmaticSendRequest.requestId,
        status: result.ok ? 'sent' : 'failed',
        ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
      })
    })
  }, [
    executeSend,
    onProgrammaticSendSettled,
    programmaticSendRequest,
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
        <div
          className={cn(
            'rounded-[17px] border-[0.5px] border-border bg-background/70 pt-2 backdrop-blur-sm transition-all duration-200 focus-within:border-foreground/20',
            allowAttachments && isDragOver && 'border-[2px] border-dashed border-primary/45 bg-primary/[0.04]',
          )}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            className="hidden"
            multiple
            onChange={handleFileInputChange}
            type="file"
          />
          {allowAttachments && (
            <AgentPendingAttachments
              attachments={pendingAttachments}
              onRemove={handleRemoveAttachment}
            />
          )}
          <RichTextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={() => { void handleSend() }}
            onPasteFiles={allowAttachments ? handleAddFiles : undefined}
            disabled={composerInteractionLocked}
            autoFocusTrigger={sessionId}
            placeholder={status && !status.ok ? '请先修复后端状态，再发送消息' : '输入消息...'}
            workspaceId={sessionWorkspaceId}
            workspacePath={workspaceContext?.workspacePath ?? null}
            workspaceSlug={workspaceContext?.workspaceSlug ?? sessionWorkspace?.slug ?? null}
            attachedDirs={attachedDirectories}
          />

          <div className="flex h-[40px] items-center justify-between gap-4 px-2 py-[5px]">
            <div className="flex min-w-0 flex-1 items-center gap-2 px-1 text-xs text-muted-foreground">
              {composerLeadingActions}
              {allowAttachments && (
                <Button
                  aria-label="添加附件"
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full text-muted-foreground hover:bg-muted"
                  disabled={composerInteractionLocked}
                  onClick={handleOpenFilePicker}
                >
                  <Paperclip className="size-4" />
                </Button>
              )}
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
                    canSend
                      ? 'text-primary hover:bg-primary/10'
                      : 'cursor-not-allowed text-foreground/30',
                  )}
                  onClick={() => { void handleSend() }}
                  disabled={!canSend}
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
