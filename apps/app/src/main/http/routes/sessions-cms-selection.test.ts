import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAgentSession } from '../../lib/agent-session-manager'
import { pageBuilderCmsSelectionService } from '../../lib/page-builder-cms-selection-service'
import { createAgentWorkspace } from '../../lib/workspace-service'
import { createHttpApp } from '../app'

describe('session cms selection routes', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-session-cms-selection-'))
    process.env.PROMA_CONFIG_DIR = configDir
  })

  afterEach(() => {
    delete process.env.PROMA_CONFIG_DIR
    rmSync(configDir, { recursive: true, force: true })
  })

  function createApp() {
    return createHttpApp({
      distDir: process.cwd(),
      isDev: true,
    })
  }

  test('POST /api/sessions/:sessionId/cms-selection-respond resolves the pending CMS selection request', async () => {
    const workspace = createAgentWorkspace('CMS Route Workspace', { template: 'page-builder' })
    const session = createAgentSession('CMS Route Session', undefined, workspace.id)
    let requestId: string | null = null

    const pendingResponse = pageBuilderCmsSelectionService.handleSelectionRequest(
      {
        sessionId: session.id,
        workspaceId: workspace.id,
        selector: '#hero',
        action: 'replace-data',
        allowedSourceTypes: ['content-item'],
      },
      new AbortController().signal,
      (request) => {
        requestId = request.requestId
      },
    )

    expect(requestId).not.toBeNull()

    const response = await createApp().fetch(new Request(`http://localhost/api/sessions/${session.id}/cms-selection-respond`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId,
        status: 'confirmed',
        selection: {
          sourceType: 'content-item',
          stableId: 'content:catalog-1:item-1',
          displayName: '头条新闻',
          selector: '#hero',
          catalogId: 'catalog-1',
          contentId: 'item-1',
          contentTypeId: 'article',
        },
      }),
    }))

    expect(response.status).toBe(204)
    await expect(pendingResponse).resolves.toEqual({
      requestId,
      status: 'confirmed',
      selection: {
        sourceType: 'content-item',
        stableId: 'content:catalog-1:item-1',
        displayName: '头条新闻',
        selector: '#hero',
        catalogId: 'catalog-1',
        contentId: 'item-1',
        contentTypeId: 'article',
      },
    })
  })

  test('POST /api/sessions/:sessionId/cms-selection-respond returns 404 when the request does not exist', async () => {
    const workspace = createAgentWorkspace('CMS Missing Route Workspace', { template: 'page-builder' })
    const session = createAgentSession('CMS Missing Route Session', undefined, workspace.id)

    const response = await createApp().fetch(new Request(`http://localhost/api/sessions/${session.id}/cms-selection-respond`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId: 'missing-request-id',
        status: 'cancelled',
        reason: 'user-cancelled',
      }),
    }))

    expect(response.status).toBe(404)
    await expect(response.text()).resolves.toContain('CMS 选择请求不存在')
  })
})
