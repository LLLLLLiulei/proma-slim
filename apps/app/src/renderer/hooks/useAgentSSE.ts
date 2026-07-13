import { useCallback, useEffect, useRef } from 'react'
import { useStore } from 'jotai'
import type { createStore } from 'jotai/vanilla'
import type {
  AgentEvent,
  AgentRunLifecycleEvent,
  AgentRunOutcome,
  AgentRunTrigger,
  AgentSendInput,
  AgentSessionMeta,
  PageBuilderEditLockCredentials,
  AskUserRequest,
  PermissionRequest,
} from '@ai-page-builder/shared'
import {
  agentMessageRefreshAtom,
  agentSessionsAtom,
  agentStreamErrorsAtom,
  agentStreamingStatesAtom,
  allPendingAskUserRequestsAtom,
  allPendingPermissionRequestsAtom,
  applyAgentEvent,
  type AgentStreamState,
} from '@/atoms/agent-atoms'
import { api } from '@/lib/api'

type JotaiStore = ReturnType<typeof createStore>
type AgentSendRequestPayload =
  Pick<AgentSendInput, 'userMessage'>
  & Partial<AgentSendInput>
  & { attachmentFiles?: File[] }

interface AgentSendRequestOptions {
  editLock?: PageBuilderEditLockCredentials
  trigger?: AgentRunTrigger
  onLifecycleEvent?: (event: AgentRunLifecycleEvent) => void
}

interface RawSSEFrame {
  event: string
  data: string
}

interface ParsedFrame {
  event: string
  data: unknown
}

interface FinalizeOptions {
  error?: string
}

interface EnsureStreamingStateOptions {
  reset?: boolean
}

export interface ReconcileSessionStreamingOptions {
  passive?: boolean
  recoverIfActive?: boolean
  reason?: string
  source?: string
  workspaceId?: string | null
}

export const PASSIVE_RECONCILE_COOLDOWN_MS = 5_000
export const STALE_STREAM_RECONCILE_IDLE_MS = 15_000

function logStreamLifecycle(
  level: 'info' | 'warn' | 'error',
  payload: Record<string, unknown>,
): void {
  const logger = level === 'info' ? console.info : level === 'warn' ? console.warn : console.error
  logger('[useAgentSSE]', payload)
}

function createAgentRunId(sessionId: string): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createInitialStreamState(now = Date.now()): AgentStreamState {
  return {
    running: true,
    content: '',
    toolActivities: [],
    teammates: [],
    startedAt: now,
    lastActivityAt: now,
  }
}

function removePermissionRequest(
  requests: readonly PermissionRequest[],
  requestId: string,
): readonly PermissionRequest[] {
  return requests.filter((request) => request.requestId !== requestId)
}

function removeAskUserRequest(
  requests: readonly AskUserRequest[],
  requestId: string,
): readonly AskUserRequest[] {
  return requests.filter((request) => request.requestId !== requestId)
}

export function ensureStreamingState(
  store: JotaiStore,
  sessionId: string,
  options?: EnsureStreamingStateOptions,
): void {
  const now = Date.now()
  store.set(agentStreamingStatesAtom, (prev: Map<string, AgentStreamState>) => {
    const current = prev.get(sessionId)
    const map = new Map(prev)

    map.set(
      sessionId,
      !current || options?.reset
        ? createInitialStreamState(now)
        : {
            ...current,
            running: true,
            startedAt: current.startedAt ?? now,
            lastActivityAt: now,
          },
    )

    return map
  })
}

export function extractSSEFrames(buffer: string): { frames: RawSSEFrame[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const remainder = parts.pop() ?? ''
  const frames: RawSSEFrame[] = []

  for (const part of parts) {
    if (!part.trim() || part.startsWith(':')) continue

    let event = 'message'
    const dataLines: string[] = []

    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim()
        continue
      }

      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart())
      }
    }

    if (dataLines.length === 0) continue
    frames.push({ event, data: dataLines.join('\n') })
  }

  return { frames, remainder }
}

export function applyStreamFrame(store: JotaiStore, frame: ParsedFrame): void {
  if (frame.event === 'title_updated') {
    const payload = frame.data as { sessionId: string; title: string }
    store.set(agentSessionsAtom, (prev: AgentSessionMeta[]) => prev.map((session) => (
      session.id === payload.sessionId
        ? { ...session, title: payload.title, updatedAt: Date.now() }
        : session
    )))
    return
  }

  const payload = frame.data as { sessionId: string; event: AgentEvent }
  const { sessionId, event } = payload

  ensureStreamingState(store, sessionId)

  store.set(agentStreamingStatesAtom, (prev: Map<string, AgentStreamState>) => {
    const current = prev.get(sessionId) ?? createInitialStreamState()
    const map = new Map(prev)
    map.set(sessionId, applyAgentEvent(current, event))
    return map
  })

  switch (event.type) {
    case 'permission_request':
      store.set(allPendingPermissionRequestsAtom, (prev: Map<string, readonly PermissionRequest[]>) => {
        const map = new Map(prev)
        const current = map.get(sessionId) ?? []
        map.set(sessionId, [...current, event.request])
        return map
      })
      break
    case 'permission_resolved':
      store.set(allPendingPermissionRequestsAtom, (prev: Map<string, readonly PermissionRequest[]>) => {
        const map = new Map(prev)
        const current = map.get(sessionId) ?? []
        const next = removePermissionRequest(current, event.requestId)
        if (next.length === 0) {
          map.delete(sessionId)
        } else {
          map.set(sessionId, next)
        }
        return map
      })
      break
    case 'ask_user_request':
      store.set(allPendingAskUserRequestsAtom, (prev: Map<string, readonly AskUserRequest[]>) => {
        const map = new Map(prev)
        const current = map.get(sessionId) ?? []
        map.set(sessionId, [...current, event.request])
        return map
      })
      break
    case 'ask_user_resolved':
      store.set(allPendingAskUserRequestsAtom, (prev: Map<string, readonly AskUserRequest[]>) => {
        const map = new Map(prev)
        const current = map.get(sessionId) ?? []
        const next = removeAskUserRequest(current, event.requestId)
        if (next.length === 0) {
          map.delete(sessionId)
        } else {
          map.set(sessionId, next)
        }
        return map
      })
      break
    case 'error':
      store.set(agentStreamErrorsAtom, (prev: Map<string, string>) => {
        const map = new Map(prev)
        map.set(sessionId, event.message)
        return map
      })
      break
    default:
      break
  }
}

export function finalizeStream(store: JotaiStore, sessionId: string, options?: FinalizeOptions): void {
  const now = Date.now()
  store.set(agentStreamingStatesAtom, (prev: Map<string, AgentStreamState>) => {
    const current = prev.get(sessionId)
    if (!current) return prev

    const map = new Map(prev)
    map.set(sessionId, { ...current, running: false, lastActivityAt: now })
    return map
  })

  if (options?.error) {
    const errorMessage = options.error
    store.set(agentStreamErrorsAtom, (prev: Map<string, string>) => {
      const map = new Map(prev)
      map.set(sessionId, errorMessage)
      return map
    })
  }

  store.set(agentMessageRefreshAtom, (prev: Map<string, number>) => {
    const map = new Map(prev)
    map.set(sessionId, (prev.get(sessionId) ?? 0) + 1)
    return map
  })
}

export function useAgentSSE() {
  const store = useStore()
  const controllersRef = useRef(new Map<string, AbortController>())
  const pendingConnectStartedAtRef = useRef(new Map<string, number>())
  const detachedSessionsRef = useRef(new Set<string>())
  const stoppingSessionsRef = useRef(new Set<string>())
  const stopSucceededSessionsRef = useRef(new Set<string>())
  const reconcileInFlightRef = useRef(new Map<string, Promise<boolean>>())
  const passiveReconcileCooldownRef = useRef(new Map<string, number>())

  useEffect(() => {
    return () => {
      for (const [sessionId, controller] of controllersRef.current.entries()) {
        detachedSessionsRef.current.add(sessionId)
        controller.abort()
      }
      controllersRef.current.clear()
      pendingConnectStartedAtRef.current.clear()
    }
  }, [])

  const clearStreamError = useCallback((sessionId: string): void => {
    store.set(agentStreamErrorsAtom, (prev: Map<string, string>) => {
      if (!prev.has(sessionId)) return prev

      const map = new Map(prev)
      map.delete(sessionId)
      return map
    })
  }, [store])

  const finalizeStaleStream = useCallback((
    sessionId: string,
    options?: Pick<ReconcileSessionStreamingOptions, 'reason' | 'source' | 'workspaceId'>,
  ): void => {
    const staleController = controllersRef.current.get(sessionId)
    if (staleController) {
      detachedSessionsRef.current.add(sessionId)
      staleController.abort()
    }

    finalizeStream(store, sessionId)
    clearStreamError(sessionId)
    passiveReconcileCooldownRef.current.delete(sessionId)

    logStreamLifecycle('info', {
      phase: 'reconcile_finalize_stale',
      sessionId,
      workspaceId: options?.workspaceId ?? null,
      reason: options?.reason ?? 'unspecified',
      source: options?.source ?? 'unknown',
      hadController: Boolean(staleController),
    })
  }, [clearStreamError, store])

  const stopSession = useCallback(async (sessionId: string): Promise<void> => {
    const controller = controllersRef.current.get(sessionId)
    const hadActiveStream = Boolean(controller)
    stoppingSessionsRef.current.add(sessionId)

    logStreamLifecycle('info', {
      phase: 'stop_start',
      sessionId,
      hadActiveStream,
    })

    try {
      await api.stopSession(sessionId)

      if (!hadActiveStream) {
        finalizeStream(store, sessionId)
        clearStreamError(sessionId)
        return
      }

      stopSucceededSessionsRef.current.add(sessionId)
      controller?.abort()
      logStreamLifecycle('info', {
        phase: 'stop_requested',
        sessionId,
      })
    } catch (error) {
      stoppingSessionsRef.current.delete(sessionId)
      stopSucceededSessionsRef.current.delete(sessionId)
      logStreamLifecycle('error', {
        phase: 'stop_failed',
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      if (!hadActiveStream) {
        stoppingSessionsRef.current.delete(sessionId)
      }
    }
  }, [clearStreamError, store])

  const reconcileSessionStreaming = useCallback(async (
    sessionId: string,
    options?: ReconcileSessionStreamingOptions,
  ): Promise<boolean> => {
    const passive = options?.passive === true
    const recoverIfActive = options?.recoverIfActive === true
    const localRunning = store.get(agentStreamingStatesAtom).get(sessionId)?.running ?? false

    if (!localRunning && !recoverIfActive) {
      return false
    }

    const inFlight = reconcileInFlightRef.current.get(sessionId)
    if (inFlight) {
      logStreamLifecycle('info', {
        phase: 'reconcile_reuse_inflight',
        sessionId,
        workspaceId: options?.workspaceId ?? null,
        passive,
        reason: options?.reason ?? 'unspecified',
        source: options?.source ?? 'unknown',
      })
      return inFlight
    }

    if (passive && localRunning) {
      const lastProbeAt = passiveReconcileCooldownRef.current.get(sessionId) ?? 0
      const now = Date.now()
      if (now - lastProbeAt < PASSIVE_RECONCILE_COOLDOWN_MS) {
        logStreamLifecycle('info', {
          phase: 'reconcile_skip_cooldown',
          sessionId,
          workspaceId: options?.workspaceId ?? null,
          passive: true,
          reason: options?.reason ?? 'unspecified',
          source: options?.source ?? 'unknown',
          cooldownMs: PASSIVE_RECONCILE_COOLDOWN_MS,
        })
        return true
      }
      passiveReconcileCooldownRef.current.set(sessionId, now)
    }

    const probePromise = (async () => {
      try {
        logStreamLifecycle('info', {
          phase: 'reconcile_start',
          sessionId,
          workspaceId: options?.workspaceId ?? null,
          passive,
          reason: options?.reason ?? 'unspecified',
          source: options?.source ?? 'unknown',
        })

        const activity = await api.getSessionActivity(sessionId)
        logStreamLifecycle('info', {
          phase: 'reconcile_result',
          sessionId,
          workspaceId: options?.workspaceId ?? null,
          passive,
          reason: options?.reason ?? 'unspecified',
          source: options?.source ?? 'unknown',
          active: activity.active,
        })

        if (activity.active) {
          const currentRunning = store.get(agentStreamingStatesAtom).get(sessionId)?.running ?? false
          const shouldRestore = recoverIfActive && !currentRunning

          if (currentRunning || shouldRestore) {
            ensureStreamingState(store, sessionId, {
              reset: shouldRestore,
            })
            clearStreamError(sessionId)
          }

          if (passive) {
            passiveReconcileCooldownRef.current.set(sessionId, Date.now())
          }
          logStreamLifecycle('info', {
            phase: shouldRestore ? 'reconcile_restore_active' : 'reconcile_confirm_active',
            sessionId,
            workspaceId: options?.workspaceId ?? null,
            passive,
            reason: options?.reason ?? 'unspecified',
            source: options?.source ?? 'unknown',
            recoverIfActive,
          })
          return true
        }

        if (localRunning) {
          const pendingConnectStartedAt = pendingConnectStartedAtRef.current.get(sessionId)
          if (pendingConnectStartedAt !== undefined) {
            if (passive) {
              passiveReconcileCooldownRef.current.set(sessionId, Date.now())
            }
            logStreamLifecycle('info', {
              phase: 'reconcile_skip_pending_connect',
              sessionId,
              workspaceId: options?.workspaceId ?? null,
              passive,
              reason: options?.reason ?? 'unspecified',
              source: options?.source ?? 'unknown',
              pendingForMs: Math.max(Date.now() - pendingConnectStartedAt, 0),
            })
            return true
          }
          finalizeStaleStream(sessionId, options)
        } else {
          logStreamLifecycle('info', {
            phase: 'reconcile_inactive_without_local_stream',
            sessionId,
            workspaceId: options?.workspaceId ?? null,
            passive,
            reason: options?.reason ?? 'unspecified',
            source: options?.source ?? 'unknown',
          })
        }
        return false
      } catch (error) {
        logStreamLifecycle('error', {
          phase: 'reconcile_failed',
          sessionId,
          workspaceId: options?.workspaceId ?? null,
          passive,
          reason: options?.reason ?? 'unspecified',
          source: options?.source ?? 'unknown',
          error: error instanceof Error ? error.message : String(error),
        })
        return true
      } finally {
        reconcileInFlightRef.current.delete(sessionId)
      }
    })()

    reconcileInFlightRef.current.set(sessionId, probePromise)
    return probePromise
  }, [finalizeStaleStream, store])

  const sendMessage = useCallback(async (
    sessionId: string,
    payload: AgentSendRequestPayload,
    options: AgentSendRequestOptions = {},
  ): Promise<void> => {
    const runId = createAgentRunId(sessionId)
    const trigger = options.trigger ?? 'user'
    let lifecycleCompleted = false
    let streamConnected = false
    let sawResponseStart = false
    let sawFailureFrame = false
    let sawCompleteFrame = false
    const emitLifecycleEvent = (
      phase: AgentRunLifecycleEvent['phase'],
      outcome?: AgentRunOutcome,
    ): void => {
      if (phase === 'response-completed') {
        if (lifecycleCompleted) return
        lifecycleCompleted = true
      }

      try {
        options.onLifecycleEvent?.({
          phase,
          runId,
          trigger,
          sessionId,
          occurredAt: Date.now(),
          ...(outcome ? { outcome } : {}),
        })
      } catch (error) {
        logStreamLifecycle('warn', {
          phase: 'lifecycle_callback_failed',
          sessionId,
          runId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    const applyLifecycleFrame = (frame: ParsedFrame): void => {
      if (!sawResponseStart && (frame.event === 'text_delta' || frame.event === 'text_complete')) {
        sawResponseStart = true
        emitLifecycleEvent('response-started')
      }

      if (frame.event === 'error' || frame.event === 'typed_error' || frame.event === 'retry_failed') {
        sawFailureFrame = true
      }

      if (frame.event === 'complete') {
        sawCompleteFrame = true
      }
    }

    ensureStreamingState(store, sessionId, { reset: true })
    clearStreamError(sessionId)
    passiveReconcileCooldownRef.current.delete(sessionId)
    emitLifecycleEvent('message-sent')

    logStreamLifecycle('info', {
      phase: 'send_start',
      sessionId,
      workspaceId: payload.workspaceId ?? null,
      source: payload.composedUserMessage ? 'composed-send' : 'user-send',
      hasAttachments: Boolean(payload.attachments?.length || payload.attachmentFiles?.length),
      mentionedSkills: payload.mentionedSkills ?? [],
      mentionedMcpServers: payload.mentionedMcpServers ?? [],
    })

    const controller = new AbortController()
    controllersRef.current.set(sessionId, controller)
    pendingConnectStartedAtRef.current.set(sessionId, Date.now())

    const cleanupSessionRefs = () => {
      controllersRef.current.delete(sessionId)
      pendingConnectStartedAtRef.current.delete(sessionId)
      detachedSessionsRef.current.delete(sessionId)
      stoppingSessionsRef.current.delete(sessionId)
      stopSucceededSessionsRef.current.delete(sessionId)
    }

    const handleStreamFailure = (error: unknown): string | null => {
      if (detachedSessionsRef.current.has(sessionId)) {
        logStreamLifecycle('info', {
          phase: 'send_stream_detached',
          sessionId,
          workspaceId: payload.workspaceId ?? null,
        })
        return null
      }

      if (stopSucceededSessionsRef.current.has(sessionId)) {
        finalizeStream(store, sessionId)
        clearStreamError(sessionId)
        emitLifecycleEvent('response-completed', 'stopped')
        logStreamLifecycle('info', {
          phase: 'send_stream_stopped',
          sessionId,
          workspaceId: payload.workspaceId ?? null,
        })
        return null
      }

      if (stoppingSessionsRef.current.has(sessionId)) {
        logStreamLifecycle('info', {
          phase: 'send_stream_stopping',
          sessionId,
          workspaceId: payload.workspaceId ?? null,
        })
        return null
      }

      const message = error instanceof Error ? error.message : '连接已断开'
      finalizeStream(store, sessionId, { error: message || '连接已断开' })
      emitLifecycleEvent(
        'response-completed',
        sawFailureFrame || !streamConnected ? 'failed' : 'disconnected',
      )
      logStreamLifecycle('error', {
        phase: 'send_stream_failed',
        sessionId,
        workspaceId: payload.workspaceId ?? null,
        error: message || '连接已断开',
      })
      return message || '连接已断开'
    }

    let response: Response
    try {
      response = await api.sendMessage(sessionId, payload, {
        signal: controller.signal,
        editLock: options.editLock,
      })
      streamConnected = true
      pendingConnectStartedAtRef.current.delete(sessionId)
      emitLifecycleEvent('processing-started')
      logStreamLifecycle('info', {
        phase: 'send_stream_connected',
        sessionId,
        workspaceId: payload.workspaceId ?? null,
      })
    } catch (error) {
      const message = handleStreamFailure(error)
      cleanupSessionRefs()
      if (message) {
        throw error instanceof Error ? error : new Error(message)
      }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      const error = new Error('未收到流式响应')
      const message = handleStreamFailure(error)
      cleanupSessionRefs()
      if (message) {
        throw error
      }
      return
    }

    void (async () => {
      try {
        const decoder = new TextDecoder()
        let remainder = ''
        let sawFirstFrame = false
        let appliedFrameCount = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          remainder += decoder.decode(value, { stream: true })
          const parsed = extractSSEFrames(remainder)
          remainder = parsed.remainder

          for (const frame of parsed.frames) {
            try {
              const parsedPayload = JSON.parse(frame.data)
              appliedFrameCount += 1
              if (!sawFirstFrame) {
                sawFirstFrame = true
                logStreamLifecycle('info', {
                  phase: 'send_first_frame',
                  sessionId,
                  workspaceId: payload.workspaceId ?? null,
                  event: frame.event,
                })
              } else if (frame.event !== 'text_delta') {
                logStreamLifecycle('info', {
                  phase: 'send_frame',
                  sessionId,
                  workspaceId: payload.workspaceId ?? null,
                  event: frame.event,
                })
              }

              applyStreamFrame(store, {
                event: frame.event,
                data: parsedPayload,
              })
              applyLifecycleFrame({
                event: frame.event,
                data: parsedPayload,
              })
            } catch (error) {
              logStreamLifecycle('warn', {
                phase: 'send_frame_parse_failed',
                sessionId,
                workspaceId: payload.workspaceId ?? null,
                event: frame.event,
                error: error instanceof Error ? error.message : String(error),
              })
            }
          }
        }

        const tail = decoder.decode()
        if (tail) {
          remainder += tail
        }

        const parsed = extractSSEFrames(remainder)
        for (const frame of parsed.frames) {
          try {
            const parsedPayload = JSON.parse(frame.data)
            appliedFrameCount += 1
            applyStreamFrame(store, {
              event: frame.event,
              data: parsedPayload,
            })
            applyLifecycleFrame({
              event: frame.event,
              data: parsedPayload,
            })
          } catch (error) {
            logStreamLifecycle('warn', {
              phase: 'send_tail_parse_failed',
              sessionId,
              workspaceId: payload.workspaceId ?? null,
              event: frame.event,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }

        finalizeStream(store, sessionId)
        clearStreamError(sessionId)
        emitLifecycleEvent(
          'response-completed',
          stopSucceededSessionsRef.current.has(sessionId)
            ? 'stopped'
            : sawFailureFrame ? 'failed' : sawCompleteFrame ? 'success' : 'disconnected',
        )
        logStreamLifecycle('info', {
          phase: 'send_finalize',
          sessionId,
          workspaceId: payload.workspaceId ?? null,
          frameCount: appliedFrameCount,
        })
      } catch (error) {
        handleStreamFailure(error)
      } finally {
        cleanupSessionRefs()
      }
    })()
  }, [clearStreamError, store])

  return {
    reconcileSessionStreaming,
    sendMessage,
    stopSession,
  }
}
