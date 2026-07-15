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
  toggleWorkspaceSkill,
  updateAgentWorkspace,
} from './workspace-service'

const UUID_V4_SLUG_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

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
    expect(existsSync(join(configDir, 'default-skills', 'cms-binding-apply', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(configDir, 'default-skills', 'page-builder-cms-region-authoring-guidance', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(configDir, 'default-skills', 'page-builder-guided-generation', 'SKILL.md'))).toBe(true)
  })

  test('refreshes placeholder bundled default skills with the checked-in implementation', () => {
    const placeholderSkillDir = join(configDir, 'default-skills', 'page-builder-guided-generation')
    mkdirSync(placeholderSkillDir, { recursive: true })
    writeFileSync(join(placeholderSkillDir, 'SKILL.md'), [
      '---',
      'name: page-builder-guided-generation',
      'description: [TODO: placeholder]',
      '---',
      '',
      '## Overview',
      '',
      '[TODO: fill me in]',
      '',
    ].join('\n'), 'utf-8')

    seedDefaultSkills()

    const refreshedSkill = readFileSync(join(placeholderSkillDir, 'SKILL.md'), 'utf-8')

    expect(refreshedSkill).toContain('AskUserQuestion')
    expect(refreshedSkill).toContain('ordinary users')
    expect(refreshedSkill).not.toContain('[TODO:')
  })

  test('creates a workspace with a UUID slug and directory', () => {
    ensureDefaultWorkspace()
    const workspace = createAgentWorkspace('Release Planning')

    expect(workspace.slug).toMatch(UUID_V4_SLUG_PATTERN)
    expect(existsSync(getAgentWorkspacePath(workspace.slug))).toBe(true)
    expect(existsSync(getWorkspacePluginManifestPath(workspace.slug))).toBe(true)
  })

  test('creates different UUID slugs even when workspace names are the same', () => {
    ensureDefaultWorkspace()
    const first = createAgentWorkspace('Release Planning')
    const second = createAgentWorkspace('Release Planning')

    expect(first.slug).toMatch(UUID_V4_SLUG_PATTERN)
    expect(second.slug).toMatch(UUID_V4_SLUG_PATTERN)
    expect(first.slug).not.toBe(second.slug)
  })

  test('creates a page-builder workspace with a root CLAUDE.md file', () => {
    ensureDefaultWorkspace()
    const workspace = createAgentWorkspace('Page Builder Workspace', { template: 'page-builder' })
    const workspaceRoot = getAgentWorkspacePath(workspace.slug)
    const claudeMdPath = join(workspaceRoot, 'CLAUDE.md')
    const claudeMd = readFileSync(claudeMdPath, 'utf-8')

    expect(existsSync(claudeMdPath)).toBe(true)
    expect(claudeMd).toContain('workspace-files/index.html')
    expect(claudeMd).toContain('workspace-files/assets/')
    expect(claudeMd).toContain('cms-binding-apply')
    expect(claudeMd).toContain('page-builder-guided-generation')
    expect(claudeMd).toContain('consult the canonical CMS guidance surfaced for that turn before editing it')
    expect(claudeMd).toContain('Always reply to the user in Chinese')
    expect(claudeMd).toContain('If the user asks in another language, still reply in Chinese')
    expect(claudeMd).toContain('Technical terms, code identifiers, file names, and API names may stay in their original form')
    expect(claudeMd).toContain('current workspace')
    expect(claudeMd).not.toContain('Do not JSON-stringify the `decision` payload')
    expect(claudeMd).not.toContain('mcp__cms__decide_cms_binding')
    expect(claudeMd).not.toContain('previewed inside Proma')
    expect(claudeMd).not.toContain('Proma')
  })

  test('copies the cms-binding-apply skill into page-builder workspaces', () => {
    ensureDefaultWorkspace()
    const workspace = createAgentWorkspace('Builder Skill Workspace', { template: 'page-builder' })

    expect(existsSync(join(getWorkspaceSkillsDir(workspace.slug), 'cms-binding-apply', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(getWorkspaceSkillsDir(workspace.slug), 'page-builder-cms-region-authoring-guidance', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(getWorkspaceSkillsDir(workspace.slug), 'page-builder-guided-generation', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(getWorkspaceSkillsDir(workspace.slug), 'topic-page-style', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(getWorkspaceSkillsDir(workspace.slug), 'taste-skill', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(getWorkspaceSkillsDir(workspace.slug), 'redesign-skill', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(getWorkspaceSkillsDir(workspace.slug), 'soft-skill', 'SKILL.md'))).toBe(false)
    expect(existsSync(join(getInactiveSkillsDir(workspace.slug), 'soft-skill', 'SKILL.md'))).toBe(true)
  })

  test('keeps soft-skill inactive across repeated page-builder workspace hydration', () => {
    ensureDefaultWorkspace()
    const workspace = createAgentWorkspace('Builder Exposure Workspace', { template: 'page-builder' })
    const activeSoftSkillPath = join(getWorkspaceSkillsDir(workspace.slug), 'soft-skill', 'SKILL.md')
    const inactiveSoftSkillPath = join(getInactiveSkillsDir(workspace.slug), 'soft-skill', 'SKILL.md')

    expect(existsSync(activeSoftSkillPath)).toBe(false)
    expect(existsSync(inactiveSoftSkillPath)).toBe(true)

    listAgentWorkspaces()
    expect(existsSync(activeSoftSkillPath)).toBe(false)
    expect(existsSync(inactiveSoftSkillPath)).toBe(true)

    listAgentWorkspaces()
    expect(existsSync(activeSoftSkillPath)).toBe(false)
    expect(existsSync(inactiveSoftSkillPath)).toBe(true)
  })

  test('persists explicit soft-skill enabling in page-builder workspaces across hydration', () => {
    ensureDefaultWorkspace()
    const workspace = createAgentWorkspace('Builder Toggle Workspace', { template: 'page-builder' })
    const activeSoftSkillPath = join(getWorkspaceSkillsDir(workspace.slug), 'soft-skill', 'SKILL.md')
    const inactiveSoftSkillPath = join(getInactiveSkillsDir(workspace.slug), 'soft-skill', 'SKILL.md')

    toggleWorkspaceSkill(workspace.slug, 'soft-skill', true)

    expect(existsSync(activeSoftSkillPath)).toBe(true)
    expect(existsSync(inactiveSoftSkillPath)).toBe(false)

    listAgentWorkspaces()
    expect(existsSync(activeSoftSkillPath)).toBe(true)
    expect(existsSync(inactiveSoftSkillPath)).toBe(false)
  })

  test('creates a page-builder workspace with default MCP servers', () => {
    ensureDefaultWorkspace()
    const workspace = createAgentWorkspace('Page Builder MCP Workspace', { template: 'page-builder' })
    const mcpConfig = JSON.parse(readFileSync(getWorkspaceMcpPath(workspace.slug), 'utf-8')) as {
      servers: Record<string, {
        type: string
        command?: string
        args?: string[]
        enabled: boolean
        timeout?: number
      }>
    }

    expect(mcpConfig.servers.playwright).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['@playwright/mcp@latest', '--headless', '--browser', 'chrome'],
      enabled: true,
      timeout: 30,
    })
    expect(mcpConfig.servers['server-sequential-thinking']).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking@latest'],
      enabled: false,
      timeout: 30,
    })
  })

  test('does not write page-builder default MCP servers for regular workspaces', () => {
    ensureDefaultWorkspace()
    const workspace = createAgentWorkspace('Regular MCP Workspace')
    const mcpConfig = JSON.parse(readFileSync(getWorkspaceMcpPath(workspace.slug), 'utf-8')) as {
      servers: Record<string, unknown>
    }

    expect(mcpConfig.servers).toEqual({})
  })

  test('persists the page-builder template only for page-builder workspaces', () => {
    ensureDefaultWorkspace()
    const pageBuilderWorkspace = createAgentWorkspace('Builder Docs', { template: 'page-builder' })
    const regularWorkspace = createAgentWorkspace('Regular Docs')
    const index = JSON.parse(readFileSync(getAgentWorkspacesIndexPath(), 'utf-8')) as {
      workspaces: Array<{
        id: string
        template?: 'page-builder'
      }>
    }

    expect(pageBuilderWorkspace.template).toBe('page-builder')
    expect(regularWorkspace.template).toBeUndefined()
    expect(index.workspaces.find((entry) => entry.id === pageBuilderWorkspace.id)?.template).toBe('page-builder')
    expect(index.workspaces.find((entry) => entry.id === regularWorkspace.id)?.template).toBeUndefined()
  })

  test('migrates existing page-builder workspaces by filling missing default MCP servers', () => {
    const now = Date.now()
    const indexPath = getAgentWorkspacesIndexPath()

    writeFileSync(indexPath, JSON.stringify({
      version: 1,
      workspaces: [
        {
          id: 'workspace-default',
          name: DEFAULT_WORKSPACE_NAME,
          slug: DEFAULT_WORKSPACE_SLUG,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'workspace-page-builder',
          name: 'Legacy Builder Docs',
          slug: 'legacy-builder-docs',
          template: 'page-builder',
          createdAt: now,
          updatedAt: now,
        },
      ],
    }, null, 2), 'utf-8')

    const legacyMcpPath = getWorkspaceMcpPath('legacy-builder-docs')
    writeFileSync(legacyMcpPath, JSON.stringify({
      servers: {
        playwright: {
          type: 'stdio',
          command: 'node',
          args: ['custom-playwright.js'],
          enabled: true,
          timeout: 88,
        },
      },
    }, null, 2), 'utf-8')

    const workspaces = listAgentWorkspaces()
    const migratedConfig = JSON.parse(readFileSync(legacyMcpPath, 'utf-8')) as {
      servers: Record<string, {
        type: string
        command?: string
        args?: string[]
        enabled: boolean
        timeout?: number
      }>
    }

    expect(workspaces.some((workspace) => workspace.id === 'workspace-page-builder')).toBe(true)
    expect(migratedConfig.servers.playwright).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['custom-playwright.js'],
      enabled: true,
      timeout: 88,
    })
    expect(migratedConfig.servers['server-sequential-thinking']).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking@latest'],
      enabled: false,
      timeout: 30,
    })
  })

  test('backfills missing default skills into existing page-builder workspaces', () => {
    const now = Date.now()
    const indexPath = getAgentWorkspacesIndexPath()

    writeFileSync(indexPath, JSON.stringify({
      version: 1,
      workspaces: [
        {
          id: 'workspace-default',
          name: DEFAULT_WORKSPACE_NAME,
          slug: DEFAULT_WORKSPACE_SLUG,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'workspace-page-builder',
          name: 'Legacy Builder Docs',
          slug: 'legacy-builder-docs',
          template: 'page-builder',
          createdAt: now,
          updatedAt: now,
        },
      ],
    }, null, 2), 'utf-8')

    const legacySkillsDir = getWorkspaceSkillsDir('legacy-builder-docs')
    mkdirSync(join(legacySkillsDir, 'brainstorming'), { recursive: true })
    writeFileSync(join(legacySkillsDir, 'brainstorming', 'SKILL.md'), '---\nname: brainstorming\ndescription: test\n---\n', 'utf-8')

    listAgentWorkspaces()

    expect(existsSync(join(legacySkillsDir, 'page-builder-guided-generation', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(legacySkillsDir, 'topic-page-style', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(legacySkillsDir, 'taste-skill', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(legacySkillsDir, 'redesign-skill', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(legacySkillsDir, 'soft-skill', 'SKILL.md'))).toBe(false)
    expect(existsSync(join(getInactiveSkillsDir('legacy-builder-docs'), 'soft-skill', 'SKILL.md'))).toBe(true)
  })

  test('refreshes placeholder guided-generation skills inside existing page-builder workspaces', () => {
    const now = Date.now()
    const indexPath = getAgentWorkspacesIndexPath()

    writeFileSync(indexPath, JSON.stringify({
      version: 1,
      workspaces: [
        {
          id: 'workspace-default',
          name: DEFAULT_WORKSPACE_NAME,
          slug: DEFAULT_WORKSPACE_SLUG,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'workspace-page-builder',
          name: 'Legacy Builder Docs',
          slug: 'legacy-builder-docs',
          template: 'page-builder',
          createdAt: now,
          updatedAt: now,
        },
      ],
    }, null, 2), 'utf-8')

    const legacySkillsDir = getWorkspaceSkillsDir('legacy-builder-docs')
    const placeholderSkillDir = join(legacySkillsDir, 'page-builder-guided-generation')
    mkdirSync(placeholderSkillDir, { recursive: true })
    writeFileSync(join(placeholderSkillDir, 'SKILL.md'), [
      '---',
      'name: page-builder-guided-generation',
      'description: [TODO: placeholder]',
      '---',
      '',
      '## Overview',
      '',
      '[TODO: fill me in]',
      '',
    ].join('\n'), 'utf-8')

    listAgentWorkspaces()

    const refreshedSkill = readFileSync(join(placeholderSkillDir, 'SKILL.md'), 'utf-8')
    expect(refreshedSkill).toContain('AskUserQuestion')
    expect(refreshedSkill).toContain('ordinary users')
    expect(refreshedSkill).not.toContain('[TODO:')
  })

  test('does not migrate regular historical workspaces without the page-builder template', () => {
    const now = Date.now()
    const indexPath = getAgentWorkspacesIndexPath()

    writeFileSync(indexPath, JSON.stringify({
      version: 1,
      workspaces: [
        {
          id: 'workspace-default',
          name: DEFAULT_WORKSPACE_NAME,
          slug: DEFAULT_WORKSPACE_SLUG,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'workspace-regular',
          name: 'Legacy Regular Docs',
          slug: 'legacy-regular-docs',
          createdAt: now,
          updatedAt: now,
        },
      ],
    }, null, 2), 'utf-8')

    const regularMcpPath = getWorkspaceMcpPath('legacy-regular-docs')
    writeFileSync(regularMcpPath, JSON.stringify({ servers: {} }, null, 2), 'utf-8')

    listAgentWorkspaces()

    const config = JSON.parse(readFileSync(regularMcpPath, 'utf-8')) as {
      servers: Record<string, unknown>
    }
    expect(config.servers).toEqual({})
  })

  test('builds workspace skill invocation names from the workspace slug', () => {
    expect(getWorkspaceSkillInvocationName('default', 'skill-creator')).toBe('default:skill-creator')
    expect(
      getWorkspaceSkillInvocationName('550e8400-e29b-41d4-a716-446655440000', 'docs'),
    ).toBe('550e8400-e29b-41d4-a716-446655440000:docs')
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
