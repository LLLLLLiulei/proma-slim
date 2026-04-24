import { randomUUID } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type {
  AgentWorkspace,
  FileSearchResult,
  McpServerEntry,
  SkillMeta,
  WorkspaceCapabilities,
  WorkspaceDirectoryContext,
  WorkspaceMcpConfig,
} from '@proma/shared'
import {
  getAgentSessionWorkspacePath,
  getAgentWorkspacePath,
  getAgentWorkspacesIndexPath,
  getDefaultSkillsDir,
  getInactiveSkillsDir,
  isPlaceholderSkillDirectory,
  seedDefaultSkills,
  getWorkspaceMemoryDir,
  getWorkspaceMemoryFilePath,
  getWorkspaceFilesDir,
  getWorkspaceMcpPath,
  getWorkspacePluginManifestPath,
  getWorkspaceSkillsDir,
} from './config-paths'
import { initializePageBuilderWorkspace } from './page-builder-workspace-bootstrap'
import type { WorkspaceTemplateName } from './workspace-template-service'

export const DEFAULT_WORKSPACE_NAME = '默认工作区'
export const DEFAULT_WORKSPACE_SLUG = 'default'

interface AgentWorkspacesIndex {
  version: number
  workspaces: AgentWorkspace[]
}

type WorkspaceSkillExposureState = 'active' | 'inactive'

interface WorkspaceConfig {
  attachedDirectories?: string[]
  skillExposureOverrides?: Record<string, WorkspaceSkillExposureState>
}

interface CreateWorkspaceOptions {
  template?: WorkspaceTemplateName
}

const INDEX_VERSION = 1
const PAGE_BUILDER_DEFAULT_INACTIVE_SKILL = 'soft-skill'
const FILE_SEARCH_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '__pycache__',
  '.venv',
  'build',
  '.cache',
])

function readIndex(): AgentWorkspacesIndex {
  const indexPath = getAgentWorkspacesIndexPath()

  if (!existsSync(indexPath)) {
    return { version: INDEX_VERSION, workspaces: [] }
  }

  try {
    return JSON.parse(readFileSync(indexPath, 'utf-8')) as AgentWorkspacesIndex
  } catch (error) {
    console.error('[Agent 工作区] 读取索引文件失败:', error)
    return { version: INDEX_VERSION, workspaces: [] }
  }
}

function writeIndex(index: AgentWorkspacesIndex): void {
  writeFileSync(getAgentWorkspacesIndexPath(), JSON.stringify(index, null, 2), 'utf-8')
}

function createWorkspaceSlug(existingSlugs: Set<string>): string {
  let slug = randomUUID()

  while (existingSlugs.has(slug)) {
    slug = randomUUID()
  }

  return slug
}

function getWorkspaceConfigPath(workspaceSlug: string): string {
  return join(getAgentWorkspacePath(workspaceSlug), 'config.json')
}

function readWorkspaceConfig(workspaceSlug: string): WorkspaceConfig {
  const configPath = getWorkspaceConfigPath(workspaceSlug)

  if (!existsSync(configPath)) {
    return {}
  }

  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as WorkspaceConfig
  } catch (error) {
    console.warn('[Agent 工作区] 读取工作区配置失败:', error)
    return {}
  }
}

function writeWorkspaceConfig(workspaceSlug: string, config: WorkspaceConfig): void {
  writeFileSync(getWorkspaceConfigPath(workspaceSlug), JSON.stringify(config, null, 2), 'utf-8')
}

function readWorkspaceSkillExposureOverride(
  workspaceSlug: string,
  skillSlug: string,
): WorkspaceSkillExposureState | null {
  const override = readWorkspaceConfig(workspaceSlug).skillExposureOverrides?.[skillSlug]
  return override === 'active' || override === 'inactive' ? override : null
}

function writeWorkspaceSkillExposureOverride(
  workspaceSlug: string,
  skillSlug: string,
  state: WorkspaceSkillExposureState,
): void {
  const config = readWorkspaceConfig(workspaceSlug)
  writeWorkspaceConfig(workspaceSlug, {
    ...config,
    attachedDirectories: config.attachedDirectories ?? [],
    skillExposureOverrides: {
      ...(config.skillExposureOverrides ?? {}),
      [skillSlug]: state,
    },
  })
}

/**
 * Claude SDK 在当前 Web 运行时里，会将 workspace skills 解析为
 * `<workspace-slug>:<skill-slug>` 这种调用名，而不是旧 Electron 版本中
 * 使用过的 `proma-workspace-<slug>:<skill-slug>`。
 *
 * 所有 prompt 注入与测试断言都必须复用这个 helper，避免再次出现命名漂移。
 */
export function getWorkspaceSkillInvocationName(workspaceSlug: string, skillSlug: string): string {
  return `${workspaceSlug}:${skillSlug}`
}

function ensureWorkspacePluginManifest(workspaceSlug: string): void {
  const pluginDir = join(getAgentWorkspacePath(workspaceSlug), '.claude-plugin')
  const manifestPath = getWorkspacePluginManifestPath(workspaceSlug)
  const expectedManifest = {
    // 与当前 SDK 解析出来的 skill namespace 保持一致。
    name: workspaceSlug,
    version: '1.0.0',
  }

  if (!existsSync(pluginDir)) {
    mkdirSync(pluginDir, { recursive: true })
  }

  if (existsSync(manifestPath)) {
    try {
      const existing = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
        name?: string
        version?: string
      }
      if (
        existing.name === expectedManifest.name &&
        existing.version === expectedManifest.version
      ) {
        return
      }
    } catch {
      // 旧文件损坏或格式变化时，直接重写为当前契约
    }
  }

  writeFileSync(manifestPath, JSON.stringify(expectedManifest, null, 2), 'utf-8')
}

function ensureWorkspaceMemoryFile(workspaceSlug: string): void {
  getWorkspaceMemoryDir(workspaceSlug)
  const memoryFilePath = getWorkspaceMemoryFilePath(workspaceSlug)

  if (!existsSync(memoryFilePath)) {
    /**
     * 原版 Electron 通过 MCP/云记忆处理长期记忆；简化版 Web 运行时没有这条链路。
     * 这里显式创建 workspace-local MEMORY.md，给 agent 一个稳定、可预期的本地持久化入口，
     * 避免它回退到 `sdk-config/projects/.../memory` 这类 SDK 内部路径猜测。
     */
    writeFileSync(memoryFilePath, '', 'utf-8')
  }
}

function ensureWorkspaceStructure(workspaceSlug: string): void {
  getAgentWorkspacePath(workspaceSlug)
  getWorkspaceSkillsDir(workspaceSlug)
  ensureWorkspacePluginManifest(workspaceSlug)
  getInactiveSkillsDir(workspaceSlug)
  getWorkspaceFilesDir(workspaceSlug)
  ensureWorkspaceMemoryFile(workspaceSlug)

  const mcpPath = getWorkspaceMcpPath(workspaceSlug)
  if (!existsSync(mcpPath)) {
    writeFileSync(mcpPath, JSON.stringify({ servers: {} }, null, 2), 'utf-8')
  }

  const configPath = getWorkspaceConfigPath(workspaceSlug)
  if (!existsSync(configPath)) {
    writeWorkspaceConfig(workspaceSlug, {
      attachedDirectories: [],
      skillExposureOverrides: {},
    })
  }
}

function copyDefaultSkills(workspaceSlug: string): void {
  seedDefaultSkills()
  const defaultDir = getDefaultSkillsDir()
  const targetDir = getWorkspaceSkillsDir(workspaceSlug)

  try {
    const entries = readdirSync(defaultDir, { withFileTypes: true })
    if (entries.length === 0) return

    for (const entry of entries) {
      const source = join(defaultDir, entry.name)
      const target = join(targetDir, entry.name)
      if (!existsSync(target)) {
        cpSync(source, target, { recursive: true })
        continue
      }

      if (isPlaceholderSkillDirectory(target)) {
        rmSync(target, { recursive: true, force: true })
        cpSync(source, target, { recursive: true })
      }
    }
  } catch {
    // default-skills 目录缺失时不阻断 workspace 初始化
  }
}

function ensurePageBuilderSkillExposure(workspaceSlug: string): void {
  const activeSoftSkillDir = join(getWorkspaceSkillsDir(workspaceSlug), PAGE_BUILDER_DEFAULT_INACTIVE_SKILL)
  const inactiveSoftSkillDir = join(getInactiveSkillsDir(workspaceSlug), PAGE_BUILDER_DEFAULT_INACTIVE_SKILL)
  const desiredExposure = readWorkspaceSkillExposureOverride(
    workspaceSlug,
    PAGE_BUILDER_DEFAULT_INACTIVE_SKILL,
  ) ?? 'inactive'

  if (desiredExposure === 'active') {
    if (existsSync(activeSoftSkillDir) && existsSync(inactiveSoftSkillDir)) {
      rmSync(inactiveSoftSkillDir, { recursive: true, force: true })
      return
    }

    if (!existsSync(activeSoftSkillDir) && existsSync(inactiveSoftSkillDir)) {
      renameSync(inactiveSoftSkillDir, activeSoftSkillDir)
    }
    return
  }

  if (existsSync(activeSoftSkillDir) && existsSync(inactiveSoftSkillDir)) {
    rmSync(activeSoftSkillDir, { recursive: true, force: true })
    return
  }

  if (existsSync(activeSoftSkillDir) && !existsSync(inactiveSoftSkillDir)) {
    renameSync(activeSoftSkillDir, inactiveSoftSkillDir)
  }
}

function ensureWorkspaceTemplateArtifacts(workspace: AgentWorkspace): AgentWorkspace {
  if (workspace.template === 'page-builder') {
    initializePageBuilderWorkspace(workspace.slug)
  }

  copyDefaultSkills(workspace.slug)

  if (workspace.template === 'page-builder') {
    ensurePageBuilderSkillExposure(workspace.slug)
  }

  return workspace
}

function parseSkillFrontmatter(content: string, slug: string, enabled: boolean): SkillMeta {
  const meta: SkillMeta = { slug, name: slug, enabled }
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatter?.[1]) return meta

  for (const line of frontmatter[1].split('\n')) {
    const separator = line.indexOf(':')
    if (separator === -1) continue

    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '')

    if (key === 'name' && value) meta.name = value
    if (key === 'description' && value) meta.description = value
    if (key === 'icon' && value) meta.icon = value
  }

  return meta
}

function scanSkillsInDir(dir: string, enabled: boolean): SkillMeta[] {
  const skills: SkillMeta[] = []

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      const isDir = entry.isDirectory() || (entry.isSymbolicLink() && statSync(fullPath).isDirectory())
      if (!isDir) continue

      const skillMdPath = join(fullPath, 'SKILL.md')
      if (!existsSync(skillMdPath)) continue

      try {
        const content = readFileSync(skillMdPath, 'utf-8')
        skills.push(parseSkillFrontmatter(content, entry.name, enabled))
      } catch {
        console.warn(`[Agent 工作区] 解析 Skill 失败: ${entry.name}`)
      }
    }
  } catch {
    // 目录不存在时返回空列表
  }

  return skills
}

export function listAgentWorkspaces(): AgentWorkspace[] {
  ensureDefaultWorkspace()
  return readIndex().workspaces
    .map(ensureWorkspaceTemplateArtifacts)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getAgentWorkspace(id: string): AgentWorkspace | undefined {
  const workspace = readIndex().workspaces.find((entry) => entry.id === id)
  return workspace ? ensureWorkspaceTemplateArtifacts(workspace) : undefined
}

export function getAgentWorkspaceBySlug(slug: string): AgentWorkspace | undefined {
  const workspace = readIndex().workspaces.find((entry) => entry.slug === slug)
  return workspace ? ensureWorkspaceTemplateArtifacts(workspace) : undefined
}

export function ensureDefaultWorkspace(): AgentWorkspace {
  const index = readIndex()
  let workspace = index.workspaces.find((entry) => entry.slug === DEFAULT_WORKSPACE_SLUG)

  if (!workspace) {
    const now = Date.now()
    workspace = {
      id: randomUUID(),
      name: DEFAULT_WORKSPACE_NAME,
      slug: DEFAULT_WORKSPACE_SLUG,
      createdAt: now,
      updatedAt: now,
    }
    index.workspaces.push(workspace)
    writeIndex(index)
  }

  ensureWorkspaceStructure(workspace.slug)
  ensureWorkspaceTemplateArtifacts(workspace)
  return workspace
}

export function createAgentWorkspace(name: string, options?: CreateWorkspaceOptions): AgentWorkspace {
  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error('工作区名称不能为空')
  }

  ensureDefaultWorkspace()
  const index = readIndex()
  const now = Date.now()
  const slug = createWorkspaceSlug(new Set(index.workspaces.map((workspace) => workspace.slug)))

  const workspace: AgentWorkspace = {
    id: randomUUID(),
    name: trimmedName,
    slug,
    ...(options?.template ? { template: options.template } : {}),
    createdAt: now,
    updatedAt: now,
  }

  index.workspaces.push(workspace)
  writeIndex(index)
  ensureWorkspaceStructure(workspace.slug)
  ensureWorkspaceTemplateArtifacts(workspace)
  return workspace
}

export function updateAgentWorkspace(id: string, updates: { name: string }): AgentWorkspace {
  const index = readIndex()
  const targetIndex = index.workspaces.findIndex((workspace) => workspace.id === id)
  if (targetIndex === -1) {
    throw new Error(`Agent 工作区不存在: ${id}`)
  }

  const existing = index.workspaces[targetIndex]!
  const nextName = updates.name.trim()
  if (!nextName) {
    throw new Error('工作区名称不能为空')
  }

  const updated: AgentWorkspace = {
    ...existing,
    name: nextName,
    updatedAt: Date.now(),
  }

  index.workspaces[targetIndex] = updated
  writeIndex(index)
  ensureWorkspaceStructure(updated.slug)
  return updated
}

export function deleteAgentWorkspace(id: string): void {
  const index = readIndex()
  const targetIndex = index.workspaces.findIndex((workspace) => workspace.id === id)
  if (targetIndex === -1) {
    throw new Error(`Agent 工作区不存在: ${id}`)
  }

  const target = index.workspaces[targetIndex]!
  if (target.slug === DEFAULT_WORKSPACE_SLUG) {
    throw new Error('默认工作区不可删除')
  }

  index.workspaces.splice(targetIndex, 1)
  writeIndex(index)
}

export function getWorkspaceMcpConfig(workspaceSlug: string): WorkspaceMcpConfig {
  ensureWorkspaceStructure(workspaceSlug)
  try {
    const parsed = JSON.parse(readFileSync(getWorkspaceMcpPath(workspaceSlug), 'utf-8')) as Partial<WorkspaceMcpConfig>
    return { servers: parsed.servers ?? {} }
  } catch (error) {
    console.error('[Agent 工作区] 读取 MCP 配置失败:', error)
    return { servers: {} }
  }
}

export function saveWorkspaceMcpConfig(workspaceSlug: string, config: WorkspaceMcpConfig): void {
  ensureWorkspaceStructure(workspaceSlug)
  writeFileSync(getWorkspaceMcpPath(workspaceSlug), JSON.stringify(config, null, 2), 'utf-8')
}

export function getWorkspaceSkills(workspaceSlug: string): SkillMeta[] {
  ensureWorkspaceStructure(workspaceSlug)
  return scanSkillsInDir(getWorkspaceSkillsDir(workspaceSlug), true)
}

function stripSkillFrontmatter(content: string): string {
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim()
}

export function readWorkspaceSkillBootstrap(
  workspaceSlug: string,
  skillSlug: string,
): { invocationName: string; content: string } | null {
  ensureWorkspaceStructure(workspaceSlug)
  const skillMdPath = join(getWorkspaceSkillsDir(workspaceSlug), skillSlug, 'SKILL.md')
  if (!existsSync(skillMdPath)) {
    return null
  }

  try {
    const content = stripSkillFrontmatter(readFileSync(skillMdPath, 'utf-8'))
    if (!content) {
      return null
    }

    return {
      invocationName: getWorkspaceSkillInvocationName(workspaceSlug, skillSlug),
      content,
    }
  } catch {
    return null
  }
}

export function getAllWorkspaceSkills(workspaceSlug: string): SkillMeta[] {
  ensureWorkspaceStructure(workspaceSlug)
  return [
    ...scanSkillsInDir(getWorkspaceSkillsDir(workspaceSlug), true),
    ...scanSkillsInDir(getInactiveSkillsDir(workspaceSlug), false),
  ]
}

export function deleteWorkspaceSkill(workspaceSlug: string, skillSlug: string): void {
  const skillPath = join(getWorkspaceSkillsDir(workspaceSlug), skillSlug)
  if (!existsSync(skillPath)) {
    throw new Error(`Skill 不存在: ${skillSlug}`)
  }
  rmSync(skillPath, { recursive: true, force: true })
}

export function toggleWorkspaceSkill(workspaceSlug: string, skillSlug: string, enabled: boolean): void {
  const sourceDir = enabled ? getInactiveSkillsDir(workspaceSlug) : getWorkspaceSkillsDir(workspaceSlug)
  const targetDir = enabled ? getWorkspaceSkillsDir(workspaceSlug) : getInactiveSkillsDir(workspaceSlug)
  const source = join(sourceDir, skillSlug)
  const target = join(targetDir, skillSlug)

  if (!existsSync(source)) {
    throw new Error(`Skill 不存在: ${skillSlug}`)
  }
  if (existsSync(target)) {
    throw new Error(`目标目录已存在同名 Skill: ${skillSlug}`)
  }

  renameSync(source, target)

  const workspace = readIndex().workspaces.find((entry) => entry.slug === workspaceSlug)
  if (workspace?.template === 'page-builder' && skillSlug === PAGE_BUILDER_DEFAULT_INACTIVE_SKILL) {
    writeWorkspaceSkillExposureOverride(workspaceSlug, skillSlug, enabled ? 'active' : 'inactive')
  }
}

export function getWorkspaceCapabilities(workspaceSlug: string): WorkspaceCapabilities {
  const mcpServers = Object.entries(getWorkspaceMcpConfig(workspaceSlug).servers).map(([name, entry]) => ({
    name,
    enabled: entry.enabled,
    type: entry.type,
  }))

  return {
    mcpServers,
    skills: getWorkspaceSkills(workspaceSlug),
  }
}

export function getWorkspaceAttachedDirectories(workspaceSlug: string): string[] {
  return readWorkspaceConfig(workspaceSlug).attachedDirectories ?? []
}

export function attachWorkspaceDirectory(workspaceSlug: string, directoryPath: string): string[] {
  const config = readWorkspaceConfig(workspaceSlug)
  const existing = config.attachedDirectories ?? []
  if (existing.includes(directoryPath)) {
    return existing
  }

  const updated = [...existing, directoryPath]
  writeWorkspaceConfig(workspaceSlug, {
    ...config,
    attachedDirectories: updated,
  })
  return updated
}

export function detachWorkspaceDirectory(workspaceSlug: string, directoryPath: string): string[] {
  const config = readWorkspaceConfig(workspaceSlug)
  const updated = (config.attachedDirectories ?? []).filter((entry) => entry !== directoryPath)
  writeWorkspaceConfig(workspaceSlug, {
    ...config,
    attachedDirectories: updated,
  })
  return updated
}

export function getWorkspaceDirectoryContext(workspaceId: string): WorkspaceDirectoryContext {
  const workspace = getAgentWorkspace(workspaceId)
  if (!workspace) {
    throw new Error(`Agent 工作区不存在: ${workspaceId}`)
  }

  ensureWorkspaceStructure(workspace.slug)

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceSlug: workspace.slug,
    workspacePath: getAgentWorkspacePath(workspace.slug),
    workspaceFilesPath: getWorkspaceFilesDir(workspace.slug),
    skillsPath: getWorkspaceSkillsDir(workspace.slug),
    mcpConfigPath: getWorkspaceMcpPath(workspace.slug),
    memoryFilePath: getWorkspaceMemoryFilePath(workspace.slug),
    attachedDirectories: getWorkspaceAttachedDirectories(workspace.slug),
  }
}

export function searchWorkspaceFiles(
  workspaceId: string,
  query: string,
  limit = 20,
  extraDirectories: string[] = [],
): FileSearchResult {
  const context = getWorkspaceDirectoryContext(workspaceId)
  const allEntries: Array<{ name: string; path: string; type: 'file' | 'dir' }> = []
  const searchableDirectories = Array.from(
    new Set([
      ...context.attachedDirectories,
      ...extraDirectories,
    ]),
  )

  function scan(dir: string, depth: number, baseRoot: string): void {
    if (depth > 5) return

    try {
      const items = readdirSync(dir, { withFileTypes: true })
      for (const item of items) {
        if (item.name.startsWith('.')) continue
        if (item.isDirectory() && FILE_SEARCH_IGNORE_DIRS.has(item.name)) continue

        const fullPath = join(dir, item.name)
        const relativePath = fullPath.startsWith(baseRoot)
          ? fullPath.slice(baseRoot.length + 1)
          : item.name

        allEntries.push({
          name: item.name,
          path: relativePath,
          type: item.isDirectory() ? 'dir' : 'file',
        })

        if (item.isDirectory()) {
          scan(fullPath, depth + 1, baseRoot)
        }
      }
    } catch {
      // 忽略无权限或瞬时不存在的目录
    }
  }

  scan(context.workspacePath, 0, context.workspacePath)

  for (const directory of searchableDirectories) {
    if (!existsSync(directory)) continue
    scan(directory, 0, directory)
  }

  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return {
      entries: allEntries.slice(0, limit),
      total: allEntries.length,
    }
  }

  const matched = allEntries.filter((entry) => {
    const nameLower = entry.name.toLowerCase()
    const pathLower = entry.path.toLowerCase()

    if (nameLower.startsWith(normalizedQuery)) return true
    if (nameLower.includes(normalizedQuery) || pathLower.includes(normalizedQuery)) return true

    let queryIndex = 0
    for (let index = 0; index < nameLower.length && queryIndex < normalizedQuery.length; index += 1) {
      if (nameLower[index] === normalizedQuery[queryIndex]) {
        queryIndex += 1
      }
    }

    return queryIndex === normalizedQuery.length
  })

  matched.sort((left, right) => {
    const leftStartsWith = left.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1
    const rightStartsWith = right.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1
    if (leftStartsWith !== rightStartsWith) return leftStartsWith - rightStartsWith
    if (left.type === 'dir' && right.type !== 'dir') return -1
    if (left.type !== 'dir' && right.type === 'dir') return 1
    return left.path.length - right.path.length
  })

  return {
    entries: matched.slice(0, limit),
    total: matched.length,
  }
}

export function moveWorkspaceSessionDirectory(
  sessionId: string,
  sourceWorkspaceSlug: string | null,
  targetWorkspaceSlug: string,
): void {
  const targetDir = getAgentSessionWorkspacePath(targetWorkspaceSlug, sessionId)

  if (!sourceWorkspaceSlug || sourceWorkspaceSlug === targetWorkspaceSlug) {
    return
  }

  const sourceDir = join(getAgentWorkspacePath(sourceWorkspaceSlug), sessionId)
  if (!existsSync(sourceDir)) {
    return
  }

  rmSync(targetDir, { recursive: true, force: true })
  renameSync(sourceDir, targetDir)
}
