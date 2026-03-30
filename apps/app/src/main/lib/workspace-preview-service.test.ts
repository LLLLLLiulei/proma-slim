import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { getPageBuilderPreviewBridgeAssetUrl } from './page-builder-preview-bridge'
import { createWorkspacePreviewResponse, getWorkspacePreviewState } from './workspace-preview-service'
import { createAgentWorkspace } from './workspace-service'

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

describe('workspace preview service', () => {
  test('rejects preview traversal attempts that escape workspace-files', () => {
    const workspace = createAgentWorkspace('Preview Traversal')

    expect(() => createWorkspacePreviewResponse(workspace, '../memory/MEMORY.md')).toThrow('非法路径')
  })

  test('reports preview availability only when workspace-files/index.html exists', async () => {
    const workspace = createAgentWorkspace('Preview State')
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    expect(getWorkspacePreviewState(workspace)).toEqual({
      hasPreview: false,
      entryUrl: null,
      revision: null,
    })

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(join(workspaceFilesDir, 'index.html'), '<html><body>ready</body></html>', 'utf-8')

    const state = getWorkspacePreviewState(workspace)
    expect(state.hasPreview).toBe(true)
    expect(state.entryUrl).toBe(`/api/workspaces/${workspace.id}/preview/`)
    expect(typeof state.revision).toBe('string')
    expect(state.revision?.length).toBeGreaterThan(0)
  })

  test('injects the page-builder preview bridge only when the request explicitly enables it', async () => {
    const builderWorkspace = createAgentWorkspace('Builder Preview', { template: 'page-builder' })
    const regularWorkspace = createAgentWorkspace('Regular Preview')
    const builderWorkspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', builderWorkspace.slug, 'workspace-files')
    const regularWorkspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', regularWorkspace.slug, 'workspace-files')

    mkdirSync(builderWorkspaceFilesDir, { recursive: true })
    mkdirSync(regularWorkspaceFilesDir, { recursive: true })
    writeFileSync(join(builderWorkspaceFilesDir, 'index.html'), '<!doctype html><html><body><h1>Builder</h1></body></html>', 'utf-8')
    writeFileSync(join(regularWorkspaceFilesDir, 'index.html'), '<!doctype html><html><body><h1>Regular</h1></body></html>', 'utf-8')

    const builderResponse = createWorkspacePreviewResponse(builderWorkspace, '/', { enablePageBuilderBridge: true })
    const builderWithoutBridgeResponse = createWorkspacePreviewResponse(builderWorkspace, '/')
    const regularResponse = createWorkspacePreviewResponse(regularWorkspace, '/')

    const builderHtml = await builderResponse.text()

    expect(builderHtml).toContain(getPageBuilderPreviewBridgeAssetUrl())
    expect(builderHtml).toContain('data-page-builder-preview-bridge-loader="true"')
    expect(builderHtml).not.toContain('window.parent !== window')
    expect(builderHtml).not.toContain('const resolveElementLabel = (element) => {')
    expect(await builderWithoutBridgeResponse.text()).not.toContain(getPageBuilderPreviewBridgeAssetUrl())
    expect(await regularResponse.text()).not.toContain(getPageBuilderPreviewBridgeAssetUrl())
  })

  test('keeps page-builder preview assets unchanged when serving non-html files', async () => {
    const workspace = createAgentWorkspace('Builder Preview Assets', { template: 'page-builder' })
    const workspaceFilesDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, 'workspace-files')

    mkdirSync(join(workspaceFilesDir, 'assets'), { recursive: true })
    writeFileSync(join(workspaceFilesDir, 'assets', 'site.css'), 'body { color: rebeccapurple; }', 'utf-8')

    const assetResponse = createWorkspacePreviewResponse(workspace, '/assets/site.css')

    expect(await assetResponse.text()).toBe('body { color: rebeccapurple; }')
  })
})
