/**
 * macOS Shell 环境变量加载模块
 *
 * Web 版本默认从终端启动，通常已经继承完整 Shell 环境。
 * 如需显式加载登录 Shell 环境，可设置 `PROMA_LOAD_SHELL_ENV=1`。
 */

import { execSync } from 'node:child_process'
import type { ShellEnvResult } from '@ai-page-builder/shared'

export function getUserShell(): string {
  return process.env.SHELL || '/bin/zsh'
}

const EXCLUDED_ENV_VARS = new Set([
  'SHLVL',
  'PWD',
  'OLDPWD',
  '_',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'TERM_SESSION_ID',
])

function parseEnvOutput(output: string): Record<string, string> {
  const env: Record<string, string> = {}

  for (const line of output.split('\n')) {
    if (!line.trim()) continue

    const eqIndex = line.indexOf('=')
    if (eqIndex <= 0) continue

    const key = line.slice(0, eqIndex)
    const value = line.slice(eqIndex + 1)

    if (EXCLUDED_ENV_VARS.has(key)) continue
    if (key.startsWith('VITE_')) continue
    if (key.startsWith('npm_')) continue

    env[key] = value
  }

  return env
}

export async function getShellEnv(shell: string): Promise<Record<string, string>> {
  const marker = '__PROMA_ENV_START__'
  const command = `echo ${marker} && env`

  const output = execSync(`${shell} -l -i -c '${command}'`, {
    encoding: 'utf-8',
    timeout: 10000,
    env: {
      HOME: process.env.HOME,
      USER: process.env.USER,
      SHELL: shell,
      TERM: 'xterm-256color',
      APPLE_SUPPRESS_DEVELOPER_TOOL_POPUP: '1',
      GIT_TERMINAL_PROMPT: '0',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const markerIndex = output.indexOf(marker)
  if (markerIndex === -1) {
    throw new Error('无法找到环境变量输出标记')
  }

  return parseEnvOutput(output.slice(markerIndex + marker.length))
}

function mergeEnvToProcess(env: Record<string, string>): number {
  let count = 0

  for (const [key, value] of Object.entries(env)) {
    if (!process.env[key]) {
      process.env[key] = value
      count++
    }
  }

  if (env.PATH) {
    const mergedPaths = [...new Set([...env.PATH.split(':'), ...(process.env.PATH || '').split(':')])]
    process.env.PATH = mergedPaths.filter(Boolean).join(':')
  }

  return count
}

const FALLBACK_PATHS = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  `${process.env.HOME}/.local/bin`,
  `${process.env.HOME}/.bun/bin`,
  `${process.env.HOME}/.cargo/bin`,
]

function applyFallbackPaths(): void {
  const mergedPaths = [...new Set([...FALLBACK_PATHS, ...(process.env.PATH || '/usr/bin:/bin').split(':')])]
  process.env.PATH = mergedPaths.filter(Boolean).join(':')
}

export async function loadShellEnv(): Promise<ShellEnvResult> {
  if (process.platform !== 'darwin') {
    return { success: true, loadedCount: 0, error: null }
  }

  if (process.env.PROMA_LOAD_SHELL_ENV !== '1') {
    return { success: true, loadedCount: 0, error: null }
  }

  try {
    const shellEnv = await getShellEnv(getUserShell())
    const loadedCount = mergeEnvToProcess(shellEnv)

    return {
      success: true,
      loadedCount,
      error: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    applyFallbackPaths()

    return {
      success: false,
      loadedCount: 0,
      error: message,
    }
  }
}
