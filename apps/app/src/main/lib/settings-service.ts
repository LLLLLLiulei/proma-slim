/**
 * 应用设置服务
 *
 * 管理应用设置（主题模式等）的读写。
 * 存储在 ~/.proma/settings.json
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { getSettingsPath } from './config-paths'
import {
  DEFAULT_ASK_USER_TIMEOUT_MS,
  DEFAULT_DIAGNOSTIC_LOG_LEVEL,
  DEFAULT_DIAGNOSTIC_MAX_FILE_SIZE_BYTES,
  DEFAULT_DIAGNOSTIC_RETENTION,
  DEFAULT_THEME_MODE,
} from '../../types'
import type { AppSettings } from '../../types'

function normalizeAskUserTimeoutMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_ASK_USER_TIMEOUT_MS
}

function normalizeDiagnosticLogging(value: unknown): NonNullable<AppSettings['diagnosticLogging']> {
  const data = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const retention = data.retention && typeof data.retention === 'object' && !Array.isArray(data.retention)
    ? data.retention as Record<string, unknown>
    : {}

  const maxFileSizeBytes = typeof data.maxFileSizeBytes === 'number'
    && Number.isFinite(data.maxFileSizeBytes)
    && data.maxFileSizeBytes > 0
    ? Math.floor(data.maxFileSizeBytes)
    : DEFAULT_DIAGNOSTIC_MAX_FILE_SIZE_BYTES

  const maxArchiveFiles = typeof retention.maxArchiveFiles === 'number'
    && Number.isFinite(retention.maxArchiveFiles)
    && retention.maxArchiveFiles > 0
    ? Math.floor(retention.maxArchiveFiles)
    : DEFAULT_DIAGNOSTIC_RETENTION.maxArchiveFiles

  const maxTurnDirectories = typeof retention.maxTurnDirectories === 'number'
    && Number.isFinite(retention.maxTurnDirectories)
    && retention.maxTurnDirectories > 0
    ? Math.floor(retention.maxTurnDirectories)
    : DEFAULT_DIAGNOSTIC_RETENTION.maxTurnDirectories

  const maxAgeDays = typeof retention.maxAgeDays === 'number'
    && Number.isFinite(retention.maxAgeDays)
    && retention.maxAgeDays > 0
    ? Math.floor(retention.maxAgeDays)
    : DEFAULT_DIAGNOSTIC_RETENTION.maxAgeDays

  return {
    level: data.level === 'trace'
      || data.level === 'debug'
      || data.level === 'info'
      || data.level === 'warn'
      || data.level === 'error'
      || data.level === 'fatal'
      ? data.level
      : DEFAULT_DIAGNOSTIC_LOG_LEVEL,
    maxFileSizeBytes,
    retention: {
      maxArchiveFiles,
      maxTurnDirectories,
      maxAgeDays,
    },
  }
}

/**
 * 获取应用设置
 *
 * 如果文件不存在，返回默认设置。
 */
export function getSettings(): AppSettings {
  const filePath = getSettingsPath()

  if (!existsSync(filePath)) {
    return {
      themeMode: DEFAULT_THEME_MODE,
      onboardingCompleted: false,
      environmentCheckSkipped: false,
      notificationsEnabled: true,
      askUserTimeoutMs: DEFAULT_ASK_USER_TIMEOUT_MS,
      diagnosticLogging: normalizeDiagnosticLogging(undefined),
    }
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as Partial<AppSettings>
    return {
      ...data,
      themeMode: data.themeMode || DEFAULT_THEME_MODE,
      onboardingCompleted: data.onboardingCompleted ?? false,
      environmentCheckSkipped: data.environmentCheckSkipped ?? false,
      notificationsEnabled: data.notificationsEnabled ?? true,
      askUserTimeoutMs: normalizeAskUserTimeoutMs(data.askUserTimeoutMs),
      diagnosticLogging: normalizeDiagnosticLogging(data.diagnosticLogging),
    }
  } catch (error) {
    console.error('[设置] 读取失败:', error)
    return {
      themeMode: DEFAULT_THEME_MODE,
      onboardingCompleted: false,
      environmentCheckSkipped: false,
      notificationsEnabled: true,
      askUserTimeoutMs: DEFAULT_ASK_USER_TIMEOUT_MS,
      diagnosticLogging: normalizeDiagnosticLogging(undefined),
    }
  }
}

/**
 * 更新应用设置
 *
 * 合并更新字段并写入文件。
 */
export function updateSettings(updates: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const updated: AppSettings = {
    ...current,
    ...updates,
    askUserTimeoutMs: normalizeAskUserTimeoutMs(updates.askUserTimeoutMs ?? current.askUserTimeoutMs),
    diagnosticLogging: normalizeDiagnosticLogging(updates.diagnosticLogging ?? current.diagnosticLogging),
  }

  const filePath = getSettingsPath()

  try {
    writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8')
    console.log('[设置] 已更新:', JSON.stringify(updated))
  } catch (error) {
    console.error('[设置] 写入失败:', error)
    throw new Error('写入应用设置失败')
  }

  return updated
}
