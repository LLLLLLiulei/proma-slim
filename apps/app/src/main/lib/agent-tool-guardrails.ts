/**
 * Agent tool guardrails
 *
 * 当前主用模型在 Proma scratch workspace 中仍可能主动发出 `Agent(... isolation: "worktree")`。
 * 这类调用在非 git session cwd 中必然失败，因此这里增加一个极窄的输入改写层：
 * 仅当主线程位于 scratch mode 且工具名为 Agent 时，移除不受支持的 `worktree` isolation，
 * 并剔除当前 Claude home 下并不存在的 `team_name`，让调用退回到普通 subagent 语义。
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

type RuntimeMode = 'scratch' | 'repo'

interface GuardrailContext {
  runtimeMode: RuntimeMode
}

interface GuardrailResult {
  changed: boolean
  updatedInput: Record<string, unknown>
  reason?: string
}

function getClaudeHomeDir(): string {
  const override = process.env.PROMA_CLAUDE_HOME?.trim()
  return override || join(homedir(), '.claude')
}

function teamExists(teamName: string): boolean {
  return existsSync(join(getClaudeHomeDir(), 'teams', teamName, 'config.json'))
}

export function applyPromaAgentToolGuardrails(
  toolName: string,
  input: Record<string, unknown>,
  context: GuardrailContext,
): GuardrailResult {
  if (toolName !== 'Agent' || context.runtimeMode !== 'scratch') {
    return { changed: false, updatedInput: input }
  }

  const nextInput = { ...input }
  let changed = false

  if (nextInput.isolation === 'worktree') {
    delete nextInput.isolation
    changed = true
  }

  if (typeof nextInput.team_name === 'string') {
    const teamName = nextInput.team_name.trim()
    if (teamName === '' || !teamExists(teamName)) {
      delete nextInput.team_name
      changed = true
    }
  }

  if (!changed) {
    return { changed: false, updatedInput: input }
  }

  return {
    changed: true,
    updatedInput: nextInput,
    reason: 'Removed unsupported Agent scratch-runtime fields for Proma workspace execution',
  }
}
