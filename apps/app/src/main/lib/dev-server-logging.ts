import { basename, join, resolve } from 'node:path'
import { getConfigDir, getLogsDir } from './config-paths'

export interface DevServerLoggingRuntimeOptions {
  cwd?: string
  entryPath: string
  logFileName: string
}

export interface DevServerLoggingRuntime {
  configDir: string
  entryPath: string
  logFilePath: string
  logsDir: string
}

function normalizeLogFileName(logFileName: string): string {
  const normalized = basename(logFileName.trim())
  if (!normalized) {
    throw new Error('日志文件名不能为空')
  }

  return normalized
}

export function resolveDevServerLoggingRuntime(
  options: DevServerLoggingRuntimeOptions,
): DevServerLoggingRuntime {
  const entryPath = options.entryPath.trim()
  if (!entryPath) {
    throw new Error('服务入口路径不能为空')
  }

  const configDir = getConfigDir()
  const logsDir = getLogsDir()
  const logFilePath = join(logsDir, normalizeLogFileName(options.logFileName))

  return {
    configDir,
    entryPath: resolve(options.cwd ?? process.cwd(), entryPath),
    logFilePath,
    logsDir,
  }
}
