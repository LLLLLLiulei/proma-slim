import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createAgentSession } from '../../lib/agent-session-manager'
import { createAgentWorkspace } from '../../lib/workspace-service'
import { createHttpApp } from '../app'

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

function createApp() {
  return createHttpApp({
    distDir: process.cwd(),
    isDev: true,
  })
}

describe('page-builder routes', () => {
  test('GET /api/page-builder/projects returns page-builder project summaries', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('History Project', { template: 'page-builder' })
    createAgentSession('History Session', undefined, workspace.id)

    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')
    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(join(workspaceFilesDir, 'index.html'), '<h1>Preview</h1>', 'utf-8')

    const response = await app.fetch(new Request('http://localhost/api/page-builder/projects'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([expect.objectContaining({
      workspaceId: workspace.id,
      workspaceName: 'History Project',
      previewUrl: `/api/workspaces/${workspace.id}/preview/`,
    })])
  })

  test('DELETE /api/page-builder/projects/:workspaceId deletes the whole page-builder project', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Disposable Project', { template: 'page-builder' })
    createAgentSession('Draft', undefined, workspace.id)
    const workspaceRoot = join(homedir(), '.proma', 'agent-workspaces', workspace.slug)
    writeFileSync(join(workspaceRoot, 'workspace-files', 'index.html'), '<h1>Preview</h1>', 'utf-8')

    const response = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspace.id}`, {
      method: 'DELETE',
    }))

    expect(response.status).toBe(204)
    const listResponse = await app.fetch(new Request('http://localhost/api/page-builder/projects'))
    expect(await listResponse.json()).toEqual([])
  })
})
