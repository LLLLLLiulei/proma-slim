import { describe, expect, test } from 'bun:test'
import type {
  PageBuilderCmsSelectionRequest,
  PageBuilderCmsSelectionResponse,
} from '@proma/shared'
import { AgentPageBuilderCmsSelectionService } from './page-builder-cms-selection-service'

function createSelectionRequest(sessionId = 'session-1'): Omit<PageBuilderCmsSelectionRequest, 'requestId'> {
  return {
    sessionId,
    workspaceId: 'workspace-1',
    selector: '#hero',
    action: 'replace-data',
    allowedSourceTypes: ['content-item'],
    allowMultiple: false,
    presentationHint: 'hero',
    title: '为当前区块选择 CMS 数据',
    description: '请选择一条内容作为当前区域的数据源。',
  }
}

function createConfirmedResponse(requestId: string): PageBuilderCmsSelectionResponse {
  return {
    requestId,
    status: 'confirmed',
    selection: {
      sourceType: 'content-item',
      stableId: 'content:catalog-1:item-1',
      displayName: '头条新闻',
      catalogId: 'catalog-1',
      contentId: 'item-1',
      contentTypeId: 'article',
      selector: '#hero',
      presentationHint: 'hero',
      itemIds: ['item-1'],
      items: [{
        id: 'item-1',
        title: '头条新闻',
        summary: '最新摘要',
      }],
    },
  }
}

describe('AgentPageBuilderCmsSelectionService', () => {
  test('emits a pending request and resolves with a confirmed selection', async () => {
    const service = new AgentPageBuilderCmsSelectionService()
    const sentRequests: PageBuilderCmsSelectionRequest[] = []

    const promise = service.handleSelectionRequest(
      createSelectionRequest(),
      new AbortController().signal,
      (request) => sentRequests.push(request),
    )

    expect(sentRequests).toHaveLength(1)
    const request = sentRequests[0]!

    const resolvedSessionId = service.respondToSelection(createConfirmedResponse(request.requestId))

    expect(resolvedSessionId).toBe('session-1')
    await expect(promise).resolves.toEqual(createConfirmedResponse(request.requestId))
  })

  test('returns a cancelled result when the pending request is cleared with the session', async () => {
    const service = new AgentPageBuilderCmsSelectionService()
    const sentRequests: PageBuilderCmsSelectionRequest[] = []

    const promise = service.handleSelectionRequest(
      createSelectionRequest('session-2'),
      new AbortController().signal,
      (request) => sentRequests.push(request),
    )

    expect(sentRequests).toHaveLength(1)

    service.clearSessionPending('session-2')

    await expect(promise).resolves.toEqual({
      requestId: sentRequests[0]!.requestId,
      status: 'cancelled',
      reason: 'session-ended',
    })
  })

  test('returns null when responding to an unknown request', () => {
    const service = new AgentPageBuilderCmsSelectionService()

    expect(service.respondToSelection({
      requestId: 'missing-request',
      status: 'cancelled',
      reason: 'user-cancelled',
    })).toBeNull()
  })
})
