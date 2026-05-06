/**
 * Agent Team Reader — 读取 Claude Teams 文件系统数据
 *
 * 该模块基本承接原版 Electron 的 team inbox / tasks 读取职责，但补了一个小改动：
 * `~/.claude` 根路径允许通过环境变量覆盖，便于单元测试在隔离目录下验证行为。
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type {
  AgentTeamData,
  ParsedMailboxMessage,
  TaskItem,
  TeamConfig,
} from '@ai-page-builder/shared'

interface InboxMessage {
  from: string
  text: string
  summary?: string
  timestamp?: string
  read?: boolean
}

export interface InboxRetryConfig {
  maxAttempts: number
  delayMs: number
}

export const INBOX_RETRY_CONFIG: InboxRetryConfig = {
  maxAttempts: 5,
  delayMs: 2_000,
}

export interface TaskNotificationSummary {
  taskId: string
  status: string
  summary: string
  outputFile?: string
}

function getClaudeHomeDir(): string {
  const override = process.env.PROMA_CLAUDE_HOME?.trim()
  return override || join(homedir(), '.claude')
}

function getTeamsDir(): string {
  return join(getClaudeHomeDir(), 'teams')
}

function getTasksDir(): string {
  return join(getClaudeHomeDir(), 'tasks')
}

export async function findTeamLeadInboxPath(
  sdkSessionId: string,
): Promise<{ teamName: string; inboxPath: string } | null> {
  let teamEntries: string[]
  try {
    teamEntries = await readdir(getTeamsDir())
  } catch {
    return null
  }

  for (const teamName of teamEntries) {
    const configPath = join(getTeamsDir(), teamName, 'config.json')
    try {
      const raw = await readFile(configPath, 'utf-8')
      const config = JSON.parse(raw) as { leadSessionId?: string }
      if (config.leadSessionId === sdkSessionId) {
        return {
          teamName,
          inboxPath: join(getTeamsDir(), teamName, 'inboxes', 'team-lead.json'),
        }
      }
    } catch {
      continue
    }
  }

  return null
}

async function readUnreadTeamLeadMessages(inboxPath: string): Promise<InboxMessage[]> {
  try {
    const raw = await readFile(inboxPath, 'utf-8')
    const messages = JSON.parse(raw) as InboxMessage[]
    return messages.filter((message) => {
      if (message.read) return false

      try {
        const parsed = JSON.parse(message.text) as Record<string, unknown>
        const type = parsed.type
        if (
          type === 'idle_notification' ||
          type === 'shutdown_request' ||
          type === 'shutdown_approved' ||
          type === 'permission_request'
        ) {
          return false
        }
      } catch {
        // 纯文本消息保留
      }

      return true
    })
  } catch {
    return []
  }
}

export async function markInboxAsRead(inboxPath: string): Promise<void> {
  try {
    const raw = await readFile(inboxPath, 'utf-8')
    const messages = JSON.parse(raw) as InboxMessage[]
    const updated = messages.map((message) => ({ ...message, read: true }))
    await writeFile(inboxPath, JSON.stringify(updated, null, 2), 'utf-8')
  } catch {
    // 标记失败不阻断主流程
  }
}

export async function pollInboxWithRetry(
  inboxPath: string,
  config: InboxRetryConfig,
): Promise<InboxMessage[]> {
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    const messages = await readUnreadTeamLeadMessages(inboxPath)
    if (messages.length > 0) {
      console.log(`[Team Reader] Inbox 轮询 ${attempt}/${config.maxAttempts}: 找到 ${messages.length} 条消息`)
      return messages
    }

    if (attempt < config.maxAttempts) {
      console.log(`[Team Reader] Inbox 轮询 ${attempt}/${config.maxAttempts}: 空，${config.delayMs}ms 后重试`)
      await new Promise<void>((resolve) => setTimeout(resolve, config.delayMs))
    }
  }

  console.log(`[Team Reader] Inbox 轮询: ${config.maxAttempts} 次尝试用尽，仍为空`)
  return []
}

export function formatInboxPrompt(messages: InboxMessage[]): string {
  const sections = messages.map((message) => {
    const header = `**来自 ${message.from}**${message.summary ? `（${message.summary}）` : ''}:`
    let body = message.text

    try {
      const parsed = JSON.parse(message.text) as Record<string, unknown>
      if (typeof parsed.content === 'string') {
        body = parsed.content
      }
    } catch {
      // 纯文本消息保持原样
    }

    return `${header}\n${body}`
  })

  return [
    '[系统通知] 你的工作者 Agent 已完成任务，以下是他们发送的完整工作结果：',
    '',
    sections.join('\n\n---\n\n'),
    '',
    '请基于以上工作结果，向用户提供完整、详尽的最终回复。',
  ].join('\n')
}

export function formatSummaryFallbackPrompt(summaries: TaskNotificationSummary[]): string {
  const sections = summaries.map((summary) => {
    const statusLabel = summary.status === 'completed' ? '已完成' : summary.status
    return `- **Task ${summary.taskId}** (${statusLabel}): ${summary.summary}`
  })

  return [
    '[系统通知] 你的工作者 Agent 已完成任务。以下是各任务的完成摘要：',
    '',
    sections.join('\n'),
    '',
    '请基于以上任务摘要，向用户提供完整、详尽的最终回复。',
  ].join('\n')
}

export async function areAllWorkersIdle(
  sdkSessionId: string,
  startedCount: number,
): Promise<boolean> {
  if (startedCount === 0) return false

  const inboxInfo = await findTeamLeadInboxPath(sdkSessionId)
  if (!inboxInfo) return false

  try {
    const raw = await readFile(inboxInfo.inboxPath, 'utf-8')
    const messages = JSON.parse(raw) as InboxMessage[]
    const idleWorkers = new Set<string>()

    for (const message of messages) {
      try {
        const parsed = JSON.parse(message.text) as Record<string, unknown>
        if (parsed.type === 'idle_notification') {
          idleWorkers.add(message.from)
        }
      } catch {
        // 纯文本消息跳过
      }
    }

    return idleWorkers.size >= startedCount
  } catch {
    return false
  }
}

export async function getAgentTeamData(sdkSessionId: string): Promise<AgentTeamData | null> {
  let teamEntries: string[]
  try {
    teamEntries = await readdir(getTeamsDir())
  } catch {
    return null
  }

  for (const teamName of teamEntries) {
    const configPath = join(getTeamsDir(), teamName, 'config.json')

    try {
      const raw = await readFile(configPath, 'utf-8')
      const config = JSON.parse(raw) as TeamConfig
      if (config.leadSessionId === sdkSessionId) {
        const tasks = await readTasksForTeam(teamName)
        const inboxes = await readInboxesForTeam(teamName)
        return { teamName, team: config, tasks, inboxes }
      }
    } catch {
      continue
    }
  }

  return null
}

async function readTasksForTeam(teamName: string): Promise<TaskItem[]> {
  const tasksDir = join(getTasksDir(), teamName)
  let files: string[]
  try {
    files = await readdir(tasksDir)
  } catch {
    return []
  }

  const jsonFiles = files
    .filter((file) => file.endsWith('.json') && !file.startsWith('.'))
    .sort((a, b) => {
      const numberA = parseInt(a, 10)
      const numberB = parseInt(b, 10)
      if (!Number.isNaN(numberA) && !Number.isNaN(numberB)) {
        return numberA - numberB
      }
      return a.localeCompare(b)
    })

  const tasks: TaskItem[] = []
  for (const file of jsonFiles) {
    try {
      const raw = await readFile(join(tasksDir, file), 'utf-8')
      tasks.push(JSON.parse(raw) as TaskItem)
    } catch {
      continue
    }
  }

  return tasks
}

async function readInboxesForTeam(teamName: string): Promise<Record<string, ParsedMailboxMessage[]>> {
  const inboxesDir = join(getTeamsDir(), teamName, 'inboxes')
  let files: string[]
  try {
    files = await readdir(inboxesDir)
  } catch {
    return {}
  }

  const result: Record<string, ParsedMailboxMessage[]> = {}

  for (const file of files) {
    if (!file.endsWith('.json') || file.startsWith('.')) continue

    const agentName = file.replace(/\.json$/, '')
    try {
      const raw = await readFile(join(inboxesDir, file), 'utf-8')
      const messages = JSON.parse(raw) as InboxMessage[]
      result[agentName] = messages.map(parseMailboxMessage)
    } catch {
      continue
    }
  }

  return result
}

function parseMailboxMessage(message: InboxMessage): ParsedMailboxMessage {
  try {
    const parsed = JSON.parse(message.text) as Record<string, unknown>
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
      if (parsed.type === 'idle_notification') return { ...message, parsedType: 'idle_notification' }
      if (parsed.type === 'shutdown_request') return { ...message, parsedType: 'shutdown_request' }
      if (parsed.type === 'shutdown_approved') return { ...message, parsedType: 'shutdown_approved' }
      if (parsed.type === 'task_assignment') return { ...message, parsedType: 'task_assignment' }
    }
  } catch {
    // 不是 JSON
  }

  return { ...message, parsedType: 'text' }
}

export async function readAgentOutputFile(filePath: string): Promise<string> {
  const claudeHomeDir = getClaudeHomeDir()
  if (!filePath.startsWith(claudeHomeDir)) {
    throw new Error('不允许读取 ~/.claude/ 目录之外的文件')
  }

  try {
    return await readFile(filePath, 'utf-8')
  } catch {
    return ''
  }
}
