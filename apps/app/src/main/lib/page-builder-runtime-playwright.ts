import type { McpServerEntry } from '@ai-page-builder/shared'
import { stripPageBuilderPublicBasePath } from '@ai-page-builder/shared'
import { readWorkspaceTemplateMcpConfig } from './workspace-template-service'

type EnvSource = Record<string, string | undefined>

function normalizeUrl(value: string): string {
  return value.trim()
}

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function resolveAbsolutePreviewUrl(
  previewPath: string | null,
  origin: string | null,
): string | null {
  if (!previewPath || !origin) {
    return null
  }

  try {
    return new URL(previewPath, `${origin}/`).toString()
  } catch {
    return null
  }
}

function stripConfiguredPublicBasePath(previewPath: string, env: EnvSource): string {
  try {
    const parsed = new URL(previewPath, 'http://page-builder.local')
    const pathname = stripPageBuilderPublicBasePath(parsed.pathname, env.AI_PAGE_BUILDER_BASE_PATH)
    return `${pathname}${parsed.search}${parsed.hash}`
  } catch {
    return previewPath
  }
}

function canonicalizeEntry(entry: McpServerEntry | null | undefined): string | null {
  if (!entry) return null

  return JSON.stringify({
    type: entry.type,
    command: entry.command ?? null,
    args: entry.args ?? null,
    env: entry.env ?? null,
    url: entry.url ?? null,
    headers: entry.headers ?? null,
    timeout: entry.timeout ?? null,
    enabled: entry.enabled,
  })
}

let cachedDefaultPlaywrightEntry: McpServerEntry | null | undefined

function getDefaultPageBuilderPlaywrightEntry(): McpServerEntry | null {
  if (cachedDefaultPlaywrightEntry !== undefined) {
    return cachedDefaultPlaywrightEntry
  }

  const config = readWorkspaceTemplateMcpConfig('page-builder')
  cachedDefaultPlaywrightEntry = config.servers.playwright ?? null
  return cachedDefaultPlaywrightEntry
}

export function resolvePageBuilderPlaywrightMcpUrl(env: EnvSource = process.env): string | null {
  const raw = env.AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL?.trim()
  return raw ? normalizeUrl(raw) : null
}

export function isPageBuilderDockerRuntime(env: EnvSource = process.env): boolean {
  return env.AI_PAGE_BUILDER_RUNTIME_ENV?.trim() === 'docker'
}

export function resolvePageBuilderInternalAppOrigin(env: EnvSource = process.env): string | null {
  const raw = env.AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN?.trim()
  return raw ? normalizeOrigin(raw) : null
}

export function resolvePageBuilderInternalPreviewUrl(
  previewPath: string | null,
  env: EnvSource = process.env,
): string | null {
  return resolveAbsolutePreviewUrl(
    previewPath ? stripConfiguredPublicBasePath(previewPath, env) : null,
    resolvePageBuilderInternalAppOrigin(env),
  )
}

export function resolvePageBuilderBrowserPreviewUrl(
  previewPath: string | null,
  appOrigin: string | null | undefined,
): string | null {
  const origin = typeof appOrigin === 'string' && appOrigin.trim().length > 0
    ? normalizeOrigin(appOrigin)
    : null
  return resolveAbsolutePreviewUrl(previewPath, origin)
}

export function isDefaultPageBuilderPlaywrightEntry(entry: McpServerEntry): boolean {
  return canonicalizeEntry(entry) === canonicalizeEntry(getDefaultPageBuilderPlaywrightEntry())
}
