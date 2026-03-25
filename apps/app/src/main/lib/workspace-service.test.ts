import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  seedDefaultSkills,
  getAgentWorkspacePath,
  getAgentWorkspacesIndexPath,
  getInactiveSkillsDir,
  getWorkspaceMemoryDir,
  getWorkspaceMemoryFilePath,
  getWorkspacePluginManifestPath,
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
  getWorkspaceDirectoryContext,
  getWorkspaceSkillInvocationName,
  listAgentWorkspaces,
  updateAgentWorkspace,
} from './workspace-service'

describe('workspace service', () => {
  let configDir: string
  let originalDefaultSkillsDir: string | undefined

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-workspace-service-'))
    process.env.PROMA_CONFIG_DIR = configDir
    originalDefaultSkillsDir = process.env.PROMA_DEFAULT_SKILLS_DIR
    delete process.env.PROMA_DEFAULT_SKILLS_DIR
  })

  afterEach(() => {
    delete process.env.PROMA_CONFIG_DIR
    if (originalDefaultSkillsDir === undefined) {
      delete process.env.PROMA_DEFAULT_SKILLS_DIR
    } else {
      process.env.PROMA_DEFAULT_SKILLS_DIR = originalDefaultSkillsDir
    }
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
    expect(existsSync(getWorkspacePluginManifestPath(DEFAULT_WORKSPACE_SLUG))).toBe(true)
    expect(existsSync(getWorkspaceMemoryDir(DEFAULT_WORKSPACE_SLUG))).toBe(true)
    expect(existsSync(getWorkspaceMemoryFilePath(DEFAULT_WORKSPACE_SLUG))).toBe(true)
    expect(index.workspaces).toHaveLength(1)
    expect(index.workspaces[0]?.id).toBe(workspace.id)
  })

  test('migrates legacy plugin manifests to the current workspace slug contract', () => {
    const workspaceRoot = getAgentWorkspacePath(DEFAULT_WORKSPACE_SLUG)
    const manifestPath = getWorkspacePluginManifestPath(DEFAULT_WORKSPACE_SLUG)
    const indexPath = getAgentWorkspacesIndexPath()

    writeFileSync(indexPath, JSON.stringify({
      version: 1,
      workspaces: [{
        id: 'workspace-default',
        name: DEFAULT_WORKSPACE_NAME,
        slug: DEFAULT_WORKSPACE_SLUG,
        createdAt: 1,
        updatedAt: 1,
      }],
    }, null, 2), 'utf-8')
    mkdirSync(join(workspaceRoot, '.claude-plugin'), { recursive: true })
    writeFileSync(manifestPath, JSON.stringify({
      name: 'proma-workspace-default',
      version: '1.0.0',
    }, null, 2), 'utf-8')

    const workspace = ensureDefaultWorkspace()
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
      name: string
      version: string
    }

    expect(workspace.id).toBe('workspace-default')
    expect(existsSync(workspaceRoot)).toBe(true)
    expect(manifest).toEqual({
      name: DEFAULT_WORKSPACE_SLUG,
      version: '1.0.0',
    })
  })

  test('seeds default skills from the bundled source tree', () => {
    seedDefaultSkills()

    expect(existsSync(join(configDir, 'default-skills', 'brainstorming', 'SKILL.md'))).toBe(true)
  })

  test('creates a workspace with a stable slug and directory', () => {
    ensureDefaultWorkspace()
    const workspace = createAgentWorkspace('Release Planning')

    expect(workspace.slug).toBe('release-planning')
    expect(existsSync(getAgentWorkspacePath('release-planning'))).toBe(true)
    expect(existsSync(getWorkspacePluginManifestPath('release-planning'))).toBe(true)
  })

  test('creates a page-builder workspace with a root CLAUDE.md file', () => {
    ensureDefaultWorkspace()
    const workspace = createAgentWorkspace('Page Builder Workspace', { template: 'page-builder' })
    const workspaceRoot = getAgentWorkspacePath(workspace.slug)
    const claudeMdPath = join(workspaceRoot, 'CLAUDE.md')

    expect(existsSync(claudeMdPath)).toBe(true)
    expect(readFileSync(claudeMdPath, 'utf-8')).toContain('workspace-files/index.html')
    expect(readFileSync(claudeMdPath, 'utf-8')).toContain('workspace-files/assets/')
  })

  test('builds workspace skill invocation names from the workspace slug', () => {
    expect(getWorkspaceSkillInvocationName('default', 'skill-creator')).toBe('default:skill-creator')
    expect(getWorkspaceSkillInvocationName('release-planning', 'docs')).toBe('release-planning:docs')
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
    const memoryDirPath = getWorkspaceMemoryDir(workspace.slug)
    const memoryFilePath = getWorkspaceMemoryFilePath(workspace.slug)
    const context = getWorkspaceDirectoryContext(workspace.id)

    expect(rootPath).toBe(join(configDir, 'agent-workspaces', workspace.slug))
    expect(skillsPath).toBe(join(rootPath, 'skills'))
    expect(inactiveSkillsPath).toBe(join(rootPath, 'skills-inactive'))
    expect(workspaceFilesPath).toBe(join(rootPath, 'workspace-files'))
    expect(mcpConfigPath).toBe(join(rootPath, 'mcp.json'))
    expect(memoryDirPath).toBe(join(rootPath, 'memory'))
    expect(memoryFilePath).toBe(join(rootPath, 'memory', 'MEMORY.md'))

    expect(existsSync(skillsPath)).toBe(true)
    expect(existsSync(inactiveSkillsPath)).toBe(true)
    expect(existsSync(workspaceFilesPath)).toBe(true)
    expect(existsSync(memoryDirPath)).toBe(true)
    expect(existsSync(memoryFilePath)).toBe(true)
    expect(context.memoryFilePath).toBe(memoryFilePath)
  })
})
