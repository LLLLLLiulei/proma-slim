import { randomUUID } from 'node:crypto'
import type {
  PageBuilderCmsSelectionRequest,
  PageBuilderCmsSelectionResponse,
} from '@proma/shared'

interface PendingCmsSelection {
  request: PageBuilderCmsSelectionRequest
  resolve: (response: PageBuilderCmsSelectionResponse) => void
  notifyResolved?: (response: PageBuilderCmsSelectionResponse) => void
}

export class AgentPageBuilderCmsSelectionService {
  private pendingRequests = new Map<string, PendingCmsSelection>()

  handleSelectionRequest(
    requestInput: Omit<PageBuilderCmsSelectionRequest, 'requestId'>,
    signal: AbortSignal,
    sendToRenderer: (request: PageBuilderCmsSelectionRequest) => void,
    notifyResolved?: (response: PageBuilderCmsSelectionResponse) => void,
  ): Promise<PageBuilderCmsSelectionResponse> {
    const request: PageBuilderCmsSelectionRequest = {
      ...requestInput,
      requestId: randomUUID(),
    }

    sendToRenderer(request)

    return new Promise<PageBuilderCmsSelectionResponse>((resolve) => {
      this.pendingRequests.set(request.requestId, {
        request,
        resolve,
        notifyResolved,
      })

      signal.addEventListener('abort', () => {
        const pending = this.pendingRequests.get(request.requestId)
        if (!pending) return

        this.pendingRequests.delete(request.requestId)
        const response: PageBuilderCmsSelectionResponse = {
          requestId: request.requestId,
          status: 'cancelled',
          reason: 'aborted',
        }
        pending.notifyResolved?.(response)
        pending.resolve(response)
      }, { once: true })
    })
  }

  respondToSelection(response: PageBuilderCmsSelectionResponse): string | null {
    const pending = this.pendingRequests.get(response.requestId)
    if (!pending) return null

    this.pendingRequests.delete(response.requestId)
    pending.notifyResolved?.(response)
    pending.resolve(response)
    return pending.request.sessionId
  }

  clearSessionPending(sessionId: string): void {
    for (const [requestId, pending] of this.pendingRequests) {
      if (pending.request.sessionId !== sessionId) continue

      this.pendingRequests.delete(requestId)
      const response: PageBuilderCmsSelectionResponse = {
        requestId,
        status: 'cancelled',
        reason: 'session-ended',
      }
      pending.notifyResolved?.(response)
      pending.resolve(response)
    }
  }
}

export const pageBuilderCmsSelectionService = new AgentPageBuilderCmsSelectionService()
