import { existsSync, readFileSync } from 'node:fs'
import type { PageBuilderCmsSettings } from '@proma/shared'
import { getCmsSettingsPath } from './config-paths'

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function normalizeRequiredString(value: unknown, fieldName: keyof PageBuilderCmsSettings): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`CMS 配置文件缺少必填字段: ${fieldName}`)
  }

  return value.trim()
}

export function readPageBuilderCmsSettings(): PageBuilderCmsSettings {
  const settingsPath = getCmsSettingsPath()
  if (!existsSync(settingsPath)) {
    throw new Error(`CMS 配置文件不存在: ${settingsPath}`)
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
  } catch (error) {
    throw new Error(`CMS 配置文件读取失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }

  return {
    baseUrl: normalizeBaseUrl(normalizeRequiredString(parsed.baseUrl, 'baseUrl')),
    currentSite: normalizeRequiredString(parsed.currentSite, 'currentSite'),
    zusid: normalizeRequiredString(parsed.zusid, 'zusid'),
  }
}

export function buildPageBuilderCmsCookie(settings: PageBuilderCmsSettings): string {
  return `CurrentSite=${settings.currentSite}; ZUSID=${settings.zusid}`
}

export function normalizePageBuilderCmsRelativePath(path: string): string {
  return path.trim().replace(/^\/+/, '')
}

export function resolvePageBuilderCmsPreviewUrl(
  relativePath: string,
  settings: PageBuilderCmsSettings,
): string {
  const normalizedPath = normalizePageBuilderCmsRelativePath(relativePath)
  return `${settings.baseUrl}/preview/news/${normalizedPath}`
}

export function extractPageBuilderCmsRelativePath(
  rawPath: string | null | undefined,
  settings: Pick<PageBuilderCmsSettings, 'baseUrl'>,
): string | null {
  if (!rawPath || !rawPath.trim()) {
    return null
  }

  const value = rawPath.trim()
  if (!/^https?:\/\//i.test(value)) {
    return normalizePageBuilderCmsRelativePath(value)
  }

  try {
    const url = new URL(value)
    const baseUrl = new URL(`${settings.baseUrl.replace(/\/+$/, '')}/`)
    const expectedPrefix = `${baseUrl.pathname.replace(/\/+$/, '')}/preview/news/`
    if (url.origin !== baseUrl.origin || !url.pathname.startsWith(expectedPrefix)) {
      return null
    }

    return normalizePageBuilderCmsRelativePath(decodeURIComponent(url.pathname.slice(expectedPrefix.length)))
  } catch {
    return null
  }
}
