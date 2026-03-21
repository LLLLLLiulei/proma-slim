import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  areAllWorkersIdle,
  findTeamLeadInboxPath,
  markInboxAsRead,
  pollInboxWithRetry,
} from './agent-team-reader'

describe('agent-team-reader', () => {
  let claudeHome: string
  let originalClaudeHome: string | undefined

  beforeEach(() => {
    claudeHome = join(tmpdir(), `proma-claude-home-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    originalClaudeHome = process.env.PROMA_CLAUDE_HOME
    process.env.PROMA_CLAUDE_HOME = claudeHome
  })

  afterEach(() => {
    if (originalClaudeHome === undefined) {
      delete process.env.PROMA_CLAUDE_HOME
    } else {
      process.env.PROMA_CLAUDE_HOME = originalClaudeHome
    }
    rmSync(claudeHome, { recursive: true, force: true })
  })

  test('finds the matching team lead inbox for a sdk session', async () => {
    const inboxPath = createTeam('scratch-research', 'sdk-session-1')

    const result = await findTeamLeadInboxPath('sdk-session-1')

    expect(result).toEqual({
      teamName: 'scratch-research',
      inboxPath,
    })
  })

  test('polls unread inbox messages while filtering system notifications', async () => {
    const inboxPath = createTeam('scratch-research', 'sdk-session-1')
    writeInbox(inboxPath, [
      { from: 'worker-a', text: JSON.stringify({ type: 'idle_notification' }) },
      { from: 'worker-b', text: '已整理出长沙近 30 天天气来源' },
      { from: 'worker-c', text: JSON.stringify({ content: '最终摘要' }), read: true },
    ])

    const messages = await pollInboxWithRetry(inboxPath, {
      maxAttempts: 1,
      delayMs: 0,
    })

    expect(messages).toEqual([
      { from: 'worker-b', text: '已整理出长沙近 30 天天气来源' },
    ])
  })

  test('marks inbox messages as read after they are consumed', async () => {
    const inboxPath = createTeam('scratch-research', 'sdk-session-1')
    writeInbox(inboxPath, [
      { from: 'worker-a', text: '任务完成' },
      { from: 'worker-b', text: '补充说明', read: false },
    ])

    await markInboxAsRead(inboxPath)

    const messages = JSON.parse(readFileSync(inboxPath, 'utf-8')) as Array<{ read?: boolean }>
    expect(messages.every((message) => message.read === true)).toBe(true)
  })

  test('detects when all started workers have reached idle state', async () => {
    const inboxPath = createTeam('scratch-research', 'sdk-session-1')
    writeInbox(inboxPath, [
      { from: 'worker-a', text: JSON.stringify({ type: 'idle_notification' }) },
      { from: 'worker-b', text: JSON.stringify({ type: 'idle_notification' }) },
      { from: 'worker-c', text: '普通消息' },
    ])

    await expect(areAllWorkersIdle('sdk-session-1', 2)).resolves.toBe(true)
    await expect(areAllWorkersIdle('sdk-session-1', 3)).resolves.toBe(false)
  })

  function createTeam(teamName: string, leadSessionId: string): string {
    const teamDir = join(claudeHome, 'teams', teamName)
    const inboxDir = join(teamDir, 'inboxes')
    mkdirSync(inboxDir, { recursive: true })
    writeFileSync(
      join(teamDir, 'config.json'),
      JSON.stringify({
        name: teamName,
        createdAt: Date.now(),
        leadSessionId,
        members: [],
      }, null, 2),
      'utf-8',
    )
    const inboxPath = join(inboxDir, 'team-lead.json')
    writeFileSync(inboxPath, '[]', 'utf-8')
    return inboxPath
  }

  function writeInbox(inboxPath: string, messages: Array<Record<string, unknown>>): void {
    writeFileSync(inboxPath, JSON.stringify(messages, null, 2), 'utf-8')
  }
})
