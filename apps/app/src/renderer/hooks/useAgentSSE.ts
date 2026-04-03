import { useCallback, useEffect, useRef } from 'react'
import { useStore } from 'jotai'
import type { createStore } from 'jotai/vanilla'
import type {
  AgentEvent,
  AgentSendInput,
  AgentSessionMeta,
  AskUserRequest,
  PermissionRequest,
} from '@proma/shared'
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

function createInitialStreamState(): AgentStreamState {
  return {
    running: true,
    content: '',
    toolActivities: [],
    teammates: [],
    startedAt: Date.now(),
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
  store.set(agentStreamingStatesAtom, (prev: Map<string, AgentStreamState>) => {
    const current = prev.get(sessionId)
    const map = new Map(prev)

    map.set(
      sessionId,
      !current || options?.reset
        ? createInitialStreamState()
        : {
            ...current,
            running: true,
            startedAt: current.startedAt ?? Date.now(),
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
  store.set(agentStreamingStatesAtom, (prev: Map<string, AgentStreamState>) => {
    const current = prev.get(sessionId)
    if (!current) return prev

    const map = new Map(prev)
    map.set(sessionId, { ...current, running: false })
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
  const detachedSessionsRef = useRef(new Set<string>())
  const stoppingSessionsRef = useRef(new Set<string>())
  const stopSucceededSessionsRef = useRef(new Set<string>())

  useEffect(() => {
    return () => {
      for (const [sessionId, controller] of controllersRef.current.entries()) {
        detachedSessionsRef.current.add(sessionId)
        controller.abort()
      }
      controllersRef.current.clear()
    }
  }, [])

  const stopSession = useCallback(async (sessionId: string): Promise<void> => {
    const controller = controllersRef.current.get(sessionId)
    const hadActiveStream = Boolean(controller)
    stoppingSessionsRef.current.add(sessionId)

    try {
      await api.stopSession(sessionId)

      if (!hadActiveStream) {
        finalizeStream(store, sessionId)
        return
      }

      stopSucceededSessionsRef.current.add(sessionId)
      controller?.abort()
    } catch (error) {
      stoppingSessionsRef.current.delete(sessionId)
      stopSucceededSessionsRef.current.delete(sessionId)
      throw error
    } finally {
      if (!hadActiveStream) {
        stoppingSessionsRef.current.delete(sessionId)
      }
    }
  }, [store])

  const reconcileSessionStreaming = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const activity = await api.getSessionActivity(sessionId)
      if (activity.active) {
        return true
      }

      const staleController = controllersRef.current.get(sessionId)
      if (staleController) {
        detachedSessionsRef.current.add(sessionId)
        staleController.abort()
      }

      finalizeStream(store, sessionId)
      store.set(agentStreamErrorsAtom, (prev: Map<string, string>) => {
        const map = new Map(prev)
        map.delete(sessionId)
        return map
      })
      return false
    } catch (error) {
      console.error('[useAgentSSE] 探测会话活跃状态失败:', error)
      return true
    }
  }, [store])

  const sendMessage = useCallback(async (
    sessionId: string,
    payload: Pick<AgentSendInput, 'userMessage'> & Partial<AgentSendInput>,
  ): Promise<void> => {
    ensureStreamingState(store, sessionId, { reset: true })
    store.set(agentStreamErrorsAtom, (prev: Map<string, string>) => {
      const map = new Map(prev)
      map.delete(sessionId)
      return map
    })

    const controller = new AbortController()
    controllersRef.current.set(sessionId, controller)

    const cleanupSessionRefs = () => {
      controllersRef.current.delete(sessionId)
      detachedSessionsRef.current.delete(sessionId)
      stoppingSessionsRef.current.delete(sessionId)
      stopSucceededSessionsRef.current.delete(sessionId)
    }

    const handleStreamFailure = (error: unknown): string | null => {
      if (detachedSessionsRef.current.has(sessionId)) return null

      if (stopSucceededSessionsRef.current.has(sessionId)) {
        finalizeStream(store, sessionId)
        return null
      }

      if (stoppingSessionsRef.current.has(sessionId)) {
        return null
      }

      const message = error instanceof Error ? error.message : '连接已断开'
      finalizeStream(store, sessionId, { error: message || '连接已断开' })
      return message || '连接已断开'
    }

    let response: Response
    try {
      response = await api.sendMessage(sessionId, payload, { signal: controller.signal })
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

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          remainder += decoder.decode(value, { stream: true })
          const parsed = extractSSEFrames(remainder)
          remainder = parsed.remainder

          for (const frame of parsed.frames) {
            try {
              applyStreamFrame(store, {
                event: frame.event,
                data: JSON.parse(frame.data),
              })
            } catch (error) {
              console.warn('[SSE] 解析事件失败:', error)
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
            applyStreamFrame(store, {
              event: frame.event,
              data: JSON.parse(frame.data),
            })
          } catch (error) {
            console.warn('[SSE] 解析尾部事件失败:', error)
          }
        }

        finalizeStream(store, sessionId)
      } catch (error) {
        handleStreamFailure(error)
      } finally {
        cleanupSessionRefs()
      }
    })()
  }, [store])

  return {
    reconcileSessionStreaming,
    sendMessage,
    stopSession,
  }
}
