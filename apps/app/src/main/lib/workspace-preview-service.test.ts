import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
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
})
