import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { getSettings, updateSettings } from '../lib/settings-service'
import { getUserProfile, updateUserProfile } from '../lib/user-profile-service'
import { createAgentSession, getAgentSessionMeta, updateAgentSessionMeta } from '../lib/agent-session-manager'
import { createAgentWorkspace, ensureDefaultWorkspace } from '../lib/workspace-service'
import { createHttpApp } from './app'

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

function createApp() {
  return createHttpApp({
    distDir: process.cwd(),
    isDev: true,
  })
}

describe('createHttpApp', () => {
  test('GET /api/status returns the current status payload', async () => {
    const app = createApp()

    const response = await app.fetch(new Request('http://localhost/api/status'))

    expect(response.status).toBe(200)
    const payload = await response.json() as {
      ok: boolean
      apiKeyConfigured: boolean
      sdkCliAvailable: boolean
    }
    expect(typeof payload.ok).toBe('boolean')
    expect(typeof payload.apiKeyConfigured).toBe('boolean')
    expect(typeof payload.sdkCliAvailable).toBe('boolean')
  })

  test('settings routes preserve existing GET and PATCH behavior', async () => {
    const app = createApp()

    const getResponse = await app.fetch(new Request('http://localhost/api/settings'))
    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toEqual(getSettings())

    const patchResponse = await app.fetch(new Request('http://localhost/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ themeMode: 'light' }),
      headers: {
        'content-type': 'application/json',
      },
    }))

    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toEqual(updateSettings({ themeMode: 'light' }))
  })

  test('settings routes persist agentWorkspaceId for browser-independent workspace restore', async () => {
    const app = createApp()

    const patchResponse = await app.fetch(new Request('http://localhost/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ agentWorkspaceId: 'workspace-restore-target' }),
      headers: {
        'content-type': 'application/json',
      },
    }))

    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toEqual(updateSettings({ agentWorkspaceId: 'workspace-restore-target' }))

    const getResponse = await app.fetch(new Request('http://localhost/api/settings'))
    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toEqual(getSettings())
  })

  test('settings routes persist askUserTimeoutMs and treat 0 as no timeout', async () => {
    const app = createApp()

    const patchResponse = await app.fetch(new Request('http://localhost/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ askUserTimeoutMs: 1500 }),
      headers: {
        'content-type': 'application/json',
      },
    }))

    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toEqual(updateSettings({ askUserTimeoutMs: 1500 }))

    const resetResponse = await app.fetch(new Request('http://localhost/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ askUserTimeoutMs: 0 }),
      headers: {
        'content-type': 'application/json',
      },
    }))

    expect(resetResponse.status).toBe(200)
    expect(await resetResponse.json()).toEqual(updateSettings({ askUserTimeoutMs: 0 }))
  })

  test('user profile routes preserve existing GET and PATCH behavior', async () => {
    const app = createApp()

    const getResponse = await app.fetch(new Request('http://localhost/api/user-profile'))
    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toEqual(getUserProfile())

    const patchResponse = await app.fetch(new Request('http://localhost/api/user-profile', {
      method: 'PATCH',
      body: JSON.stringify({ userName: 'Proma Tester' }),
      headers: {
        'content-type': 'application/json',
      },
    }))

    expect(patchResponse.status).toBe(200)
    expect(await patchResponse.json()).toEqual(updateUserProfile({ userName: 'Proma Tester' }))
  })

  test('unknown /api routes return a JSON error payload', async () => {
    const app = createApp()

    const response = await app.fetch(new Request('http://localhost/api/not-found'))

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({ error: '接口不存在' })
  })

  test('workspace routes preserve the existing CRUD and query behavior', async () => {
    const app = createApp()
    ensureDefaultWorkspace()

    const listResponse = await app.fetch(new Request('http://localhost/api/workspaces'))
    expect(listResponse.status).toBe(200)
    const listed = await listResponse.json() as Array<{ slug: string }>
    expect(listed.some((workspace) => workspace.slug === 'default')).toBe(true)

    const createResponse = await app.fetch(new Request('http://localhost/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'Proma Docs' }),
      headers: {
        'content-type': 'application/json',
      },
    }))
    expect(createResponse.status).toBe(201)
    const created = await createResponse.json() as { id: string; name: string; slug: string }
    expect(created.name).toBe('Proma Docs')
    expect(created.slug).toBe('proma-docs')

    const renameResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed Docs' }),
      headers: {
        'content-type': 'application/json',
      },
    }))
    expect(renameResponse.status).toBe(200)
    const renamed = await renameResponse.json() as { name: string; slug: string }
    expect(renamed.name).toBe('Renamed Docs')
    expect(renamed.slug).toBe('proma-docs')

    const capabilityResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${created.id}/capabilities`))
    expect(capabilityResponse.status).toBe(200)

    const contextResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${created.id}/directory-context`))
    expect(contextResponse.status).toBe(200)
    const context = await contextResponse.json() as {
      workspaceSlug: string
      workspaceFilesPath: string
      memoryFilePath: string
    }
    expect(context.workspaceSlug).toBe('proma-docs')
    expect(context.workspaceFilesPath).toContain('/workspace-files')
    expect(context.memoryFilePath).toContain('/memory/MEMORY.md')

    const workspaceRoot = join(homedir(), '.proma', 'agent-workspaces', created.slug)
    const externalDir = join(homedir(), '.proma', 'external-docs')
    mkdirSync(join(workspaceRoot, 'docs'), { recursive: true })
    mkdirSync(externalDir, { recursive: true })
    writeFileSync(join(workspaceRoot, 'docs', 'claude.md'), '# Claude', 'utf-8')
    writeFileSync(join(externalDir, 'guide.md'), '# Guide', 'utf-8')
    writeFileSync(
      join(workspaceRoot, 'config.json'),
      JSON.stringify({ attachedDirectories: [externalDir] }, null, 2),
      'utf-8',
    )

    const searchResponse = await app.fetch(
      new Request(`http://localhost/api/workspaces/${created.id}/file-search?q=gui&limit=5`),
    )
    expect(searchResponse.status).toBe(200)
    const searchResult = await searchResponse.json() as { entries: Array<{ path: string }>; total: number }
    expect(searchResult.total).toBeGreaterThan(0)
    expect(searchResult.entries.some((entry) => entry.path === 'guide.md')).toBe(true)

    const deleteResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${created.id}`, {
      method: 'DELETE',
    }))
    expect(deleteResponse.status).toBe(204)
  })

  test('workspace routes can create a page-builder workspace with a root CLAUDE.md file', async () => {
    const app = createApp()

    const createResponse = await app.fetch(new Request('http://localhost/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Page Builder Project',
        template: 'page-builder',
      }),
      headers: {
        'content-type': 'application/json',
      },
    }))

    expect(createResponse.status).toBe(201)
    const created = await createResponse.json() as { id: string; slug: string }
    const claudeMdPath = join(homedir(), '.proma', 'agent-workspaces', created.slug, 'CLAUDE.md')

    expect(readFileSync(claudeMdPath, 'utf-8')).toContain('workspace-files/index.html')
    expect(readFileSync(claudeMdPath, 'utf-8')).toContain('workspace-files/assets/')
  })

  test('workspace preview routes expose preview-state, serve workspace-files, and refresh revision on changes', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Preview Docs')
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    const emptyStateResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/preview-state`))
    expect(emptyStateResponse.status).toBe(200)
    expect(await emptyStateResponse.json()).toEqual({
      hasPreview: false,
      entryUrl: null,
      revision: null,
    })

    mkdirSync(join(workspaceFilesDir, 'assets'), { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><link rel="stylesheet" href="./assets/site.css"><h1>Preview</h1></body></html>',
      'utf-8',
    )
    writeFileSync(join(workspaceFilesDir, 'assets', 'site.css'), 'body { color: red; }', 'utf-8')

    const previewStateResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/preview-state`))
    expect(previewStateResponse.status).toBe(200)
    const previewState = await previewStateResponse.json() as {
      hasPreview: boolean
      entryUrl: string | null
      revision: string | null
    }
    expect(previewState.hasPreview).toBe(true)
    expect(previewState.entryUrl).toBe(`/api/workspaces/${workspace.id}/preview/`)
    expect(typeof previewState.revision).toBe('string')
    expect(previewState.revision?.length).toBeGreaterThan(0)

    const previewResponse = await app.fetch(new Request(`http://localhost${previewState.entryUrl}`))
    expect(previewResponse.status).toBe(200)
    expect(await previewResponse.text()).toContain('<h1>Preview</h1>')

    const assetResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/preview/assets/site.css`))
    expect(assetResponse.status).toBe(200)
    expect(await assetResponse.text()).toContain('color: red')

    writeFileSync(join(workspaceFilesDir, 'assets', 'site.css'), 'body { color: blue; }', 'utf-8')

    const updatedStateResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/preview-state`))
    expect(updatedStateResponse.status).toBe(200)
    const updatedState = await updatedStateResponse.json() as {
      hasPreview: boolean
      entryUrl: string | null
      revision: string | null
    }
    expect(updatedState.hasPreview).toBe(true)
    expect(updatedState.revision).not.toBe(previewState.revision)
  })

  test('workspace preview routes stop serving stale preview content when the entry disappears', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Preview Safety')
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(join(workspaceFilesDir, 'index.html'), '<html><body>safe</body></html>', 'utf-8')

    rmSync(join(workspaceFilesDir, 'index.html'))

    const emptyStateResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/preview-state`))
    expect(emptyStateResponse.status).toBe(200)
    expect(await emptyStateResponse.json()).toEqual({
      hasPreview: false,
      entryUrl: null,
      revision: null,
    })

    const missingPreviewResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/preview/`))
    expect(missingPreviewResponse.status).toBe(404)
    expect(await missingPreviewResponse.json()).toEqual({ error: '预览入口不存在' })
  })

  test('workspace routes return a 404 JSON error when the workspace is missing', async () => {
    const app = createApp()

    const response = await app.fetch(new Request('http://localhost/api/workspaces/missing-workspace/capabilities'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: '工作区不存在: missing-workspace' })
  })

  test('session routes preserve workspace-aware CRUD behavior', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Docs Runtime')

    const createResponse = await app.fetch(new Request('http://localhost/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: 'Workspace session', workspaceId: workspace.id }),
      headers: {
        'content-type': 'application/json',
      },
    }))
    expect(createResponse.status).toBe(201)
    const created = await createResponse.json() as { id: string; workspaceId?: string }
    expect(created.workspaceId).toBe(workspace.id)
    expect(getAgentSessionMeta(created.id)?.workspaceId).toBe(workspace.id)

    const listResponse = await app.fetch(new Request('http://localhost/api/sessions'))
    expect(listResponse.status).toBe(200)
    const listed = await listResponse.json() as Array<{ id: string }>
    expect(listed.some((session) => session.id === created.id)).toBe(true)

    const patchResponse = await app.fetch(new Request(`http://localhost/api/sessions/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Renamed Session' }),
      headers: {
        'content-type': 'application/json',
      },
    }))
    expect(patchResponse.status).toBe(200)
    expect(getAgentSessionMeta(created.id)?.title).toBe('Renamed Session')

    const sourceWorkspace = ensureDefaultWorkspace()
    const targetWorkspace = createAgentWorkspace('Migrated Docs')
    const movable = createAgentSession('可迁移会话', undefined, sourceWorkspace.id)
    updateAgentSessionMeta(movable.id, { sdkSessionId: 'sdk-session-1' })

    const moveResponse = await app.fetch(new Request(`http://localhost/api/sessions/${movable.id}/move-workspace`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId: targetWorkspace.id }),
      headers: {
        'content-type': 'application/json',
      },
    }))
    expect(moveResponse.status).toBe(200)
    const moved = await moveResponse.json() as { workspaceId?: string; sdkSessionId?: string }
    expect(moved.workspaceId).toBe(targetWorkspace.id)
    expect(moved.sdkSessionId).toBeUndefined()
    expect(getAgentSessionMeta(movable.id)?.workspaceId).toBe(targetWorkspace.id)
    expect(getAgentSessionMeta(movable.id)?.sdkSessionId).toBeUndefined()

    const deleteResponse = await app.fetch(new Request(`http://localhost/api/sessions/${created.id}`, {
      method: 'DELETE',
    }))
    expect(deleteResponse.status).toBe(204)
    expect(getAgentSessionMeta(created.id)).toBeUndefined()
  })

  test('session routes return a 404 JSON error when the session is missing', async () => {
    const app = createApp()

    const response = await app.fetch(new Request('http://localhost/api/sessions/missing-session/messages'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: '会话不存在: missing-session' })
  })

  test('send route preserves the existing validation error for blank userMessage', async () => {
    const app = createApp()
    const session = createAgentSession('Send Validation')

    const response = await app.fetch(new Request(`http://localhost/api/sessions/${session.id}/send`, {
      method: 'POST',
      body: JSON.stringify({ userMessage: '   ' }),
      headers: {
        'content-type': 'application/json',
      },
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '消息内容不能为空' })
  })

  test('production static handling serves files and falls back to index.html for non-api paths', async () => {
    const distDir = join(homedir(), '.proma', 'test-dist')
    mkdirSync(join(distDir, 'assets'), { recursive: true })
    writeFileSync(join(distDir, 'index.html'), '<html><body>fallback</body></html>', 'utf-8')
    writeFileSync(join(distDir, 'assets', 'app.js'), 'console.log("asset")', 'utf-8')

    const app = createHttpApp({
      distDir,
      isDev: false,
    })

    const assetResponse = await app.fetch(new Request('http://localhost/assets/app.js'))
    expect(assetResponse.status).toBe(200)
    expect(await assetResponse.text()).toContain('console.log("asset")')

    const fallbackResponse = await app.fetch(new Request('http://localhost/conversations/123'))
    expect(fallbackResponse.status).toBe(200)
    expect(await fallbackResponse.text()).toContain('fallback')
  })
})
