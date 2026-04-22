import type { AgentEvent } from '@proma/shared'
import {
  createSseConnectionTraceContext,
  getDiagnosticBackendLogger,
  type SseConnectionTraceContext,
} from './lib/diagnostic-logging'

const encoder = new TextEncoder()

export type SseConnectionCloseReason =
  | 'client_cancel'
  | 'emit_failed'
  | 'server_close'
  | 'turn_complete'
  | 'turn_error'
  | 'manual_stop'

function logSseLifecycle(
  level: 'info' | 'warn' | 'error',
  payload: Record<string, unknown>,
): void {
  const diagnosticLogger = getDiagnosticBackendLogger({
    component: 'sse_manager',
    category: 'transport',
    requestId: payload.requestId ?? null,
    turnId: payload.turnId ?? null,
    sessionId: payload.sessionId ?? null,
    sseConnectionId: payload.sseConnectionId ?? null,
  })
  if (level === 'info') {
    diagnosticLogger.info(payload, 'SSE 连接生命周期')
  } else if (level === 'warn') {
    diagnosticLogger.warn(payload, 'SSE 连接生命周期')
  } else {
    diagnosticLogger.error(payload, 'SSE 连接生命周期')
  }

  const consoleLogger = level === 'info' ? console.info : level === 'warn' ? console.warn : console.error
  consoleLogger('[sse-manager]', payload)
}

interface SessionConnection {
  controller: ReadableStreamDefaultController<Uint8Array>
  onClose?: () => void
  closed: boolean
  traceContext: SseConnectionTraceContext
}

function formatEvent(event: string, payload: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
}

export class SSEManager {
  private sessions = new Map<string, Set<SessionConnection>>()

  createResponse(
    sessionId: string,
    options?: {
      onClose?: () => void
      traceContext?: SseConnectionTraceContext
    },
  ): Response {
    let connection: SessionConnection | null = null

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const traceContext = options?.traceContext ?? createSseConnectionTraceContext({ sessionId })
        connection = {
          controller,
          onClose: options?.onClose,
          closed: false,
          traceContext,
        }

        const sessionConnections = this.sessions.get(sessionId) ?? new Set<SessionConnection>()
        sessionConnections.add(connection)
        this.sessions.set(sessionId, sessionConnections)

        logSseLifecycle('info', {
          phase: 'connection_open',
          sessionId,
          requestId: traceContext.requestId ?? null,
          turnId: traceContext.turnId ?? null,
          sseConnectionId: traceContext.sseConnectionId,
          connectionCount: sessionConnections.size,
        })

        controller.enqueue(encoder.encode(': connected\n\n'))
      },
      cancel: () => {
        logSseLifecycle('info', {
          phase: 'connection_cancel',
          sessionId,
          requestId: connection?.traceContext.requestId ?? null,
          turnId: connection?.traceContext.turnId ?? null,
          sseConnectionId: connection?.traceContext.sseConnectionId ?? null,
        })
        if (connection) {
          this.closeConnection(sessionId, connection, 'client_cancel')
        }
      },
    })

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    })
  }

  hasSession(sessionId: string): boolean {
    return (this.sessions.get(sessionId)?.size ?? 0) > 0
  }

  emitAgentEvent(sessionId: string, event: AgentEvent): void {
    this.emit(sessionId, event.type, {
      sessionId,
      event,
    })
  }

  emitTitleUpdated(sessionId: string, title: string): void {
    this.emit(sessionId, 'title_updated', {
      sessionId,
      title,
    })
  }

  closeSession(sessionId: string, reason: SseConnectionCloseReason = 'server_close'): void {
    const connections = this.sessions.get(sessionId)
    if (!connections) return

    for (const connection of connections) {
      this.closeConnection(sessionId, connection, reason)
    }
  }

  private emit(sessionId: string, event: string, payload: unknown): void {
    const connections = this.sessions.get(sessionId)
    if (!connections || connections.size === 0) return

    const frame = formatEvent(event, payload)

    for (const connection of connections) {
      if (connection.closed) continue

      try {
        connection.controller.enqueue(frame)
      } catch (error) {
        logSseLifecycle('warn', {
          phase: 'emit_failed',
          sessionId,
          requestId: connection.traceContext.requestId ?? null,
          turnId: connection.traceContext.turnId ?? null,
          sseConnectionId: connection.traceContext.sseConnectionId,
          event,
          error: error instanceof Error ? error.message : String(error),
        })
        console.warn(`[SSE] 推送事件失败 (${sessionId}/${event}):`, error)
        this.closeConnection(sessionId, connection, 'emit_failed')
      }
    }
  }

  private closeConnection(
    sessionId: string,
    connection: SessionConnection,
    reason: SseConnectionCloseReason,
  ): void {
    if (connection.closed) return
    connection.closed = true

    try {
      connection.controller.close()
    } catch {
      // ignore already closed stream
    }

    try {
      connection.onClose?.()
    } catch (error) {
      logSseLifecycle('warn', {
        phase: 'connection_on_close_failed',
        sessionId,
        requestId: connection.traceContext.requestId ?? null,
        turnId: connection.traceContext.turnId ?? null,
        sseConnectionId: connection.traceContext.sseConnectionId,
        error: error instanceof Error ? error.message : String(error),
      })
      console.warn(`[SSE] 关闭连接回调失败 (${sessionId}):`, error)
    }

    const connections = this.sessions.get(sessionId)
    if (!connections) return

    connections.delete(connection)
    if (connections.size === 0) {
      this.sessions.delete(sessionId)
    }

    logSseLifecycle('info', {
      phase: 'connection_close',
      sessionId,
      requestId: connection.traceContext.requestId ?? null,
      turnId: connection.traceContext.turnId ?? null,
      sseConnectionId: connection.traceContext.sseConnectionId,
      closeReason: reason,
      remainingConnections: connections.size,
    })
  }
}

export const sseManager = new SSEManager()
