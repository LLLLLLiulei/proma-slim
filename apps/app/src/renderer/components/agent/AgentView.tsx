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
import { PlainTextInput } from '@/components/ai-elements/plain-text-input'
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
import { STALE_STREAM_RECONCILE_IDLE_MS } from '@/hooks/useAgentSSE'
import { cn } from '@/lib/utils'
import type {
  AgentMessage,
  PageBuilderCmsAutoAgentHandoffRequest,
  PageBuilderCmsAutoAgentHandoffSettledResult,
  PageBuilderEditLockCredentials,
} from '@ai-page-builder/shared'

interface SyncSessionMessagesDeps {
  loadSessionMessagesWithCatchup: typeof loadSessionMessagesWithCatchup
}

const defaultSyncSessionMessagesDeps: SyncSessionMessagesDeps = {
  loadSessionMessagesWithCatchup,
}

function logAgentViewLifecycle(
  level: 'info' | 'warn' | 'error',
  payload: Record<string, unknown>,
): void {
  const logger = level === 'info' ? console.info : level === 'warn' ? console.warn : console.error
  logger('[AgentView]', payload)
}

const SESSION_BUSY_ERROR_MESSAGE = '当前会话正在处理中，请稍候再试'
const ACTIVE_SESSION_CONFLICT_MESSAGE = '上一条消息仍在处理中，请稍候再试'

function resolveErrorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : null
}

function isActiveSessionConflictError(error: unknown): boolean {
  const status = resolveErrorStatus(error)
  return error instanceof Error
    && error.message.includes(ACTIVE_SESSION_CONFLICT_MESSAGE)
    && (status === null || status === 409)
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
  prepareSendPayload?: (input: {
    userMessage: string
    sessionId: string
    workspaceId?: string
  }) => Promise<AgentSendPayloadPreparationResult | void> | AgentSendPayloadPreparationResult | void
  composerNotice?: React.ReactNode
  composerLeadingActions?: React.ReactNode
  onMessageSent?: (userMessage: string) => void
  beforeSendMessage?: (input: {
    userMessage: string
    sessionId: string
    workspaceId?: string
  }) => Promise<{
    handled: true
    clearComposer?: boolean
    clearAttachments?: boolean
  } | void> | {
    handled: true
    clearComposer?: boolean
    clearAttachments?: boolean
  } | void
  programmaticSendRequest?: PageBuilderCmsAutoAgentHandoffRequest | null
  onProgrammaticSendSettled?: (result: PageBuilderCmsAutoAgentHandoffSettledResult) => void
  onSendError?: (error: unknown) => void
  sendMessageOptions?: {
    editLock?: PageBuilderEditLockCredentials
  }
}

export type AgentMessageDecorator = (userMessage: string) => string

export interface PreparedAgentSendPayload {
  userMessage: string
  composedUserMessage?: string
  mentionedSkills: string[]
  bootstrappedSkills?: string[]
  mentionedMcpServers: string[]
}

export interface BlockedAgentSendPayload {
  blocked: true
  errorMessage: string
}

export type AgentSendPayloadPreparationResult = PreparedAgentSendPayload | BlockedAgentSendPayload

interface AgentSendExecutionResult {
  ok: boolean
  errorMessage?: string
}

export async function resolvePreparedAgentSendPayload(input: {
  userMessage: string
  sessionId: string
  workspaceId?: string
  messageDecorator?: AgentMessageDecorator
  defaultMentionedSkills?: string[]
  prepareSendPayload?: (input: {
    userMessage: string
    sessionId: string
    workspaceId?: string
  }) => Promise<AgentSendPayloadPreparationResult | void> | AgentSendPayloadPreparationResult | void
}): Promise<AgentSendPayloadPreparationResult> {
  const prepared = await input.prepareSendPayload?.({
    userMessage: input.userMessage,
    sessionId: input.sessionId,
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
  })

  if (prepared) {
    return prepared
  }

  return prepareAgentSendPayload(
    input.userMessage,
    input.messageDecorator,
    input.defaultMentionedSkills ?? [],
  )
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
  prepareSendPayload,
  composerNotice,
  composerLeadingActions,
  onMessageSent,
  beforeSendMessage,
  programmaticSendRequest = null,
  onProgrammaticSendSettled,
  onSendError,
  sendMessageOptions,
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
  const lastReloadRecoveryProbeKeyRef = React.useRef<string | null>(null)
  const pendingAttachmentsRef = React.useRef(pendingAttachments)
  pendingAttachmentsRef.current = pendingAttachments
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const messages = React.useMemo(
    () => getMessagesForSession(messagesBySession, sessionId),
    [messagesBySession, sessionId],
  )

  const inputValue = draftsMap.get(sessionId) ?? ''
  const latestDraftValueRef = React.useRef(inputValue)
  latestDraftValueRef.current = inputValue
  const streaming = streamingState?.running ?? false
  const session = sessions.find((item) => item.id === sessionId) ?? null
  const sessionWorkspaceId = session?.workspaceId ?? null
  const sessionWorkspace = workspaces.find((item) => item.id === sessionWorkspaceId) ?? null
  const workspaceContext = sessionWorkspaceId
    ? workspaceDirectoryContextMap.get(sessionWorkspaceId) ?? null
    : null
  const composerInputDisabled = Boolean(status && !status.ok)
  const composerSendDisabled = streaming || composerInputDisabled
  const canSend = (inputValue.trim().length > 0 || pendingAttachments.length > 0) && !composerSendDisabled
  const attachedDirectories = React.useMemo(
    () => Array.from(new Set([
      ...(workspaceContext?.attachedDirectories ?? []),
      ...(session?.attachedDirectories ?? []),
    ])),
    [session?.attachedDirectories, workspaceContext?.attachedDirectories],
  )

  const setInputValue = React.useCallback((value: string) => {
    latestDraftValueRef.current = value
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
    bootstrappedSkills = [],
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
    bootstrappedSkills?: string[]
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

    const source = emitMessageSent ? 'user-send' : 'programmatic-send'

    if (streaming) {
      logAgentViewLifecycle('info', {
        phase: 'send_busy_probe',
        sessionId,
        workspaceId: sessionWorkspaceId ?? null,
        source,
      })

      const stillBusy = await reconcileSessionStreaming(sessionId, {
        reason: 'send-while-local-busy',
        source,
        workspaceId: sessionWorkspaceId,
      })
      if (stillBusy) {
        const errorMessage = SESSION_BUSY_ERROR_MESSAGE
        toast.error(errorMessage)
        logAgentViewLifecycle('warn', {
          phase: 'send_blocked_busy',
          sessionId,
          workspaceId: sessionWorkspaceId ?? null,
          source,
        })
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
      logAgentViewLifecycle('info', {
        phase: 'send_dispatch',
        sessionId,
        workspaceId: sessionWorkspaceId ?? null,
        source,
        attachmentCount: attachmentFiles.length,
        mentionedSkills,
        mentionedMcpServers,
      })

      const sendPayload = {
        userMessage: trimmedUserMessage,
        ...(composedUserMessage ? { composedUserMessage } : {}),
        ...(attachmentFiles.length > 0 ? { attachmentFiles } : {}),
        ...(sessionWorkspaceId && { workspaceId: sessionWorkspaceId }),
        ...(attachedDirectories.length > 0 && { additionalDirectories: attachedDirectories }),
        ...(mentionedSkills.length > 0 && { mentionedSkills }),
        ...(bootstrappedSkills.length > 0 && { bootstrappedSkills }),
        ...(mentionedMcpServers.length > 0 && { mentionedMcpServers }),
      }

      if (sendMessageOptions) {
        await sendMessage(sessionId, sendPayload, sendMessageOptions)
      } else {
        await sendMessage(sessionId, sendPayload)
      }

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
      if (isActiveSessionConflictError(error)) {
        logAgentViewLifecycle('warn', {
          phase: 'send_conflict_busy',
          sessionId,
          workspaceId: sessionWorkspaceId ?? null,
          source,
          status: resolveErrorStatus(error),
        })

        const stillBusy = await reconcileSessionStreaming(sessionId, {
          passive: true,
          recoverIfActive: true,
          reason: 'send-rejected-active-session',
          source,
          workspaceId: sessionWorkspaceId,
        })

        setStreamErrors((prev) => {
          if (!prev.has(sessionId)) return prev

          const map = new Map(prev)
          map.delete(sessionId)
          return map
        })

        const nextMessages = await api.getSessionMessages(sessionId)
        setMessagesBySession((prev) => replaceMessagesForSession(prev, sessionId, nextMessages))
        toast.error(SESSION_BUSY_ERROR_MESSAGE)
        logAgentViewLifecycle('warn', {
          phase: 'send_conflict_busy_adopted',
          sessionId,
          workspaceId: sessionWorkspaceId ?? null,
          source,
          restoredBusy: stillBusy,
        })
        return {
          ok: false,
          errorMessage: SESSION_BUSY_ERROR_MESSAGE,
        }
      }

      logAgentViewLifecycle('error', {
        phase: 'send_failed',
        sessionId,
        workspaceId: sessionWorkspaceId ?? null,
        source,
        error: error instanceof Error ? error.message : String(error),
      })
      const errorMessage = error instanceof Error ? error.message : '发送消息失败'
      toast.error(errorMessage)
      onSendError?.(error)
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
    onSendError,
    reconcileSessionStreaming,
    sendMessage,
    sendMessageOptions,
    session,
    sessionId,
    sessionWorkspaceId,
    setInputValue,
    setSessions,
    setStreamErrors,
    status,
    streaming,
  ])

  const triggerPassiveReconcile = React.useCallback((reason: string): void => {
    if (!streaming) return

    logAgentViewLifecycle('info', {
      phase: 'passive_reconcile_trigger',
      sessionId,
      workspaceId: sessionWorkspaceId ?? null,
      reason,
    })

    void reconcileSessionStreaming(sessionId, {
      passive: true,
      reason,
      source: 'agent-view',
      workspaceId: sessionWorkspaceId,
    })
  }, [reconcileSessionStreaming, sessionId, sessionWorkspaceId, streaming])

  const sendDraftMessage = React.useCallback(async (nextUserMessage: string): Promise<boolean> => {
    const trimmedUserMessage = nextUserMessage.trim()
    if (beforeSendMessage) {
      const interception = await beforeSendMessage({
        userMessage: trimmedUserMessage,
        sessionId,
        ...(sessionWorkspaceId ? { workspaceId: sessionWorkspaceId } : {}),
      })

      if (interception?.handled) {
        if (interception.clearComposer) {
          setInputValue('')
        }

        if (interception.clearAttachments) {
          setPendingAttachments((current) => {
            releasePendingAgentAttachments(current)
            return []
          })
        }

        return false
      }
    }

    const payload = await resolvePreparedAgentSendPayload({
      userMessage: nextUserMessage.trim(),
      sessionId,
      ...(sessionWorkspaceId ? { workspaceId: sessionWorkspaceId } : {}),
      messageDecorator,
      defaultMentionedSkills,
      prepareSendPayload,
    })
    if ('blocked' in payload) {
      toast.error(payload.errorMessage)
      return false
    }

    const result = await executeSend({
      userMessage: payload.userMessage,
      ...(payload.composedUserMessage ? { composedUserMessage: payload.composedUserMessage } : {}),
      mentionedSkills: payload.mentionedSkills,
      bootstrappedSkills: payload.bootstrappedSkills ?? [],
      mentionedMcpServers: payload.mentionedMcpServers,
      optimisticAttachments: pendingAttachments,
      attachmentFiles: pendingAttachments.map((attachment) => attachment.file),
      clearComposerOnSuccess: true,
      clearAttachmentsOnSuccess: true,
      emitMessageSent: true,
    })

    return result.ok
  }, [
    beforeSendMessage,
    defaultMentionedSkills,
    executeSend,
    messageDecorator,
    pendingAttachments,
    prepareSendPayload,
    sessionId,
    sessionWorkspaceId,
    setInputValue,
  ])

  const handleSend = React.useCallback(async (): Promise<void> => {
    if (composerSendDisabled) {
      return
    }

    await sendDraftMessage(latestDraftValueRef.current)
  }, [composerSendDisabled, sendDraftMessage])

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
      bootstrappedSkills: programmaticSendRequest.bootstrappedSkills ?? [],
      mentionedMcpServers: programmaticSendRequest.mentionedMcpServers ?? [],
      optimisticAttachments: [],
      attachmentFiles: [],
      clearComposerOnSuccess: false,
      clearAttachmentsOnSuccess: false,
      emitMessageSent: false,
    }).then((result) => {
      logAgentViewLifecycle(result.ok ? 'info' : 'warn', {
        phase: 'programmatic_send_settled',
        sessionId,
        workspaceId: sessionWorkspaceId ?? null,
        requestId: programmaticSendRequest.requestId,
        status: result.ok ? 'sent' : 'failed',
        errorMessage: result.errorMessage ?? null,
      })

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
    sessionId,
    sessionWorkspaceId,
  ])

  React.useEffect(() => {
    if (streaming) {
      return
    }

    const lastMessage = messages.at(-1)
    if (lastMessage?.role !== 'user') {
      return
    }

    if (lastMessage.id.startsWith('local-')) {
      return
    }

    const probeKey = `${sessionId}:${refreshVersion}:${lastMessage.id}:${lastMessage.createdAt}`
    if (lastReloadRecoveryProbeKeyRef.current === probeKey) {
      return
    }

    lastReloadRecoveryProbeKeyRef.current = probeKey
    logAgentViewLifecycle('info', {
      phase: 'message_reload_busy_probe',
      sessionId,
      workspaceId: sessionWorkspaceId ?? null,
      messageId: lastMessage.id,
    })

    void reconcileSessionStreaming(sessionId, {
      passive: true,
      recoverIfActive: true,
      reason: 'message-reload-last-user',
      source: 'agent-view',
      workspaceId: sessionWorkspaceId,
    })
  }, [
    messages,
    reconcileSessionStreaming,
    refreshVersion,
    sessionId,
    sessionWorkspaceId,
    streaming,
  ])

  React.useEffect(() => {
    if (!streaming) return
    triggerPassiveReconcile('mount')
  }, [sessionId, streaming, triggerPassiveReconcile])

  React.useEffect(() => {
    if (!streaming || typeof window === 'undefined') {
      return
    }

    const handleFocus = () => {
      triggerPassiveReconcile('window-focus')
    }

    window.addEventListener('focus', handleFocus)

    const doc = typeof document !== 'undefined' ? document : null
    const handleVisibilityChange = () => {
      if (doc?.visibilityState === 'visible') {
        triggerPassiveReconcile('document-visible')
      }
    }

    doc?.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      doc?.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [streaming, triggerPassiveReconcile])

  React.useEffect(() => {
    if (!streaming) {
      return
    }

    const referenceTime = streamingState?.lastActivityAt ?? Date.now()
    const idleForMs = Date.now() - referenceTime
    const delayMs = Math.max(STALE_STREAM_RECONCILE_IDLE_MS - idleForMs, 0)
    const timerId = setTimeout(() => {
      triggerPassiveReconcile('idle-timeout')
    }, delayMs)

    return () => {
      clearTimeout(timerId)
    }
  }, [
    sessionId,
    streaming,
    streamingState?.lastActivityAt,
    streamingState?.startedAt,
    triggerPassiveReconcile,
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
          {composerNotice && (
            <div className="px-3 pb-2">
              {composerNotice}
            </div>
          )}
          <PlainTextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={() => { void handleSend() }}
            onPasteFiles={allowAttachments ? handleAddFiles : undefined}
            disabled={composerInputDisabled}
            submitDisabled={composerSendDisabled}
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
                  disabled={composerSendDisabled}
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
                </>
              )}
              <span className="truncate">
                {streaming
                  ? '正在处理中，可继续输入；完成后可发送。'
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
