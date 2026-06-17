/**
 * 配置路径工具
 *
 * 管理 Proma 应用的本地配置文件路径。
 * 所有用户配置存储在 ~/.proma/ 目录下。
 */

import { fileURLToPath } from 'node:url'
import { isAbsolute, join, normalize } from 'node:path'
import { mkdirSync, existsSync, cpSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'

/** 配置目录名称 */
const CONFIG_DIR_NAME = '.proma'

/**
 * 获取配置目录路径
 *
 * 返回 ~/.proma/，如果目录不存在则自动创建。
 */
export function getConfigDir(): string {
  const configuredDir = process.env.PROMA_CONFIG_DIR?.trim()
  const configDir = configuredDir || join(homedir(), CONFIG_DIR_NAME)

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
    console.log(`[配置] 已创建配置目录: ${configDir}`)
  }

  return configDir
}

/**
 * 获取对话索引文件路径
 *
 * @returns ~/.proma/conversations.json
 */
export function getConversationsIndexPath(): string {
  return join(getConfigDir(), 'conversations.json')
}

/**
 * 获取对话消息目录路径
 *
 * 如果目录不存在则自动创建。
 *
 * @returns ~/.proma/conversations/
 */
export function getConversationsDir(): string {
  const dir = join(getConfigDir(), 'conversations')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建对话目录: ${dir}`)
  }

  return dir
}

/**
 * 获取指定对话的消息文件路径
 *
 * @param id 对话 ID
 * @returns ~/.proma/conversations/{id}.jsonl
 */
export function getConversationMessagesPath(id: string): string {
  return join(getConversationsDir(), `${id}.jsonl`)
}

/**
 * 获取附件存储根目录
 *
 * 如果目录不存在则自动创建。
 *
 * @returns ~/.proma/attachments/
 */
export function getAttachmentsDir(): string {
  const dir = join(getConfigDir(), 'attachments')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建附件目录: ${dir}`)
  }

  return dir
}

/**
 * 获取日志目录路径
 *
 * 如果目录不存在则自动创建。
 *
 * @returns ~/.proma/logs/
 */
export function getLogsDir(): string {
  const dir = join(getConfigDir(), 'logs')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建日志目录: ${dir}`)
  }

  return dir
}

/**
 * 获取指定对话的附件目录
 *
 * 如果目录不存在则自动创建。
 *
 * @param conversationId 对话 ID
 * @returns ~/.proma/attachments/{conversationId}/
 */
export function getConversationAttachmentsDir(conversationId: string): string {
  const dir = join(getAttachmentsDir(), conversationId)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 解析附件相对路径为完整路径
 *
 * @param localPath 相对路径 {conversationId}/{uuid}.ext
 * @returns 完整路径 ~/.proma/attachments/{conversationId}/{uuid}.ext
 */
export function resolveAttachmentPath(localPath: string): string {
  return join(getAttachmentsDir(), localPath)
}

/**
 * 获取应用设置文件路径
 *
 * @returns ~/.proma/settings.json
 */
export function getSettingsPath(): string {
  return join(getConfigDir(), 'settings.json')
}

/**
 * 获取用户档案文件路径
 *
 * @returns ~/.proma/user-profile.json
 */
export function getUserProfilePath(): string {
  return join(getConfigDir(), 'user-profile.json')
}

/**
 * 获取代理配置文件路径
 *
 * @returns ~/.proma/proxy-settings.json
 */
export function getProxySettingsPath(): string {
  return join(getConfigDir(), 'proxy-settings.json')
}

/**
 * 获取 CMS 浏览配置文件路径
 *
 * @returns ~/.proma/cms-settings.json
 */
export function getCmsSettingsPath(): string {
  return join(getConfigDir(), 'cms-settings.json')
}

/**
 * 获取 PageBuilder 用户模板根目录
 *
 * @returns ~/.proma/page-builder-templates/
 */
export function getUserPageBuilderTemplatesDir(): string {
  const dir = join(getConfigDir(), 'page-builder-templates')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建 PageBuilder 用户模板目录: ${dir}`)
  }

  return dir
}

/**
 * 获取 Agent 会话索引文件路径
 *
 * @returns ~/.proma/agent-sessions.json
 */
export function getAgentSessionsIndexPath(): string {
  return join(getConfigDir(), 'agent-sessions.json')
}

/**
 * 获取 Agent 会话消息目录路径
 *
 * 如果目录不存在则自动创建。
 *
 * @returns ~/.proma/agent-sessions/
 */
export function getAgentSessionsDir(): string {
  const dir = join(getConfigDir(), 'agent-sessions')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建 Agent 会话目录: ${dir}`)
  }

  return dir
}

/**
 * 获取指定 Agent 会话的消息文件路径
 *
 * @param id 会话 ID
 * @returns ~/.proma/agent-sessions/{id}.jsonl
 */
export function getAgentSessionMessagesPath(id: string): string {
  return join(getAgentSessionsDir(), `${id}.jsonl`)
}

/**
 * 获取 Agent 工作区索引文件路径
 *
 * @returns ~/.proma/agent-workspaces.json
 */
export function getAgentWorkspacesIndexPath(): string {
  return join(getConfigDir(), 'agent-workspaces.json')
}

/**
 * 获取 Agent 工作区根目录路径
 *
 * 如果目录不存在则自动创建。
 *
 * @returns ~/.proma/agent-workspaces/
 */
export function getAgentWorkspacesDir(): string {
  const dir = join(getConfigDir(), 'agent-workspaces')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建 Agent 工作区目录: ${dir}`)
  }

  return dir
}

/**
 * 获取指定 Agent 工作区的目录路径
 *
 * 如果目录不存在则自动创建。
 *
 * @param slug 工作区 slug
 * @returns ~/.proma/agent-workspaces/{slug}/
 */
export function getAgentWorkspacePath(slug: string): string {
  const dir = join(getAgentWorkspacesDir(), slug)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建 Agent 工作区: ${dir}`)
  }

  return dir
}

/**
 * 获取指定工作区的 MCP 配置文件路径
 *
 * @param slug 工作区 slug
 * @returns ~/.proma/agent-workspaces/{slug}/mcp.json
 */
export function getWorkspaceMcpPath(slug: string): string {
  return join(getAgentWorkspacePath(slug), 'mcp.json')
}

/**
 * 获取指定工作区的 Skills 目录路径
 *
 * @param slug 工作区 slug
 * @returns ~/.proma/agent-workspaces/{slug}/skills/
 */
export function getWorkspaceSkillsDir(slug: string): string {
  const dir = join(getAgentWorkspacePath(slug), 'skills')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 获取工作区 Claude plugin manifest 文件路径
 *
 * @param slug 工作区 slug
 * @returns ~/.proma/agent-workspaces/{slug}/.claude-plugin/plugin.json
 */
export function getWorkspacePluginManifestPath(slug: string): string {
  return join(getAgentWorkspacePath(slug), '.claude-plugin', 'plugin.json')
}

/**
 * 获取工作区不活跃 Skills 目录路径
 *
 * @param slug 工作区 slug
 * @returns ~/.proma/agent-workspaces/{slug}/skills-inactive/
 */
export function getInactiveSkillsDir(slug: string): string {
  const dir = join(getAgentWorkspacePath(slug), 'skills-inactive')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 获取工作区文件目录路径
 *
 * @param slug 工作区 slug
 * @returns ~/.proma/agent-workspaces/{slug}/workspace-files/
 */
export function getWorkspaceFilesDir(slug: string): string {
  const dir = join(getAgentWorkspacePath(slug), 'workspace-files')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 获取工作区文件派生元数据目录路径
 *
 * @param slug 工作区 slug
 * @returns ~/.proma/agent-workspaces/{slug}/workspace-files/.proma/
 */
export function getWorkspaceFilesDerivedDir(slug: string): string {
  const dir = join(getWorkspaceFilesDir(slug), '.proma')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 获取工作区 CMS rendering manifest 文件路径
 *
 * @param slug 工作区 slug
 * @returns ~/.proma/agent-workspaces/{slug}/workspace-files/.proma/cms-rendering-manifest.json
 */
export function getWorkspaceCmsRenderingManifestPath(slug: string): string {
  return join(getWorkspaceFilesDerivedDir(slug), 'cms-rendering-manifest.json')
}

/**
 * 获取工作区本地记忆目录路径
 *
 * 简化版 Web 运行时没有接回原版的云记忆 MCP，因此需要为每个工作区显式
 * 约定一个稳定的本地记忆目录，避免 agent 退回到 SDK 内部 project memory
 * 路径猜测。
 *
 * @param slug 工作区 slug
 * @returns ~/.proma/agent-workspaces/{slug}/memory/
 */
export function getWorkspaceMemoryDir(slug: string): string {
  const dir = join(getAgentWorkspacePath(slug), 'memory')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 获取工作区本地记忆文件路径
 *
 * @param slug 工作区 slug
 * @returns ~/.proma/agent-workspaces/{slug}/memory/MEMORY.md
 */
export function getWorkspaceMemoryFilePath(slug: string): string {
  return join(getWorkspaceMemoryDir(slug), 'MEMORY.md')
}

/**
 * 获取指定 Agent 会话的工作路径
 *
 * @param workspaceSlug 工作区 slug
 * @param sessionId 会话 ID
 * @returns ~/.proma/agent-workspaces/{slug}/{sessionId}/
 */
export function getAgentSessionWorkspacePath(workspaceSlug: string, sessionId: string): string {
  const dir = join(getAgentWorkspacePath(workspaceSlug), sessionId)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建 Agent 会话工作目录: ${dir}`)
  }

  return dir
}

/**
 * 获取指定 Agent 会话的附件目录路径
 *
 * @param workspaceSlug 工作区 slug
 * @param sessionId 会话 ID
 * @returns ~/.proma/agent-workspaces/{slug}/{sessionId}/attachments/
 */
export function getAgentSessionAttachmentsDir(workspaceSlug: string, sessionId: string): string {
  const dir = join(getAgentSessionWorkspacePath(workspaceSlug, sessionId), 'attachments')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 解析会话附件相对路径为完整路径
 *
 * localPath 必须是 session cwd 下的相对路径，并且当前仅允许
 * `attachments/` 子目录中的文件。
 *
 * @param workspaceSlug 工作区 slug
 * @param sessionId 会话 ID
 * @param localPath 相对路径，例如 attachments/uuid.png
 * @returns 完整路径 ~/.proma/agent-workspaces/{slug}/{sessionId}/attachments/uuid.png
 */
export function resolveAgentSessionAttachmentPath(
  workspaceSlug: string,
  sessionId: string,
  localPath: string,
): string {
  const trimmedPath = localPath.trim()
  const normalizedPath = normalize(trimmedPath).replace(/\\/g, '/')

  if (!normalizedPath || isAbsolute(trimmedPath) || normalizedPath.startsWith('../') || !normalizedPath.startsWith('attachments/')) {
    throw new Error(`非法的会话附件路径: ${localPath}`)
  }

  return join(getAgentSessionWorkspacePath(workspaceSlug, sessionId), normalizedPath)
}

/**
 * 获取默认 Skills 模板目录路径
 *
 * 新建工作区时自动复制此目录的内容到工作区 skills/ 下。
 *
 * @returns ~/.proma/default-skills/
 */
export function getDefaultSkillsDir(): string {
  const dir = join(getConfigDir(), 'default-skills')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

/**
 * 解析当前运行时可用的默认 Skills 源目录。
 *
 * 当前 Bun 本地 Web 应用直接运行 `src/main/index.ts`，所以默认从
 * `apps/app/default-skills` 读取。若未来运行布局变化（例如外部打包
 * 或测试注入），可通过 PROMA_DEFAULT_SKILLS_DIR 显式覆盖该来源目录。
 */
function resolveBundledDefaultSkillsDir(): string {
  const configuredDir = process.env.PROMA_DEFAULT_SKILLS_DIR?.trim()
  return configuredDir
    ? configuredDir
    : fileURLToPath(new URL('../../../default-skills', import.meta.url))
}

export function isPlaceholderSkillDirectory(skillDir: string): boolean {
  const skillPath = join(skillDir, 'SKILL.md')
  if (!existsSync(skillPath)) return false

  try {
    const content = readFileSync(skillPath, 'utf-8')
    return content.includes('[TODO:') || content.includes('## Structuring This Skill')
  } catch {
    return false
  }
}

/**
 * 同步默认 Skills 到 ~/.proma/default-skills/
 *
 * 仅补充缺失的 Skill 目录，不覆盖用户已有内容。工作区初始化时再从这里
 * 复制到各自的 `skills/` 目录，因此这里是默认 Skills 的本地种子来源。
 */
export function seedDefaultSkills(): void {
  const bundledDir = resolveBundledDefaultSkillsDir()

  if (!existsSync(bundledDir)) {
    console.log('[配置] 未找到内置 default-skills 目录，跳过')
    return
  }

  const userDir = getDefaultSkillsDir()

  try {
    const entries = readdirSync(bundledDir, { withFileTypes: true })

    for (const entry of entries) {
      const source = join(bundledDir, entry.name)
      const target = join(userDir, entry.name)

      if (!existsSync(target)) {
        cpSync(source, target, { recursive: true })
        console.log(`[配置] 已同步默认 Skill: ${entry.name}`)
        continue
      }

      if (isPlaceholderSkillDirectory(target)) {
        rmSync(target, { recursive: true, force: true })
        cpSync(source, target, { recursive: true })
        console.log(`[配置] 已刷新占位 Skill: ${entry.name}`)
      }
    }
  } catch (err) {
    console.warn('[配置] 同步默认 Skills 失败:', err)
  }
}

/**
 * 获取 SDK 隔离配置目录路径
 *
 * 用于设置 CLAUDE_CONFIG_DIR 环境变量，让 SDK 读取独立的配置文件，
 * 而不是用户的 ~/.claude.json，实现 Proma 与 Claude Code CLI 的配置隔离。
 *
 * 如果目录不存在则自动创建。
 *
 * @returns ~/.proma/sdk-config/
 */
export function getSdkConfigDir(): string {
  const dir = join(getConfigDir(), 'sdk-config')

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`[配置] 已创建 SDK 配置目录: ${dir}`)
  }

  return dir
}
