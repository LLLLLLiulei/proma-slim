import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { strFromU8, unzipSync } from 'fflate'
import {
  PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
  PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
} from '@ai-page-builder/shared'
import { getSettings, updateSettings } from '../lib/settings-service'
import { getUserProfile, updateUserProfile } from '../lib/user-profile-service'
import { appendAgentMessage, createAgentSession, getAgentSessionMeta, updateAgentSessionMeta } from '../lib/agent-session-manager'
import { getPageBuilderPreviewBridgeAssetUrl } from '../lib/page-builder-preview-bridge'
import { createAgentWorkspace, ensureDefaultWorkspace } from '../lib/workspace-service'
import { createHttpApp } from './app'

const UUID_V4_SLUG_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

function createApp() {
  return createHttpApp({
    distDir: process.cwd(),
    isDev: true,
  })
}

async function acquirePageBuilderEditLockHeaders(
  app: ReturnType<typeof createApp>,
  workspaceId: string,
  holderId = 'test-holder',
): Promise<Record<string, string>> {
  const response = await app.fetch(new Request(`http://localhost/api/page-builder/projects/${workspaceId}/edit-lock`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ holderId }),
  }))

  expect(response.status).toBe(201)
  const lease = await response.json() as { lockId: string; holderId: string }

  return {
    'x-proma-page-builder-edit-lock': lease.lockId,
    'x-proma-page-builder-edit-holder': lease.holderId,
  }
}

async function waitForCompletedStaticExportJob(
  app: ReturnType<typeof createApp>,
  workspaceId: string,
  jobId: string,
): Promise<{
  status: string
  downloadUrl?: string | null
}> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await app.fetch(new Request(`http://localhost/api/workspaces/${workspaceId}/page-builder/export-static-jobs/${jobId}`))
    expect(response.status).toBe(200)

    const payload = await response.json() as {
      status: string
      downloadUrl?: string | null
    }
    if (payload.status === 'completed' || payload.status === 'failed') {
      return payload
    }

    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  throw new Error(`等待导出任务超时: ${jobId}`)
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
    expect(created.slug).toMatch(UUID_V4_SLUG_PATTERN)

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
    expect(renamed.slug).toBe(created.slug)

    const capabilityResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${created.id}/capabilities`))
    expect(capabilityResponse.status).toBe(200)

    const contextResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${created.id}/directory-context`))
    expect(contextResponse.status).toBe(200)
    const context = await contextResponse.json() as {
      workspaceSlug: string
      workspaceFilesPath: string
      memoryFilePath: string
    }
    expect(context.workspaceSlug).toBe(created.slug)
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
      hasCmsRendering: false,
      requiresSameOrigin: false,
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
      hasCmsRendering: boolean
      requiresSameOrigin: boolean
    }
    expect(previewState.hasPreview).toBe(true)
    expect(previewState.entryUrl).toBe(`/api/workspaces/${workspace.id}/preview/`)
    expect(typeof previewState.revision).toBe('string')
    expect(previewState.revision?.length).toBeGreaterThan(0)
    expect(previewState.hasCmsRendering).toBe(false)
    expect(previewState.requiresSameOrigin).toBe(false)

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
      hasCmsRendering: boolean
      requiresSameOrigin: boolean
    }
    expect(updatedState.hasPreview).toBe(true)
    expect(updatedState.revision).not.toBe(previewState.revision)
    expect(updatedState.hasCmsRendering).toBe(false)
    expect(updatedState.requiresSameOrigin).toBe(false)
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
      hasCmsRendering: false,
      requiresSameOrigin: false,
    })

    const missingPreviewResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/preview/`))
    expect(missingPreviewResponse.status).toBe(404)
    expect(await missingPreviewResponse.json()).toEqual({ error: '预览入口不存在' })
  })

  test('workspace preview routes inject the selection bridge only when explicitly requested', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Builder Preview Route', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(join(workspaceFilesDir, 'assets'), { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><h1>Builder Preview</h1></body></html>',
      'utf-8',
    )
    writeFileSync(join(workspaceFilesDir, 'assets', 'site.css'), 'body { color: green; }', 'utf-8')

    const previewResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/preview/`))
    expect(previewResponse.status).toBe(200)
    expect(await previewResponse.text()).not.toContain(getPageBuilderPreviewBridgeAssetUrl())

    const bridgePreviewResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/preview/?page-builder-bridge=1`))
    expect(bridgePreviewResponse.status).toBe(200)
    expect(await bridgePreviewResponse.text()).toContain(getPageBuilderPreviewBridgeAssetUrl())

    const assetResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/preview/assets/site.css`))
    expect(assetResponse.status).toBe(200)
    expect(await assetResponse.text()).toBe('body { color: green; }')
  })

  test('workspace routes persist page-builder inline text edits back to workspace-files/index.html', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Builder Inline Text', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><section id="hero"><h1>旧标题</h1><p>旧描述</p></section></body></html>',
      'utf-8',
    )
    const editLockHeaders = await acquirePageBuilderEditLockHeaders(app, workspace.id)

    const response = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/page-builder/inline-text`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        ...editLockHeaders,
      },
      body: JSON.stringify({
        selector: '#hero',
        textTargetDescriptor: {
          version: 1,
          tagName: 'h1',
          childPath: [0],
        },
        nextText: '新标题',
      }),
    }))

    expect(response.status).toBe(200)
    expect(readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')).toContain('<h1>新标题</h1>')

    const payload = await response.json() as {
      hasPreview: boolean
      entryUrl: string | null
      revision: string | null
    }
    expect(payload.hasPreview).toBe(true)
    expect(payload.entryUrl).toBe(`/api/workspaces/${workspace.id}/preview/`)
    expect(typeof payload.revision).toBe('string')
    expect(payload.revision?.length).toBeGreaterThan(0)
  })

  test('workspace routes reject page-builder write requests without an edit lock', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Builder Missing Lock', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><section id="hero"><h1>旧标题</h1></section></body></html>',
      'utf-8',
    )

    const response = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/page-builder/inline-text`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        selector: '#hero',
        textTargetDescriptor: {
          version: 1,
          tagName: 'h1',
          childPath: [0],
        },
        nextText: '新标题',
      }),
    }))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: '编辑锁已失效，请从首页重新进入编辑',
    })
    expect(readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')).toContain('<h1>旧标题</h1>')
  })

  test('workspace title updates require edit locks only for page-builder workspaces', async () => {
    const app = createApp()
    const pageBuilderWorkspace = createAgentWorkspace('Builder Rename Locked', { template: 'page-builder' })
    const regularWorkspace = createAgentWorkspace('Regular Rename')

    const pageBuilderResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${pageBuilderWorkspace.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Should Not Rename',
      }),
    }))

    expect(pageBuilderResponse.status).toBe(409)
    expect(await pageBuilderResponse.json()).toEqual({
      error: '编辑锁已失效，请从首页重新进入编辑',
    })

    const regularResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${regularWorkspace.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Regular Renamed',
      }),
    }))

    expect(regularResponse.status).toBe(200)
    expect(await regularResponse.json()).toEqual(expect.objectContaining({
      id: regularWorkspace.id,
      name: 'Regular Renamed',
    }))
  })

  test('workspace routes accept page-builder image replacement uploads and rewrite the targeted img src', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Builder Image Replacement', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(join(workspaceFilesDir, 'assets'), { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><section id="hero"><img src="./assets/original.png" alt="Hero"></section></body></html>',
      'utf-8',
    )
    writeFileSync(join(workspaceFilesDir, 'assets', 'original.png'), 'old-image', 'utf-8')
    const editLockHeaders = await acquirePageBuilderEditLockHeaders(app, workspace.id)

    const formData = new FormData()
    formData.set('payload', JSON.stringify({
      selector: '#hero',
      imageTargetDescriptor: {
        version: 1,
        tagName: 'img',
        childPath: [0],
      },
    }))
    formData.set('file', new File(['new-image'], 'replacement.png', { type: 'image/png' }))

    const response = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/page-builder/image`, {
      method: 'POST',
      headers: editLockHeaders,
      body: formData,
    }))

    expect(response.status).toBe(200)

    const payload = await response.json() as {
      hasPreview: boolean
      entryUrl: string | null
      revision: string | null
    }
    expect(payload.hasPreview).toBe(true)
    expect(payload.entryUrl).toBe(`/api/workspaces/${workspace.id}/preview/`)
    expect(typeof payload.revision).toBe('string')

    const updatedHtml = readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')
    expect(updatedHtml).not.toContain('./assets/original.png')
    const nextSrcMatch = updatedHtml.match(/src="([^"]+)"/)
    expect(nextSrcMatch).not.toBeNull()
    expect(nextSrcMatch?.[1]).toContain('./assets/')
    expect(existsSync(join(workspaceFilesDir, nextSrcMatch![1]!))).toBe(true)
  })

  test('workspace routes accept page-builder block deletion requests and remove the selected element', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Builder Block Deletion', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><body><section id="hero"><h1>旧标题</h1></section><section id="features"><p>保留内容</p></section></body></html>',
      'utf-8',
    )
    const editLockHeaders = await acquirePageBuilderEditLockHeaders(app, workspace.id)

    const response = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/page-builder/block-delete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        ...editLockHeaders,
      },
      body: JSON.stringify({
        selector: '#hero',
      }),
    }))

    expect(response.status).toBe(200)

    const payload = await response.json() as {
      hasPreview: boolean
      entryUrl: string | null
      revision: string | null
    }
    expect(payload.hasPreview).toBe(true)
    expect(payload.entryUrl).toBe(`/api/workspaces/${workspace.id}/preview/`)
    expect(typeof payload.revision).toBe('string')
    expect(payload.revision?.length).toBeGreaterThan(0)

    const updatedHtml = readFileSync(join(workspaceFilesDir, 'index.html'), 'utf-8')
    expect(updatedHtml).not.toContain('id="hero"')
    expect(updatedHtml).toContain('id="features"')
    expect(updatedHtml).toContain('保留内容')
  })

  test('workspace routes create static export jobs, expose status, and allow downloading the completed package', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Builder Export', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(join(workspaceFilesDir, 'assets'), { recursive: true })
    writeFileSync(
      join(workspaceFilesDir, 'index.html'),
      '<!doctype html><html><head><link rel="stylesheet" href="./assets/site.css"></head><body><img src="./assets/hero.png"><h1>导出预览</h1></body></html>',
      'utf-8',
    )
    writeFileSync(join(workspaceFilesDir, 'assets', 'site.css'), 'body { color: red; }', 'utf-8')
    writeFileSync(join(workspaceFilesDir, 'assets', 'hero.png'), 'hero-image', 'utf-8')
    const createResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/page-builder/export-static-jobs`, {
      method: 'POST',
    }))

    expect(createResponse.status).toBe(202)
    const createdJob = await createResponse.json() as {
      jobId: string
      status: string
    }
    expect(createdJob.status === 'pending' || createdJob.status === 'running').toBe(true)

    const finishedJob = await waitForCompletedStaticExportJob(app, workspace.id, createdJob.jobId)
    expect(finishedJob.status).toBe('completed')
    expect(finishedJob.downloadUrl).toBe(`/api/workspaces/${workspace.id}/page-builder/export-static-jobs/${createdJob.jobId}/download`)

    const downloadResponse = await app.fetch(new Request(`http://localhost${finishedJob.downloadUrl}`))
    expect(downloadResponse.status).toBe(200)
    expect(downloadResponse.headers.get('content-type')).toContain('application/zip')
    expect(downloadResponse.headers.get('content-disposition')).toContain('attachment;')
    expect(downloadResponse.headers.get('content-disposition')).toMatch(/filename\*=UTF-8''Builder%20Export-\d{14}\.zip/)

    const archiveEntries = unzipSync(new Uint8Array(await downloadResponse.arrayBuffer()))
    expect(strFromU8(archiveEntries['index.html']!)).toContain('<h1>导出预览</h1>')
    expect(strFromU8(archiveEntries['assets/site.css']!)).toContain('color: red')
    const report = JSON.parse(strFromU8(archiveEntries['export-report.json']!)) as {
      entryFile: string
      summary: {
        localizedResourceCount: number
      }
    }
    expect(report.entryFile).toBe('index.html')
    expect(report.summary.localizedResourceCount).toBe(0)
  })

  test('workspace routes pass an explicit downloadCmsRemoteAssets=false option to the static export service', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Builder Export Explicit Option', { template: 'page-builder' })

    const {
      pageBuilderStaticExportService,
    } = await import('../lib/page-builder-static-export-service')

    const originalCreateJob = pageBuilderStaticExportService.createJob.bind(pageBuilderStaticExportService)
    const createJobCalls: Array<unknown> = []

    pageBuilderStaticExportService.createJob = ((capturedWorkspace, options) => {
      createJobCalls.push({
        workspaceId: capturedWorkspace.id,
        options,
      })

      return {
        jobId: 'job-explicit-option',
        status: 'running',
        phase: 'copying',
        createdAt: '2026-04-07T10:00:00.000Z',
        updatedAt: '2026-04-07T10:00:00.000Z',
        expiresAt: '2026-04-07T11:00:00.000Z',
        downloadUrl: null,
        errorMessage: null,
        failure: null,
        reportSummary: null,
      }
    }) as typeof pageBuilderStaticExportService.createJob

    try {
      const editLockHeaders = await acquirePageBuilderEditLockHeaders(app, workspace.id)
      const response = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/page-builder/export-static-jobs`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...editLockHeaders,
        },
        body: JSON.stringify({
          downloadCmsRemoteAssets: false,
        }),
      }))

      expect(response.status).toBe(202)
      expect(createJobCalls).toEqual([{
        workspaceId: workspace.id,
        options: {
          downloadCmsRemoteAssets: false,
        },
      }])
    } finally {
      pageBuilderStaticExportService.createJob = originalCreateJob
    }
  })

  test('workspace routes reject invalid static export option payloads', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Builder Export Invalid Option', { template: 'page-builder' })
    const editLockHeaders = await acquirePageBuilderEditLockHeaders(app, workspace.id)

    const response = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/page-builder/export-static-jobs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...editLockHeaders,
      },
      body: JSON.stringify({
        downloadCmsRemoteAssets: 'no',
      }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'downloadCmsRemoteAssets 必须是 boolean',
    })
  })

  test('workspace routes reject static export creation when workspace-files/index.html is missing', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Builder Export Missing Entry', { template: 'page-builder' })
    const editLockHeaders = await acquirePageBuilderEditLockHeaders(app, workspace.id)

    const response = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/page-builder/export-static-jobs`, {
      method: 'POST',
      headers: editLockHeaders,
    }))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: '当前项目没有可导出的页面产物' })
  })

  test('page-builder routes serve the external preview bridge asset', async () => {
    const app = createApp()

    const response = await app.fetch(new Request('http://localhost/api/page-builder/preview-bridge.js'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/javascript')
    const script = await response.text()
    expect(script).toContain(PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE)
    expect(script).toContain(PAGE_BUILDER_PREVIEW_PARENT_SOURCE)
    expect(script).not.toContain('__PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE__')
    expect(script).not.toContain('__PAGE_BUILDER_PREVIEW_PARENT_SOURCE__')
    expect(script).not.toContain("from './")
    expect(script.trim().startsWith('(() =>')).toBe(true)
  })

  test('page-builder routes serve CMS rendering preview assets', async () => {
    const app = createApp()

    const previewResponse = await app.fetch(new Request('http://localhost/api/page-builder/cms-rendering-preview.js', {
      headers: {
        origin: 'null',
      },
    }))
    expect(previewResponse.status).toBe(200)
    expect(previewResponse.headers.get('content-type')).toContain('application/javascript')
    expect(previewResponse.headers.get('access-control-allow-origin')).toBe('*')
    const previewScript = await previewResponse.text()
    expect(previewScript).toContain('proma:cms-rendering-ready')
    expect(previewScript).toContain('__PROMA_CMS_RENDERING_PREVIEW__')

    const vueResponse = await app.fetch(new Request('http://localhost/api/page-builder/cms-rendering-vue.js', {
      headers: {
        origin: 'null',
      },
    }))
    expect(vueResponse.status).toBe(200)
    expect(vueResponse.headers.get('content-type')).toContain('application/javascript')
    expect(vueResponse.headers.get('access-control-allow-origin')).toBe('*')
    const vueScript = await vueResponse.text()
    expect(vueScript).toContain('createApp')
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

  test('session activity route returns the current active flag', async () => {
    const app = createApp()
    const session = createAgentSession('Activity Probe')

    const response = await app.fetch(new Request(`http://localhost/api/sessions/${session.id}/activity`))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ active: false })
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

  test('send route rejects page-builder sessions without an edit lock', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Builder Send Missing Lock', { template: 'page-builder' })
    const session = createAgentSession('Builder Send', undefined, workspace.id)

    const response = await app.fetch(new Request(`http://localhost/api/sessions/${session.id}/send`, {
      method: 'POST',
      body: JSON.stringify({
        userMessage: '更新页面',
        workspaceId: workspace.id,
      }),
      headers: {
        'content-type': 'application/json',
      },
    }))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: '编辑锁已失效，请从首页重新进入编辑',
    })
  })

  test('send route accepts multipart payloads for attachment-backed Builder messages', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Attachment Runtime')
    const session = createAgentSession('Send With Attachment', undefined, workspace.id)
    const formData = new FormData()

    formData.set('payload', JSON.stringify({
      userMessage: '参考附件生成页面',
      workspaceId: workspace.id,
    }))
    formData.append('attachments', new File(['image-binary'], 'reference.png', { type: 'image/png' }))

    const response = await app.fetch(new Request(`http://localhost/api/sessions/${session.id}/send`, {
      method: 'POST',
      body: formData,
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
  })

  test('attachment content route serves structured session attachments', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Attachment Preview')
    const session = createAgentSession('Attachment Session', undefined, workspace.id)
    const attachmentDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, session.id, 'attachments')

    mkdirSync(attachmentDir, { recursive: true })
    writeFileSync(join(attachmentDir, 'attachment-1.png'), 'preview-bytes', 'utf-8')
    appendAgentMessage(session.id, {
      id: 'message-1',
      role: 'user',
      content: '请参考这张图',
      createdAt: Date.now(),
      attachments: [{
        id: 'attachment-1',
        filename: 'reference.png',
        mediaType: 'image/png',
        localPath: 'attachments/attachment-1.png',
        size: 13,
      }],
    })

    const response = await app.fetch(new Request(`http://localhost/api/sessions/${session.id}/attachments/attachment-1/content`))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('image/png')
    expect(await response.text()).toBe('preview-bytes')
  })

  test('attachment content route returns 404 when the attachment cannot be resolved', async () => {
    const app = createApp()
    const session = createAgentSession('Attachment Missing')

    const response = await app.fetch(new Request(`http://localhost/api/sessions/${session.id}/attachments/missing/content`))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: '附件不存在: missing' })
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
