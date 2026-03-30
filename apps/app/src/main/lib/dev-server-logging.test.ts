import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveDevServerLoggingRuntime } from './dev-server-logging'

describe('dev server logging', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-dev-server-logging-'))
    process.env.PROMA_CONFIG_DIR = configDir
  })

  afterEach(() => {
    delete process.env.PROMA_CONFIG_DIR
    rmSync(configDir, { recursive: true, force: true })
  })

  test('writes backend logs into the configDir/logs folder', () => {
    const runtime = resolveDevServerLoggingRuntime({
      cwd: '/tmp/proma-app',
      entryPath: 'src/main/index.ts',
      logFileName: 'page-builder-server.log',
    })

    expect(runtime.configDir).toBe(configDir)
    expect(runtime.logsDir).toBe(join(configDir, 'logs'))
    expect(runtime.logFilePath).toBe(join(configDir, 'logs', 'page-builder-server.log'))
    expect(runtime.entryPath).toBe(resolve('/tmp/proma-app', 'src/main/index.ts'))
    expect(existsSync(runtime.logsDir)).toBe(true)
  })

  test('keeps log files inside the logs directory even when given a nested name', () => {
    const runtime = resolveDevServerLoggingRuntime({
      cwd: '/tmp/proma-app',
      entryPath: 'src/main/index.ts',
      logFileName: '../unsafe/server.log',
    })

    expect(runtime.logFilePath).toBe(join(configDir, 'logs', 'server.log'))
  })
})
