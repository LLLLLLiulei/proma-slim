import { existsSync, readFileSync } from 'node:fs'
import { getCmsSettingsPath } from './config-paths'

export interface PageBuilderCmsConfig {
  baseUrl: string
  siteID: string
  username: string
  password: string
}

type CmsEnv = Record<string, string | undefined>

interface CmsSettingsFile {
  baseUrl?: unknown
  siteID?: unknown
  siteId?: unknown
  username?: unknown
  password?: unknown
}

function normalizeBaseUrl(baseUrl: string): string | undefined {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    return undefined
  }

  try {
    const next = new URL(trimmed)
    next.search = ''
    next.hash = ''
    next.pathname = next.pathname.replace(/\/+$/, '') || '/'
    return next.pathname.endsWith('/manager') ? next.toString().replace(/\/+$/, '') : undefined
  } catch {
    return undefined
  }
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const next = value.trim()
    return next ? next : undefined
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return undefined
}

function readSiteID(value: unknown): string | undefined {
  const next = readOptionalString(value)
  if (!next) {
    return undefined
  }

  return /^\d+$/.test(next) ? next : undefined
}

function readCmsSettingsFile(): CmsSettingsFile | null {
  const settingsPath = getCmsSettingsPath()
  if (!existsSync(settingsPath)) {
    return null
  }

  try {
    const raw = readFileSync(settingsPath, 'utf-8')
    return JSON.parse(raw) as CmsSettingsFile
  } catch (error) {
    console.error('[CMS 配置] 读取 cms-settings.json 失败:', error)
    return null
  }
}

export function resolvePageBuilderCmsConfig(env: CmsEnv = process.env): PageBuilderCmsConfig | null {
  const fileSettings = readCmsSettingsFile()
  const rawBaseUrl = env.PROMA_CMS_BASE_URL?.trim() || readOptionalString(fileSettings?.baseUrl)
  const baseUrl = rawBaseUrl ? normalizeBaseUrl(rawBaseUrl) : undefined
  const rawSiteID = env.PROMA_CMS_SITE_ID?.trim()
    ?? readOptionalString(fileSettings?.siteID)
    ?? readOptionalString(fileSettings?.siteId)
  const siteID = rawSiteID === undefined ? '1' : readSiteID(rawSiteID)
  const username = env.PROMA_CMS_USERNAME?.trim() || readOptionalString(fileSettings?.username)
  const password = env.PROMA_CMS_PASSWORD?.trim() || readOptionalString(fileSettings?.password)

  if (!baseUrl || !username || !password || !siteID) {
    return null
  }

  return {
    baseUrl,
    siteID,
    username,
    password,
  }
}
