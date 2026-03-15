import type { AgentEvent } from '@proma/shared'

const encoder = new TextEncoder()

interface SessionConnection {
  controller: ReadableStreamDefaultController<Uint8Array>
  onClose?: () => void
  closed: boolean
}

function formatEvent(event: string, payload: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
}

export class SSEManager {
  private sessions = new Map<string, Set<SessionConnection>>()

  createResponse(sessionId: string, onClose?: () => void): Response {
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const connection: SessionConnection = {
          controller,
          onClose,
          closed: false,
        }

        const sessionConnections = this.sessions.get(sessionId) ?? new Set<SessionConnection>()
        sessionConnections.add(connection)
        this.sessions.set(sessionId, sessionConnections)

        controller.enqueue(encoder.encode(': connected\n\n'))
      },
      cancel: () => {
        this.closeSession(sessionId)
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

  closeSession(sessionId: string): void {
    const connections = this.sessions.get(sessionId)
    if (!connections) return

    for (const connection of connections) {
      this.closeConnection(sessionId, connection)
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
        console.warn(`[SSE] 推送事件失败 (${sessionId}/${event}):`, error)
        this.closeConnection(sessionId, connection)
      }
    }
  }

  private closeConnection(sessionId: string, connection: SessionConnection): void {
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
      console.warn(`[SSE] 关闭连接回调失败 (${sessionId}):`, error)
    }

    const connections = this.sessions.get(sessionId)
    if (!connections) return

    connections.delete(connection)
    if (connections.size === 0) {
      this.sessions.delete(sessionId)
    }
  }
}

export const sseManager = new SSEManager()
