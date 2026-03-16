import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  getAgentWorkspacePath,
  getAgentWorkspacesIndexPath,
  getInactiveSkillsDir,
  getWorkspaceFilesDir,
  getWorkspaceMcpPath,
  getWorkspaceSkillsDir,
} from './config-paths'
import {
  DEFAULT_WORKSPACE_NAME,
  DEFAULT_WORKSPACE_SLUG,
  createAgentWorkspace,
  deleteAgentWorkspace,
  ensureDefaultWorkspace,
  listAgentWorkspaces,
  updateAgentWorkspace,
} from './workspace-service'

describe('workspace service', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-workspace-service-'))
    process.env.PROMA_CONFIG_DIR = configDir
  })

  afterEach(() => {
    delete process.env.PROMA_CONFIG_DIR
    rmSync(configDir, { recursive: true, force: true })
  })

  test('bootstraps a default workspace when none exist', () => {
    const workspace = ensureDefaultWorkspace()
    const workspaces = listAgentWorkspaces()

    expect(workspaces).toHaveLength(1)
    expect(workspaces[0]).toMatchObject({
      name: DEFAULT_WORKSPACE_NAME,
      slug: DEFAULT_WORKSPACE_SLUG,
    })

    const indexPath = getAgentWorkspacesIndexPath()
    const defaultWorkspacePath = getAgentWorkspacePath(DEFAULT_WORKSPACE_SLUG)
    const index = JSON.parse(readFileSync(indexPath, 'utf-8')) as {
      workspaces: Array<{ id: string; slug: string }>
    }

    expect(existsSync(indexPath)).toBe(true)
    expect(existsSync(defaultWorkspacePath)).toBe(true)
    expect(index.workspaces).toHaveLength(1)
    expect(index.workspaces[0]?.id).toBe(workspace.id)
  })

  test('creates a workspace with a stable slug and directory', () => {
    ensureDefaultWorkspace()
    const workspace = createAgentWorkspace('Release Planning')

    expect(workspace.slug).toBe('release-planning')
    expect(existsSync(getAgentWorkspacePath('release-planning'))).toBe(true)
  })

  test('updates the name without changing the slug', () => {
    ensureDefaultWorkspace()
    const workspace = createAgentWorkspace('Weekly Review')

    const updated = updateAgentWorkspace(workspace.id, { name: 'Weekly Review Renamed' })

    expect(updated.name).toBe('Weekly Review Renamed')
    expect(updated.slug).toBe(workspace.slug)
    expect(listAgentWorkspaces().find((entry) => entry.id === workspace.id)?.slug).toBe(workspace.slug)
  })

  test('deletes only the index entry and keeps the workspace directory', () => {
    ensureDefaultWorkspace()
    const workspace = createAgentWorkspace('Scratchpad')
    const workspacePath = getAgentWorkspacePath(workspace.slug)

    deleteAgentWorkspace(workspace.id)

    expect(listAgentWorkspaces().some((entry) => entry.id === workspace.id)).toBe(false)
    expect(existsSync(workspacePath)).toBe(true)
  })

  test('resolves capability directories and mcp path for a workspace', () => {
    ensureDefaultWorkspace()
    const workspace = createAgentWorkspace('Capability Context')
    const rootPath = getAgentWorkspacePath(workspace.slug)
    const skillsPath = getWorkspaceSkillsDir(workspace.slug)
    const inactiveSkillsPath = getInactiveSkillsDir(workspace.slug)
    const workspaceFilesPath = getWorkspaceFilesDir(workspace.slug)
    const mcpConfigPath = getWorkspaceMcpPath(workspace.slug)

    expect(rootPath).toBe(join(configDir, 'agent-workspaces', workspace.slug))
    expect(skillsPath).toBe(join(rootPath, 'skills'))
    expect(inactiveSkillsPath).toBe(join(rootPath, 'skills-inactive'))
    expect(workspaceFilesPath).toBe(join(rootPath, 'workspace-files'))
    expect(mcpConfigPath).toBe(join(rootPath, 'mcp.json'))

    expect(existsSync(skillsPath)).toBe(true)
    expect(existsSync(inactiveSkillsPath)).toBe(true)
    expect(existsSync(workspaceFilesPath)).toBe(true)
  })
})
