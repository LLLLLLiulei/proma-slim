import { existsSync, readFileSync } from 'node:fs'
import { getCmsSettingsPath } from './config-paths'

export interface PageBuilderCmsConfig {
  baseUrl: string
  zusid: string
  currentSite: string
  headers: Record<string, string>
  cookie: string
}

type CmsEnv = Record<string, string | undefined>

interface CmsSettingsFile {
  baseUrl?: unknown
  zusid?: unknown
  currentSite?: unknown
  cookie?: unknown
  referer?: unknown
  acceptLanguage?: unknown
  userAgent?: unknown
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
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

function readCmsCookieField(cookie: string, name: 'ZUSID' | 'CurrentSite'): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = cookie.match(new RegExp(`(?:^|[;,，]\\s*)${escapedName}=([^;,，]+)`))
  return match?.[1]?.trim() || undefined
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
  const fileCookie = readOptionalString(fileSettings?.cookie)
  const rawBaseUrl = env.PROMA_CMS_BASE_URL?.trim() || readOptionalString(fileSettings?.baseUrl)
  const zusid =
    env.PROMA_CMS_ZUSID?.trim() ||
    readOptionalString(fileSettings?.zusid) ||
    (fileCookie ? readCmsCookieField(fileCookie, 'ZUSID') : undefined)
  const currentSite =
    env.PROMA_CMS_CURRENT_SITE?.trim() ||
    readOptionalString(fileSettings?.currentSite) ||
    (fileCookie ? readCmsCookieField(fileCookie, 'CurrentSite') : undefined)

  if (!rawBaseUrl || !zusid || !currentSite) {
    return null
  }

  const baseUrl = normalizeBaseUrl(rawBaseUrl)
  const referer = env.PROMA_CMS_REFERER?.trim() || readOptionalString(fileSettings?.referer) || `${baseUrl}/app.html`
  const acceptLanguage =
    env.PROMA_CMS_ACCEPT_LANGUAGE?.trim() || readOptionalString(fileSettings?.acceptLanguage) || 'zh-CN,zh;q=0.9'
  const userAgent =
    env.PROMA_CMS_USER_AGENT?.trim() || readOptionalString(fileSettings?.userAgent) || 'Proma CMS Runtime/1.0'

  return {
    baseUrl,
    zusid,
    currentSite,
    cookie: `ZUSID=${zusid}; CurrentSite=${currentSite}`,
    headers: {
      Accept: '*/*',
      'Accept-Language': acceptLanguage,
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      Pragma: 'no-cache',
      Referer: referer,
      'User-Agent': userAgent,
    },
  }
}
