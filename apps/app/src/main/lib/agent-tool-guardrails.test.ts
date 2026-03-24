import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { applyPromaAgentToolGuardrails } from './agent-tool-guardrails'

describe('applyPromaAgentToolGuardrails', () => {
  let claudeHomeDir: string
  let originalClaudeHome: string | undefined

  beforeEach(() => {
    claudeHomeDir = mkdtempSync(join(tmpdir(), 'proma-agent-guardrails-'))
    originalClaudeHome = process.env.PROMA_CLAUDE_HOME
    process.env.PROMA_CLAUDE_HOME = claudeHomeDir
  })

  afterEach(() => {
    if (originalClaudeHome === undefined) {
      delete process.env.PROMA_CLAUDE_HOME
    } else {
      process.env.PROMA_CLAUDE_HOME = originalClaudeHome
    }
    rmSync(claudeHomeDir, { recursive: true, force: true })
  })

  test('rewrites scratch-mode Agent worktree requests into plain subagent calls', () => {
    const result = applyPromaAgentToolGuardrails('Agent', {
      description: '抓取长沙近30天天气',
      isolation: 'worktree',
      team_name: '',
      subagent_type: 'general-purpose',
    }, {
      runtimeMode: 'scratch',
    })

    expect(result.changed).toBe(true)
    expect(result.updatedInput).toEqual({
      description: '抓取长沙近30天天气',
      subagent_type: 'general-purpose',
    })
    expect(result.reason).toContain('scratch-runtime')
  })

  test('drops nonexistent scratch team names so Agent falls back to plain subagent execution', () => {
    const result = applyPromaAgentToolGuardrails('Agent', {
      description: '抓取长沙近30天天气',
      team_name: 'default',
      subagent_type: 'general-purpose',
    }, {
      runtimeMode: 'scratch',
    })

    expect(result.changed).toBe(true)
    expect(result.updatedInput).toEqual({
      description: '抓取长沙近30天天气',
      subagent_type: 'general-purpose',
    })
  })

  test('keeps scratch team names when the Claude team already exists', () => {
    const teamDir = join(claudeHomeDir, 'teams', 'existing-team')
    mkdirSync(teamDir, { recursive: true })
    writeFileSync(join(teamDir, 'config.json'), JSON.stringify({ leadSessionId: 'sdk-session' }), 'utf-8')

    const result = applyPromaAgentToolGuardrails('Agent', {
      description: '抓取长沙近30天天气',
      team_name: 'existing-team',
      subagent_type: 'general-purpose',
    }, {
      runtimeMode: 'scratch',
    })

    expect(result.changed).toBe(false)
    expect(result.updatedInput).toEqual({
      description: '抓取长沙近30天天气',
      team_name: 'existing-team',
      subagent_type: 'general-purpose',
    })
  })

  test('leaves non-worktree or repo-mode requests unchanged', () => {
    const repoMode = applyPromaAgentToolGuardrails('Agent', {
      description: '修改代码',
      isolation: 'worktree',
    }, {
      runtimeMode: 'repo',
    })
    expect(repoMode.changed).toBe(false)
    expect(repoMode.updatedInput).toEqual({
      description: '修改代码',
      isolation: 'worktree',
    })

    const otherTool = applyPromaAgentToolGuardrails('WebSearch', {
      query: '长沙天气',
    }, {
      runtimeMode: 'scratch',
    })
    expect(otherTool.changed).toBe(false)
    expect(otherTool.updatedInput).toEqual({
      query: '长沙天气',
    })
  })
})
